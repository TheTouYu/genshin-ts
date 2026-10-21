#!/usr/bin/env python3
"""scrollbar.selftest.py — 滚动条/滑块检测（tools/ys-scrollbar）的离线验收。

判据唯一实现在 `tools/ys-editor/ys_scrollbar.py`；**本脚本不重实现判据**，只读真值集取读数、
比阈值、给 PASS/FAIL。全程离线：只读 png，不抓屏、不点击、不抢焦点、不注入。

真值集由 `.scratch/scrollbar/build_truth.py` 生成（正样本带 bbox、负样本含"同 UI 去掉滚动条"
的合成版本）。缺真值或缺帧时**不静默通过**：退出码 2 并逐条列出缺什么。

用法
  python3 tools/ys-editor/tests/scrollbar.selftest.py            # 人看
  python3 tools/ys-editor/tests/scrollbar.selftest.py --json     # 机器看（stdout 只有 JSON）
  python3 tools/ys-editor/tests/scrollbar.selftest.py --truth DIR

判定
  正样本 **hit**：found=True 且方向一致 且 轨道中心线对齐（±(半宽+4px)）且 滑块中心落在真值轨道内
  负样本 **fp** ：found=True（任何方向）
  门槛：召回 ≥ 0.80 且 假阳 ≤ 1 帧

机读行（契约，供 tools/ys-gates 解析）
  SCROLLBAR-RESULT pos=<n> hit=<k> neg=<m> fp=<f> verdict=PASS|FAIL

退出码：0 PASS / 1 FAIL / 2 环境缺件（真值集或帧缺失）/ 3 用法错
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
DEFAULT_TRUTH = os.path.join(ROOT, '.scratch', 'scrollbar', 'truth')
MIN_POS, MIN_NEG = 10, 20
MIN_RECALL, MAX_FP = 0.80, 1
IOU_MIN = 0.30

sys.path.insert(0, os.path.join(ROOT, 'tools', 'ys-editor'))


def iou(a, b):
    ix0, iy0 = max(a[0], b[0]), max(a[1], b[1])
    ix1, iy1 = min(a[2], b[2]), min(a[3], b[3])
    iw, ih = max(0, ix1 - ix0), max(0, iy1 - iy0)
    inter = iw * ih
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--truth', default=DEFAULT_TRUTH)
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--verbose', action='store_true')
    a = ap.parse_args()

    pos_p = os.path.join(a.truth, 'pos.json')
    neg_p = os.path.join(a.truth, 'neg.json')
    for p in (pos_p, neg_p):
        if not os.path.exists(p):
            print('FAIL 前置：缺真值集 %s\n'
                  '  下一步：python3 .scratch/scrollbar/build_truth.py' % p, file=sys.stderr)
            return 2
    pos = json.load(open(pos_p))['frames']
    neg = json.load(open(neg_p))['frames']

    try:
        import ys_scrollbar
    except Exception as exc:
        print('FAIL 前置：加载判据模块失败 %s: %s' % (type(exc).__name__, exc), file=sys.stderr)
        return 2

    def path_of(e):
        p = e['path']
        return p if os.path.isabs(p) else os.path.join(ROOT, p)

    def regen_synth(e):
        """合成负样本可现造：缺图且源帧在 ⇒ 按 synth_from 重造（避免把 6MB 帧提交进仓库）。"""
        if not e.get('synth_from') or os.path.exists(path_of(e)):
            return
        src = os.path.join(ROOT, e['synth_from'])
        if not os.path.exists(src):
            return
        try:
            import numpy as np
            from PIL import Image
            im = np.array(Image.open(src).convert('RGB'))
            x0, x1 = e['synth_span']
            left = im[:, x0 - 12:x0 - 1].mean(axis=1, keepdims=True)
            right = im[:, x1:x1 + 11].mean(axis=1, keepdims=True)
            im[:, x0:x1] = ((left + right) / 2.0).astype(np.uint8)
            os.makedirs(os.path.dirname(path_of(e)), exist_ok=True)
            Image.fromarray(im).save(path_of(e))
        except Exception:                                # noqa: BLE001
            pass

    def present(entries):
        ok, miss = [], []
        for e in entries:
            (ok if os.path.exists(path_of(e)) else miss).append(e)
        return ok, miss

    for e in neg:
        regen_synth(e)
    pos_ok, pos_miss = present(pos)
    neg_ok, neg_miss = present(neg)
    if len(pos_ok) < MIN_POS or len(neg_ok) < MIN_NEG:
        print('FAIL 前置：帧缺失（要有 ≥%d 正样本 / ≥%d 负样本；实测 %d / %d）'
              % (MIN_POS, MIN_NEG, len(pos_ok), len(neg_ok)), file=sys.stderr)
        for e in (pos_miss + neg_miss)[:12]:
            print('  缺帧：%s' % e['path'], file=sys.stderr)
        return 2

    t0 = time.time()
    hits, misses, details = 0, [], []
    for e in pos_ok:
        r = ys_scrollbar.detect_path(path_of(e))
        gt = e['track_bbox']
        ok = False
        why = r.get('reason') or 'unknown'
        if r.get('found'):
            got = r['track_bbox']
            tb = e.get('thumb_bbox')
            tc = ((got[0] + got[2]) / 2.0, (got[1] + got[3]) / 2.0)
            thumb_c = ((got[0] + got[2]) / 2.0, (r['thumb_bbox'][1] + r['thumb_bbox'][3]) / 2.0) \
                if r.get('orientation') == 'v' else ((r['thumb_bbox'][0] + r['thumb_bbox'][2]) / 2.0,
                                                     (got[1] + got[3]) / 2.0)
            inside = (gt[0] - 2 <= thumb_c[0] <= gt[2] + 2 and gt[1] - 2 <= thumb_c[1] <= gt[3] + 2)
            iv = iou(got, gt)
            # 细带（3–12px）上 IoU 会被宽度误差主导（3px vs 10px 恒 <0.3），
            # 所以判「是不是同一根滚动条」用**中心线对齐**：带宽允许差 ±(半宽+4)，
            # 方向与滑块纵向范围必须落在真值轨道内。
            axis_c = 0 if e.get('orientation', 'v') == 'v' else 1
            half = (gt[2] - gt[0]) / 2.0 if axis_c == 0 else (gt[3] - gt[1]) / 2.0
            centre = tc[axis_c]
            gt_c = (gt[0] + gt[2]) / 2.0 if axis_c == 0 else (gt[1] + gt[3]) / 2.0
            aligned = abs(centre - gt_c) <= half + 4
            ok = (r.get('orientation') == e.get('orientation', 'v')) and aligned and inside
            why = '' if ok else ('中心线偏 %.0fpx > %.0f' % (abs(centre - gt_c), half + 4)
                                 if not aligned else
                                 'thumb 中心 %.0f,%.0f 不在真值轨道内' % thumb_c)
            if tb is not None:
                details.append({'path': e['path'], 'kind': 'pos', 'ok': ok,
                                'track_iou': round(iv, 3),
                                'thumb_off': abs(r['thumb_bbox'][1] - tb[1])})
        if ok:
            hits += 1
        else:
            misses.append((e['path'], why))

    fps, fp_list = 0, []
    for e in neg_ok:
        r = ys_scrollbar.detect_path(path_of(e))
        if r.get('found'):
            fps += 1
            fp_list.append((e['path'], r.get('track_bbox'), r.get('position_ratio')))

    npos, nneg = len(pos_ok), len(neg_ok)
    recall = hits / float(npos)
    verdict = 'PASS' if (recall >= MIN_RECALL and fps <= MAX_FP) else 'FAIL'
    ms = int((time.time() - t0) * 1000)

    if a.json:
        print(json.dumps({'pos': npos, 'hit': hits, 'neg': nneg, 'fp': fps,
                          'recall': round(recall, 3), 'missing': len(pos_miss) + len(neg_miss),
                          'verdict': verdict, 'ms': ms, 'misses': misses,
                          'fps': [[p, b, r] for p, b, r in fp_list], 'details': details},
                         ensure_ascii=False))
    else:
        print('== ys-scrollbar selftest ==')
        print('   真值：%s（正 %d / 负 %d，缺帧 %d）' % (a.truth, npos, nneg,
                                                    len(pos_miss) + len(neg_miss)))
        print('   门槛：召回 ≥ %.2f，假阳 ≤ %d 帧，轨道中心线对齐 ±(半宽+4px)' % (MIN_RECALL, MAX_FP))
        print('   读数：召回 %d/%d = %.3f，假阳 %d/%d，耗时 %dms' % (hits, npos, recall, fps, nneg, ms))
        for p, why in misses:
            print('   MISS %s → %s' % (p, why))
        for p, b, r in fp_list:
            print('   FP   %s → track=%s pos=%s' % (p, b, r))
        if a.verbose:
            for d in details:
                print('   · %(path)s iou=%(track_iou)s thumb_off=%(thumb_off)s' % d)
    print('SCROLLBAR-RESULT pos=%d hit=%d neg=%d fp=%d verdict=%s' % (npos, hits, nneg, fps, verdict))
    return 0 if verdict == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
