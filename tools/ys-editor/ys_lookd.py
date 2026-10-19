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
WIN = os.environ.get("YS_WIN") or __import__("ys_look")._resolve_win()



_CACHE = {}          # path -> (mtime, tensor)：只缓存**模板**（小、稳定）；离线帧见 _FRAME_CACHE
# 活体帧**复用窗口**（`ys-state --json --max-age-ms N` 显式开启）：真实轮里一个动作后要连判 1~3 次，
# 每次都重抓纯属浪费（抓帧 ~105ms 是活体开销的大头）。语义要点：
#   · 这是「减少抓帧**次数**」，不是「抓得更快」——不复用时必须报告 reused=false
#   · 默认**关**（max_age_ms 缺省/0 ⇒ 每次新抓）。用过期帧判态=静默错误，绝不能默认开。
#   · 只对同一 (roi, profile) 生效；换了 ROI/profile 一律视为未命中。
_LAST_FRAME = {"It": None, "t": 0.0, "key": None}
_PARTS = {}          # 分项耗时（grab/gpu/probe/anchor/decide/uid）：判态要能说清慢在哪一步
_XGRAB = {"g": None, "win": None}   # 进程内 XShm 抓帧器（2–12ms）；ImageMagick 子进程 ~116ms
_FULL = {"rgb": None, "roi": None}  # 单次请求内复用整帧（ROI 裁剪与 UID 小条同源，只抓一次）
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

def _full_shot():
    """整窗一次 XShm 抓帧（实测 2–12ms）；同一请求内复用。失败抛异常 → 调用方回退 ImageMagick。"""
    if _FULL.get("rgb") is not None:
        return _FULL["rgb"]
    import ys_capture as CAP
    disp = os.environ.get("DISPLAY") or ":1"
    key = int(str(YL.WIN), 0) if not isinstance(YL.WIN, int) else YL.WIN
    if _XGRAB["g"] is None or _XGRAB["win"] != key:
        _XGRAB["g"] = CAP.XShmGrabber(disp, key, 2560, 1440)
        _XGRAB["win"] = key
    rgb, ms = _XGRAB["g"].grab()
    _FULL["rgb"] = rgb
    _PARTS["xshm_ms"] = round(ms, 1)
    return rgb


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
        _t_grab = time.time()
        _t0x = time.time()
        try:                                   # 首选：进程内 XShm（整窗一次，ROI 就地裁）
            import numpy as _np
            _full = _full_shot()
            if req.get("region"):
                X, Y, W, H = map(int, req["region"])
            else:
                X, Y, W, H = 0, 0, _full.shape[1], _full.shape[0]
            arr = _full[Y:Y + H, X:X + W].astype(_np.float32) / 255.0
            _FULL["roi"] = arr                    # 判据取点直接用这份，省一次 GPU→CPU 回传
            req["_origin"] = (X, Y)
            _PARTS["grab_ms"] = round((time.time() - _t0x) * 1000, 1)
            _t_gpu = time.time()
            t = torch.from_numpy(arr).permute(2, 0, 1).contiguous().cuda()
            _PARTS["gpu_ms"] = round((time.time() - _t_gpu) * 1000, 1)
            return t
        except Exception as _e:                # noqa: BLE001 —— XShm 不可用（窗口没了/无 MIT-SHM）回退
            _PARTS["xshm_error"] = f"{type(_e).__name__}: {_e}"[:80]
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
        _PARTS["grab_ms"] = round((time.time() - _t_grab) * 1000, 1)
        _t_gpu = time.time()
        t = torch.from_numpy(arr).permute(2, 0, 1).contiguous().cuda()
        _PARTS["gpu_ms"] = round((time.time() - _t_gpu) * 1000, 1)
        return t
    _t_gpu = time.time()
    t = torch.from_numpy(arr).permute(2, 0, 1).contiguous().cuda()
    _PARTS["gpu_ms"] = round((time.time() - _t_gpu) * 1000, 1)
    return t


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

_UID_STRIP = (2200, 1340, 360, 100)   # 右下 UID 小条：本体判据的**唯一取数点**


def _uid_present(arr_full=None):
    """右下 UID 小条里有没有 "UID" —— `_state` 与 `_world_state` **共用这一份**。

    2026-10-19 修正：这段逻辑此前只写在 `_state` 里，而 `cmd=world` 走自己的 `YS.decide`
    直接返回 ⇒ 同一帧 `cmd=state` 说 GAME_WORLD、`cmd=world` 说 PLAYTEST（实测差 1 个态，
    且 `look` 的 state 全部来自 world 路径）。界面态判定必须只有一处实现（门槛⑤）。

    arr_full：整帧 HxWx3（uint8 0..255）。给了就从同一帧裁条（0ms），否则退回单抓。
    结果按**时间**缓存 5s——画面持续渲染 ⇒ 像素 sha 每帧都变，而 UID 只在切场景时变。
    """
    import numpy as _np
    bx, by, bw, bh = _UID_STRIP
    _now = time.monotonic()
    hit = _UID_CACHE.get("t")
    if hit and (_now - hit[1]) < 5.0:
        return hit[0]
    try:
        if arr_full is not None and len(getattr(arr_full, "shape", ())) >= 2 \
                and arr_full.shape[0] >= by + bh and arr_full.shape[1] >= bx + bw:
            strip = arr_full[by:by + bh, bx:bx + bw]
            a8 = strip if strip.dtype == _np.uint8 else \
                (_np.clip(strip, 0, 1) * 255).round().astype(_np.uint8)
        else:                                      # 整帧不可用/尺寸不够 ⇒ 退回单抓
            raw = YL.grab(bx, by, bw, bh)
            a8 = (_np.clip(raw, 0, 1) * 255).round().astype(_np.uint8)
        eng, _err = _ocr_engine()
        found = False
        if eng is not None:
            boxes = _ocr_array(eng, a8, (bx, by))
            found = any("UID" in (b.get("text") or "").upper() for b in boxes)
    except Exception:                              # noqa: BLE001 —— 取不到就当"没有"，保持原判定
        return False
    _UID_CACHE["t"] = (found, _now)
    if len(_UID_CACHE) > 8:
        _UID_CACHE.clear()
        _UID_CACHE["t"] = (found, _now)
    return found


def _apply_world_uid(res, arr_full=None):
    """UNKNOWN/PLAYTEST ⇒ 用 UID 小条补判 GAME_WORLD（就地改 res）。判据只有这一份。"""
    if (res or {}).get("state") not in ("UNKNOWN", "PLAYTEST"):
        return res
    try:
        if _uid_present(arr_full):
            res["replaced"] = str(res.get("state")) + "->GAME_WORLD"
            res["state"] = "GAME_WORLD"
            res["confidence"] = max(0.6, float(res.get("confidence") or 0))
            res["ambiguous"] = False
    except Exception as _e:                        # noqa: BLE001
        res["world_check_error"] = f"{type(_e).__name__}: {_e}"
    return res


def _state(req):
    """常驻判态（fast 通道）：**一次取数**（抓原始像素，无 PNG 编解码）→ 判据 → JSON。

    分工（契约 §1/§6 单一源）：
      · 本服务：取像素 + 锚点匹配（math 在 ys_look.ncc_t，早就在这）
      · 判据/阈值/状态名/投票：`ys-state` 模块（import 进来，不复制）
    """
    t0 = time.time()
    _PARTS.clear()
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
        _t_probe = time.time()
        pts = YS.all_probe_points()
        if _FULL.get("roi") is not None and _FULL["roi"].shape[:2] == (H, W):
            arr = (_FULL["roi"] * 255).round().astype("uint8")   # 活体 XShm 路径：免 24MB 回传
        else:
            arr = (It.permute(1, 2, 0).cpu().numpy() * 255).round().astype("uint8")
        cells = {}
        for x, y in pts:
            rx, ry = x - ox, y - oy
            if 0 <= rx < W and 0 <= ry < H:
                cells[(x, y)] = tuple(int(v) for v in arr[ry, rx])
        readings.update(YS.pixel_readings(YS.CellsPixels(cells, geom_w, geom_h)))
        _PARTS["probe_ms"] = round((time.time() - _t_probe) * 1000, 1)
        _t_anc = time.time()
        jobs, state_of = YS.anchor_jobs(prof)
        if ox or oy:                                       # 锚点 ROI 平移到裁剪坐标系
            for j in jobs:
                j["roi"] = [j["roi"][0] - ox, j["roi"][1] - oy, j["roi"][2], j["roi"][3]]
        r = _batch_on(It, jobs, -ox, -oy)
        scores = {x["id"]: (x["best"]["score"] if x.get("best") else -1.0) for x in r["results"]}
        readings.update(YS.anchor_readings_from_scores(scores, state_of))
        _PARTS["anchor_ms"] = round((time.time() - _t_anc) * 1000, 1)
    _t_dec = time.time()
    res = YS.decide(readings)
    _PARTS["decide_ms"] = round((time.time() - _t_dec) * 1000, 1)
    # 本体态补判（2026-10-19）：fast ROI 裁到 x≤1400，右下 UID 行不在内 ⇒ 世界里会判成
    # PLAYTEST/UNKNOWN。判据本体已抽到 `_apply_world_uid`（`_world_state` 共用同一份，
    # 修掉"同一帧 cmd=state 说 GAME_WORLD、cmd=world 说 PLAYTEST"的双实现漂移）。
    # **绝不调用会重入 daemon RPC 的路径**（那会自锁，e676e698 已踩）。
    if is_live and res.get("state") in ("UNKNOWN", "PLAYTEST"):
        _t_uid = time.time()
        try:                                   # 同一张 XShm 整帧裁条：0ms（避免第二次抓帧 ~50ms）
            _full = _full_shot()
        except Exception:                      # noqa: BLE001 —— 整帧不可用时由 helper 退回单抓
            _full = None
        _apply_world_uid(res, _full)
        _PARTS["uid_ms"] = round((time.time() - _t_uid) * 1000, 1)
    readings = res.get('readings') or readings
    res.update({"channel": "fast", "readings": readings,
                "ms": round((time.time() - t0) * 1000),
                "load_ms": round((t_load - t0) * 1000),
                "judge_ms": round((time.time() - t_load) * 1000),
                "roi": [ox, oy, W, H], "frame_bytes": int(W * H * 3),
                "reused": reused, "frame_age_ms": age_ms,
                "via": "daemon", "parts": dict(_PARTS)})
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
_UID_CACHE = {}
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


