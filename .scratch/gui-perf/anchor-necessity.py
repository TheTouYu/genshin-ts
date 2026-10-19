#!/usr/bin/env python3
"""锚点必要性分析：判态 fast 通道里 12 个 GPU 锚点到底有没有改变结论？

方法（离线，26 张真实回归帧，不碰活体窗口）：
  对每帧算两份 readings：
    A) 只像素判据（39 取样点，实测 1–4ms）
    B) 像素 + 12 锚点（GPU NCC，实测 ~120ms）
  分别走同一份 decide()，与 manifest 期望态比对。
  若 A 与 B 在所有帧上判定一致 ⇒ 锚点对结论零贡献，可以整个砍掉（省 ~120ms + 缩小 ROI）。
用法：python3 .scratch/gui-perf/anchor-necessity.py [--json]
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


def batch_scores(jobs, frame):
    r = YL.daemon({"cmd": "batch", "frame": frame, "jobs": jobs}, timeout=60)
    if not r:
        raise RuntimeError(f"ys-lookd 不可用: {YL.LAST_DAEMON_ERROR}")
    return {x["id"]: (x["best"]["score"] if x.get("best") else -1.0) for x in r["results"]}


def main():
    prof = YS.load_profile(YS.PROFILE_DEFAULT)
    jobs, state_of = YS.anchor_jobs(prof)
    pts = YS.all_probe_points()
    rows = YS.read_manifest()
    out = []
    t_anchor = 0.0
    t_pix = 0.0
    for name, expect, note in rows:
        path = os.path.join(YS.REG_DIR, name)
        arr = YS.decode_frame(path)
        h, w = arr.shape[0], arr.shape[1]
        t0 = time.time()
        cells = {}
        for x, y in pts:
            if 0 <= x < w and 0 <= y < h:
                cells[(x, y)] = tuple(int(v) for v in arr[y, x])
        r_pix = YS.pixel_readings(YS.CellsPixels(cells, w, h))
        t_pix += time.time() - t0
        t0 = time.time()
        try:
            scores = batch_scores(jobs, path)
        except Exception as e:                                   # noqa: BLE001
            print(f"[warn] {name}: 锚点批失败 {e}", file=sys.stderr)
            scores = {}
        t_anchor += time.time() - t0
        r_anc = YS.anchor_readings_from_scores(scores, state_of) if scores else {}
        d_pix = YS.decide(YS.merge_readings(r_pix) if hasattr(YS, "merge_readings") else r_pix)
        r_full = dict(r_pix)
        r_full.update(r_anc)
        d_full = YS.decide(r_full)
        out.append({"frame": name, "expect": expect, "pix": d_pix["state"], "full": d_full["state"],
                    "same": d_pix["state"] == d_full["state"],
                    "pix_ok": d_pix["state"] == expect, "full_ok": d_full["state"] == expect})
    n = len(out)
    changed = [o for o in out if not o["same"]]
    pix_ok = sum(1 for o in out if o["pix_ok"])
    full_ok = sum(1 for o in out if o["full_ok"])
    rescue = [o for o in changed if not o["pix_ok"] and o["full_ok"]]
    break_ = [o for o in changed if o["pix_ok"] and not o["full_ok"]]
    print(f"帧数 {n}｜像素判据正确 {pix_ok}｜像素+锚点正确 {full_ok}")
    print(f"锚点改变结论的帧 {len(changed)}（救回 {len(rescue)}／弄错 {len(break_)}）")
    for o in changed:
        print(f"  {o['frame']:<28} expect={o['expect']:<9} pix={o['pix']:<9} full={o['full']}")
    print(f"累计：像素读数 {t_pix*1000:.0f}ms（{t_pix/n*1000:.1f}ms/帧）"
          f"｜锚点批 {t_anchor*1000:.0f}ms（{t_anchor/n*1000:.1f}ms/帧）")
    if "--json" in sys.argv:
        print(json.dumps(out, ensure_ascii=False, indent=1))
    # 逐锚点诊断：某个态若只有 1 条像素判据成立，该态就依赖锚点
    print("\n每态像素判据条数（<2 说明该态的判定**依赖锚点**）：")
    for st in ("MENU", "SAVELIST", "PLAYTEST", "PAUSE", "SETTLE", "LOADING", "EDITOR"):
        ok = [k for k, v in r_pix.items() if k.startswith(st + "/") and v.get("passed")]
        print(f"  {st:<9} 成立 {len(ok)}  {ok[:3]}")


if __name__ == "__main__":
    main()
