#!/usr/bin/env python3
"""rows_from_ocr.py — 把 OCR 文本行按区域**聚成行候选**（严格逐行标注用）。

为什么需要它：用户点名批评"成片列表整块漏标"。逐行标的第一件事是**别漏行**——
OCR 已经给出了每行文字的位置，先把"有哪些行"枚举出来，人只做「这行是单元吗 / 行带左右到哪」。

纪律：本工具只做**候选枚举**（哪些 y 上有文字行），不做判定：
  · 行带高度、左右边界、是否算单元 ⇒ 人来定（用 edges.py 量面板/行带）
  · 输出是 "y 中心 + 该行所有文本 + 该行 x 范围"，供写进 _build 数据表

用法：
  python3 rows_from_ocr.py <ocr.json> --region x0,x1,y0,y1 [--region …] [--pad 8]
输出：按 region 分组的候选行（y 中心 / x span / 文本拼接）
"""
import argparse
import json
import sys


def load_texts(path):
    d = json.load(open(path, encoding='utf-8'))
    out = []
    for t in d.get('text') or []:
        b = t.get('bbox')
        if not b or len(b) != 4:
            continue
        txt = (t.get('text') or '').strip()
        if not txt:
            continue
        out.append({'text': txt, 'bbox': list(b)})
    return out


def cluster(texts, region, pad):
    x0, x1, y0, y1 = region
    sel = [t for t in texts
           if t['bbox'][0] >= x0 - 4 and t['bbox'][2] <= x1 + 4
           and t['bbox'][1] >= y0 - 4 and t['bbox'][3] <= y1 + 4]
    sel.sort(key=lambda t: (t['bbox'][1], t['bbox'][0]))
    rows = []
    for t in sel:
        cy = (t['bbox'][1] + t['bbox'][3]) / 2
        h = t['bbox'][3] - t['bbox'][1]
        placed = False
        for r in rows:
            if abs(cy - r['cy']) <= max(6, 0.55 * max(h, r['h'])):
                r['items'].append(t)
                r['cy'] = (r['cy'] * r['n'] + cy) / (r['n'] + 1)
                r['n'] += 1
                r['h'] = max(r['h'], h)
                r['x0'] = min(r['x0'], t['bbox'][0])
                r['x1'] = max(r['x1'], t['bbox'][2])
                placed = True
                break
        if not placed:
            rows.append({'cy': cy, 'h': h, 'n': 1, 'x0': t['bbox'][0], 'x1': t['bbox'][2],
                         'items': [t]})
    rows.sort(key=lambda r: r['cy'])
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('ocr')
    ap.add_argument('--region', action='append', required=True, help='x0,x1,y0,y1（可重复）')
    ap.add_argument('--pad', type=int, default=8)
    a = ap.parse_args(argv)
    texts = load_texts(a.ocr)
    print('# %s  文本行=%d' % (a.ocr.split('/')[-1], len(texts)))
    for ri, reg in enumerate(a.region):
        region = [int(v) for v in reg.replace(' ', '').split(',')]
        rows = cluster(texts, region, a.pad)
        print('== region%d [%s] rows=%d' % (ri, reg, len(rows)))
        for r in rows:
            top = int(r['cy'] - r['h'] / 2) - a.pad
            hh = int(r['h']) + 2 * a.pad
            txt = ' / '.join(t['text'][:14] for t in r['items'])
            print('   y0=%-5d h=%-3d x=[%d,%d] n=%d  %s'
                  % (top, hh, r['x0'], r['x1'], r['n'], txt[:110]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