# ── 按对象 OCR（2026-10-18 新增；票 25/33 的「分块并行 + 内容寻址缓存」落地形态）──────
# 为什么放常驻进程：引擎加载 + CUDA context 约 9s，只该付一次；切片 OCR 的瓶颈是
# rec（2–9ms/框）+ 预处理，而**静止 UI 的对象切片逐字节不变** ⇒ 按切片内容寻址缓存，
# 增量帧只算变了的对象（实测同一屏二次 14ms 级）。
_OBJ_CACHE = {}                      # sha16(crop)+ruleset -> {'text','score'}
_OBJ_FRAME_CACHE = {}                # frame_sha+det_max+ruleset -> 整个对象结果（同帧二次 ~ms）
_OBJ_CACHE_MAX = 8000
_OBJ_RULESET = 'objocr-v1'           # 改切片/归一/模型必须 +1（否则旧缓存被当新结果）
# rec 批大小上限（**实测事实，别再加**）：本机 6GB 显存、游戏 1.9GB + lookd 2.1GB ⇒ 可用 ~1.5GB；
# rec_batch_num=32 实测 ONNXRuntimeError（BFCArena 申请 187–203MB 失败）；16 可跑但余量小 ⇒ 默认 8。
_REC_BATCH = max(1, min(16, int(os.environ.get('YS_LOOKD_REC_BATCH', '8'))))
_REC_BATCH_HARD_CAP = 16              # 32 实测 OOM；不要调高
# 小字号兜底（Lead 2026-10-18 裁决）：对象字高 < SMALL_FONT_H 的占比 ≥ SMALL_FONT_RATIO 时
# 回退全帧 OCR（多付 50–100ms 的帧才付）。阈值可 env 覆盖，bench 里给触发率与触发帧召回。
_SMALL_FONT_H = int(os.environ.get('YS_LOOKD_SMALL_FONT_H', '20'))
_SMALL_FONT_RATIO = float(os.environ.get('YS_LOOKD_SMALL_FONT_RATIO', '0.35'))
_VRAM_LAST = {'ts': 0.0, 'free_mb': -1}


def _vram_free_mb():
    """nvidia-smi 空闲显存（节流 3s；查不到返回 -1，不阻塞）。"""
    now = time.time()
    if now - _VRAM_LAST['ts'] < 3.0:
        return _VRAM_LAST['free_mb']
    try:
        out = subprocess.run(['nvidia-smi', '--query-gpu=memory.free', '--format=csv,noheader,nounits'],
                             capture_output=True, text=True, timeout=4).stdout.strip()
        _VRAM_LAST['free_mb'] = int(out.splitlines()[0])
    except Exception:                                     # noqa: BLE001
        _VRAM_LAST['free_mb'] = -1
    _VRAM_LAST['ts'] = now
    return _VRAM_LAST['free_mb']


def _ocr_objects_core(arr, frame_sha=None, det_max=2000, parallel=4, cache=True,
                      max_objects=200, rec_buckets=False):
    """rec_buckets=True：按行宽分桶（<320/<640/<960/更宽）分别 rec——同一桶内 padding 到
    该桶 max_wh_ratio，避免「一个 1550 宽的宽行把整批 6 个窄行都撑到 1550」（实测宽批 48ms vs 窄批 12ms）。
    输出与逐条 rec 一致（只是批分组不同），字符召回实测不变。"""
    """按对象 OCR 核心：整帧 det 一次 → 每个对象切片 rec（并行 + 内容寻址缓存 + 帧级缓存）。

    输入是 **RGB uint8 数组**（命令路径从文件读、world 路径直接用内存帧，避免落盘）。
    返回里 det_ms / rec_ms / crop_ms / cache 命中分开报——**缓存命中不是计算变快**。
    """
    import hashlib
    import threading
    import numpy as np
    from rapidocr.utils.process_img import get_rotate_crop_image
    from rapidocr.ch_ppocr_rec.typings import TextRecInput
    eng, err = _ocr_engine()
    if eng is None:
        return {"error": f"OCR 不可用: {err}", "code": "OCR_UNAVAILABLE"}
    t0 = time.time()
    bgr = np.ascontiguousarray(arr[..., ::-1])            # 引擎约定 BGR（同 _world_ocr）
    # 帧级缓存：同一帧（同 det_max/ruleset）直接回整个结果——省掉 det ~140ms
    if not frame_sha:
        frame_sha = hashlib.sha256(np.ascontiguousarray(arr).tobytes()).hexdigest()[:24]
    fkey = f"{frame_sha}:{int(det_max)}:{_OBJ_RULESET}:{'b' if rec_buckets else 'n'}"
    if cache and fkey in _OBJ_FRAME_CACHE:
        hit = dict(_OBJ_FRAME_CACHE[fkey])
        hit['total_ms'] = round((time.time() - t0) * 1000, 1)
        hit['frame_cache'] = True
        hit['n_cached'] = len(hit.get('objects') or [])
        return hit
    det = eng.text_det or eng._load_det_model()
    _prev = (det.limit_type, det.limit_side_len)          # 共享引擎：用完必须还原
    det.limit_type = 'max'
    det.limit_side_len = int(det_max)
    t1 = time.time()
    try:
        d = eng.text_det(bgr)
    finally:
        det.limit_type, det.limit_side_len = _prev
    det_ms = round((time.time() - t1) * 1000, 1)
    boxes = [] if d.boxes is None else [np.array(b, copy=True) for b in d.boxes][:int(max_objects)]
    objects = [None] * len(boxes)
    todo = []
    t2 = time.time()
    for i, b in enumerate(boxes):
        crop = get_rotate_crop_image(bgr, b)
        key = hashlib.sha256(np.ascontiguousarray(crop).tobytes()).hexdigest()[:20] + ':' + _OBJ_RULESET
        hit = _OBJ_CACHE.get(key) if cache else None
        bb = [int(b[:, 0].min()), int(b[:, 1].min()),
              int(b[:, 0].max() - b[:, 0].min()), int(b[:, 1].max() - b[:, 1].min())]
        if hit is not None:
            objects[i] = {'i': i, 'bbox': bb, 'text': hit['text'], 'score': hit['score'],
                          'cached': True}
        else:
            todo.append((i, key, crop, bb))
    crop_ms = round((time.time() - t2) * 1000, 1)
    free = _vram_free_mb()
    batch = _REC_BATCH if not (0 <= free < 300) else 4
    if 0 <= free < 120:
        return {"error": f"显存不足（free={free}MB <120MB），拒绝 OCR 以免 OOM",
                "code": "VRAM_LOW", "det_ms": det_ms, "free_mb": free}
    threads = max(1, min(int(parallel or 4), 8))
    rec_ms = 0.0
    n_jobs = 0
    if todo:
        rec = eng.text_rec or eng._load_rec_model()
        rec.rec_batch_num = min(batch, _REC_BATCH_HARD_CAP)
        # 分组：优先按行宽分桶（每桶单独批，padding 不被宽行拖大），桶内再按 batch 切批
        if rec_buckets:
            def _bucket(c):
                r = c.shape[1] / float(c.shape[0])
                return 0 if r <= 320 / 48.0 else (1 if r <= 640 / 48.0 else
                                                  (2 if r <= 960 / 48.0 else 3))
            groups = {}
            for item in todo:
                groups.setdefault(_bucket(item[2]), []).append(item)
            jobs = []
            for k in sorted(groups):
                items = groups[k]
                for i in range(0, len(items), batch):
                    jobs.append(items[i:i + batch])
        else:
            jobs = [todo[i:i + batch] for i in range(0, len(todo), batch)]
        n_jobs = len(jobs)
        out = [None] * len(jobs)
        errs = [None] * len(jobs)
        t3 = time.time()

        def work(k):
            try:
                items = jobs[k]
                r = rec(TextRecInput(img=[c for _, _, c, _ in items], return_word_box=False))
                txts = list(r.txts or [])
                scs = list(r.scores or [])
                out[k] = [(items[j][0], items[j][1], txts[j] if j < len(txts) else '',
                           float(scs[j]) if j < len(scs) else 0.0, items[j][3])
                          for j in range(len(items))]
            except Exception as e:                        # noqa: BLE001
                errs[k] = f'{type(e).__name__}: {e}'
        nthreads = max(1, min(threads, len(jobs)))
        th = [threading.Thread(target=work, args=(k,)) for k in range(nthreads)]
        [t.start() for t in th]
        for t in th:
            t.join()
        # 剩余批（jobs 比线程多时）由主线程补齐
        for k in range(nthreads, len(jobs)):
            work(k)
        rec_ms = round((time.time() - t3) * 1000, 1)
        for k, got in enumerate(out):
            if errs[k] and not got:
                return {"error": f"rec 失败: {errs[k]}", "code": "REC_FAILED",
                        "det_ms": det_ms, "free_mb": free}
            for (i, key, txt, sc, bb) in (got or []):
                objects[i] = {'i': i, 'bbox': bb, 'text': txt, 'score': round(sc, 4),
                              'cached': False}
                if cache and len(_OBJ_CACHE) < _OBJ_CACHE_MAX:
                    _OBJ_CACHE[key] = {'text': txt, 'score': round(sc, 4)}
    objects = [o for o in objects if o is not None]
    res = {'objects': objects, 'n_objects': len(objects), 'n_ocr': len(todo),
           'n_cached': len(objects) - len(todo), 'det_ms': det_ms, 'rec_ms': rec_ms,
           'crop_ms': crop_ms, 'total_ms': round((time.time() - t0) * 1000, 1),
           'ruleset': _OBJ_RULESET, 'rec_batch': min(batch, _REC_BATCH_HARD_CAP),
           'rec_buckets': bool(rec_buckets), 'rec_jobs': n_jobs,
           'parallel': threads, 'free_mb': free, 'cache_size': len(_OBJ_CACHE),
           'frame_sha': frame_sha, 'frame_cache': False}
    if cache:
        if len(_OBJ_FRAME_CACHE) > 64:
            _OBJ_FRAME_CACHE.clear()
        _OBJ_FRAME_CACHE[fkey] = dict(res)
    return res


def _ocr_objects(req):
    """cmd="ocr_objects"：从文件读帧 → 按对象 OCR（核心见 _ocr_objects_core）。"""
    import numpy as np
    from PIL import Image
    if req.get("reset"):
        _OBJ_CACHE.clear()
        _OBJ_FRAME_CACHE.clear()
    frame = req.get("frame")
    if not frame or not os.path.isfile(frame):
        return {"error": f"ocr_objects 需要存在的 frame 路径（收到 {frame!r}）", "code": "BAD_FRAME"}
    try:
        arr = np.asarray(Image.open(frame).convert('RGB'))
    except Exception as e:                                # noqa: BLE001
        return {"error": f"读帧失败: {type(e).__name__}: {e}", "code": "BAD_FRAME"}
    return _ocr_objects_core(arr, frame_sha=req.get("frame_sha"),
                             det_max=int(req.get("det_max") or 2000),
                             parallel=int(req.get("parallel") or 4),
                             cache=bool(req.get("cache", True)),
                             max_objects=int(req.get("max_objects") or 200),
                             rec_buckets=bool(req.get("rec_buckets", False)))


