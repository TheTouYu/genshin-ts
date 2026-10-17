#!/usr/bin/env python3
"""ys-lookd — 常驻图像识别服务（GPU 常驻，摊掉 torch import 与 CUDA 初始化）

设计（成本链：进程启动 > I/O 面积 > 计算）：
  进程启动 3s + CUDA 初始化 ~1s 只付一次；此后每次请求只剩 I/O + 计算。
  协议：Unix socket 上的一行 JSON 请求 → 一行 JSON 响应。
  客户端 ys_look.py 优先连本服务，连不上就回退 in-process（CPU/GPU 自适应）。
"""
import json, os, socket, sys, threading, time, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ys_look as YL

# 判据**只有一份**：把 `ys-state` 当模块 import（它是无扩展名的可执行脚本，用 SourceFileLoader 加载）。
# 本服务只负责「取数」（抓原始像素 + 锚点匹配），投票/阈值/状态名全在 ys-state 里。
_YS_STATE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ys-state")
_YS_MOD = None


def ys_state():
    global _YS_MOD
    if _YS_MOD is None:
        import importlib.machinery, importlib.util
        loader = importlib.machinery.SourceFileLoader("ys_state_canonical", _YS_STATE_PATH)
        spec = importlib.util.spec_from_loader("ys_state_canonical", loader)
        mod = importlib.util.module_from_spec(spec)
        loader.exec_module(mod)
        _YS_MOD = mod
    return _YS_MOD

SOCK = os.environ.get("YS_LOOKD_SOCK", f"/run/user/{os.getuid()}/ys-lookd.sock")
WIN = os.environ.get("YS_WIN", "0x01400001")



_CACHE = {}          # path -> (mtime, tensor)：只缓存**模板**（小、稳定）；帧不进缓存
_FRAME_CACHE = {}    # path -> ((mtime_ns, size), tensor)：**离线帧**缓存（活体帧不缓存）
_FRAME_CACHE_MAX = 2


def _frame_tensor(path):
    """离线帧 → GPU 张量（带 (mtime_ns,size) 缓存）。

    为什么要缓存：`ys-state --frame X` 反复判同一张图（回归/基准/等待）时，
    每次重解码 2560×1440 PNG 要 ~110ms —— 那正是单次判定进不了 150ms 的大头。
    活体帧（无 path）不走这里，所以不会把陈旧画面当新帧。
    """
    import numpy as np, torch, os
    from PIL import Image
    st = os.stat(path)
    key = (st.st_mtime_ns, st.st_size)
    hit = _FRAME_CACHE.get(path)
    if hit and hit[0] == key:
        return hit[1]
    arr = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0
    t = torch.from_numpy(arr).permute(2, 0, 1).contiguous().cuda()
    _FRAME_CACHE[path] = (key, t)
    while len(_FRAME_CACHE) > _FRAME_CACHE_MAX:
        _FRAME_CACHE.pop(next(iter(_FRAME_CACHE)))
    return t
_CACHE_MAX_BYTES = 96 * 1024 * 1024     # 模板缓存上限；实测过 unlimited 会吃掉 900+MB 显存

def _cached(path, cuda=True):
    import numpy as np, torch, os
    from PIL import Image
    mt = os.path.getmtime(path)
    hit = _CACHE.get(path)
    if hit and hit[0] == mt:
        return hit[1]
    arr = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0
    t = torch.from_numpy(arr).permute(2, 0, 1).contiguous()
    if cuda:
        t = t.cuda()
    _CACHE[path] = (mt, t)
    # 按**字节**而不是条数限流（2026-10-17 事故：16 张 2560×1440 帧张量 = 700MB+ 显存）
    total = sum(x[1].numel() * x[1].element_size() for x in _CACHE.values())
    while total > _CACHE_MAX_BYTES and len(_CACHE) > 1:
        k = next(iter(_CACHE))
        if k == path:
            break
        total -= _CACHE[k][1].numel() * _CACHE[k][1].element_size()
        _CACHE.pop(k)
    return t

def _load_frame(req):
    """取帧一次，转成 GPU 张量（C,H,W float）——批量请求里所有锚点共用这一份。"""
    import numpy as np, torch
    if req.get("frame_bin"):                   # 在线快路径之二：原始 RGB 落盘（读 11MB ≈ 10ms）
        import numpy as np
        shape = tuple(req["frame_shape"])
        arr = np.fromfile(req["frame_bin"], dtype=np.uint8).reshape(shape).astype(np.float32) / 255.0
        return torch.from_numpy(arr).permute(2, 0, 1).cuda()
    if req.get("frame_b64"):                   # 在线快路径：客户端用 import…rgb:- 抓的原始像素
        import base64, numpy as np
        raw = base64.b64decode(req["frame_b64"])
        shape = tuple(req["frame_shape"])      # (H, W, 3)
        arr = np.frombuffer(raw, dtype=np.uint8).reshape(shape).astype(np.float32) / 255.0
        return torch.from_numpy(arr).permute(2, 0, 1).contiguous().cuda()
    if req.get("frame"):                       # 离线/基准：读 PNG（带 (mtime,size) 缓存）
        return _frame_tensor(req["frame"])
    else:                                      # 在线：抓窗口区域
        if req.get("region"):
            X, Y, W, H = map(int, req["region"])
        else:
            import subprocess
            g = dict(l.split("=") for l in subprocess.run(
                ["xdotool", "getwindowgeometry", "--shell", YL.WIN],
                capture_output=True, text=True).stdout.strip().splitlines() if "=" in l)
            X, Y, W, H = 0, 0, int(g["WIDTH"]), int(g["HEIGHT"])
        arr = YL.grab(X, Y, W, H).astype(np.float32) / 255.0
        req["_origin"] = (X, Y)
    return torch.from_numpy(arr).permute(2, 0, 1).contiguous().cuda()


