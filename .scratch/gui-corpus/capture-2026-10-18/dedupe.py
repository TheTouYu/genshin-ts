#!/usr/bin/env python3
"""连拍帧去重 + 聚类（只读，workspace 内）。

用法：
  python3 dedupe.py [--dir .] [--thresh 6.0] [--json-out clusters.json]

方法：每帧缩到 64x36 灰度；与"上一个成簇代表"做平均绝对差（MAD）。
  MAD <= thresh ⇒ 同一屏（同一界面停住的多帧）；
  跨簇后若与任一代表 MAD <= thresh ⇒ 归入该簇（同一界面回头）。
输出：簇列表（代表帧 + 成员 + 起止时间）+ 总帧数/簇数/显著变化次数。
用途：把连拍变成"界面序列"，只对代表帧做标注。
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

W, H = 64, 36


def sig(path):
    im = Image.open(path).convert("L").resize((W, H), Image.BILINEAR)
    return np.asarray(im, dtype=np.float32)


def mad(a, b):
    return float(np.abs(a - b).mean())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=".")
    ap.add_argument("--thresh", type=float, default=6.0)
    ap.add_argument("--json-out", default="clusters.json")
    args = ap.parse_args()

    files = sorted(f for f in os.listdir(args.dir) if f.lower().endswith((".png", ".jpg", ".jpeg")))
    if not files:
        print("no frames", file=sys.stderr)
        return 2

    clusters = []  # [{rep, sig, members:[{file, mad_prev}], t0, t1}]
    prev_sig = None
    for f in files:
        p = os.path.join(args.dir, f)
        try:
            s = sig(p)
        except Exception as e:  # 坏帧不猜
            print(f"WARN unreadable {f}: {e}", file=sys.stderr)
            continue
        if prev_sig is None:
            clusters.append({"rep": f, "sig": s, "members": [{"file": f, "mad_prev": None}], "t0": f, "t1": f})
            prev_sig = s
            continue
        d_prev = mad(prev_sig, s)
        # 先与上一帧比；差得远再找历史簇代表
        best, best_d = None, None
        for c in clusters:
            d = mad(c["sig"], s)
            if best_d is None or d < best_d:
                best, best_d = c, d
        if d_prev <= args.thresh and clusters:
            c = clusters[-1]
        elif best is not None and best_d <= args.thresh:
            c = best
        else:
            clusters.append({"rep": f, "sig": s, "members": [{"file": f, "mad_prev": d_prev}], "t0": f, "t1": f})
            prev_sig = s
            continue
        c["members"].append({"file": f, "mad_prev": round(d_prev, 2)})
        c["t1"] = f
        prev_sig = s

    out = {
        "dir": os.path.abspath(args.dir),
        "frames": len(files),
        "clusters": len(clusters),
        "thresh": args.thresh,
        "items": [
            {
                "rep": c["rep"],
                "t0": c["t0"],
                "t1": c["t1"],
                "count": len(c["members"]),
                "members": c["members"],
            }
            for c in clusters
        ],
    }
    with open(args.json_out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(f"frames={out['frames']} clusters={out['clusters']} thresh={args.thresh} -> {args.json_out}")
    for it in out["items"]:
        print(f"  {it['t0']}..{it['t1']}  n={it['count']:>2}  rep={it['rep']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
