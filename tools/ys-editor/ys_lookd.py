#!/usr/bin/env python3
"""ys-lookd — 常驻图像识别服务（GPU 常驻，摊掉 torch import 与 CUDA 初始化）

设计（成本链：进程启动 > I/O 面积 > 计算）：
  进程启动 3s + CUDA 初始化 ~1s 只付一次；此后每次请求只剩 I/O + 计算。
  协议：Unix socket 上的一行 JSON 请求 → 一行 JSON 响应。
  客户端 ys_look.py 优先连本服务，连不上就回退 in-process（CPU/GPU 自适应）。

命令（旧命令行为保持不变）：
  px / find / batch / state / probe / ocr / warm      —— 原有用途
  **world**（2026-10-18 用户批准新增，显式 cmd）—— 世界状态仪器：
    一次请求 = 取帧 + 判据下沉（复用 ys-state）+ 对象层（复用 ys-screen）+ 回执；
    帧缓冲 / OCR 内容寻址缓存 / 容器层缓存 / 结果缓存都在本进程内；
    live 帧先做窗口归属校验（票 34），不过就返回 error、**不抓像素**。
    契约见 `docs/architecture/gui-world-state.md` §3.5。
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



_CACHE = {}          # path -> (mtime, tensor)：只缓存**模板**（小、稳定）；离线帧见 _FRAME_CACHE
# 活体帧**复用窗口**（`ys-state --json --max-age-ms N` 显式开启）：真实轮里一个动作后要连判 1~3 次，
# 每次都重抓纯属浪费（抓帧 ~105ms 是活体开销的大头）。语义要点：
#   · 这是「减少抓帧**次数**」，不是「抓得更快」——不复用时必须报告 reused=false
#   · 默认**关**（max_age_ms 缺省/0 ⇒ 每次新抓）。用过期帧判态=静默错误，绝不能默认开。
#   · 只对同一 (roi, profile) 生效；换了 ROI/profile 一律视为未命中。
_LAST_FRAME = {"It": None, "t": 0.0, "key": None}
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
    key = (path, bool(cuda))
    hit = _CACHE.get(key)
    if hit and hit[0] == mt:
        return hit[1]
    arr = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0
    t = torch.from_numpy(arr).permute(2, 0, 1).contiguous()
    if cuda:
        t = t.cuda()
    _CACHE[key] = (mt, t)
    # 按**字节**而不是条数限流（2026-10-17 事故：16 张 2560×1440 帧张量 = 700MB+ 显存）
    total = sum(x[1].numel() * x[1].element_size() for x in _CACHE.values())
    while total > _CACHE_MAX_BYTES and len(_CACHE) > 1:
        k = next(iter(_CACHE))
        if k == key:
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
    else:                                      # 在线：抓窗口区域（原始像素，无 PNG 编解码）
        if req.get("region"):
            X, Y, W, H = map(int, req["region"])
            arr = YL.grab(X, Y, W, H)
        else:
            # 判据坐标系 = 全屏 2560×1440（契约 §5：屏 2560×1440，游戏窗 2561×1440 @(0,0)，
            # 多出的 1 列在屏外）。**别按窗口 geometry 抓**：实测 2561 宽会让
            # `import -crop 2561x1440` 只返回 2560×1440×3=11059200 字节，而 grab 的尺寸断言
            # 期望 2561×1440×3=11063520 ⇒ 抛「截取失败」，活体 --fast 于是静默回退本地（慢 4 倍）。
            try:
                YS = ys_state()
                X, Y, W, H = 0, 0, YS.FRAME_W, YS.FRAME_H
                arr = YL.grab(X, Y, W, H)
            except Exception:
                import subprocess                      # 兜底：窗口真实 geometry（坐标不符由 geom 校验兜住）
                g = dict(l.split("=") for l in subprocess.run(
                    ["xdotool", "getwindowgeometry", "--shell", YL.WIN],
                    capture_output=True, text=True).stdout.strip().splitlines() if "=" in l)
                X, Y, W, H = 0, 0, int(g["WIDTH"]), int(g["HEIGHT"])
                arr = YL.grab(X, Y, W, H)
        req["_origin"] = (X, Y)
    return torch.from_numpy(arr).permute(2, 0, 1).contiguous().cuda()


def _tpl_tensor(path, scales, cuda=True):
    """读一次模板图（带缓存），按各尺度在设备上缩放（不再走 PIL——那是批量时的胶水大头）。"""
    import torch
    import torch.nn.functional as F
    t = _cached(path, cuda=cuda)
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


def _batch_on(It, jobs, ox=0, oy=0, cuda=True):
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
        for s, Tt in _tpl_tensor(job["tpl"], job.get("scales", [1.0]), cuda=cuda):
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

    # 活体：只抓「锚点 ROI ∪ 取样点」的外接框（实测 1401×1440 = 54.7% 面积 / 5.77MB，
    # 全帧是 10.5MB）。坐标按 origin 平移；离线帧不做裁剪（它已经是文件）。
    is_live = not (req.get("frame") or req.get("frame_bin"))
    ox = oy = 0
    if is_live and not req.get("region"):
        try:
            roi = YS.fast_roi(prof)
            req = dict(req, region=list(roi))
            ox, oy = roi[0], roi[1]
        except Exception:                                  # noqa: BLE001 —— 算不出 ROI 就退回整帧
            pass
    t_cap = time.time()
    reused, age_ms = False, None
    max_age = req.get("max_age_ms")
    if is_live and max_age:
        key = (tuple(req.get("region") or ()), prof_path)
        age = (time.monotonic() - _LAST_FRAME["t"]) * 1000.0
        if _LAST_FRAME["It"] is not None and _LAST_FRAME["key"] == key and age <= float(max_age):
            It = _LAST_FRAME["It"]
            reused, age_ms = True, int(round(age))
    if not reused:
        It = _load_frame(req)                               # 活体=原始像素；离线=缓存帧张量
        if is_live:
            _LAST_FRAME.update({"It": None, "key": None})    # 先失效，避免半初始化被读到
            _LAST_FRAME.update({"It": It, "key": (tuple(req.get("region") or ()), prof_path),
                                "t": time.monotonic()})
    t_load = time.time()
    H, W = int(It.shape[1]), int(It.shape[2])              # 裁剪后尺寸
    readings = {}
    # 几何校验：
    #   · 活体裁剪帧 = 从**判据坐标系**里切出来的一块（fast_roi 已裁剪到 2560×1440 内）⇒ 坐标系可信
    #   · 离线帧 = 文件本身，按它的真实尺寸判（缩放帧/半截帧在这里被挡掉）
    geom_w, geom_h = (YS.FRAME_W, YS.FRAME_H) if is_live else (W, H)
    if not YS.geom_ok(geom_w, geom_h):
        readings["GEOM/frame 尺寸 2560x1440"] = {
            "value": f"实际 {geom_w}x{geom_h}（缩放帧/抓帧失败态）", "passed": False, "kind": "pixel"}
    else:
        import numpy as np
        pts = YS.all_probe_points()
        arr = (It.permute(1, 2, 0).cpu().numpy() * 255).round().astype("uint8")
        cells = {}
        for x, y in pts:
            rx, ry = x - ox, y - oy
            if 0 <= rx < W and 0 <= ry < H:
                cells[(x, y)] = tuple(int(v) for v in arr[ry, rx])
        readings.update(YS.pixel_readings(YS.CellsPixels(cells, geom_w, geom_h)))
        jobs, state_of = YS.anchor_jobs(prof)
        if ox or oy:                                       # 锚点 ROI 平移到裁剪坐标系
            for j in jobs:
                j["roi"] = [j["roi"][0] - ox, j["roi"][1] - oy, j["roi"][2], j["roi"][3]]
        r = _batch_on(It, jobs, -ox, -oy)
        scores = {x["id"]: (x["best"]["score"] if x.get("best") else -1.0) for x in r["results"]}
        readings.update(YS.anchor_readings_from_scores(scores, state_of))
    res = YS.decide(readings)   # 本体后备**不在这里做**：本服务持有的是 ROI 裁剪帧，
    # 而本体判据要看右下 UID（x≈2370，在裁剪外）。改由 ys-state 在 UNKNOWN 时用全帧兜底。
    readings = res.get('readings') or readings
    res.update({"channel": "fast", "readings": readings,
                "ms": round((time.time() - t0) * 1000),
                "load_ms": round((t_load - t0) * 1000),
                "judge_ms": round((time.time() - t_load) * 1000),
                "roi": [ox, oy, W, H], "frame_bytes": int(W * H * 3),
                "reused": reused, "frame_age_ms": age_ms,
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
    t0 = time.time()
    if req.get("frame") or req.get("frame_bin"):
        path = req.get("frame")
        cache_hit = False
        if path:
            try:
                st = os.stat(path)
                hit = _FRAME_CACHE.get(path)
                cache_hit = bool(hit and hit[0] == (st.st_mtime_ns, st.st_size))
            except OSError:
                pass
        It = _load_frame(req)
        H, W = int(It.shape[1]), int(It.shape[2])
        x0, y0 = max(0, min(ox, W - 1)), max(0, min(oy, H - 1))
        sub = It[:, y0:min(H, y0 + bh), x0:min(W, x0 + bw)]
        arr = (sub.permute(1, 2, 0).cpu().numpy() * 255).round().astype("uint8")
        t_load = time.time()
        out = YS.probe(name, grabbed=(arr, x0, y0))
        out.update({"cache_hit": cache_hit, "judge_ms": round((time.time() - t_load) * 1000)})
    else:
        # ⚠️ `YL.grab` 返回 **0..1 float**，而探针判据要 0..255 uint8（`int(v)` 直接取会全变 0/1）。
        # 2026-10-17 事故：活体探针因此**永远判"不可见"**（save_page/editor/menu_open 全 rc=1），
        # 而同一时刻 --print-state 全判对 —— 探针的"严"其实是单位错。
        arr = (YL.grab(ox, oy, bw, bh) * 255).round().astype("uint8")
        t_load = time.time()
        out = YS.probe(name, grabbed=(arr, ox, oy))
        out.update({"cache_hit": False, "judge_ms": round((time.time() - t_load) * 1000)})
    out["ms"] = round((time.time() - t0) * 1000)        # 含抓帧/解码，不是只算判据
    out["load_ms"] = round((t_load - t0) * 1000)
    out["via"] = "daemon"
    return out


# ── 常驻 OCR（2026-10-18）─────────────────────────────────────────────
# 为什么放进这个服务而不是另起一个：RapidOCR 每次新建 RapidOCR() 要付
#   - 模型加载 ~430ms（CPU）/ ~3300ms（CUDA 首次建 context）
#   - 加上进程启动 ~0.4s
# 实测同一帧：每次新进程 CPU **3673ms** → 本服务内常驻 CUDA **~690ms（5.3×）**。
# 再叠一层：`ys-screen` 本来就走这个 socket，不用多一条链路。
#
# GPU 接入的两个**非显然**前提（都会静默退回 CPU，只留一行 warning）：
#   ① onnxruntime 1.31 把 CUDA EP 拆成独立插件库，必须
#      `register_execution_provider_library('CUDAExecutionProvider', <capi>/libonnxruntime_providers_cuda.so)`；
#      只装 onnxruntime-gpu 不够，`preload_dlls()` 也不够（都实测过）。
#   ② ORT 的 CUDA EP 要 CUDA **12** 运行库（libcudart.so.12 / libcublas.so.12）；本机系统 CUDA 是 13，
#      所以由 venv 里的 nvidia-*-cu12 包提供，需要把它们加进 LD_LIBRARY_PATH。
_OCR_ENGINE = None
_OCR_ERR = None


def _ocr_engine():
    """懒加载 + 常驻。返回 (engine, err)。失败不抛，让调用方 fail-closed。

    2026-10-18 实测：把引擎留在常驻进程里，单帧 OCR 从「每次新进程 5.5~13.8s」
    降到 **~0.4s**（引擎加载只付一次）。GPU 生效需要三个条件，缺一个就静默退回 CPU：
      ① 预载 cuDNN（否则 ORT 加载 provider 报 undefined symbol）
      ② register_execution_provider_library（ORT ≥1.29 的 CUDA EP 是独立 so）
      ③ 绕过 RapidOCR 的 `get_device()=="GPU"` 判断（本机返回 'GPU-DNNL'）
    判据都在 ys_ocr.py 里（同一份实现），这里只复用。
    """
    global _OCR_ENGINE, _OCR_ERR
    if _OCR_ENGINE is not None or _OCR_ERR is not None:
        return _OCR_ENGINE, _OCR_ERR
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            'ys_ocr_mod', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ys_ocr.py'))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _OCR_ENGINE = mod._engine(verbose=True)      # 判别/GPU 开关全在 ys_ocr.py（唯一实现）
        print(f"[ys-lookd] OCR 引擎就绪（{'CUDA' if mod._GPU_STATE is True else 'CPU'}）", flush=True)
    except Exception as e:                          # noqa: BLE001
        _OCR_ERR = f"{type(e).__name__}: {e}"
        print(f"[ys-lookd] OCR 引擎不可用：{_OCR_ERR}", flush=True)
    return _OCR_ENGINE, _OCR_ERR


def _ocr_array(eng, arr, offset):
    """在**已解码的 RGB uint8 数组**上 OCR，返回全屏坐标的 boxes。"""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'ys_ocr_mod3', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ys_ocr.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    items = mod._normalize(eng(arr))
    ox, oy = offset
    out = []
    for box, txt, sc in items:
        xs = [p[0] + ox for p in box]
        ys = [p[1] + oy for p in box]
        out.append({'text': txt,
                    'cx': int(sum(xs) / len(xs)), 'cy': int(sum(ys) / len(ys)),
                    'score': round(sc, 4),
                    'box': [[int(p[0] + ox), int(p[1] + oy)] for p in box]})
    return out


def _ocr(req):
    eng, err = _ocr_engine()
    if eng is None:
        return {"error": f"OCR 不可用: {err}"}
    t0 = time.time()
    frame = req.get("frame")
    if not frame:
        # 无帧路径 = 让服务**自己抓全帧**再 OCR（2026-10-18）。
        # 为什么值得：客户端存一张 2560×1440 PNG 要 ~0.3~0.5s（PNG 编码），
        # 而服务在这里直接拿内存张量，省掉落盘+读盘+解码三笔。
        # 本体判态全程从 3.4s 降到 <1s，靠的就是这一条。
        try:
            import numpy as _np
            _YS = ys_state()                      # 判据模块（FRAME_W/H 在它里面）
            arr = YL.grab(0, 0, _YS.FRAME_W, _YS.FRAME_H)
            boxes = _ocr_array(eng, (arr * 255).round().astype(_np.uint8), (0, 0))
            return {"boxes": boxes, "n_total": len(boxes),
                    "ms": round((time.time() - t0) * 1000), "via": "daemon-live"}
        except Exception as e:                          # noqa: BLE001
            return {"error": f"活体取帧失败: {type(e).__name__}: {e}"}
    # 输出形状归一（2.x 元组 / 3.x RapidOCROutput）——与 ys_ocr.py 用同一份归一逻辑
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'ys_ocr_mod2', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ys_ocr.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    region = req.get("region")
    if region:                                     # 只裁一块再识别（省推理面积）
        import numpy as np
        from PIL import Image
        x, y, w, h = map(int, region)
        im = Image.open(frame).convert('RGB').crop((x, y, x + w, y + h))
        items = mod._normalize(eng(np.array(im)))
        off = (x, y)
    else:
        items = mod._normalize(eng(frame))
        off = (0, 0)
    boxes = []
    for box, txt, sc in items:
        xs = [p[0] + off[0] for p in box]
        ys = [p[1] + off[1] for p in box]
        boxes.append({'text': txt,
                      'cx': int(sum(xs) / len(xs)), 'cy': int(sum(ys) / len(ys)),
                      'score': round(sc, 4),
                      'box': [[int(p[0] + off[0]), int(p[1] + off[1])] for p in box]})
    return {"boxes": boxes, "n_total": len(items),
            "ms": round((time.time() - t0) * 1000), "via": "daemon"}



# ══════════════════════════════════════════════════════════════════
# 世界状态仪器（2026-10-18，用户批准；**显式 cmd="world"**，旧命令/旧行为不变）
# ──────────────────────────────────────────────────────────────────
# 一次请求做完：取帧 → 判据下沉（复用 ys-state 的 pixel/anchor/decide/native）→
# 对象层（复用 ys-screen 的 containers）→ 世界状态回执。三块缓存都在常驻进程里：
#   · 帧缓冲：同一帧（path+size+mtime / 帧内容 sha）只解码一次，GPU 张量也只建一次
#   · OCR 内容寻址缓存：按帧 sha + ys_ocr.py 指纹落 JSON（同帧第二次 ≤3ms，不再付 ~690ms）
#   · 容器层：复用 ys-screen 的 `containers_cached`（同帧同文本盒签名 ≤1ms）
# 另加「结果缓存」：同帧 + 同 profile + 同开关的第二次 world 请求直接返回（≤5ms 量级）。
# 说明：旧命令（px/find/batch/state/probe/ocr/warm）不走这里，行为不变。
WORLD_SCHEMA = "ys-lookd/world/0"
_WORLD_FRAME = {"key": None, "arr": None, "It": None, "half": None,
                "sha": None, "w": 0, "h": 0, "path": None, "source": None}
_WORLD_CACHE = {}
_WORLD_CACHE_MAX = 4
_WORLD_SHA = {}
_YS_SCREEN_MOD = None
_YS_ATTR_MOD = None
_OCR_CACHE_DIR = None


class WorldAttribError(RuntimeError):
    def __init__(self, attr):
        self.attr = attr
        self.code = "ATTRIBUTION_" + str(attr.get("verdict") or "UNKNOWN")
        super().__init__(f"live 取帧归属校验未通过：{attr.get('verdict')}")


def _world_use_cuda():
    try:
        import torch
        return bool(torch.cuda.is_available())
    except Exception:                                       # noqa: BLE001
        return False


def _world_file_sha(path):
    """离线帧 sha：同一文件（mtime_ns+size 不变）只算一次（2560×1440 PNG ≈ 2.5MB / 7ms）。"""
    import hashlib
    st = os.stat(path)
    key = (os.path.abspath(path), st.st_mtime_ns, st.st_size)
    hit = _WORLD_SHA.get(key)
    if hit:
        return hit
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for blk in iter(lambda: f.read(1 << 20), b""):
            h.update(blk)
    _WORLD_SHA[key] = h.hexdigest()
    if len(_WORLD_SHA) > 8:
        _WORLD_SHA.clear()
    return _WORLD_SHA.get(key) or h.hexdigest()


def _ys_screen():
    """按需 import `tools/ys-screen`（无扩展名脚本，SourceFileLoader）。只读复用，不改它。"""
    global _YS_SCREEN_MOD
    if _YS_SCREEN_MOD is None:
        import importlib.machinery, importlib.util
        path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ys-screen")
        loader = importlib.machinery.SourceFileLoader("ys_screen_canonical", path)
        spec = importlib.util.spec_from_loader("ys_screen_canonical", loader)
        mod = importlib.util.module_from_spec(spec)
        loader.exec_module(mod)
        _YS_SCREEN_MOD = mod
    return _YS_SCREEN_MOD


def _ys_screen_ruleset():
    try:
        return str(getattr(_ys_screen(), "CONTAINER_RULESET", "?"))
    except Exception:                                       # noqa: BLE001
        return "?"


def _world_ocr_dir():
    global _OCR_CACHE_DIR
    if _OCR_CACHE_DIR is None:
        base = os.environ.get("YS_LOOKD_OCR_CACHE")
        if not base:
            xdg = os.environ.get("XDG_CACHE_HOME") or os.path.expanduser("~/.cache")
            base = os.path.join(xdg, "ys-lookd", "ocr")
        try:
            os.makedirs(base, exist_ok=True)
        except OSError:
            import tempfile
            base = tempfile.mkdtemp(prefix="ys-lookd-ocr-")
        _OCR_CACHE_DIR = base
    return _OCR_CACHE_DIR


def _world_ocr_sig():
    """引擎指纹 + 输入约定（bgr1）。改 OCR 输入约定必须 +1，否则旧缓存会被当新结果。"""
    try:
        st = os.stat(os.path.join(os.path.dirname(os.path.abspath(__file__)), "ys_ocr.py"))
        return "bgr1-%d-%d" % (st.st_mtime_ns, st.st_size)
    except OSError:
        return "bgr1-0-0"


def _world_ocr(arr, sha):
    """帧内容寻址 OCR：先查磁盘缓存，未命中才跑常驻引擎。返回 (boxes|None, meta)。"""
    t0 = time.time()
    path = os.path.join(_world_ocr_dir(), "ocr-%s-%s.json" % (sha, _world_ocr_sig()))
    try:
        with open(path, encoding="utf-8") as f:
            c = json.load(f)
        if isinstance(c.get("boxes"), list):
            return c["boxes"], {"source": "cache", "ms": round((time.time() - t0) * 1000, 1),
                                "n": len(c["boxes"]), "err": None}
    except (OSError, ValueError):
        pass
    eng, err = _ocr_engine()
    if eng is None:
        return None, {"source": "unavailable", "ms": round((time.time() - t0) * 1000, 1),
                      "n": 0, "err": err}
    # 引擎约定是 BGR（ys_ocr.py/ys-screen 走图片路径时由 cv2 读成 BGR）；我们的 arr 是 RGB，
    # 必须转一次——实测 RGB 直喂会把 "GPU: 64%" 读成 "GPU8 64%"、把 "一官方社区" 并成 "官方社区"，
    # 导致 world 的对象层与 ys-screen CLI 不一致（同一帧 20 vs 22 个容器）。
    import numpy as np
    bgr = np.ascontiguousarray(arr[..., ::-1]) if arr.ndim == 3 and arr.shape[2] == 3 else arr
    boxes = _ocr_array(eng, bgr, (0, 0))
    ms = round((time.time() - t0) * 1000, 1)
    try:
        tmp = "%s.tmp%d" % (path, os.getpid())
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"boxes": boxes, "n": len(boxes), "sig": _world_ocr_sig(),
                       "frame_sha": sha}, f, ensure_ascii=False)
        os.replace(tmp, path)
    except OSError:
        pass
    return boxes, {"source": "engine", "ms": ms, "n": len(boxes), "err": None}


def _ys_attrib():
    """按需 import 快速归属模块（X11/EWMH，~20ms）；失败返回 None。"""
    global _YS_ATTR_MOD
    if _YS_ATTR_MOD is None:
        import importlib.machinery, importlib.util
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ys_attrib.py")
        loader = importlib.machinery.SourceFileLoader("ys_attrib_canonical", path)
        spec = importlib.util.spec_from_loader("ys_attrib_canonical", loader)
        mod = importlib.util.module_from_spec(spec)
        loader.exec_module(mod)
        _YS_ATTR_MOD = mod
    return _YS_ATTR_MOD


def _world_attrib():
    """live 取帧前的窗口归属校验（票 34）：走 X11 快路径（~20ms），不猜、不抬窗。"""
    try:
        mod = _ys_attrib()
        d, rc = mod.attrib()
        d = dict(d)
        d["rc"] = rc
        return d
    except Exception as e:                                  # noqa: BLE001
        return {"checked": False, "verdict": "UNKNOWN",
                "error": f"{type(e).__name__}: {e}"}


def _world_frame(req):
    """取一帧（离线/原始 bin/live）→ (arr, It, sha, W, H, source, attribution)。带 1 帧缓冲。

    live 帧先做归属校验（票 34）：不通过直接抛 WorldAttribError，**不返回像素**。
    """
    import hashlib
    import numpy as np
    import torch
    use_cuda = _world_use_cuda()
    src = "frame_bin" if req.get("frame_bin") else (
        "frame_b64" if req.get("frame_b64") else ("frame" if req.get("frame") else "live"))
    key = None
    path = None
    if src == "frame_bin":
        path = os.path.abspath(req["frame_bin"])
        st = os.stat(path)
        key = ("bin", path, st.st_mtime_ns, st.st_size)
        if _WORLD_FRAME["key"] == key:
            return (_WORLD_FRAME["arr"], _WORLD_FRAME["It"], _WORLD_FRAME["sha"],
                    _WORLD_FRAME["w"], _WORLD_FRAME["h"], _WORLD_FRAME["source"],
                    _WORLD_FRAME.get("attrib"))
        shape = tuple(req.get("frame_shape") or ())
        if len(shape) != 3:
            raise ValueError("frame_bin 需要 frame_shape=(H,W,3)")
        raw = np.fromfile(path, dtype=np.uint8)
        arr = raw.reshape(shape)
        sha = hashlib.sha256(raw).hexdigest()
    elif src == "frame":
        path = os.path.abspath(req["frame"])
        st = os.stat(path)
        key = ("png", path, st.st_mtime_ns, st.st_size)
        if _WORLD_FRAME["key"] == key:
            return (_WORLD_FRAME["arr"], _WORLD_FRAME["It"], _WORLD_FRAME["sha"],
                    _WORLD_FRAME["w"], _WORLD_FRAME["h"], _WORLD_FRAME["source"],
                    _WORLD_FRAME.get("attrib"))
        from PIL import Image
        arr = np.asarray(Image.open(path).convert("RGB"), dtype=np.uint8)
        sha = _world_file_sha(path)
    elif src == "frame_b64":
        import base64
        raw = base64.b64decode(req["frame_b64"])
        shape = tuple(req.get("frame_shape") or ())
        if len(shape) != 3:
            raise ValueError("frame_b64 需要 frame_shape=(H,W,3)")
        arr = np.frombuffer(raw, dtype=np.uint8).reshape(shape)
        sha = hashlib.sha256(raw).hexdigest()
        key = ("b64", sha)
        if _WORLD_FRAME["key"] == key:
            return (_WORLD_FRAME["arr"], _WORLD_FRAME["It"], _WORLD_FRAME["sha"],
                    _WORLD_FRAME["w"], _WORLD_FRAME["h"], _WORLD_FRAME["source"],
                    _WORLD_FRAME.get("attrib"))
    else:
        # live：先做归属校验（票 34），不过就**不抓**（fail-closed，不返回像素）
        attr = _world_attrib()
        if attr.get("verdict") != "OK":
            raise WorldAttribError(attr)
        YS = ys_state()
        arr = (YL.grab(0, 0, YS.FRAME_W, YS.FRAME_H) * 255).round().astype(np.uint8)
        sha = hashlib.sha256(arr.tobytes()).hexdigest()
        key = ("live", sha)
        if _WORLD_FRAME["key"] == key:
            return (_WORLD_FRAME["arr"], _WORLD_FRAME["It"], _WORLD_FRAME["sha"],
                    _WORLD_FRAME["w"], _WORLD_FRAME["h"], _WORLD_FRAME["source"],
                    _WORLD_FRAME.get("attrib"))
    W, H = int(arr.shape[1]), int(arr.shape[0])
    It = torch.from_numpy(arr.astype(np.float32) / 255.0).permute(2, 0, 1).contiguous()
    if use_cuda:
        It = It.cuda()
    _WORLD_FRAME.update({"key": key, "arr": arr, "It": It, "half": None, "sha": sha,
                         "w": W, "h": H, "path": path, "source": src,
                         "attrib": attr if src == "live" else None})
    return arr, It, sha, W, H, src, _WORLD_FRAME.get("attrib")


def _world_half(arr):
    """半分辨率图（容器层用）。**必须与 ys-screen.load_small 同口径（PIL LANCZOS）**——
    换插值会让容器集合轻微变化，同一帧 world 与 CLI 的对象数就对不上（2026-10-18 实测：
    cv2 INTER_AREA 20 个 vs ys-screen 22 个）。带帧缓冲。"""
    hit = _WORLD_FRAME.get("half")
    if hit is not None and hit.shape[0] == max(1, arr.shape[0] // 2):
        return hit
    try:
        from PIL import Image
        im = Image.fromarray(arr).resize((max(1, arr.shape[1] // 2), max(1, arr.shape[0] // 2)),
                                         Image.LANCZOS)
        import numpy as np
        half = np.asarray(im, dtype=np.uint8)
    except Exception:                                       # noqa: BLE001 —— 退回 cv2（仍可用）
        import cv2
        half = cv2.resize(arr, (max(1, arr.shape[1] // 2), max(1, arr.shape[0] // 2)),
                          interpolation=cv2.INTER_AREA)
    _WORLD_FRAME["half"] = half
    return half


def _world_state(arr, It, W, H, prof, boxes):
    """判据下沉：像素/锚点/投票/本体后备全部复用 ys-state（本函数只做"取数"）。"""
    YS = ys_state()
    t0 = time.time()
    readings = {}
    if not YS.geom_ok(W, H):
        readings["GEOM/frame 尺寸 2560x1440"] = {
            "value": f"实际 {W}x{H}（缩放帧/抓帧失败态）", "passed": False, "kind": "pixel"}
    else:
        cells = {}
        for x, y in YS.all_probe_points():
            if 0 <= x < W and 0 <= y < H:
                cells[(x, y)] = tuple(int(v) for v in arr[y, x])
        readings.update(YS.pixel_readings(YS.CellsPixels(cells, W, H)))
        jobs, state_of = YS.anchor_jobs(prof)
        r = _batch_on(It, jobs, cuda=_world_use_cuda())
        scores = {x["id"]: (x["best"]["score"] if x.get("best") else -1.0)
                  for x in r["results"]}
        readings.update(YS.anchor_readings_from_scores(scores, state_of))
    t_judge = round((time.time() - t0) * 1000, 1)
    if boxes:
        # 本体后备：仍走 ys-state 的 native_readings/decide_with_native（判据只有一份）。
        # 常驻服务单线程处理请求，临时换 _ocr_boxes 不会与别的请求交错；finally 必还原。
        orig = YS._ocr_boxes
        YS._ocr_boxes = lambda frame_path=None: boxes
        try:
            res = YS.decide_with_native(readings, None)
        finally:
            YS._ocr_boxes = orig
    else:
        res = YS.decide(readings)
    res = dict(res)
    res["readings"] = res.get("readings") or readings
    return res, t_judge


def _world_containers(arr, sha, boxes, W, H):
    """对象层：复用 ys-screen 的容器层 + 它的内容寻址缓存（按帧 sha + 文本盒签名）。"""
    t0 = time.time()
    try:
        S = _ys_screen()
        text = S.text_objects(boxes or [])
        half = _world_half(arr)
        res = S.containers_cached(None, half, 0.5, W, H, text,
                                  use_cache=True, frame_sha=sha)
        res = {k: res.get(k) for k in ("containers", "free_text", "free_glyphs",
                                       "degraded", "error")}
        res["timing_ms"] = round((time.time() - t0) * 1000, 1)
        return res
    except Exception as e:                                  # noqa: BLE001 —— fail-closed 成 degraded
        return {"containers": [], "free_text": [], "free_glyphs": [],
                "degraded": True, "error": f"{type(e).__name__}: {e}",
                "timing_ms": round((time.time() - t0) * 1000, 1)}


def _world(req):
    """cmd="world"：世界状态仪器（显式开启；请求里不给 cmd=world 就完全走旧路径）。"""
    t0 = time.time()
    YS = ys_state()
    prof_path = req.get("profile") or YS.PROFILE_DEFAULT
    do_ocr = bool(req.get("ocr", True))
    do_obj = bool(req.get("objects", True))
    try:
        arr, It, sha, W, H, src, attrib = _world_frame(req)
    except WorldAttribError as e:
        return {"schema": WORLD_SCHEMA, "error": str(e), "code": e.code,
                "attribution": e.attr, "via": "daemon"}
    except Exception as e:                                  # noqa: BLE001
        return {"schema": WORLD_SCHEMA, "error": f"{type(e).__name__}: {e}",
                "code": "FRAME_FAILED", "via": "daemon"}
    t_load = round((time.time() - t0) * 1000, 1)
    try:
        prof = YS.load_profile(prof_path)
        pst = os.stat(prof_path)
    except Exception as e:                                  # noqa: BLE001
        return {"schema": WORLD_SCHEMA, "error": f"profile: {type(e).__name__}: {e}",
                "code": "PROFILE_FAILED", "via": "daemon"}
    ck = (sha, os.path.abspath(prof_path), pst.st_mtime_ns, do_ocr, do_obj, _ys_screen_ruleset())
    if req.get("cache", True):
        hit = _WORLD_CACHE.get(ck)
        if hit is not None:
            out = json.loads(json.dumps(hit))               # 深拷贝：调用方改不脏缓存
            out["timing"] = {"cache_hit": True,
                             "total_ms": round((time.time() - t0) * 1000, 1)}
            return out
    boxes, ocr_meta = (None, {"source": "skip", "ms": 0, "n": 0, "err": None})
    if do_ocr:
        boxes, ocr_meta = _world_ocr(arr, sha)
    t_after_ocr = time.time()
    state, t_judge = _world_state(arr, It, W, H, prof, boxes)
    t_after_state = time.time()
    objects = _world_containers(arr, sha, boxes, W, H) if do_obj else None
    t_after_obj = time.time()
    degraded = []
    if do_ocr and boxes is None:
        degraded.append({"code": "OCR_UNAVAILABLE",
                         "detail": str(ocr_meta.get("err") or "OCR 引擎不可用")})
    if objects is not None and (objects.get("degraded") or objects.get("error")):
        degraded.append({"code": "OBJECTS_DEGRADED",
                         "detail": str(objects.get("error") or "")[:300]})
    out = {
        "schema": WORLD_SCHEMA,
        "state": state,
        "objects": objects,
        "frame": {"source": src, "path": _WORLD_FRAME.get("path"),
                  "sha256": sha, "w": W, "h": H, "bytes": int(W * H * 3)},
        "profile": os.path.basename(prof_path),
        "attribution": attrib,
        "timing": {"load_ms": t_load,
                   "ocr_ms": round((t_after_ocr - t0) * 1000 - t_load, 1),
                   "state_ms": round((t_after_state - t_after_ocr) * 1000, 1),
                   "judge_ms": t_judge,
                   "objects_ms": round((t_after_obj - t_after_state) * 1000, 1),
                   "total_ms": round((t_after_obj - t0) * 1000, 1),
                   "ocr_source": ocr_meta.get("source"), "ocr_n": ocr_meta.get("n"),
                   "ocr_err": ocr_meta.get("err"), "cache_hit": False,
                   "attribution_ms": (attrib or {}).get("elapsed_ms") if attrib else None},
        "degraded": degraded,
        "via": "daemon",
    }
    if req.get("cache", True):
        try:
            json.dumps(out)                                  # 只缓存可序列化结果
            _WORLD_CACHE[ck] = out
            while len(_WORLD_CACHE) > _WORLD_CACHE_MAX:
                _WORLD_CACHE.pop(next(iter(_WORLD_CACHE)))
        except (TypeError, ValueError):
            pass
    return out

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
    if cmd == "ocr":
        return _ocr(req)
    if cmd == "world":                     # 显式开启的世界状态仪器；旧命令不受影响
        return _world(req)
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
        # ⚠️ 回包失败**绝不许掀翻常驻服务**（2026-10-18 事故）：
        # 客户端（ys-state / tools/gui）在**自身超时**时会把 socket 直接关掉，此时服务端 sendall
        # 抛 BrokenPipeError；以前它没有任何 except 兜底 ⇒ 冒泡出 serve() ⇒ 进程退出 ⇒
        # systemd 重启 + 重新预热（~3s 冷启动）⇒ 下一次调用落到「daemon 不可用」回退本地（慢 4 倍）。
        # 表现是**间歇性 AND 与负载相关**的假红：门槛② 自测里两个 wall-clock 断言（≤3s / ≤3s）
        # 会飘红而四个 exit 码全对，重跑又全绿 —— 真因永远不在被测对象身上。
        # 语义：客户端先走了 = 这次响应没人要，丢弃即可，服务继续听下一个连接。
        try:
            c.sendall((json.dumps(resp) + "\n").encode())
        except (BrokenPipeError, ConnectionResetError) as e:
            print(f"[ys-lookd] 客户端提前断开，丢弃本次响应（{type(e).__name__}）", flush=True)
        except Exception as e:                              # noqa: BLE001 —— 任何回包失败都不许退出
            print(f"[ys-lookd] 回包失败但服务继续：{type(e).__name__}: {e}", flush=True)
        finally:
            try:
                c.close()
            except Exception:                               # noqa: BLE001
                pass

if __name__ == "__main__":
    serve()
