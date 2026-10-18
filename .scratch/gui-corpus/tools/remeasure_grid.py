#!/usr/bin/env python3
"""remeasure_grid.py — **独立几何重测**派蒙菜单格子（去循环性用，票 23 地基）。

为什么需要它：真值 f06/f07/f08 的 19 格 bbox 与 `tools/ys-screen` 的候选几乎同框（IoU≈1.0），
这只能证明"两者一致"，不能证明"真值本身对"。本脚本用一条**与 ys-screen 无关的前提**重测：

  ys-screen 的前提 = Lab 三通道边缘能量低（平坦皮肤）+ 矩形度 → 容器
  本脚本的前提   = **同一块皮肤色**（帧内主色聚类，亮度低于面板底色）→ 二值 → 连通域 → 紧致外接框

两条前提互不依赖，若两者在同一帧上给出同框 ⇒ 该格子几何可判"实测通过"（写进 truth 的 provenance）。

用法：
  python3 remeasure_grid.py <帧.png> [--roi x0,y0,x1,y1] [--json]
输出：每个连通块的 xywh + 面积/填充率；与真值逐格比对用 `--truth <json>`：
  python3 remeasure_grid.py f06.png --truth truth/f06.json
      → 逐格 IoU 表 + `REMEASURE matched=… mean_iou=… min_iou=…`
不写任何文件（只读）。
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))


def iou(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x0, y0 = max(ax, bx), max(ay, by)
    x1, y1 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    i = (x1 - x0) * (y1 - y0)
    return i / (aw * ah + bw * bh - i)


def components(mask):
    """4-连通标记（纯 numpy，避免依赖 cv2 的连通域实现——与本案的独立性有关）。"""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    cur = 0
    stack = []
    for y in range(h):
        row = mask[y]
        if not row.any():
            continue
        for x in np.nonzero(row)[0]:
            if lab[y, x]:
                continue
            cur += 1
            lab[y, x] = cur
            stack.append((y, x))
            while stack:
                cy, cx = stack.pop()
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx_ = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx_ < w and mask[ny, nx_] and not lab[ny, nx_]:
                        lab[ny, nx_] = cur
                        stack.append((ny, nx_))
            if cur > 4000:      # 保险：别在噪声上跑飞
                return lab, cur
    return lab, cur


def measure(path, roi=None, lum_max=150, min_area=6000, fill_min=0.45,
            ar_range=(0.7, 1.6)):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    H, W = a.shape[:2]
    x0, y0, x1, y1 = roi or (0, 0, W, H)
    sub = a[y0:y1, x0:x1]
    lum = sub.mean(axis=2)
    # 皮肤色前提：格子皮肤是**低亮度**的深色块；面板底/背景亮。
    mask = lum < lum_max
    lab, n = components(mask)
    print('# 连通块 %d（阈值 lum<%d，ROI=%s）' % (n, lum_max, [x0, y0, x1, y1]), file=sys.stderr)
    out = []
    for i in range(1, n + 1):
        ys, xs = np.where(lab == i)
        if ys.size < min_area:
            continue
        bx0, bx1 = int(xs.min()) + x0, int(xs.max()) + x0 + 1
        by0, by1 = int(ys.min()) + y0, int(ys.max()) + y0 + 1
        bw, bh = bx1 - bx0, by1 - by0
        fill = ys.size / float(bw * bh)
        ar = bw / float(bh)
        if fill < fill_min or not (ar_range[0] <= ar <= ar_range[1]):
            continue
        out.append({'bbox': [bx0, by0, bw, bh], 'area': int(ys.size), 'fill': round(fill, 3)})
    out.sort(key=lambda o: (o['bbox'][1], o['bbox'][0]))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('frame')
    ap.add_argument('--roi', default=None)
    ap.add_argument('--lum-max', type=int, default=150)
    ap.add_argument('--truth', default=None, help='与该帧真值逐格比 IoU')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args(argv)
    roi = None
    if a.roi:
        roi = tuple(int(v) for v in a.roi.split(','))
    boxes = measure(a.frame, roi, lum_max=a.lum_max)
    for b in boxes:
        print('MEASURED bbox=%s area=%d fill=%.3f' % (b['bbox'], b['area'], b['fill']))
    if a.json:
        print(json.dumps(boxes, ensure_ascii=False))
    if a.truth:
        tp = a.truth if os.path.isabs(a.truth) else os.path.join(ROOT, a.truth)
        doc = json.load(open(tp, encoding='utf-8'))
        tiles = [o for o in doc['objects'] if o['kind'] == 'tile']
        pairs, miss, used = [], [], set()
        for t in tiles:
            best = max(((iou(t['bbox'], b['bbox']), k) for k, b in enumerate(boxes)),
                       default=(0.0, -1))
            if best[0] >= 0.5:
                pairs.append((t['id'], best[1], round(best[0], 3)))
                used.add(best[1])
            else:
                miss.append(t['id'])
        extra = [k for k in range(len(boxes)) if k not in used]
        ious = [p[2] for p in pairs]
        print('REMEASURE frame=%s truth_tiles=%d measured=%d matched=%d miss=%s extra=%d '
              'mean_iou=%.3f min_iou=%.3f'
              % (os.path.basename(a.frame), len(tiles), len(boxes), len(pairs), miss, len(extra),
                 (sum(ious) / len(ious)) if ious else 0.0, min(ious) if ious else 0.0))
        for p in pairs:
            print('   tile id=%-3s measured#%-3d iou=%.3f' % p)
    return 0


if __name__ == '__main__':
    sys.exit(main())
