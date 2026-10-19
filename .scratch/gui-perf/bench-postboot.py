#!/usr/bin/env python3
"""bench-postboot — 感知链路时延基准（重启后复测用；n≥10 报 p50/p90，冷热分开）。

用法：
  python3 .scratch/gui-perf/bench-postboot.py                 # 静态项（1/3/4/5/6/2）
  python3 .scratch/gui-perf/bench-postboot.py --actions       # 追加动作项（会占用桌面 ~30s）
  python3 .scratch/gui-perf/bench-postboot.py --json out.json

纪律：每项之间 sleep 1s 防连发堵 X；单次调用都有超时；任何一项异常只记录不中断。
达标线来自 `.scratch/gui-stack/AGI-BAR.md §十`。
"""
import argparse
import json
import os
import statistics as st
import subprocess
import sys
import time

ROOT = "/home/h/genshin-ts"
sys.path.insert(0, os.path.join(ROOT, ".scratch", "gui-service"))
sys.path.insert(0, os.path.join(ROOT, "tools", "ys-editor"))

FRAMES = [
    os.path.join(ROOT, ".scratch/gui-corpus/truth-v9-fixed/r004_snap_2026-10-19_00-20-33.png"),
    os.path.join(ROOT, ".scratch/gui-corpus/truth-v9-fixed/r028_snap_2026-10-19_00-27-49.png"),
    os.path.join(ROOT, ".scratch/gui-corpus/evidence-friend-30d.jpg"),
]

TARGETS = {
    "grab_new": 200, "grab_warm": 200, "state_fast": 200, "ocr_warm": 45,
    "detect": 10, "structure": 10, "list": 500, "action": 50, "world_new": 2000,
}


def pct(v, q):
    v = sorted(v)
    return v[min(len(v) - 1, int(len(v) * q))] if v else None


def summarize(name, vals, target):
    if not vals:
        return {"name": name, "n": 0, "error": "no samples"}
    med = st.median(vals)
    p90 = pct(vals, 0.9)
    verdict = "ok" if med <= target else ("near" if med <= target * 2 else "over")
    return {"name": name, "n": len(vals), "p50": round(med, 1), "p90": round(p90, 1),
            "min": round(min(vals), 1), "max": round(max(vals), 1),
            "target": target, "verdict": verdict}


def bench_grab(n=20):
    import instruments as I
    vals = []
    for _ in range(n):
        t = time.perf_counter()
        try:
            I.daemon_rpc({"cmd": "grab", "out": "/tmp/bench-grab.jpg"}, timeout=20)
        except Exception:                                # noqa: BLE001
            continue
        vals.append((time.perf_counter() - t) * 1000)
        time.sleep(0.05)
    return vals


def bench_ocr(warm=10):
    import instruments as I
    f = os.path.abspath(FRAMES[2])
    vals = []
    for _ in range(warm):
        t = time.perf_counter()
        try:
            I.daemon_rpc({"cmd": "ocr_objects", "frame": f, "ocr": True, "cache": True, "max_objects": 300}, timeout=60)
        except Exception:                                # noqa: BLE001
            continue
        vals.append((time.perf_counter() - t) * 1000)
        time.sleep(0.05)
    return vals


def bench_detect(n=20):
    import numpy as np
    from PIL import Image
    import gui_det
    det = gui_det.Detector()
    arrs = [np.asarray(Image.open(f).convert("RGB")) for f in FRAMES]
    for a in arrs:                                       # 预热
        det.detect(a)
    vals = []
    for i in range(n):
        a = arrs[i % len(arrs)]
        t = time.perf_counter()
        det.detect(a)
        vals.append((time.perf_counter() - t) * 1000)
    return vals


def bench_state(n=20):
    vals = []
    for _ in range(n):
        t = time.perf_counter()
        try:
            subprocess.run([sys.executable, os.path.join(ROOT, "tools/ys-editor/ys-state"), "--fast"],
                           capture_output=True, timeout=20)
        except Exception:                                # noqa: BLE001
            continue
        vals.append((time.perf_counter() - t) * 1000)
        time.sleep(0.05)
    return vals


def bench_list(n=10):
    vals = []
    for _ in range(n):
        t = time.perf_counter()
        try:
            subprocess.run([sys.executable, os.path.join(ROOT, "tools/ys-editor/ys-list"),
                            "--frame", FRAMES[2], "--full"], capture_output=True, timeout=30)
        except Exception:                                # noqa: BLE001
            continue
        vals.append((time.perf_counter() - t) * 1000)
        time.sleep(0.05)
    return vals


def bench_world(n=5):
    vals = []
    for i in range(n):
        t = time.perf_counter()
        try:
            subprocess.run([sys.executable, os.path.join(ROOT, ".scratch/gui-service/worldsvc.py"),
                            "look", "--frame", FRAMES[i % len(FRAMES)], "--backend", "daemon-world", "--no-cache"],
                           capture_output=True, timeout=90)
        except Exception:                                # noqa: BLE001
            continue
        vals.append((time.perf_counter() - t) * 1000)
    return vals


def bench_action(n=10):
    """租约内动作：取一次租约，连做 n 次 ESC（每次 release? 不——保持租约），最后释放。"""
    import instruments as I  # noqa: F401  （仅确保路径可用）
    lease = os.path.join(ROOT, "tools/ys-editor/ys-lease")
    subprocess.run([sys.executable, lease, "acquire", "--max", "60"], capture_output=True, timeout=60)
    env = dict(os.environ, YS_SLOT_ACTIVE="1")
    vals = []
    for _ in range(n):
        t = time.perf_counter()
        try:
            subprocess.run(["ydotool", "key", "1:1", "1:0"], env=env, capture_output=True, timeout=10)
        except Exception:                                # noqa: BLE001
            continue
        vals.append((time.perf_counter() - t) * 1000)
        time.sleep(0.3)
    subprocess.run([sys.executable, lease, "release"], capture_output=True, timeout=30)
    return vals


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--actions", action="store_true")
    ap.add_argument("--json", default="")
    a = ap.parse_args()
    res = []
    plan = [
        ("grab", bench_grab, TARGETS["grab_new"]),
        ("ocr_warm", bench_ocr, TARGETS["ocr_warm"]),
        ("detect", bench_detect, TARGETS["detect"]),
        ("list", bench_list, TARGETS["list"]),
        ("state_fast", bench_state, TARGETS["state_fast"]),
        ("world_new", bench_world, TARGETS["world_new"]),
    ]
    if a.actions:
        plan.append(("action", bench_action, TARGETS["action"]))
    for name, fn, target in plan:
        try:
            vals = fn()
        except Exception as e:                           # noqa: BLE001
            res.append({"name": name, "error": f"{type(e).__name__}: {e}"})
            print(f"{name:<12} ERROR {type(e).__name__}: {e}")
            time.sleep(1)
            continue
        r = summarize(name, vals, target)
        res.append(r)
        if r.get("n"):
            flag = {"ok": "✅", "near": "⚠️", "over": "❌"}[r["verdict"]]
            print(f"{r['name']:<12} n={r['n']:<3} p50={r['p50']:>8.1f}ms p90={r['p90']:>8.1f}ms "
                  f"target≤{target:<6} {flag} {r['verdict']}")
        time.sleep(1)
    if a.json:
        json.dump(res, open(a.json, "w"), ensure_ascii=False, indent=1)
        print("->", a.json)


if __name__ == "__main__":
    main()
