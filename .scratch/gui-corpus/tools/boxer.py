#!/usr/bin/env python3
"""boxer.py — 在给定 ROI 里量出**非背景**像素的紧致 bbox（给 truth 标注量小图标用）。

原则：标注者先用 grid 裁剪图**人眼确认**"这里有一个对象、它是什么"，
再用本工具把它的像素边界量准（背景 = ROI 里出现最多的颜色，ΔRGB>thr 即前景）。

用法：
  python3 boxer.py <frame.png> --roi x0,y0,x1,y1 [--thr 30] [--json]
  多个 ROI 可一次给：--roi 30,480,110,560 --roi 30,580,110,660 ...
输出每行：bbox(x,y,w,h) + 前景占比 + 背景色。
"""
import argparse
import json
import sys

import numpy as np
from PIL import Image


def measure(arr, x0, y0, x1, y1, thr):
    roi = arr[y0:y1, x0:x1]
    if roi.size == 0:
        return None
    flat = roi.reshape(-1, 3)
    # 背景 = 出现最多的颜色（量化到 4 级避免噪声）
    q = (flat // 4).astype(np.int32)
    keys = q[:, 0] * 10000 + q[:, 1] * 100 + q[:, 2]
    vals, counts = np.unique(keys, return_counts=True)
    bg_key = vals[counts.argmax()]
    bg = np.array([bg_key // 10000, (bg_key // 100) % 100, bg_key % 100], dtype=np.int32) * 4
    diff = np.abs(roi.astype(np.int32) - bg).sum(axis=2)
    mask = diff > thr
    if not mask.any():
        return {'bbox': None, 'fg_ratio': 0.0, 'bg': bg.tolist(), 'roi': [x0, y0, x1, y1]}
    ys, xs = np.where(mask)
    bx0, bx1 = int(xs.min()) + x0, int(xs.max()) + x0 + 1
    by0, by1 = int(ys.min()) + y0, int(ys.max()) + y0 + 1
    return {'bbox': [bx0, by0, bx1 - bx0, by1 - by0],
            'fg_ratio': round(float(mask.mean()), 3),
            'bg': bg.tolist(), 'roi': [x0, y0, x1, y1]}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('frame')
    ap.add_argument('--roi', action='append', required=True,
                    help='x0,y0,x1,y1（可重复）')
    ap.add_argument('--thr', type=int, default=30)
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args(argv)
    arr = np.asarray(Image.open(a.frame).convert('RGB'))
    out = []
    for r in a.roi:
        x0, y0, x1, y1 = [int(v) for v in r.replace(' ', '').split(',')]
        m = measure(arr, x0, y0, x1, y1, a.thr)
        out.append(m)
        if not a.json and m:
            print('roi=%s -> bbox=%s fg=%.3f bg=%s' %
                  (r, m['bbox'], m['fg_ratio'], m['bg']))
    if a.json:
        print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
