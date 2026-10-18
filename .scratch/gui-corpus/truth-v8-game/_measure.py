#!/usr/bin/env python3
"""_measure.py — 本批自用的**段测量**工具（不改共享工具）。

为什么不用 edges.py 单扫描线：皮肤内部有插画/文字纹理，单行亮差会把纹理当边界
（r003 网格一条线报 48 个跃变）。这里换成**带内聚合**，两种模式：

  --mode frac   perpendicular 带里"暗像素占比" > frac 的列/行 → 段（给网格/平皮肤面板，最稳）
  --mode pct    perpendicular 带里的中位亮度 < thr → 段（给有内容的面板）

用法：
  python3 _measure.py <frame.png> --axis x --mode frac --proj 470,1350 --from 130 --to 1040 --thr 160
  python3 _measure.py <frame.png> --axis y --mode frac --proj 180,340  --from 440 --to 1440 --thr 160
      → 打印每个"命中段"的 [start,end) 与宽度
  --seg on|off   只看命中/未命中段
  --min 8        忽略短于 N px 的段
  --scale 0.5     分块降采样（大 ROI 提速；误差 ≤2px）
"""
import argparse
import sys

import numpy as np
from PIL import Image


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('frame')
    ap.add_argument('--axis', choices=('x', 'y'), required=True)
    ap.add_argument('--proj', required=True, help='axis=x 时是 y0,y1（跨该带统计每列）；axis=y 相反')
    ap.add_argument('--from', dest='frm', type=int, default=0)
    ap.add_argument('--to', type=int, default=None)
    ap.add_argument('--thr', type=float, default=160.0, help='亮度阈值：<thr 记暗')
    ap.add_argument('--mode', choices=('frac', 'pct'), default='frac')
    ap.add_argument('--frac', type=float, default=0.5, help='mode=frac：命中所需的暗像素占比')
    ap.add_argument('--seg', choices=('on', 'off', 'both'), default='on')
    ap.add_argument('--min', dest='minlen', type=int, default=8)
    a = ap.parse_args(argv)

    im = Image.open(a.frame).convert('RGB')
    arr = np.asarray(im).astype(np.float32)
    lum = arr[:, :, 0] * 0.299 + arr[:, :, 1] * 0.587 + arr[:, :, 2] * 0.114
    b0, b1 = [int(v) for v in a.proj.replace(' ', '').split(',')]
    dark = lum < a.thr
    if a.axis == 'x':
        prof = dark[b0:b1, :].mean(axis=0)
    else:
        prof = dark[:, b0:b1].mean(axis=1)
    hit = prof > a.frac if a.mode == 'frac' else prof < a.frac
    lo = a.frm
    hi = a.to if a.to is not None else len(prof)
    h = hit[lo:hi]
    out = []
    i = 0
    n = len(h)
    while i < n:
        j = i
        while j + 1 < n and h[j + 1] == h[i]:
            j += 1
        s, e = lo + i, lo + j + 1
        kind = 'on' if h[i] else 'off'
        if e - s >= a.minlen and (a.seg == 'both' or a.seg == kind):
            out.append((kind, s, e, e - s))
        i = j + 1
    print('MEASURE axis=%s proj=%d,%d mode=%s thr=%.0f frac=%.2f range=[%d,%d] segs=%d'
          % (a.axis, b0, b1, a.mode, a.thr, a.frac, lo, hi, len(out)))
    for kind, s, e, w in out:
        print('  %-3s %4d..%-4d w=%d' % (kind, s, e, w))
    return 0


if __name__ == '__main__':
    sys.exit(main())
