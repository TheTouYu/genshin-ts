#!/usr/bin/env python3
"""inproc_probe.py — 同进程（in-process）仪器尖刺：测「不经 CLI / 不 subprocess」的成本。

Lead 2026-10-18 指派（不动共享工具，只 importlib 加载同目录脚本）：
  ① 进程内直接 import ys-state 的判态逻辑 / ys-screen 的对象层，测「同进程 look」多少 ms；
  ② 三条路径并列：subprocess（现状）/ 裸 daemon RPC / in-process；
  ③ 缓冲帧复用（同 frame_sha 不重解 PNG）单独一条 —— 命中应接近 0。

测量项（顺序执行，全部真实调用）：
  · imports             加载 ys-state / ys-screen 模块
  · decode              ys_state.decode_frame(f06) —— PNG 解码的物理地板
  · state_raw           ys_state.execute("fast", frame) ×3（现状：daemon 判 8 态 → UNKNOWN 后本体 OCR）
  · screen_raw          ys_screen.analyze(f06, containers_only=True) ×2（现状：每次 load_small 解码）
  · screen_buffer       给 load_small 加进程内帧缓冲后，再 analyze 同帧
  · state_ocr_cache     把 ys_state._ocr_boxes 换成 ys_screen.run_ocr（内容寻址 OCR 缓存）后判态
  · look_inproc         组合（state + screen，均带上述复用）×2，同帧；再换 f05 一帧
  · look_service_cache  worldsvc.WorldService.look 的热缓存命中（进程内，无 subprocess）

用法：
  python3 .scratch/gui-service/inproc_probe.py [--frames f06 f05] [--json-out P]
输出：人读表格 + JSON（默认 evidence/inproc.json）。
"""
from __future__ import annotations

import argparse
import importlib.machinery
import importlib.util
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

YS_STATE = os.path.join(REPO, "tools", "ys-editor", "ys-state")
YS_SCREEN = os.path.join(REPO, "tools", "ys-screen")
PROFILE = os.path.join(REPO, ".scratch", "gui-profiles", "qianxing.json")
CORPUS = os.path.join(REPO, ".scratch", "gui-corpus")
EVIDENCE = os.path.join(HERE, "evidence")

import schema  # noqa: E402  （本地模块）


def ms(t0):
    return round((time.perf_counter() - t0) * 1000, 2)


def load_module(name, path):
    loader = importlib.machinery.SourceFileLoader(name, path)
    spec = importlib.util.spec_from_loader(name, loader)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    loader.exec_module(mod)
    return mod


def memoize_frame_loaders(screen_mod):
    """给 ys-screen.load_small 加进程内帧缓冲：同 (path, mtime, scale) 只解码一次。

    这是「缓冲帧复用」的最小实现；不动原文件，只在本进程内替换函数引用。
    """
    orig = screen_mod.load_small
    cache = {}
    stats = {"hit": 0, "miss": 0}

    def cached(path, scale):
        key = (os.path.abspath(path), os.stat(path).st_mtime_ns, float(scale))
        if key in cache:
            stats["hit"] += 1
            return cache[key]
        stats["miss"] += 1
        cache[key] = orig(path, scale)
        return cache[key]

    screen_mod.load_small = cached
    return {"orig": orig, "cache": cache, "stats": stats}


def patch_state_ocr(state_mod, screen_mod):
    """把 ys-state 的本体 OCR 通道换成 ys-screen 的内容寻址 OCR 缓存。

    判据逻辑仍是 ys-state 的 decide/native_readings（单一源不变），只换"拿 OCR 框"的提供者。
    """
    orig = state_mod._ocr_boxes

    def boxes(frame_path):
        if not frame_path:
            return None
        got = screen_mod.run_ocr(frame_path, use_cache=True, scale=1.0)
        b, meta = got if isinstance(got, tuple) else (got, {})
        if not b:
            return None
        return [{"text": t.get("text"),
                 "bbox": list(t.get("bbox") or []),
                 "cx": t.get("cx", ((t.get("bbox") or [0, 0, 0, 0])[0] + (t.get("bbox") or [0, 0, 0, 0])[2]) / 2.0),
                 "cy": t.get("cy", ((t.get("bbox") or [0, 0, 0, 0])[1] + (t.get("bbox") or [0, 0, 0, 0])[3]) / 2.0)}
                for t in b if t.get("text")]

    state_mod._ocr_boxes = boxes
    return {"orig": orig, "stats": {"patched": True}}


def daemon_call(req, timeout=120):
    """裸 socket 调 ys-lookd（不经过 ys-state CLI）——量「daemon 通道」自身的地板。"""
    import socket
    sock = os.environ.get("YS_LOOKD_SOCK", f"/run/user/{os.getuid()}/ys-lookd.sock")
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(timeout)
    s.connect(sock)
    s.sendall((json.dumps(req) + "\n").encode())
    buf = b""
    while not buf.endswith(b"\n"):
        chunk = s.recv(1 << 20)
        if not chunk:
            break
        buf += chunk
    s.close()
    return json.loads(buf.decode())


