#!/usr/bin/env python3
"""ys-lookd — 常驻图像识别服务（GPU 常驻，摊掉 torch import 与 CUDA 初始化）

设计（成本链：进程启动 > I/O 面积 > 计算）：
  进程启动 3s + CUDA 初始化 ~1s 只付一次；此后每次请求只剩 I/O + 计算。
  协议：Unix socket 上的一行 JSON 请求 → 一行 JSON 响应。
  客户端 ys_look.py 优先连本服务，连不上就回退 in-process（CPU/GPU 自适应）。
"""
import json, os, socket, sys, threading, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ys_look as YL

SOCK = os.environ.get("YS_LOOKD_SOCK", f"/run/user/{os.getuid()}/ys-lookd.sock")
WIN = os.environ.get("YS_WIN", "0x01400001")



_CACHE = {}          # path -> (mtime, tensor)：只缓存**模板**（小、稳定）；帧不进缓存
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
    if req.get("frame"):                       # 离线/基准：直接读 PNG（帧不缓存：每次都是新的）
        from PIL import Image
        import numpy as np
        arr = np.asarray(Image.open(req["frame"]).convert("RGB"), dtype=np.float32) / 255.0
        return torch.from_numpy(arr).permute(2, 0, 1).contiguous().cuda()
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
    """一次请求跑完 N 个锚点 × M 个尺度。

    为什么要有它（2026-10-17 实测）：单次匹配 31ms，但 10 锚点串起来 690ms——
    开销全在每锚点的取帧/格式转换/PIL 缩放。批量把这三件各做一次。
    """
    import torch
    It = _load_frame(req)
    ox, oy = req.get("_origin", (0, 0))
    results = []
    for job in req.get("jobs", []):
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
    if cmd == "warm":
        return {"ok": True, "gpu": True}
    return {"error": "unknown cmd"}

def serve():
    if os.path.exists(SOCK):
        os.unlink(SOCK)
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    srv.bind(SOCK); os.chmod(SOCK, 0o600); srv.listen(8)
    # 预热：跑一次小匹配，把 CUDA context 建起来
    try:
        import numpy as np
        I = np.random.rand(64, 64, 3).astype("float32"); T = I[10:30, 10:30].copy()
        YL.ncc(I, T)
        print("[ys-lookd] 预热完成", flush=True)
    except Exception as e:
        print(f"[ys-lookd] 预热跳过: {e}", flush=True)
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
