#!/usr/bin/env python3
"""锚点成本实验：搜索半径 pad 与锚点数量，哪个砍得动？

背景（2026-10-19 实测，活体）：fast 判态 398ms = 抓帧/张量 117ms + 判据 220ms + CLI 开销 ~60ms；
判据里 **12 个 GPU 锚点 ≈120ms**（每个 ~10ms），39 个像素取样点只要 1–4ms。

锚点定义：96×96 模板 + 搜索 ROI = (96 + 2*pad)²，pad 默认 200 ⇒ 每锚点 496×496。
两个可砍的自由度：①pad 变小 → NCC 面积按平方降；②锚点变少 → 线性降。
本脚本用 24 张回归帧验证「砍了还判得对」，并在活体窗口上量真实耗时。
用法：python3 .scratch/gui-perf/anchor-cost.py [--live]
"""
import os
import sys
import json
import time
from importlib.machinery import SourceFileLoader

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools/ys-editor"))
YS = SourceFileLoader("ys_state", os.path.join(ROOT, "tools/ys-editor/ys-state")).load_module()
import ys_look as YL                                              # noqa: E402

PADS = [200, 96, 48, 24]


def jobs_with_pad(profile, pad):
    tier1 = YS.anchor_tier1(profile)
    jobs, state_of = [], {}
    for st, lst in tier1.items():
        for a in lst:
            psz = a.get("patch", 96)
            jobs.append({"id": a["name"], "tpl": os.path.abspath(a["tpl"]), "scales": [1.0],
                         "roi": [max(0, a["x"] - pad), max(0, a["y"] - pad), psz + 2 * pad, psz + 2 * pad]})
            state_of[a["name"]] = st
    return jobs, state_of


def scores_of(jobs, frame=None, region=None):
    req = {"cmd": "batch", "jobs": jobs}
    if frame:
        req["frame"] = frame
    else:
        req["region"] = list(region)
    r = YL.daemon(req, timeout=120)
    if not r:
        raise RuntimeError(f"ys-lookd 不可用: {YL.LAST_DAEMON_ERROR}  {r}")
    return {x["id"]: (x["best"]["score"] if x.get("best") else -1.0) for x in r["results"]}


def main():
    prof = YS.load_profile(YS.PROFILE_DEFAULT)
    pts = YS.all_probe_points()
    rows = YS.read_manifest()
    print(f"回归帧 {len(rows)} 张；pad 扫描 {PADS}\n")
    header = "pad   " + "".join(f"{n[:12]:>14}" for n in [r[0] for r in rows[:3]]) + "   正确帧/24"
    print(header)
    results = {}
    for pad in PADS:
        jobs, state_of = jobs_with_pad(prof, pad)
        ok = 0
        per = []
        for name, expect, note in rows:
            path = os.path.join(YS.REG_DIR, name)
            arr = YS.decode_frame(path)
            h, w = arr.shape[0], arr.shape[1]
            cells = {(x, y): tuple(int(v) for v in arr[y, x]) for x, y in pts if 0 <= x < w and 0 <= y < h}
            r = YS.pixel_readings(YS.CellsPixels(cells, w, h))
            try:
                sc = scores_of(jobs, frame=path)
                r.update(YS.anchor_readings_from_scores(sc, state_of))
            except Exception as e:                               # noqa: BLE001
                print("  [warn]", name, e)
            d = YS.decide(r)
            good = d["state"] == expect
            ok += good
            per.append((name, expect, d["state"], good))
        results[pad] = per
        print(f"{pad:<6}{ok:>3}/24 正确")
    # 活体成本
    if "--live" in sys.argv:
        print("\n活体耗时（ROI 抓帧一次，走已有的 region 复用）")
        roi = YS.fast_roi(prof)
        for pad in PADS:
            jobs, _ = jobs_with_pad(prof, pad)
            for j in jobs:
                j["roi"] = [j["roi"][0] - roi[0], j["roi"][1] - roi[1], j["roi"][2], j["roi"][3]]
            ts = []
            for _ in range(3):
                t = time.time()
                scores_of(jobs, region=roi)
                ts.append((time.time() - t) * 1000)
            print(f"  pad={pad:<4} 12 锚点批 {min(ts):.0f}–{max(ts):.0f}ms")
    # 逐锚点贡献：找出「唯一证据」锚点
    print("\n逐帧明细（pad=200 vs 最小可用 pad）")
    base = {n: (e, s) for n, e, s, g in results[PADS[0]]}
    for n, e, s, g in results[PADS[-1]]:
        if not g:
            print(f"  ✗ {n:<28} expect={e:<9} got={s}")
    if "--json" in sys.argv:
        print(json.dumps({str(k): v for k, v in results.items()}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