def timed(fn, n=1):
    walls, details = [], []
    for _ in range(n):
        t0 = time.perf_counter()
        out = fn()
        walls.append(ms(t0))
        details.append(out)
    return walls, details


def main(argv=None):
    ap = argparse.ArgumentParser(description="同进程仪器尖刺（不改共享工具）")
    ap.add_argument("--frame", default=os.path.join(CORPUS, "f06.png"))
    ap.add_argument("--alt-frame", default=os.path.join(CORPUS, "f05.png"))
    ap.add_argument("--json-out", default=os.path.join(EVIDENCE, "inproc.json"))
    a = ap.parse_args(argv)
    os.makedirs(EVIDENCE, exist_ok=True)
    F, F2 = os.path.abspath(a.frame), os.path.abspath(a.alt_frame)
    out = {"frame": F, "alt_frame": F2, "measured_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
           "results": {}, "notes": []}

    # ── imports ──
    t0 = time.perf_counter()
    ys_state = load_module("ys_state_probe", YS_STATE)
    out["results"]["import_ys_state_ms"] = ms(t0)
    t0 = time.perf_counter()
    ys_screen = load_module("ys_screen_probe", YS_SCREEN)
    out["results"]["import_ys_screen_ms"] = ms(t0)
    out["notes"].append(f"ys-state STATES={list(getattr(ys_state, 'STATES', ()))}")

    # ── PNG 解码物理地板 ──
    walls, _ = timed(lambda: ys_state.decode_frame(F), 2)
    out["results"]["decode_frame_ms"] = walls
    # sha256 内容寻址成本（世界状态缓存 key）
    walls, _ = timed(lambda: schema.frame_id_of(F), 2)
    out["results"]["sha256_frame_id_ms"] = walls

    # ── state：现状（daemon 8 态 → 本体 OCR）──
    def state_call(frame):
        res = ys_state.execute("fast", frame=frame, profile=PROFILE)
        r = res[0] if isinstance(res, tuple) else res
        return {"state": r.get("state"), "ms": r.get("ms"), "via": r.get("via"),
                "native": r.get("native"), "confidence": r.get("confidence")}
    walls, det = timed(lambda: state_call(F), 3)
    out["results"]["state_raw_ms"] = walls
    out["results"]["state_raw_detail"] = det

    # ── screen：现状（每次 load_small 解码 + 容器缓存）──
    def screen_call(frame):
        r = ys_screen.analyze(frame, containers_only=True)
        t = r.get("timing") or {}
        return {"n": len(r.get("containers") or []), "load_ms": t.get("load_ms"),
                "container_ms": t.get("container_ms"), "cached": t.get("container_cached"),
                "total_ms": t.get("total_ms")}
    walls, det = timed(lambda: screen_call(F), 2)
    out["results"]["screen_raw_ms"] = walls
    out["results"]["screen_raw_detail"] = det

    # ── 缓冲帧复用：同帧第二次不再解码 ──
    buf = memoize_frame_loaders(ys_screen)
    walls, det = timed(lambda: screen_call(F), 2)
    out["results"]["screen_buffer_ms"] = walls
    out["results"]["screen_buffer_detail"] = det
    out["results"]["screen_buffer_stats"] = buf["stats"]

    # ── state + OCR 缓存补丁 ──
    ocr_patch = patch_state_ocr(ys_state, ys_screen)
    walls, det = timed(lambda: state_call(F), 2)
    out["results"]["state_ocr_cached_ms"] = walls
    out["results"]["state_ocr_cached_detail"] = det
    out["results"]["state_ocr_patch_kept_single_source"] = True

    # ── 组合 look（in-process）──
    def look_inproc(frame):
        t0 = time.perf_counter()
        st = state_call(frame)
        t_state = ms(t0)
        t1 = time.perf_counter()
        sc = screen_call(frame)
        t_obj = ms(t1)
        return {"state": st, "objects": sc, "state_ms": t_state, "objects_ms": t_obj,
                "total_ms": ms(t0)}
    walls, det = timed(lambda: look_inproc(F), 2)
    out["results"]["look_inproc_same_frame_ms"] = walls
    out["results"]["look_inproc_same_frame_detail"] = det
    walls, det = timed(lambda: look_inproc(F2), 1)
    out["results"]["look_inproc_alt_frame_ms"] = walls
    out["results"]["look_inproc_alt_frame_detail"] = det

    # ── daemon 通道地板（裸 socket，不经 CLI）──
    def daemon_state_png():
        t0 = time.perf_counter()
        d = daemon_call({"cmd": "state", "frame": F, "profile": PROFILE})
        return {"wall_ms": ms(t0), "state": d.get("state"), "ms": d.get("ms"),
                "load_ms": d.get("load_ms"), "judge_ms": d.get("judge_ms")}
    walls, det = timed(daemon_state_png, 3)
    out["results"]["daemon_state_png_ms"] = walls
    out["results"]["daemon_state_png_detail"] = det

    # raw RGB bin（缓冲帧复用的 daemon 通道）：先解码一次、落盘一次，再看 daemon 判态地板
    import numpy as np  # noqa: E402
    arr = ys_state.decode_frame(F)
    bin_path = os.path.join(EVIDENCE, "f06.rgb.bin")
    arr.tofile(bin_path)                     # 只用于测量；结束即删（11MB 不进证据目录）

    def daemon_state_bin():
        t0 = time.perf_counter()
        d = daemon_call({"cmd": "state", "profile": PROFILE, "frame_bin": bin_path,
                         "frame_shape": [int(arr.shape[0]), int(arr.shape[1]), 3]})
        return {"wall_ms": ms(t0), "state": d.get("state"),
                "load_ms": d.get("load_ms"), "judge_ms": d.get("judge_ms")}
    walls, det = timed(daemon_state_bin, 2)
    out["results"]["daemon_state_bin_ms"] = walls
    out["results"]["daemon_state_bin_detail"] = det
    try:
        os.remove(bin_path)
    except OSError:
        pass

    def daemon_ocr():
        t0 = time.perf_counter()
        d = daemon_call({"cmd": "ocr", "frame": F})
        return {"wall_ms": ms(t0), "n_boxes": len(d.get("boxes") or []), "ms": d.get("ms")}
    walls, det = timed(daemon_ocr, 2)
    out["results"]["daemon_ocr_ms"] = walls
    out["results"]["daemon_ocr_detail"] = det

    # ── 服务层缓存命中（进程内，无 subprocess）──
    import worldsvc  # noqa: E402  （本地模块；只用其缓存路径）
    svc = worldsvc.WorldService(cache_dir=os.path.join(HERE, ".cache"))
    t0 = time.perf_counter()
    ws1 = svc.look(frame=F)
    first = ms(t0)
    walls, _ = timed(lambda: svc.look(frame=F), 3)
    out["results"]["look_service_first_ms"] = first
    out["results"]["look_service_cache_hit_ms"] = walls
    out["results"]["look_service_detail"] = {"state": ws1.state_name, "objects": len(ws1.objects),
                                             "cache": ws1.raw.get("cache"),
                                             "timing": ws1.raw.get("timing_ms")}

    # ── 汇总（人读）──
    r = out["results"]
    lines = [
        "# 同进程仪器尖刺（in-process probe）",
        f"- 帧：{F}（alt={F2}）",
        f"- imports：ys-state {r['import_ys_state_ms']}ms｜ys-screen {r['import_ys_screen_ms']}ms",
        f"- decode_frame（PNG 解码地板）：{r['decode_frame_ms']}ms｜frame_id sha256：{r['sha256_frame_id_ms']}ms",
        f"- state 现状：{r['state_raw_ms']}ms → {[d.get('state') for d in r['state_raw_detail']]}",
        f"- screen 现状（containers）：{r['screen_raw_ms']}ms → 输出 {r['screen_raw_detail'][-1]}",
        f"- 缓冲帧复用后 screen：{r['screen_buffer_ms']}ms（hit/miss={r['screen_buffer_stats']}）",
        f"- state + OCR 内容缓存：{r['state_ocr_cached_ms']}ms → {[d.get('state') for d in r['state_ocr_cached_detail']]}",
        f"- 组合 look（in-process，同帧）：{r['look_inproc_same_frame_ms']}ms",
        f"- 组合 look（in-process，换帧 {os.path.basename(F2)}）：{r['look_inproc_alt_frame_ms']}ms",
        f"- 裸 daemon state（PNG）：{r['daemon_state_png_ms']}ms → {[d.get('state') for d in r['daemon_state_png_detail']]}"
        f"（judge_ms={[d.get('judge_ms') for d in r['daemon_state_png_detail']]}）",
        f"- 裸 daemon state（raw frame_bin，免 PNG 解码）：{r['daemon_state_bin_ms']}ms"
        f"（judge_ms={[d.get('judge_ms') for d in r['daemon_state_bin_detail']]}）",
        f"- 裸 daemon OCR（同帧两次，无缓存）：{r['daemon_ocr_ms']}ms",
        f"- 服务层 look 首次 {r['look_service_first_ms']}ms / 缓存命中 {r['look_service_cache_hit_ms']}ms",
    ]
    out["summary_lines"] = lines
    print("\n".join(lines))
    with open(a.json_out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"\n[inproc_probe] 证据 → {a.json_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
