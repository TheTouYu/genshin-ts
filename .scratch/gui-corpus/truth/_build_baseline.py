#!/usr/bin/env python3
"""_build_baseline.py — 把 ys-screen 的逐帧 pred JSON + coverage 结果合成
`.scratch/gui-corpus/baseline-2026-10-18.json`（票 23 的复跑基线，证据落在 workspace）。

用法（先跑 ys-screen 落 pred/，再跑 ys-coverage 落 coverage-cv-baseline.json）：
  python3 .scratch/gui-corpus/truth/_build_baseline.py
产物：baseline-2026-10-18.json（含每帧工具输出摘要 + 覆盖率 + near-miss 表）
"""
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS = os.path.dirname(HERE)
PRED = os.path.join(CORPUS, 'pred')
COV = os.path.join(CORPUS, 'coverage-cv-baseline.json')
OUT = os.path.join(CORPUS, 'baseline-2026-10-18.json')


def iou(a, b):
    x0, y0 = max(a[0], b[0]), max(a[1], b[1])
    x1, y1 = min(a[0] + a[2], b[0] + b[2]), min(a[1] + a[3], b[1] + b[3])
    if x1 <= x0 or y1 <= y0:
        return 0.0
    inter = (x1 - x0) * (y1 - y0)
    return inter / (a[2] * a[3] + b[2] * b[3] - inter)


def to_xywh(b):
    return [b[0], b[1], b[2] - b[0], b[3] - b[1]]


def main():
    cov = json.load(open(COV, encoding='utf-8'))
    frames = []
    for fr in cov['frames']:
        stem = fr['frame']
        pred_path = os.path.join(PRED, stem + '.json')
        pd = json.load(open(pred_path, encoding='utf-8')) if os.path.exists(pred_path) else {}
        containers = [{'bbox_xyxy': c['bbox'], 'bbox_xywh': to_xywh(c['bbox']),
                       'kind': c.get('kind'), 'text': c.get('text') or []}
                      for c in (pd.get('containers') or [])]
        # near-miss：0.3 ≤ IoU < 0.5 的"差一点"配对（解释 README 与严格口径的差）
        truth = json.load(open(os.path.join(HERE, stem + '.json'), encoding='utf-8'))
        near = []
        for o in truth['objects']:
            for c in containers:
                v = iou(o['bbox'], c['bbox_xywh'])
                if 0.30 <= v < cov['iou_thr']:
                    near.append({'truth_id': o['id'], 'kind': o.get('kind'),
                                 'truth_bbox': o['bbox'], 'pred_bbox': c['bbox_xywh'],
                                 'iou': round(v, 3)})
            near.sort(key=lambda x: -x['iou'])
            near = near[:8]
        frames.append({
            'frame': stem,
            'ys_screen': {
                'command': 'tools/ys-screen %s.png --json' % (truth.get('image') or ''),
                'containers': len(containers),
                'container_boxes': containers,
                'degraded': pd.get('degraded'),
                'free_text': len(pd.get('free_text') or []),
                'free_glyphs': len(pd.get('free_glyphs') or []),
                'timing': pd.get('timing'),
            },
            'coverage': {k: fr[k] for k in ('units', 'hit', 'rate', 'fp', 'degenerate',
                                            'iou_mean', 'miss', 'pairs')},
            'near_miss_iou_0.3_0.5': near,
        })
    doc = {
        'schema': 'ys-baseline/1',
        'date': '2026-10-18',
        'note': 'ys-screen 当前主检测路径（flat-skin 容器层）在 14 帧 + 1 负样本上的覆盖率基线；'
                'truth 见 truth/*.json（口径 truth/_rules.md），记分器 tools/ys-coverage（IoU≥0.5 一对一）。',
        'repo': os.path.abspath(os.path.join(CORPUS, '..', '..')),
        'commands': {
            'pred': 'for f in f00..f13.png; tools/ys-screen $f --json --json-out pred/$f.json',
            'coverage': 'tools/ys-coverage --truth .scratch/gui-corpus/truth '
                        '--pred .scratch/gui-corpus/pred --iou 0.5 '
                        '--json-out .scratch/gui-corpus/coverage-cv-baseline.json',
            'selftest': 'tools/ys-coverage --truth .scratch/gui-corpus/truth --selftest',
        },
        'bbox_formats': {
            'truth': 'xywh（AGI-BAR §四）',
            'ys_screen_containers': 'xyxy（tools/ys-screen 源码 containers bbox）',
            'ys_coverage': '--pred-format xyxy（默认）',
        },
        'iou_thr': cov['iou_thr'],
        'frames': frames,
        'summary': cov['summary'],
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('wrote %s  frames=%d units=%d hit=%d rate=%.3f fp=%d'
          % (OUT, len(frames), cov['summary']['units'], cov['summary']['hit'],
             cov['summary']['rate'], cov['summary']['fp']))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