def _tpl_tensor(path, scales):
    """读一次模板图（带缓存），按各尺度在 GPU 上缩放（不再走 PIL——那是批量时的胶水大头）。"""
    import torch
    import torch.nn.functional as F
    t = _cached(path)
    out = []
    for s in scales:
        if abs(s - 1.0) < 1e-6:
            out.append((s, t))
        else:
            h = max(8, int(round(t.shape[1] * s)))
            w = max(8, int(round(t.shape[2] * s)))
            out.append((s, F.interpolate(t.unsqueeze(0), size=(h, w), mode="bilinear",
                                         align_corners=False).squeeze(0)))
    return out


def _batch(req):
    """一次请求跑完 N 个锚点 × M 个尺度（取帧一次，锚点共用）。"""
    It = _load_frame(req)
    ox, oy = req.get("_origin", (0, 0))
    return _batch_on(It, req.get("jobs", []), ox, oy)


def _batch_on(It, jobs, ox=0, oy=0):
    """在**已加载的**帧张量上跑 jobs（常驻判态复用同一帧：不再抓第二次）。"""
    results = []
    for job in jobs:
        roi = job.get("roi")
        if roi:
            x, y, w, h = map(int, roi)
            sub = It[:, y:y + h, x:x + w]
            bx, by = x, y
        else:
            sub, bx, by = It, 0, 0
        best = None
        per = []
        for s, Tt in _tpl_tensor(job["tpl"], job.get("scales", [1.0])):
            if Tt.shape[1] > sub.shape[1] or Tt.shape[2] > sub.shape[2]:
                continue
            px, py, score = YL.ncc_t(sub, Tt)
            rec = {"scale": s, "x": bx + px + Tt.shape[2] // 2 + ox,
                   "y": by + py + Tt.shape[1] // 2 + oy, "score": score}
            per.append(rec)
            if best is None or score > best["score"]:
                best = rec
        results.append({"id": job.get("id"), "best": best, "all": per})
    return {"results": results, "frame": list(It.shape)}

def _state(req):
    """常驻判态（fast 通道）：**一次取数**（抓原始像素，无 PNG 编解码）→ 判据 → JSON。

    分工（契约 §1/§6 单一源）：
      · 本服务：取像素 + 锚点匹配（math 在 ys_look.ncc_t，早就在这）
      · 判据/阈值/状态名/投票：`ys-state` 模块（import 进来，不复制）
    """
    t0 = time.time()
    YS = ys_state()
    prof_path = req.get("profile") or YS.PROFILE_DEFAULT
    prof = YS.load_profile(prof_path)
    It = _load_frame(req)                                   # 活体=原始像素；离线=缓存帧张量
    t_load = time.time()
    H, W = int(It.shape[1]), int(It.shape[2])
    readings = {}
    if not YS.geom_ok(W, H):
        readings["GEOM/frame 尺寸 2560x1440"] = {
            "value": f"实际 {W}x{H}（缩放帧/抓帧失败态）", "passed": False, "kind": "pixel"}
    else:
        import numpy as np
        pts = YS.all_probe_points()
        arr = (It.permute(1, 2, 0).cpu().numpy() * 255).round().astype("uint8")
        cells = {(x, y): tuple(int(v) for v in arr[y, x]) for x, y in pts if x < W and y < H}
        readings.update(YS.pixel_readings(YS.CellsPixels(cells, W, H)))
        jobs, state_of = YS.anchor_jobs(prof)
        r = _batch_on(It, jobs)
        scores = {x["id"]: (x["best"]["score"] if x.get("best") else -1.0) for x in r["results"]}
        readings.update(YS.anchor_readings_from_scores(scores, state_of))
    res = YS.decide(readings)
    res.update({"channel": "fast", "readings": readings,
                "ms": round((time.time() - t0) * 1000),
                "load_ms": round((t_load - t0) * 1000),
                "judge_ms": round((time.time() - t_load) * 1000),
                "via": "daemon"})
    return res


def _probe(req):
    """常驻探针判定：只取该探针外接框那一小块（不抓全屏、离线走帧缓存）→ ys-state 的判据。

    离线：从 GPU 帧张量（`_frame_tensor` 缓存）切出外接框 —— 不重启 magick 子进程，
          所以 `--wait --poll 0.2` 才轮得动（实测从 ~370ms/次 降到 ~90ms/次）。
    活体：只抓外接框（`import -crop`，面积小）。
    """
    YS = ys_state()
    name = req.get("name")
    spec = YS.PROBES[YS.PROBE_ALIAS.get(name, name)]
    ox, oy, bw, bh = YS._probe_bbox(spec)
    if req.get("frame") or req.get("frame_bin"):
        It = _load_frame(req)
        H, W = int(It.shape[1]), int(It.shape[2])
        x0, y0 = max(0, min(ox, W - 1)), max(0, min(oy, H - 1))
        sub = It[:, y0:min(H, y0 + bh), x0:min(W, x0 + bw)]
        arr = (sub.permute(1, 2, 0).cpu().numpy() * 255).round().astype("uint8")
        return YS.probe(name, grabbed=(arr, x0, y0))
    arr = YL.grab(ox, oy, bw, bh)
    return YS.probe(name, grabbed=(arr, ox, oy))


def handle(req):
    cmd = req.get("cmd")
    YL.WIN = req.get("win", WIN)
    if cmd == "px":
        x, y = int(req["x"]), int(req["y"])
        p = YL.grab(x, y, 1, 1)[0, 0] * 255
        return {"v": f"{int(round(p[0]))} {int(round(p[1]))} {int(round(p[2]))}"}
    if cmd == "find":
        tpl = req["tpl"]
        import subprocess
        dim = subprocess.run(["identify", "-format", "%w %h", tpl], capture_output=True, text=True).stdout.split()
        tw, th = int(dim[0]), int(dim[1])
        raw = subprocess.run(["magick", tpl, "-depth", "8", "rgb:-"], capture_output=True).stdout
        import numpy as np
        T = np.frombuffer(raw, dtype=np.uint8).reshape(th, tw, 3).astype("float32") / 255.0
        if req.get("region"):
            X, Y, W, H = map(int, req["region"])
        else:
            g = dict(l.split("=") for l in subprocess.run(
                ["xdotool", "getwindowgeometry", "--shell", YL.WIN], capture_output=True, text=True).stdout.strip().splitlines() if "=" in l)
            X, Y, W, H = 0, 0, int(g["WIDTH"]), int(g["HEIGHT"])
        I = YL.grab(X, Y, W, H)
        x, y, s, backend = YL.ncc(I, T)
        return {"x": X + x + tw // 2, "y": Y + y + th // 2, "score": round(s, 4), "backend": backend}
    if cmd == "batch":
        return _batch(req)
    if cmd == "state":
        return _state(req)
    if cmd == "probe":
        return _probe(req)
    if cmd == "warm":
        return {"ok": True, "gpu": True}
    return {"error": "unknown cmd"}

def serve():
    if os.path.exists(SOCK):
        os.unlink(SOCK)
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    srv.bind(SOCK); os.chmod(SOCK, 0o600); srv.listen(8)
    # 预热：① 建 CUDA context；② 把 ys-state 判据模块 import 进来（首请求不再付 ~200ms）
    try:
        import numpy as np
        I = np.random.rand(64, 64, 3).astype("float32"); T = I[10:30, 10:30].copy()
        YL.ncc(I, T)
        print("[ys-lookd] 预热完成", flush=True)
    except Exception as e:
        print(f"[ys-lookd] 预热跳过: {e}", flush=True)
    try:
        YS = ys_state()
        print(f"[ys-lookd] 判据模块就绪：{os.path.basename(_YS_STATE_PATH)}"
              f"（{len(YS.PROBES)} 探针 / {len(YS.STATES)} 状态）", flush=True)
        # 再把「判态热路径」走一遍：cuFFT plan 与模板 GPU 张量都是首用才建，
        # 不预热的话第一次 state 请求要付 ~1.5s（实测 1685ms）。
        import numpy as np, torch
        prof = YS.load_profile(YS.PROFILE_DEFAULT)
        jobs, _ = YS.anchor_jobs(prof)
        I = torch.rand(3, 512, 512, device="cuda")
        _batch_on(I, jobs[:1])
        print(f"[ys-lookd] 判态热路径预热完成（{len(jobs)} 锚点 profile 已加载）", flush=True)
    except Exception as e:
        print(f"[ys-lookd] 判据模块加载失败（state/probe 命令不可用）: "
              f"{type(e).__name__}: {e}", flush=True)
    print(f"[ys-lookd] listening {SOCK}", flush=True)
    while True:
        c, _ = srv.accept()
        try:
            data = b""
            while not data.endswith(b"\n"):
                chunk = c.recv(4096)
                if not chunk: break
                data += chunk
            req = json.loads(data.decode())
            resp = handle(req)
        except Exception as e:
            resp = {"error": f"{type(e).__name__}: {e}", "tb": traceback.format_exc()[-400:]}
        try:
            c.sendall((json.dumps(resp) + "\n").encode())
        finally:
            c.close()

if __name__ == "__main__":
    serve()
