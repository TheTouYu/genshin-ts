#!/usr/bin/env python3
"""edges.py — 沿一条扫描线打印**亮度跃变位置**（量规则网格/行的边界用，输出是文字不是图）。

用途：标注时不想靠"看网格图猜 ±10px"。给一条扫描线，本工具报出边界像素坐标，
比人眼读数准、且几乎不花上下文。

用法：
  python3 edges.py <帧.png> --axis x --line 520 --from 140 --to 1010 [--thr 25]
      → 沿 y=520 这一行、在 x∈[140,1010] 内找竖直边界
  python3 edges.py <帧.png> --axis y --line 250 --from 400 --to 1400
      → 沿 x=250 这一列找水平边界
  --merge 3   相邻跃变合并（抗锯齿会给出 2~3px 的双边）

输出：`EDGES axis=x line=520 thr=25 n=13 pos=174,348,382,556,...` + 逐条 `edge x=174 d=52`
亮度用 0.299R+0.587G+0.114B（够稳，不需要 Lab）。
"""
import argparse
import sys

import numpy as np
from PIL import Image


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('frame')
    ap.add_argument('--axis', choices=('x', 'y'), required=True,
                    help='x=沿一行找竖直边界；y=沿一列找水平边界')
    ap.add_argument('--line', type=int, required=True, help='扫描线坐标（axis=x 时是 y）')
    ap.add_argument('--from', dest='frm', type=int, default=0)
    ap.add_argument('--to', type=int, default=None)
    ap.add_argument('--thr', type=float, default=25.0)
    ap.add_argument('--merge', type=int, default=3)
    a = ap.parse_args(argv)
    im = Image.open(a.frame).convert('RGB')
    arr = np.asarray(im).astype(np.float32)
    lum = arr[:, :, 0] * 0.299 + arr[:, :, 1] * 0.587 + arr[:, :, 2] * 0.114
    if a.axis == 'x':
        sig = lum[a.line, :]
    else:
        sig = lum[:, a.line]
    lo = a.frm
    hi = a.to if a.to is not None else len(sig)
    seg = sig[lo:hi]
    d = np.abs(np.diff(seg))
    idx = np.nonzero(d > a.thr)[0]
    pos = []
    for i in idx:
        p = int(i + lo + 1)
        if pos and p - pos[-1] <= a.merge:
            # 同一处双边：保留跃变更大的那一侧
            if d[i] > d[pos[-1] - lo - 1]:
                pos[-1] = p
            continue
        pos.append(p)
    print('EDGES axis=%s line=%d thr=%.0f n=%d range=[%d,%d]' % (a.axis, a.line, a.thr, len(pos), lo, hi))
    print('pos=' + ','.join(str(p) for p in pos))
    for p in pos:
        print('  edge %s=%d d=%.0f' % (a.axis, p, abs(sig[p] - sig[p - 1]) if p > 0 else 0))
    return 0


if __name__ == '__main__':
    sys.exit(main())
