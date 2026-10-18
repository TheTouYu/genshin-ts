#!/usr/bin/env python3
"""d2_prod_eval.py — 用**生产入口**（tools/ys-editor/gui_det.Detector.detect）复算每类召回与端到端耗时。

与 d2_train.py 的验证集切分完全一致（d2.Data，seed=0、val_frac=0.25 → 7 帧留族），
但走真实调用链：PIL 缩放 → 前向 → decode/decode_rows → postprocess(NMS)。

  python3 .scratch/gui-detect/d2_prod_eval.py --w tools/ys-editor/models/gui-det-v2.pt
  python3 .scratch/gui-detect/d2_prod_eval.py --w tools/ys-editor/models/gui-det-v1.pt --tag v1
"""
import argparse
import json
import os
import statistics
import sys
import time
from collections import Counter

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "..", "tools", "ys-editor"))

import d2  # noqa: E402
import gui_det  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--w", default="")
    ap.add_argument("--tag", default="")
    ap.add_argument("--reps", type=int, default=5)
    args = ap.parse_args()
    data = d2.Data(".scratch/gui-detect/dataset", 0.25)
    det = gui_det.Detector(model_path=args.w or None)
    hit, tot = Counter(), Counter()
    lat = []
    for it in data.val:
        rgb = np.asarray(Image.open(it["path"]).convert("RGB"))
        out = det.detect(rgb)                     # 冷一次
        for _ in range(args.reps):                # 热态计时
            t0 = time.perf_counter()
            det.detect(rgb)
            lat.append((time.perf_counter() - t0) * 1000)
        for bbox, kind in it["boxes"]:
            tot[kind] += 1
            if any(o["kind"] == kind and gui_det._iou(o["bbox"], bbox) >= 0.5 for o in out):
                hit[kind] += 1
    per = {k: round(hit[k] / tot[k], 3) for k in sorted(tot) if tot[k]}
    micro = sum(hit.values()) / max(1, sum(tot.values()))
    cf = sum(hit[k] for k in hit if k not in ("row", "panel", "card"))
    ct = sum(tot[k] for k in tot if k not in ("row", "panel", "card"))
    srt = sorted(lat)
    res = {"tag": args.tag or os.path.basename(det.model_path), "err": det.err,
           "kinds": det.kinds, "row_strip": det.row_strip, "in_size": det.in_size,
           "micro": round(micro, 3), "per_kind": per, "gt": dict(tot),
           "element_fine_micro": round(cf / max(1, ct), 3),
           "p50_ms": round(statistics.median(srt), 1),
           "p90_ms": round(srt[int(0.9 * (len(srt) - 1))], 1)}
    print(json.dumps(res, ensure_ascii=False))


if __name__ == "__main__":
    main()