# ── 分块差量 OCR（2026-10-19；用户点名方向：空间换时间）────────────────────────
# 核心事实：GUI 大部分时间是静止的 ⇒ 把帧切成 N×M 块，块级内容寻址缓存；
# 只有「核心区像素变了」的块才跑 det+rec，其余块直接复用上次结果（含文本与坐标）。
# 设计要点：
#   · 块 = core（网格单元，哈希只算这块）+ OCR 扩边 margin（默认 96px，保证跨界的文本
#     在裁剪里完整；归属按**文本中心落在哪个 core**判定，天然去重）。
#   · 变化块占比 ≥ fallback_ratio（默认 0.6，即冷帧/换页）→ 回退**整帧 OCR**（333ms 地板），
#     并把结果按中心分配给各 core 填缓存 —— 冷帧不会因为切块而变慢。
#   · 跨块去重：按核心归属（中心法）+ 兜底 IoU>0.5 去重。
_BLOCK_CACHE = {}                    # 内容哈希 -> {'boxes','cells'}（跨帧复用）
_BLOCK_PREV = {}                     # (grid_idx, W, H) -> 上一次该位置的内容 {'boxes','cells'}
# 为什么要有 prev 表：内容一变，哈希 key 就变了，光靠 key 找不到"这块上一帧长什么样"，
# 就没法做块内格子差量（实测：只按 key 查 ⇒ cells_changed=0、所有行重识别 200–500ms）。
_BLOCK_CACHE_MAX = 4000
_BLOCK_RULESET = 'blk-v1'            # 改切块/扩边/哈希必须 +1
_BLOCK_GRID = (3, 3)                 # rows, cols
_BLOCK_MARGIN = 160
_BLOCK_FALLBACK_RATIO = 0.6


def _block_rects(W, H, grid=_BLOCK_GRID, margin=_BLOCK_MARGIN):
    """返回 [(core(x0,y0,x1,y1), crop(x0,y0,x1,y1))]；crop=core 扩边（clamp 到帧内）。"""
    rows, cols = grid
    out = []
    for r in range(rows):
        for c in range(cols):
            cx0, cx1 = int(round(W * c / cols)), int(round(W * (c + 1) / cols))
            cy0, cy1 = int(round(H * r / rows)), int(round(H * (r + 1) / rows))
            out.append(((cx0, cy0, cx1, cy1),
                        (max(0, cx0 - margin), max(0, cy0 - margin),
                         min(W, cx1 + margin), min(H, cy1 + margin))))
    return out


def _block_cells(bgr, core, grid=16):
    """把 core 区域缩成 16×16 的格子均值（用于「块内哪些格子变了」的差量判定；约 1ms/块）。"""
    import numpy as np
    x0, y0, x1, y1 = core
    c = bgr[y0:y1, x0:x1]
    if c.size == 0:
        return np.zeros((grid, grid, 3), np.float32)
    h, w = c.shape[:2]
    ys = np.linspace(0, h, grid + 1).astype(int); xs = np.linspace(0, w, grid + 1).astype(int)
    out = np.zeros((grid, grid, 3), np.float32)
    for r in range(grid):
        for q in range(grid):
            cell = c[ys[r]:ys[r + 1], xs[q]:xs[q + 1]]
            if cell.size:
                out[r, q] = cell.reshape(-1, 3).mean(axis=0)
    return out


def _changed_cells(old, cur, thr=6.0):
    """返回变化的格子集合 {(r,q)}；old 为 None 表示全部变化。"""
    if old is None:
        return None
    import numpy as np
    d = np.abs(old - cur).max(axis=2)
    return set(zip(*np.where(d > thr)))


def _cell_range(bbox, core, grid=16):
    """把全局 bbox 映射到 core 内的格子区间（含 1 格外扩，避免边界误判）。"""
    x0, y0, x1, y1 = core
    bx, by, bw, bh = bbox
    h, w = max(1, y1 - y0), max(1, x1 - x0)
    r0 = int((by - y0) / h * grid); r1 = int((by + bh - y0) / h * grid)
    q0 = int((bx - x0) / w * grid); q1 = int((bx + bw - x0) / w * grid)
    return set((r, q) for r in range(max(0, r0 - 1), min(grid - 1, r1 + 1) + 1)
               for q in range(max(0, q0 - 1), min(grid - 1, q1 + 1) + 1))


def _iou_xywh(a, b):
    ax, ay, aw, ah = a; bx, by, bw, bh = b
    x0, y0 = max(ax, bx), max(ay, by)
    x1, y1 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    inter = (x1 - x0) * (y1 - y0)
    return inter / float(aw * ah + bw * bh - inter + 1e-9)


def _ocr_region_bgr(bgr, rect, det, rec, det_max, batch, old_boxes=None,
                    changed_cells=None, core=None):
    """在块 crop 上 det + 按需 rec。

    **块内差量**：16×16 格子均值判定「块内哪些格子变了」；det 出的行若不碰变化格子，
    直接复用上一帧同位置那行（IoU>0.5）的文本，只有碰到的行才 rec。
    为什么不用行级像素哈希：全帧 det（2000 宽）与块内 det（原分辨率）的框会差 1–3px，
    裁块像素不同 ⇒ 哈希全 miss（实测一个 21 行的块因此白跑 200ms）。
    """
    import numpy as np
    from rapidocr.utils.process_img import get_rotate_crop_image
    from rapidocr.ch_ppocr_rec.typings import TextRecInput
    x0, y0, x1, y1 = rect
    crop = bgr[y0:y1, x0:x1]
    _prev = (det.limit_type, det.limit_side_len)
    det.limit_type = 'max'
    det.limit_side_len = int(det_max)
    try:
        d = det(crop)
    finally:
        det.limit_type, det.limit_side_len = _prev
    if d.boxes is None:
        return []
    out = []
    todo = []
    for b in d.boxes:
        xs = b[:, 0]; ys = b[:, 1]
        bb = [int(xs.min()) + x0, int(ys.min()) + y0,
              int(xs.max() - xs.min()), int(ys.max() - ys.min())]
        reuse = None
        if old_boxes and changed_cells is not None and core is not None:
            cells = _cell_range(bb, core)
            if not (cells & changed_cells):
                best = max(old_boxes, key=lambda o: _iou_xywh(bb, o['bbox']), default=None)
                if best is not None and _iou_xywh(bb, best['bbox']) > 0.5:
                    reuse = best
        if reuse is not None:
            out.append({'text': reuse['text'], 'score': reuse['score'], 'bbox': bb, 'reused': True})
        else:
            idx = len(out)
            out.append({'text': '', 'score': 0.0, 'bbox': bb, 'reused': False})
            todo.append((idx, b))
    if todo:
        crops = [get_rotate_crop_image(crop, np.array(b, copy=True)) for _, b in todo]
        rec.rec_batch_num = min(batch, _REC_BATCH_HARD_CAP)
        r = rec(TextRecInput(img=crops, return_word_box=False))
        txts = list(r.txts or []); scs = list(r.scores or [])
        for j, (idx, _b) in enumerate(todo):
            if idx < len(out):
                out[idx]['text'] = txts[j] if j < len(txts) else ''
                out[idx]['score'] = round(float(scs[j]), 4) if j < len(scs) else 0.0
    return out


def _dedupe_objects(objs, iou_thr=0.5):
    """按 IoU 去重（保留分数高的），再按 (y,x) 排序。"""
    def _iou(a, b):
        ax, ay, aw, ah = a; bx, by, bw, bh = b
        x0, y0 = max(ax, bx), max(ay, by)
        x1, y1 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
        if x1 <= x0 or y1 <= y0:
            return 0.0
        inter = (x1 - x0) * (y1 - y0)
        return inter / float(aw * ah + bw * bh - inter + 1e-9)
    kept = []
    for o in sorted(objs, key=lambda o: -(o.get('score') or 0)):
        if all(_iou(o['bbox'], k['bbox']) <= iou_thr for k in kept):
            kept.append(o)
    kept.sort(key=lambda o: (o['bbox'][1] // 24, o['bbox'][0]))
    return [{'i': i, **{k: v for k, v in o.items() if k != 'i'}} for i, o in enumerate(kept)]


def _ocr_blocks_core(arr, det_max=2000, cache=True, grid=_BLOCK_GRID,
                     margin=_BLOCK_MARGIN, fallback_ratio=_BLOCK_FALLBACK_RATIO,
                     parallel=4, max_objects=200):
    """分块差量 OCR。返回与 _ocr_objects_core 同形的 objects + blocks 统计。"""
    import zlib
    import numpy as np
    t0 = time.time()
    H, W = arr.shape[:2]
    bgr = np.ascontiguousarray(arr[..., ::-1])
    rects = _block_rects(W, H, grid, margin)
    keys = []
    for core, crop in rects:
        c = np.ascontiguousarray(bgr[core[1]:core[3], core[0]:core[2]])
        keys.append(f'{zlib.crc32(c):08x}:{_BLOCK_RULESET}:{core[2]-core[0]}x{core[3]-core[1]}:{int(det_max)}')
    hits = []
    misses = []
    cur_cells = []
    for i, (core, _crop) in enumerate(rects):
        cc = _block_cells(bgr, core)
        cur_cells.append(cc)
        if cache and keys[i] in _BLOCK_CACHE:          # ① 精确内容命中（最快）
            hits.append(i)
            _BLOCK_PREV[(i, W, H)] = _BLOCK_CACHE[keys[i]]
            continue
        prev = _BLOCK_PREV.get((i, W, H))
        if cache and prev is not None:
            ch = _changed_cells(prev.get('cells'), cc)
            if ch is not None and not ch:               # ② 格子级"视觉未变"命中
                # JPEG 复查/编码噪声会让逐字节 crc 全 miss（实测 real pairs 0/9 精确命中），
                # 但 16×16 格子均值不变 ⇒ 认为这块没变，直接沿用上一帧结果。
                hits.append(i)
                continue
        miss.append(i) if False else misses.append(i)
    hash_ms = round((time.time() - t0) * 1000, 1)
    blocks = [{'core': list(core), 'crop': list(crop), 'hit': i in set(hits)} for i, (core, crop) in enumerate(rects)]
    # 冷帧/换页：变化块占比过大 → 整帧 OCR（保证不低于整帧地板，并把结果填进块缓存）
    if len(misses) / float(len(rects)) >= fallback_ratio:
        full = _ocr_objects_core(arr, det_max=det_max, cache=False, max_objects=max_objects,
                                 rec_buckets=False)
        objs = full.get('objects') or []
        if cache:
            # ① 填块缓存（按文本中心归属 core）；② 同时填**行级缓存**——否则"冷帧之后第一次
            # 改到某个块"仍要把该块所有行重识别（实测 200–500ms），行级预填后只付变化的几行。
            import hashlib
            import numpy as np
            from rapidocr.utils.process_img import get_rotate_crop_image
            filled_lines = 0
            for o in objs:
                b = np.array([[o['bbox'][0], o['bbox'][1]],
                              [o['bbox'][0] + o['bbox'][2], o['bbox'][1]],
                              [o['bbox'][0] + o['bbox'][2], o['bbox'][1] + o['bbox'][3]],
                              [o['bbox'][0], o['bbox'][1] + o['bbox'][3]]], dtype=np.float32)
                try:
                    c = get_rotate_crop_image(bgr, b)
                    k = hashlib.sha256(np.ascontiguousarray(c).tobytes()).hexdigest()[:20] + ':' + _OBJ_RULESET
                    if len(_OBJ_CACHE) < _OBJ_CACHE_MAX and k not in _OBJ_CACHE:
                        _OBJ_CACHE[k] = {'text': o['text'], 'score': o['score']}
                        filled_lines += 1
                except Exception:                     # noqa: BLE001
                    pass
            for i, (core, crop) in enumerate(rects):
                inside = [o for o in objs
                          if core[0] <= o['bbox'][0] + o['bbox'][2] // 2 < core[2]
                          and core[1] <= o['bbox'][1] + o['bbox'][3] // 2 < core[3]]
                entry = {'boxes': [{'text': o['text'], 'score': o['score'], 'bbox': o['bbox']}
                                   for o in inside],
                         'cells': _block_cells(bgr, core)}
                _BLOCK_PREV[(i, W, H)] = entry
                if len(_BLOCK_CACHE) < _BLOCK_CACHE_MAX:
                    _BLOCK_CACHE[keys[i]] = entry
        return {'objects': objs, 'n_objects': len(objs), 'mode': 'blocks',
                'fallback': 'fullframe', 'blocks': blocks,
                'block_stats': {'total': len(rects), 'hit': len(hits), 'ocr': len(rects),
                                'changed_ratio': 1.0},
                'det_ms': full.get('det_ms'), 'rec_ms': full.get('rec_ms'),
                'hash_ms': hash_ms, 'total_ms': round((time.time() - t0) * 1000, 1),
                'rec_batch': full.get('rec_batch'), 'frame_cache': False}
    # 差量：只 OCR 变化的块
    eng, err = _ocr_engine()
    if eng is None:
        return {'error': f'OCR 不可用: {err}', 'code': 'OCR_UNAVAILABLE'}
    det = eng.text_det or eng._load_det_model()
    rec = eng.text_rec or eng._load_rec_model()
    free = _vram_free_mb()
    batch = _REC_BATCH if not (0 <= free < 300) else 4
    t1 = time.time()
    ocr_objs = []
    n_reuse = 0
    n_rec = 0
    n_lines_before = len(_OBJ_CACHE)
    for i in misses:
        core, crop = rects[i]
        prev = _BLOCK_PREV.get((i, W, H)) or _BLOCK_CACHE.get(keys[i]) or {}
        prev_boxes = prev.get('boxes') or []
        cc = cur_cells[i]
        changed_cells = _changed_cells(prev.get('cells'), cc)
        if changed_cells and prev_boxes:
            # ② 只在「变化格子的 bbox + margin」上跑 det+rec（不再整块跑）
            g = 16
            cw = max(1.0, (core[2] - core[0]) / g); ch = max(1.0, (core[3] - core[1]) / g)
            rows = [r for r, _ in changed_cells]; cols = [q for _, q in changed_cells]
            rx0 = core[0] + int(min(cols) * cw); rx1 = core[0] + int((max(cols) + 1) * cw)
            ry0 = core[1] + int(min(rows) * ch); ry1 = core[1] + int((max(rows) + 1) * ch)
            sub = (max(crop[0], rx0 - _BLOCK_MARGIN), max(crop[1], ry0 - _BLOCK_MARGIN),
                   min(crop[2], rx1 + _BLOCK_MARGIN), min(crop[3], ry1 + _BLOCK_MARGIN))
            loc = _ocr_region_bgr(bgr, sub, det, rec, det_max, batch,
                                  old_boxes=prev_boxes, changed_cells=changed_cells, core=core)
            # 未变化的旧框保留（它们的文本没变），变化区域的框用本次结果替换
            kept = [o for o in prev_boxes
                    if not (_cell_range(o['bbox'], core) & changed_cells)]
            merged_boxes = _dedupe_objects([{'text': o['text'], 'score': o['score'], 'bbox': o['bbox']}
                                            for o in kept]
                                           + [{'text': o['text'], 'score': o['score'], 'bbox': o['bbox']}
                                              for o in loc])
            g = merged_boxes
        else:
            # 首次见到这块：整块跑（块内无旧结果可复用）
            loc = _ocr_region_bgr(bgr, crop, det, rec, det_max, batch,
                                  old_boxes=prev_boxes or None, changed_cells=changed_cells, core=core)
            g = [{'text': o['text'], 'score': o['score'], 'bbox': o['bbox']} for o in loc]
        ocr_objs.append((i, g, core))
        n_reuse += sum(1 for o in (loc or []) if o.get('reused'))
        n_rec += sum(1 for o in (loc or []) if not o.get('reused'))
    region_ms = round((time.time() - t1) * 1000, 1)
    merged = []
    for i in hits:
        merged.extend((_BLOCK_CACHE.get(keys[i]) or {}).get('boxes') or [])
    for i, g, core in ocr_objs:
        inside = [o for o in g
                  if core[0] <= o['bbox'][0] + o['bbox'][2] // 2 < core[2]
                  and core[1] <= o['bbox'][1] + o['bbox'][3] // 2 < core[3]]
        merged.extend(inside)
        if cache:
            entry = {'boxes': inside, 'cells': cc}
            _BLOCK_PREV[(i, W, H)] = entry
            if len(_BLOCK_CACHE) < _BLOCK_CACHE_MAX:
                _BLOCK_CACHE[keys[i]] = entry
    objs = _dedupe_objects(merged)
    for b, i in zip(blocks, range(len(blocks))):
        b['n_boxes'] = len(_BLOCK_CACHE.get(keys[i], [])) if b['hit'] else             len(next((g for j, g, _ in ocr_objs if j == i), []))
    return {'objects': objs[:max_objects], 'n_objects': min(len(objs), max_objects),
            'mode': 'blocks', 'fallback': None, 'blocks': blocks,
            'block_stats': {'total': len(rects), 'hit': len(hits), 'ocr': len(misses),
                            'changed_ratio': round(len(misses) / float(len(rects)), 3)},
            'det_ms': region_ms, 'rec_ms': 0.0, 'hash_ms': hash_ms,
            'line_cache_before': n_lines_before, 'line_cache_after': len(_OBJ_CACHE),
            'lines_reused': n_reuse, 'lines_rec': n_rec,
            'cells_changed_total': sum(len(_changed_cells((_BLOCK_CACHE.get(keys[i]) or {}).get('cells'),
                                                          _block_cells(bgr, core)) or []) for i in misses
                                        for core, _crop in [rects[i]]),
            'total_ms': round((time.time() - t0) * 1000, 1),
            'rec_batch': min(batch, _REC_BATCH_HARD_CAP), 'free_mb': free, 'frame_cache': False}


# ── 对象级基线差量 OCR（2026-10-19 第二轮；用户口径：页面 = 一组对象）────────────
# 基线 = 上一帧的 det 框集合（整份缓存，**不重跑 det**）；每帧只做：
#   ① 每个旧框：裁切 → 8×8 缩略签名 → 与基线比（容差吸收 JPEG 噪声/渲染微动）→ 没变就复用文字；
#   ② 变了的框：只对这些框跑 rec（不跑 det）；
#   ③ 新增对象兜底：整帧降采样差 → 找**未被任何旧框覆盖**的成片变化区域（面积超阈值）→ 只在该区域
#      （+margin）补跑一次 det，把新对象捡回来（**旧框一个都不丢**——上一轮召回崩到 71% 的根因就是丢框）；
#   ④ 变化框占比 ≥ rebuild_ratio（默认 0.4）或基线缺失 → 整帧 det 重建基线（冷帧/换页）。
_PAGE = {}                            # (W,H) -> {'boxes': [...], 'sig': [8×8×3], 'gray': 1/4 灰度}
_PAGE_RULESET = 'page-v1'
_PAGE_SIG_THR = 6.0                   # 8×8 签名平均绝对差（0-255）
_PAGE_REBUILD_RATIO = 0.40
_PAGE_NEW_AREA = 1600                 # 1/4 尺度下的最小新区域面积（= 全分辨率 25600px²）
_PAGE_MARGIN = 48


def _thumb(arr, g=8):
    """8×8 缩略（格子均值），用于选框级签名比较——比逐字节 crc 稳（JPEG 噪声）。"""
    import numpy as np
    h, w = arr.shape[:2]
    if h < g or w < g:
        return np.zeros((g, g, 3), np.float32)
    ys = np.linspace(0, h, g + 1).astype(int); xs = np.linspace(0, w, g + 1).astype(int)
    out = np.zeros((g, g, 3), np.float32)
    for r in range(g):
        for c in range(g):
            cell = arr[ys[r]:ys[r + 1], xs[c]:xs[c + 1]]
            if cell.size:
                out[r, c] = cell.reshape(-1, 3).mean(axis=0)
    return out


def _page_gray(arr, step=4):
    import numpy as np
    return arr[::step, ::step].mean(axis=2)


def _new_regions(prev_gray, cur_gray, boxes, step=4, thr=10.0, min_area=_PAGE_NEW_AREA):
    """找「未被旧框覆盖、且成片变化」的区域（1/4 尺度坐标 → 返回全分辨率 bbox 列表）。"""
    import numpy as np
    from scipy import ndimage as ndi  # 本机有 scipy？没有就退回连通域手写
    d = (np.abs(prev_gray - cur_gray) > thr)
    # 抹掉旧框覆盖的区域
    H, W = d.shape
    for b in boxes:
        x, y, w, h = [int(v) for v in b['bbox']]
        d[max(0, y // step):min(H, (y + h) // step), max(0, x // step):min(W, (x + w) // step)] = False
    lab, n = ndi.label(d)
    out = []
    for sl in ndi.find_objects(lab):
        if sl is None:
            continue
        h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
        if w * h < min_area:
            continue
        out.append((sl[1].start * step, sl[0].start * step, w * step, h * step))
    return out


def _ocr_page_core(arr, det_max=2000, cache=True, sig_thr=_PAGE_SIG_THR,
                   rebuild_ratio=_PAGE_REBUILD_RATIO, max_objects=200):
    import numpy as np
    t0 = time.time()
    H, W = arr.shape[:2]
    bgr = np.ascontiguousarray(arr[..., ::-1])
    key = (W, H)
    page = _PAGE.get(key) if cache else None
    stats = {'mode': 'page', 'reused': 0, 'rec': 0, 'new': 0, 'rebuilt': False,
             'det_ms': 0.0, 'rec_ms': 0.0, 'sig_ms': 0.0}
    eng, err = _ocr_engine()
    if eng is None:
        return {'error': f'OCR 不可用: {err}', 'code': 'OCR_UNAVAILABLE'}
    det = eng.text_det or eng._load_det_model()
    rec = eng.text_rec or eng._load_rec_model()
    free = _vram_free_mb()
    batch = _REC_BATCH if not (0 <= free < 300) else 4
    rec.rec_batch_num = min(batch, _REC_BATCH_HARD_CAP)

    # ── 冷启动 / 重建：整帧 det 一次（贵，但只付一次）
    if page is None:
        t1 = time.time()
        full = _ocr_objects_core(arr, det_max=det_max, cache=False, max_objects=max_objects,
                                 rec_buckets=False)
        stats['det_ms'] = full.get('det_ms'); stats['rec_ms'] = full.get('rec_ms')
        objs = full.get('objects') or []
        sigs = []
        for o in objs:
            x, y, w, h = [int(v) for v in o['bbox']]
            sigs.append(_thumb(arr[max(0, y):y + h, max(0, x):x + w]))
        _PAGE[key] = {'boxes': objs, 'sig': sigs, 'gray': _page_gray(arr)}
        stats.update(rebuilt=True, cold=True)
        return {'objects': objs[:max_objects], 'n_objects': len(objs), **stats,
                'total_ms': round((time.time() - t0) * 1000, 1), 'rec_batch': batch}

    # ── 逐框签名比较（只裁切+缩略，不跑 det）
    t1 = time.time()
    boxes = page['boxes']; sigs = page['sig']
    changed = []
    for i, o in enumerate(boxes):
        x, y, w, h = [int(v) for v in o['bbox']]
        sig = _thumb(arr[max(0, y):y + h, max(0, x):x + w])
        if float(np.abs(sig - sigs[i]).mean()) > sig_thr:
            changed.append(i)
    stats['sig_ms'] = round((time.time() - t1) * 1000, 1)
    if len(boxes) and len(changed) / float(len(boxes)) >= rebuild_ratio:
        _PAGE.pop(key, None)                       # 结构大改 → 重建
        return _ocr_page_core(arr, det_max=det_max, cache=cache, sig_thr=sig_thr,
                              rebuild_ratio=rebuild_ratio, max_objects=max_objects)
    # ── 变了的框只跑 rec
    if changed:
        t2 = time.time()
        crops = []
        for i in changed:
            x, y, w, h = [int(v) for v in boxes[i]['bbox']]
            crops.append(arr[max(0, y):y + h, max(0, x):x + w])
        from rapidocr.utils.process_img import get_rotate_crop_image
        from rapidocr.ch_ppocr_rec.typings import TextRecInput
        rc = [get_rotate_crop_image(bgr, np.array([[boxes[i]['bbox'][0], boxes[i]['bbox'][1]],
                                                   [boxes[i]['bbox'][0] + boxes[i]['bbox'][2], boxes[i]['bbox'][1]],
                                                   [boxes[i]['bbox'][0] + boxes[i]['bbox'][2], boxes[i]['bbox'][1] + boxes[i]['bbox'][3]],
                                                   [boxes[i]['bbox'][0], boxes[i]['bbox'][1] + boxes[i]['bbox'][3]]], np.float32))
              for i in changed]
        r = rec(TextRecInput(img=rc, return_word_box=False))
        txts = list(r.txts or []); scs = list(r.scores or [])
        for j, i in enumerate(changed):
            boxes[i] = dict(boxes[i], text=txts[j] if j < len(txts) else '',
                            score=round(float(scs[j]), 4) if j < len(scs) else 0.0)
            x, y, w, h = [int(v) for v in boxes[i]['bbox']]
            sigs[i] = _thumb(arr[max(0, y):y + h, max(0, x):x + w])
        stats['rec'] = len(changed)
        stats['rec_ms'] = round((time.time() - t2) * 1000, 1)
    # ── 新增对象兜底：只在「未被旧框覆盖的成片变化」区域补 det（不整帧 det）
    try:
        prev_gray = page['gray']
        cur_gray = _page_gray(arr)
        regions = _new_regions(prev_gray, cur_gray, boxes)
    except Exception:                                 # noqa: BLE001  （scipy 缺失时跳过兜底）
        regions = []
    if regions:
        t3 = time.time()
        new_objs = []
        for (rx, ry, rw, rh) in regions[:4]:
            sx0, sy0 = max(0, rx - _PAGE_MARGIN), max(0, ry - _PAGE_MARGIN)
            sx1, sy1 = min(W, rx + rw + _PAGE_MARGIN), min(H, ry + rh + _PAGE_MARGIN)
            loc = _ocr_region_bgr(bgr, (sx0, sy0, sx1, sy1), det, rec, det_max, batch)
            for o in loc:
                if rx - 8 <= o['bbox'][0] <= rx + rw + 8 and ry - 8 <= o['bbox'][1] <= ry + rh + 8:
                    new_objs.append({'text': o['text'], 'score': o['score'], 'bbox': o['bbox']})
        # 只加与旧框 IoU≤0.5 的新框（旧框一个都不丢）
        for o in new_objs:
            if all(_iou_xywh(o['bbox'], b['bbox']) <= 0.5 for b in boxes):
                boxes.append(o)
                x, y, w, h = [int(v) for v in o['bbox']]
                sigs.append(_thumb(arr[max(0, y):y + h, max(0, x):x + w]))
                stats['new'] += 1
        stats['det_ms'] = round((time.time() - t3) * 1000, 1)
    page['boxes'] = boxes; page['sig'] = sigs; page['gray'] = _page_gray(arr)
    stats['reused'] = len(boxes) - stats['rec']
    return {'objects': boxes[:max_objects], 'n_objects': len(boxes), **stats,
            'total_ms': round((time.time() - t0) * 1000, 1), 'rec_batch': batch}


def _ocr_page(req):
    """cmd="ocr_page"：对象级基线差量 OCR（默认不参与主路径）。"""
    import numpy as np
    from PIL import Image
    if req.get('reset'):
        _PAGE.clear()
    frame = req.get('frame')
    if not frame or not os.path.isfile(frame):
        return {'error': f'ocr_page 需要存在的 frame 路径（收到 {frame!r}）', 'code': 'BAD_FRAME'}
    try:
        arr = np.asarray(Image.open(frame).convert('RGB'))
    except Exception as e:                            # noqa: BLE001
        return {'error': f'读帧失败: {type(e).__name__}: {e}', 'code': 'BAD_FRAME'}
    return _ocr_page_core(arr, det_max=int(req.get('det_max') or 2000),
                          cache=bool(req.get('cache', True)),
                          sig_thr=float(req.get('sig_thr') or _PAGE_SIG_THR),
                          rebuild_ratio=float(req.get('rebuild_ratio') or _PAGE_REBUILD_RATIO),
                          max_objects=int(req.get('max_objects') or 200))


# ── 多帧共识底板（temporal consensus plate；2026-10-19 用户口径）──────────────
# 基线不是"上一帧"，而是**同一页面 N≥5 帧的逐像素中值**（静态底板）+ 多帧持续变化像素（动态掩码）。
# 底板只 OCR 一次（离线）；查询 = 新帧 vs 底板的变化掩码 → 只对变化区域 det+rec；
# 底板文本按"未变化"复用（框级检查），动态区域永远跳过。
_PLATE = {}                            # page -> {'plate','dyn','boxes','W','H'}
_PLATE_RULESET = 'plate-v1'
_PLATE_DIFF_THR = 12                   # 0-255 像素差阈值
_PLATE_DYN_FRAC = 0.5                  # 多帧中偏差>阈值的帧占比超过它 → always-dynamic
_PLATE_MIN_AREA = 400                  # 1/4 尺度连通域最小面积
_PLATE_MARGIN = 48
_PLATE_TEXT_CHANGE_RATIO = 0.02         # 文字掩码 XOR 比例阈值（默认 2%，可 req 覆盖）


def _plate_quarter(img):
    import numpy as np
    return img[::4, ::4].astype(np.int16)


def _ocr_plate_build(req):
    """action=build：frames=[路径...]（N≥5）→ 中值底板 + 动态掩码 + 底板 OCR（离线，慢没关系）。"""
    import numpy as np
    from PIL import Image
    page = req.get('page') or 'default'
    fps = list(req.get('frames') or [])
    if req.get('dir'):
        import glob as _g
        pat = req.get('pattern') or '*.jpg'
        fps += sorted(_g.glob(os.path.join(req['dir'], pat)))
    if len(fps) < 3:
        return {'error': 'build 需要至少 3 帧（建议 5–10）', 'code': 'BAD_FRAMES'}
    t0 = time.time()
    imgs = [np.asarray(Image.open(f).convert('RGB')) for f in fps]
    h = min(i.shape[0] for i in imgs); w = min(i.shape[1] for i in imgs)
    stack = np.stack([i[:h, :w] for i in imgs])
    plate = np.median(stack, axis=0).astype(np.uint8)
    med = plate.astype(np.int16)
    dev = (np.abs(stack.astype(np.int16) - med).max(axis=3) > _PLATE_DIFF_THR)   # N×H×W
    dyn = (dev.mean(axis=0) > _PLATE_DYN_FRAC)                                   # H×W
    dyn_q = dyn[::4, ::4]
    t1 = time.time()
    objs = _ocr_objects_core(plate, det_max=2000, cache=False)['objects']
    _PLATE[page] = {'plate': plate, 'dyn': dyn_q, 'boxes': objs, 'W': w, 'H': h}
    return {'ok': True, 'objects': objs, 'n_objects': len(objs),
            'page': page, 'frames': len(fps), 'w': w, 'h': h,
            'dynamic_px_ratio': round(float(dyn.mean()), 4),
            'box_count': len(objs), 'build_ms': round((time.time() - t0) * 1000, 1),
            'plate_ocr_ms': round((time.time() - t1) * 1000, 1)}


def _ocr_plate_query(req):
    """action=query：新帧 vs 底板 → 只对变化区域 det+rec；静态区复用底板文本。"""
    import numpy as np
    from PIL import Image
    from scipy import ndimage as ndi
    page = req.get('page') or 'default'
    pl = _PLATE.get(page)
    if not pl:
        return {'error': f'没有页面 {page} 的底板（先 action=build）', 'code': 'NO_PLATE'}
    t0 = time.time()
    arr = np.asarray(Image.open(req['frame']).convert('RGB'))
    h = min(arr.shape[0], pl['H']); w = min(arr.shape[1], pl['W'])
    arr = arr[:h, :w]
    bgr = np.ascontiguousarray(arr[..., ::-1])
    eng, err = _ocr_engine()
    if eng is None:
        return {'error': f'OCR 不可用: {err}', 'code': 'OCR_UNAVAILABLE'}
    det = eng.text_det or eng._load_det_model(); rec = eng.text_rec or eng._load_rec_model()
    free = _vram_free_mb(); batch = _REC_BATCH if not (0 <= free < 300) else 4
    # 1) 变化掩码（1/4 尺度；去掉动态区）
    cur_q = _plate_quarter(arr); plate_q = _plate_quarter(pl['plate'][:h, :w])
    diff = (np.abs(cur_q - plate_q).max(axis=2) > _PLATE_DIFF_THR)
    dyn = pl['dyn'][:diff.shape[0], :diff.shape[1]]
    diff = diff & ~ndi.binary_dilation(dyn, iterations=2)
    lab, n = ndi.label(diff)
    regions = []
    for sl in ndi.find_objects(lab):
        if sl is None: continue
        rh = sl[0].stop - sl[0].start; rw = sl[1].stop - sl[1].start
        if rw * rh < _PLATE_MIN_AREA: continue
        regions.append((sl[1].start * 4, sl[0].start * 4, rw * 4, rh * 4))
    changed_px_ratio = round(float(diff.mean()), 4) if diff.size else 0.0
    mask_ms = round((time.time() - t0) * 1000, 1)
    gate = {'regions_threshold': 3, 'px_ratio_threshold': 0.05,
            'regions': len(regions), 'changed_px_ratio': changed_px_ratio,
            'rebuild': (len(regions) >= 3 or changed_px_ratio >= 0.05)}
    if gate['rebuild']:
        # 换页/大变化 → **不重建底板**（重建要 1.2s，比整帧 OCR 还慢）；
        # 直接回落到标准 ocr_objects 路径返回本次结果，底板标记 stale，留给后台/下次 build 重建。
        _PLATE[page]['stale'] = True
        fb = _ocr_objects_core(arr, det_max=2000, cache=True)
        return {'objects': fb.get('objects') or [], 'n_objects': fb.get('n_objects'),
                'mode': 'plate_fallback_objects', 'page': page, 'gate': gate,
                'plate_stale': True, 'fallback': 'ocr_objects',
                'det_ms': fb.get('det_ms'), 'rec_ms': fb.get('rec_ms'),
                'total_ms': round((time.time() - t0) * 1000, 1)}
    # 2) 底板框：未被变化覆盖的复用文字；被覆盖的只重跑 rec
    # 框级判据：**文字掩码**（Otsu 二值化后 XOR 比例），不再用 8×8 亮度——
    # 亮度接近但文字变了的框（数字/选中态）只有掩码能抓到。
    import cv2
    changed_boxes = []; kept = []
    text_changed = 0
    for o in pl['boxes']:
        x, y, bw, bh = [int(v) for v in o['bbox']]
        x1, y1 = min(w, x + bw), min(h, y + bh)
        if x1 <= x or y1 <= y:
            kept.append(o); continue
        sub = diff[max(0, y // 4):min(diff.shape[0], y1 // 4 + 1),
                   max(0, x // 4):min(diff.shape[1], x1 // 4 + 1)]
        area_changed = bool(sub.size and sub.mean() > 0.05)
        a = cv2.cvtColor(arr[y:y1, x:x1], cv2.COLOR_RGB2GRAY)
        b = cv2.cvtColor(pl['plate'][y:y1, x:x1], cv2.COLOR_RGB2GRAY)
        try:
            _, ta = cv2.threshold(a, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            _, tb = cv2.threshold(b, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            ink = max(1, int((tb > 0).sum()))
            ratio = float(((ta > 0) ^ (tb > 0)).sum()) / ink
        except Exception:                                # noqa: BLE001
            ratio = 1.0
        if ratio > _PLATE_TEXT_CHANGE_RATIO or area_changed:
            changed_boxes.append(o); text_changed += 1
        else:
            kept.append(o)
    t1 = time.time()
    rec_ms = 0.0
    if changed_boxes:
        from rapidocr.utils.process_img import get_rotate_crop_image
        from rapidocr.ch_ppocr_rec.typings import TextRecInput
        rc = []
        for o in changed_boxes:
            x, y, bw, bh = [int(v) for v in o['bbox']]
            rc.append(get_rotate_crop_image(bgr, np.array([[x, y], [x + bw, y],
                                                           [x + bw, y + bh], [x, y + bh]], np.float32)))
        rec.rec_batch_num = min(batch, _REC_BATCH_HARD_CAP)
        r = rec(TextRecInput(img=rc, return_word_box=False))
        txts = list(r.txts or []); scs = list(r.scores or [])
        for j, o in enumerate(changed_boxes):
            kept.append(dict(o, text=txts[j] if j < len(txts) else '',
                             score=round(float(scs[j]), 4) if j < len(scs) else 0.0))
        rec_ms = round((time.time() - t1) * 1000, 1)
    # 3) 变化区域补 det（把新对象捡回来；旧框一个不丢）
    t2 = time.time()
    new_objs = []
    # 只对「未被任何底板框覆盖」的变化区域补 det（被覆盖的文本已经在上面按 rec 更新，不丢框）
    uncovered = []
    for (rx, ry, rw, rh) in regions[:4]:
        covered = any(_iou_xywh([rx, ry, rw, rh], b['bbox']) > 0.15 for b in kept)
        if not covered:
            uncovered.append((rx, ry, rw, rh))
    for (rx, ry, rw, rh) in uncovered:
        sx0, sy0 = max(0, rx - _PLATE_MARGIN), max(0, ry - _PLATE_MARGIN)
        sx1, sy1 = min(w, rx + rw + _PLATE_MARGIN), min(h, ry + rh + _PLATE_MARGIN)
        loc = _ocr_region_bgr(bgr, (sx0, sy0, sx1, sy1), det, rec, 2000, batch)
        for o in loc:
            if all(_iou_xywh(o['bbox'], b['bbox']) <= 0.5 for b in kept):
                new_objs.append({'text': o['text'], 'score': o['score'], 'bbox': o['bbox']})
    det_ms = round((time.time() - t2) * 1000, 1)
    objs = _dedupe_objects([{'text': o['text'], 'score': o.get('score', 0.0), 'bbox': o['bbox']}
                            for o in kept] + new_objs)
    return {'objects': objs, 'n_objects': len(objs), 'mode': 'plate', 'page': page,
            'regions': len(regions), 'uncovered_regions': len(uncovered),
            'gate': gate, 'changed_px_ratio': changed_px_ratio,
            'text_changed_boxes': text_changed,
            'reused_boxes': len(kept), 'rec_boxes': len(changed_boxes),
            'new_boxes': len(new_objs), 'mask_ms': mask_ms, 'rec_ms': rec_ms, 'det_ms': det_ms,
            'total_ms': round((time.time() - t0) * 1000, 1), 'rec_batch': batch, 'err': None}


def _ocr_blocks(req):
    """cmd="ocr_blocks"：分块差量 OCR（默认 3×3 网格、扩边 96px、变化块占比≥0.6 回退整帧）。"""
    import numpy as np
    from PIL import Image
    if req.get('reset'):
        _BLOCK_CACHE.clear()
        _BLOCK_PREV.clear()
    frame = req.get('frame')
    if not frame or not os.path.isfile(frame):
        return {'error': f'ocr_blocks 需要存在的 frame 路径（收到 {frame!r}）', 'code': 'BAD_FRAME'}
    try:
        arr = np.asarray(Image.open(frame).convert('RGB'))
    except Exception as e:                                # noqa: BLE001
        return {'error': f'读帧失败: {type(e).__name__}: {e}', 'code': 'BAD_FRAME'}
    grid = req.get('grid') or _BLOCK_GRID
    if isinstance(grid, list) and len(grid) == 2:
        grid = (int(grid[0]), int(grid[1]))
    return _ocr_blocks_core(arr, det_max=int(req.get('det_max') or 2000),
                            cache=bool(req.get('cache', True)), grid=grid,
                            margin=int(req.get('margin') or _BLOCK_MARGIN),
                            fallback_ratio=float(req.get('fallback_ratio') or _BLOCK_FALLBACK_RATIO),
                            parallel=int(req.get('parallel') or 4),
                            max_objects=int(req.get('max_objects') or 200))


def _world_ocr_objects(arr, sha, force_fallback=False):
    """世界状态的文本来源：**按对象 OCR**（切片并行 + 内容寻址缓存），小字号过多时回退全帧。

    为什么换（Lead 2026-10-18 裁决 + 实测）：全帧 det 单项 130–150ms，是 world 里 OCR 的硬地板；
    同一屏反复看时对象切片逐字节不变 ⇒ 帧级缓存命中后 **39–43ms**（110 帧中位）。
    兜底判据：对象字高 < _SMALL_FONT_H 的占比 ≥ _SMALL_FONT_RATIO ⇒ 走全帧 OCR（与旧口径同源）。
    """
    res = _ocr_objects_core(arr, frame_sha=sha)
    if res.get("error"):
        boxes, meta = _world_ocr(arr, sha)                 # 新路径失败 → 保守回退旧路径
        return boxes, dict(meta, fallback="objects_failed",
                           objects_err=str(res.get("error"))[:200])
    objs = res.get("objects") or []
    hs = [int(o["bbox"][3]) for o in objs if o.get("bbox")]
    small_ratio = (sum(1 for h in hs if h < _SMALL_FONT_H) / len(hs)) if hs else 0.0
    base_meta = {"source": "objects", "ms": res.get("total_ms"), "det_ms": res.get("det_ms"),
                 "rec_ms": res.get("rec_ms"), "n": len(objs),
                 "n_cached": res.get("n_cached"), "frame_cache": res.get("frame_cache"),
                 "small_font_h": _SMALL_FONT_H, "small_ratio": round(small_ratio, 4),
                 "rec_batch": res.get("rec_batch"), "err": None}
    if force_fallback or small_ratio >= _SMALL_FONT_RATIO:
        t0 = time.time()
        boxes, meta = _world_ocr(arr, sha)                 # 全帧兜底（与旧口径同源）
        merged = dict(meta)                                # meta 里已有 source="engine|cache"，先拷再覆盖
        merged.update({k: v for k, v in base_meta.items() if k != "source"})
        merged.update(source="objects+fullframe_fallback", fallback=True,
                      fallback_ms=round((time.time() - t0) * 1000, 1))
        return boxes, merged
    boxes = []
    for o in objs:
        x, y, w, h = [int(v) for v in o["bbox"]]
        boxes.append({"text": o["text"], "cx": x + w // 2, "cy": y + h // 2,
                      "score": o.get("score"),
                      "box": [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]})
    return boxes, dict(base_meta, fallback=False)


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


def _capture_frame_via_ys_capture():
    """经 ys-capture 取一帧（常驻 XShm，~13ms）；归属用它的 KWin 权威结论。失败 fail-closed。"""
    import numpy as np
    import subprocess as _sp
    from PIL import Image
    here = os.path.dirname(os.path.abspath(__file__))
    out = "/dev/shm/ys-lookd-frame-%d.bmp" % os.getpid()
    cmd = [os.path.join(here, "ys-capture"), "latest", "--out", out, "--format", "bmp"]
    if os.environ.get("YS_LOOKD_ALLOW_BACKGROUND") == "1":
        cmd.append("--allow-background")
    p = _sp.run(cmd, capture_output=True, text=True, timeout=20,
                env=dict(os.environ, DISPLAY=os.environ.get("DISPLAY") or ":1"))
    try:
        meta = json.loads((p.stdout or "").strip().splitlines()[-1]) if p.stdout.strip() else {}
    except ValueError:
        meta = {}
    if p.returncode != 0:
        raise WorldAttribError({"verdict": meta.get("error") or "CAPTURE_FAILED",
                                "detail": meta.get("detail") or (p.stderr or "")[-300:],
                                "rc": p.returncode, "src": "ys-capture"})
    arr = np.asarray(Image.open(out).convert("RGB"), dtype=np.uint8)
    attr = dict(meta.get("attribution") or {})
    attr.setdefault("src", "ys-capture")
    attr["capture_ms"] = meta.get("ms")
    attr["frame"] = meta.get("frame")
    return arr, attr


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
        # 帧源两条（显式开关 YS_LOOKD_FRAME_SRC）：
        #   · default    = YL.grab（import -window，~100ms）
        #   · ys-capture = 常驻 XShm（~13ms；**归属闸门在守护进程里，且 KWin 才是权威**——
        #     实测 EWMH 的 _NET_WM_DESKTOP 会把桌面说错，正是票 34 的 fail-open 根因）
        if os.environ.get("YS_LOOKD_FRAME_SRC") == "ys-capture":
            arr, attr = _capture_frame_via_ys_capture()
        else:
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


def _world_state(arr, It, W, H, prof, boxes, is_live=False):
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
    # 本体态补判：与 `_state` **同一份判据**（2026-10-19 修双实现漂移）。
    # 不给 arr 就是挂不上——world 路径拿到的是整帧 uint8，直接从它裁 UID 小条。
    if is_live:
        _apply_world_uid(res, arr)
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
        _KEYS = ("containers", "free_text", "free_glyphs", "uncertainty",
                 "degraded", "error")
        _extra = set(res) - set(_KEYS)          # 新增字段没加进白名单 ⇒ 大声报，不静默丢
        res = {k: res.get(k) for k in _KEYS}
        if _extra:
            res["whitelist_dropped"] = sorted(_extra)
        res["timing_ms"] = round((time.time() - t0) * 1000, 1)
        return res
    except Exception as e:                                  # noqa: BLE001 —— fail-closed 成 degraded
        return {"containers": [], "free_text": [], "free_glyphs": [],
                "degraded": True, "error": f"{type(e).__name__}: {e}",
                "timing_ms": round((time.time() - t0) * 1000, 1)}



_DET = None
_DETS = {}           # 按权重路径缓存（双检测器分派，见 _detector_for）

# 世界 HUD 真值里 icon 数为 0（trainer 固定快照实测）；模型会把无底 glyph 误开火成 icon。
# 丢掉这一类：世界专家 P .386→.511，R 不变（映射成 glyph_icon **未验证**，先不做）。
_WORLD_DROP_KINDS = ("icon",)


def _detector_for(state_name):
    """按 state 选检测器：**三维世界用 world 专家，其余用 v2**。

    为什么分派（2026-10-19 实测，`STAGE-B-REPORT.md`）：
      单模型兼顾两边是「用 game_ui 换 world HUD」——v4 热启动后 game_ui P .500→.436（差 4.4pp 未过线），
      换来的 world_hud 从 0/0 到 .386/.737。而**三维世界里 CV 容器层是 0 命中**（flat+rect 是菜单 UI 规则），
      HUD 检测器是唯一对象来源；菜单里 CV 本来就好用，检测器只是补充。
      ⇒ 两个场景要的不是同一个能力，分派让两边各自零退化。
    """
    import gui_det
    here = os.path.dirname(os.path.abspath(gui_det.__file__))
    world = os.path.join(here, "models", "gui-det-world-v1.pt")
    path = world if (state_name == "GAME_WORLD" and os.path.exists(world)) else gui_det.DEFAULT_MODEL
    det = _DETS.get(path)
    if det is None:
        det = gui_det.Detector(path)
        _DETS[path] = det
    return det, path


def _world_detector(arr, state_name=None):
    """D2 检测器（按 state 分派，懒加载常驻）。返回 (objs, ms, err)。"""
    t0 = time.time()
    try:
        det, path = _detector_for(state_name)
        objs = det.detect(arr)
        if state_name == "GAME_WORLD":
            objs = [o for o in objs if o.get("kind") not in _WORLD_DROP_KINDS]
        return objs, round((time.time() - t0) * 1000, 1), (det.err if not objs else None), path
    except Exception as e:                                   # noqa: BLE001
        return [], round((time.time() - t0) * 1000, 1), f"{type(e).__name__}: {e}", None



def _attach_text_to_dets(dets, boxes, min_cover=0.5):
    """把全帧 OCR 文本归到**学习型检测框**上（2026-10-19 修：编辑器/世界里 objects 来自 D2，
    而 `schema.object_from_detection` 曾把 text 写死为空 ⇒ 有 OCR 也永远"0 个对象有文字"）。

    归属规则（与容器层同源思路）：OCR 框中心落在 det 框内，且 OCR 框面积被 det 框覆盖 ≥ min_cover
    ⇒ 归给**面积最小的那个 det**（避免大面板吞掉所有文字）。返回归上的文本条数。
    """
    n = 0
    for b in boxes or []:
        txt = (b.get("text") or "").strip()
        if not txt or not b.get("box"):
            continue
        xs = [p[0] for p in b["box"]]; ys = [p[1] for p in b["box"]]
        tx0, ty0, tx1, ty1 = min(xs), min(ys), max(xs), max(ys)
        cx, cy = (tx0 + tx1) / 2.0, (ty0 + ty1) / 2.0
        tarea = max(1.0, (tx1 - tx0) * (ty1 - ty0))
        best, best_area = None, None
        for d in dets:
            bx, by, bw, bh = d["bbox"]
            if not (bx <= cx <= bx + bw and by <= cy <= by + bh):
                continue
            iw = max(0.0, min(tx1, bx + bw) - max(tx0, bx))
            ih = max(0.0, min(ty1, by + bh) - max(ty0, by))
            if (iw * ih) / tarea < min_cover:
                continue
            a = bw * bh
            if best is None or a < best_area:
                best, best_area = d, a
        if best is not None:
            best.setdefault("text", []).append(txt)
            best["text_source"] = "fullframe+det"
            n += 1
    return n


def _world_structure(objects, W, H, boxes=None, det_objs=None):
    """D3 结构层：给对象列表，返回 groups / rows / pitch / 类别修正 / 缺行槽。

    输入契约：objects = {containers:[{bbox(xyxy), kind, text,...}], free_text:[...]}
    ⚠ ys-screen 的 containers[].bbox 是 **xyxy**，D3 要 xywh ⇒ 这里统一转换。
    """
    t0 = time.time()
    try:
        import d3_structure as D3
        objs = []
        for i, c in enumerate((objects or {}).get("containers") or []):
            b = c.get("bbox") or []
            if len(b) != 4:
                continue
            x0, y0, x1, y1 = b
            w, h = x1 - x0, y1 - y0
            if w <= 0 or h <= 0 or w * h >= 0.75 * W * H:      # 整屏底板必丢（实测会吞掉所有配对）
                continue
            objs.append({"id": i, "bbox": [int(x0), int(y0), int(w), int(h)],
                         "kind": c.get("kind") or "unknown"})
        for d in (det_objs or []):                   # D2 检测器：主要密度来源（一帧 80–120 框）
            b = d.get("bbox") or []
            if len(b) != 4:
                continue
            x, y, w, h = b
            if w * h >= 0.75 * W * H:                # 整屏底板必丢
                continue
            objs.append({"id": len(objs), "bbox": [int(x), int(y), int(w), int(h)],
                         "kind": d.get("kind") or "unknown"})
        for t in (boxes or []):                      # OCR 文本框也进结构层（密度来源）
            b = t.get("bbox") or []
            if len(b) != 4:
                continue
            x, y, w, h = b
            if w <= 0 or h <= 0:
                continue
            objs.append({"id": len(objs), "bbox": [int(x), int(y), int(w), int(h)], "kind": "text"})
        if len(objs) < 4:
            return {"groups": [], "rows": [], "pitch": None, "kind_fixes": [], "slots": [],
                    "n_objects": len(objs), "ms": round((time.time() - t0) * 1000, 1)}
        r = D3.analyze({"objects": objs})
        r["n_objects"] = len(objs)
        r["ms"] = round((time.time() - t0) * 1000, 1)
        return r
    except Exception as e:                                     # noqa: BLE001
        return {"groups": [], "rows": [], "error": f"{type(e).__name__}: {e}",
                "ms": round((time.time() - t0) * 1000, 1)}


# ── world 的 OCR 时间缓存（2026-10-19；Lead 口径：文本类可时间缓存，对象框/可点性必须跟帧走）──
# 为什么：`_WORLD_CACHE` 键含整帧 sha256，活体画面每帧都在渲染 ⇒ 永远不命中；
# OCR 是每帧都付的固定成本（实测活体帧 824ms）。文本结果在"画面基本没变"时可安全复用，
# 但对象框/可点性仍用**当前帧**重算（不缓存整份 world 状态）。
_WORLD_OCR_TTL = {"ts": 0.0, "boxes": None, "sig": None, "sha": None}
_WORLD_OCR_TTL_MS = int(os.environ.get("YS_WORLD_OCR_TTL_MS", "1200"))
_WORLD_OCR_SIG_THR = float(os.environ.get("YS_WORLD_OCR_SIG_THR", "6.0"))


def _world_ocr_objects_timed(arr, sha, force_fallback=False):
    """在 _world_ocr_objects 外包一层**时间缓存**：TTL 内且帧间差异小 → 直接复用文本。

    复用的只是**文本层**（boxes/text/score）；对象框、可点性、判态仍用当前帧现算。
    返回 (boxes, meta)，meta.source = 'objects' | 'ttl-cache'。
    """
    import numpy as np
    now = time.time()
    st = _WORLD_OCR_TTL
    if _WORLD_OCR_TTL_MS > 0 and st["boxes"] is not None and (now - st["ts"]) * 1000 <= _WORLD_OCR_TTL_MS:
        try:
            sig = _page_gray(arr, step=8)
            if st["sig"] is not None and float(np.abs(sig - st["sig"]).mean()) < _WORLD_OCR_SIG_THR:
                return st["boxes"], {"source": "ttl-cache", "ms": 0.1, "n": len(st["boxes"]),
                                     "err": None, "age_ms": round((now - st["ts"]) * 1000)}
        except Exception:                                # noqa: BLE001
            pass
    boxes, meta = _world_ocr_objects(arr, sha, force_fallback=force_fallback)
    if boxes is not None:
        try:
            st.update(ts=now, boxes=boxes, sig=_page_gray(arr, step=8), sha=sha)
        except Exception:                                # noqa: BLE001
            pass
    return boxes, meta


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
        # 2026-10-18（Lead 裁决）：文本来源从「全帧」换成「对象切片」——热态同屏重复看 ~40ms，
        # 冷态与全帧同量级；小字号占比过高时回退全帧（兜底只在那些帧付 50–100ms）。
        boxes, ocr_meta = _world_ocr_objects_timed(arr, sha,
                                                   force_fallback=bool(req.get("force_fallback")))
    t_after_ocr = time.time()
    state, t_judge = _world_state(arr, It, W, H, prof, boxes, is_live=(src == "live"))
    t_after_state = time.time()
    objects = _world_containers(arr, sha, boxes, W, H) if do_obj else None
    t_after_obj = time.time()
    det_objs, det_ms, det_err, det_path = (
        _world_detector(arr, (state or {}).get("state"))
        if (do_obj and req.get("structure", True)) else ([], 0.0, None, None))
    t_after_det = time.time()
    structure = _world_structure(objects, W, H, boxes, det_objs) if (do_obj and req.get("structure", True)) else None
    if structure is not None:
        structure["detector"] = {"n": len(det_objs), "ms": det_ms, "err": det_err,
                                 "model": os.path.basename(det_path) if det_path else None,
                                 "dropped_kinds": list(_WORLD_DROP_KINDS)
                                 if (state or {}).get("state") == "GAME_WORLD" else []}
        # D2 检测结果原样透出：它是**三维世界 HUD 里唯一的对象来源**（CV flat+rect 在开放世界
        # 找不到容器，实测 containers=0 而检测器给 33 个框）。此前只喂给 D3 结构层、不对外暴露，
        # 消费方等于看不见任何对象。放在 structure 里（已透传）而不是新增顶层键，避免又撞白名单。
        structure["detections"] = det_objs
        # 把 OCR 文本归到检测框上（编辑器/世界的 objects 来源就是这批框）；归不上的仍走 free_text
        try:
            _n_txt = _attach_text_to_dets(det_objs, boxes)
            structure["detector"]["text_attached"] = _n_txt
        except Exception as _e:                      # noqa: BLE001 —— 归属失败不影响主输出
            structure["detector"]["text_attached"] = 0
            structure["detector"]["text_attach_err"] = "%s: %s" % (type(_e).__name__, _e)
    t_after_structure = time.time()
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
        "structure": structure,
        "frame": {"source": src, "path": _WORLD_FRAME.get("path"),
                  "sha256": sha, "w": W, "h": H, "bytes": int(W * H * 3)},
        "profile": os.path.basename(prof_path),
        "attribution": attrib,
        "timing": {"load_ms": t_load, "structure_ms": (structure or {}).get("ms"),
                   "detector_ms": det_ms,
                   "structure": round((t_after_structure - t_after_obj) * 1000, 1),
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

_GRAB_GEO = {}


def _grab_geo():
    import subprocess
    g = dict(l.split("=") for l in subprocess.run(
        ["xdotool", "getwindowgeometry", "--shell", YL.WIN],
        capture_output=True, text=True).stdout.strip().splitlines() if "=" in l)
    _GRAB_GEO["wh"] = (int(g["WIDTH"]), int(g["HEIGHT"]))
    return _GRAB_GEO["wh"]


def handle(req):
    _FULL["rgb"] = None                     # 每请求只复用同一张整帧，不跨请求（画面会变）
    _FULL["roi"] = None
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
    if cmd == "ocr_objects":               # 按对象 OCR（新命令；旧命令语义不变）
        return _ocr_objects(req)
    if cmd == "ocr_blocks":                # 分块差量 OCR（EXPERIMENTAL；旧命令语义不变）
        return _ocr_blocks(req)
    if cmd == "ocr_page":                  # 对象级基线差量 OCR（新命令；旧命令语义不变）
        return _ocr_page(req)
    if cmd == "ocr_plate":                 # 多帧共识底板（实验命令；旧命令语义不变）
        return _ocr_plate_build(req) if req.get('action') == 'build' else _ocr_plate_query(req)
    if cmd == "world_check":
        # 本体态快速判定：只抓底部横条（含右下 UID 行）→ 常驻 OCR 引擎识别 → 返回是否含 UID。
        # 为什么放在 daemon：客户端做同样的事要 ~500ms（grab 往返 + 独立 OCR + PNG 落盘），
        # 在这里是 ~100ms（内存张量直接喂引擎）。
        t0 = time.time()
        eng, err = _ocr_engine()
        if eng is None:
            return {"error": f"OCR 不可用: {err}", "code": "OCR_UNAVAILABLE"}
        x, y, w, h = [int(v) for v in (req.get("region") or [1000, 1330, 1560, 110])]
        try:
            import numpy as _np
            arr = YL.grab(x, y, w, h)
            boxes = _ocr_array(eng, (_np.clip(arr, 0, 1) * 255).round().astype(_np.uint8), (x, y))
        except Exception as e:                              # noqa: BLE001
            return {"error": f"{type(e).__name__}: {e}", "code": "FRAME_FAILED"}
        texts = [{"text": b.get("text") or "", "bbox": b.get("bbox")} for b in boxes]
        has_uid = any("UID" in (t["text"] or "").upper() for t in texts)
        return {"has_uid": bool(has_uid), "texts": texts[:12], "n": len(texts),
                "ms": round((time.time() - t0) * 1000), "region": [x, y, w, h]}
    if cmd == "grab":                      # 快抓帧落 PNG（XShm 直抓，~10–40ms；给 ys-scroll/ys-list 等工具用）
        from PIL import Image as _Image
        import hashlib as _hl
        t0 = time.time()
        try:
            if req.get("verify_frame", False):              # 需要归属校验时才走慢路径
                arr, It, sha, W, H, src, attrib = _world_frame(req)
            else:                                            # 快路径：直接 XShm 抓窗口
                w, h = _GRAB_GEO.get("wh") or _grab_geo()
                try:
                    arr = YL.grab(0, 0, w, h)
                except RuntimeError:                        # 窗口实际尺寸差 1px（2561 vs 2560）时自愈
                    arr = None
                    for dw in (1, -1, 2):
                        try:
                            arr = YL.grab(0, 0, w + dw, h)
                            w = w + dw
                            _GRAB_GEO["wh"] = (w, h)
                            break
                        except RuntimeError:
                            continue
                    if arr is None:
                        raise
                W, H, src = w, h, "fast"
                sha = _hl.sha256(arr.tobytes()).hexdigest()[:16]
        except Exception as e:                              # noqa: BLE001
            return {"error": f"{type(e).__name__}: {e}", "code": "FRAME_FAILED"}
        out = req.get("out") or "/tmp/ys-lookd-grab.png"
        import numpy as _np
        a8 = arr if arr.dtype == _np.uint8 else (_np.clip(arr, 0, 1) * 255).astype(_np.uint8)
        if out.lower().endswith((".jpg", ".jpeg")):        # JPEG 编码比 PNG 快 5–10×（验证用足够）
            _Image.fromarray(a8).save(out, quality=85)
        else:
            _Image.fromarray(a8).save(out)
        return {"path": out, "sha256": sha, "w": W, "h": H, "source": src,
                "ms": round((time.time() - t0) * 1000, 1)}
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
    # OCR 引擎在**后台线程**预热：引擎加载 + CUDA/cudnn 首次 kernel ~2–9s，
    # 不预热的话重启后第一次 world/look 要付（实测首次 ocr_ms 5998ms，热后 15–20ms）。
    def _warm_ocr():
        try:
            t0 = time.time()
            eng, err = _ocr_engine()
            if eng is None:
                print(f"[ys-lookd] OCR 预热跳过：{err}", flush=True)
                return
            import numpy as np
            eng(np.zeros((64, 160, 3), dtype=np.uint8))      # 触发 det/cls/rec 首次 kernel
            print(f"[ys-lookd] OCR 预热完成（{round((time.time()-t0)*1000)}ms）", flush=True)
        except Exception as e:                            # noqa: BLE001
            print(f"[ys-lookd] OCR 预热失败（不影响启动）: {type(e).__name__}: {e}", flush=True)
    import threading as _th
    _th.Thread(target=_warm_ocr, daemon=True, name="warm-ocr").start()
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
