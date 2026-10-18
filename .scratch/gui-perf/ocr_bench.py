#!/usr/bin/env python3
"""ocr_bench.py — 分块并行 OCR 基准（票 25；离线，只读语料，不改 ys_ocr.py）。

改前口径（Lead 实测 / 本文件复测）：
  `ys_ocr.py ocr <png>` 每次新进程：模型加载 + 全帧单次 = **634–3521ms**；
  进程内全帧（本文件复测，2560×1440，38 框）= **~685ms**（det ~200 / cls ~130 / rec ~330）。

本文件要回答：能不能在**不丢字**的前提下 <200ms。做法：
  ① 只把 det 缩小（det 是定位，不需要原分辨率）；crops 仍从**原始帧**切（保清晰度）；
  ② cls 关掉（UI 文本水平；每框一次分类是纯开销）；
  ③ rec 分块并行（ORT 的 Run 是线程安全的，同一 CUDA session 上并发跑）；
  ④ 内容寻址缓存（同帧第二次 0 成本）。

用法：
  python3 .scratch/gui-perf/ocr_bench.py --frames 12 --variants baseline,det1600,det1280,det960,det1280_t4,strips4_t4,cache
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import sys
import threading
import time
import unicodedata

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(REPO, 'tools', 'ys-editor'))
import ys_ocr  # noqa: E402

REPS = os.path.join(REPO, '.scratch/gui-corpus/video-20261018/reps')


def log(*a):
    print(*a, flush=True)


def load_frames(n, pattern=None):
    fs = sorted(glob.glob(os.path.join(REPS, '*.jpg')))
    if pattern:
        fs = [f for f in fs if pattern in f]
    if n and n < len(fs):
        step = len(fs) / float(n)
        fs = [fs[int(i * step)] for i in range(n)]
    out = []
    for f in fs:
        out.append((os.path.basename(f), np.asarray(Image.open(f).convert('RGB'))))
    return out


def norm(t):
    t = unicodedata.normalize('NFKC', t or '')
    return ''.join(ch for ch in t if not ch.isspace())


def cmp_texts(base, var):
    """字符级对账：baseline 的字符在 variant 里还找得到吗（顺序无关的多重集）。"""
    from collections import Counter
    nb = Counter()
    for t in base:
        nb.update(norm(t))
    nv = Counter()
    for t in var:
        nv.update(norm(t))
    missing = nb - nv
    extra = nv - nb
    base_total = sum(nb.values())
    kept = sum((nb & nv).values())
    return {'base_chars': base_total, 'var_chars': sum(nv.values()),
            'char_recall': round(kept / base_total, 4) if base_total else 1.0,
            'missing_chars': ''.join(k * v for k, v in sorted(missing.items()))[:200],
            'extra_chars': ''.join(k * v for k, v in sorted(extra.items()))[:200],
            'n_base': len(base), 'n_var': len(var)}


def get_engine(use_cls=True):
    ok, why = ys_ocr._enable_gpu()
    eng = ys_ocr._engine()
    if not use_cls:
        eng.use_cls = False
    return eng, ok, why


def run_full(eng, img, use_cls=None):
    t0 = time.perf_counter()
    r = eng(img, use_cls=use_cls)
    ms = (time.perf_counter() - t0) * 1000
    return {'ms': ms, 'elapse': [round(x * 1000, 1) if isinstance(x, float) else x
                                 for x in (r.elapse_list or [])],
            'texts': list(r.txts or []), 'boxes': len(r)}


def _crops(eng, img, det_max):
    """det（缩小）→ 框映射回原图 → 从**原图**切块（清晰度不丢）。"""
    det = eng.text_det or eng._load_det_model()
    det.limit_type = 'max'
    det.limit_side_len = int(det_max)
    from rapidocr.utils.process_img import get_rotate_crop_image
    t0 = time.perf_counter()
    dres = det(img)
    det_ms = (time.perf_counter() - t0) * 1000
    if dres.boxes is None:
        return det_ms, 0, []
    crops = [get_rotate_crop_image(img, np.array(b, copy=True)) for b in dres.boxes]
    return det_ms, len(crops), crops


def _rec_batch(eng, crops, chunk=None):
    """rec；chunk>1 时把 crops 分 chunk 段并发跑（同一 ORT session，Run 线程安全）。"""
    from rapidocr.ch_ppocr_rec.typings import TextRecInput
    if not crops:
        return 0.0, []
    if chunk and chunk > 1 and len(crops) > chunk:
        parts = [crops[i::chunk] for i in range(chunk)]
        out = [None] * chunk
        els = [0.0] * chunk
        t0 = time.perf_counter()

        def work(i):
            r = eng.text_rec(TextRecInput(img=parts[i], return_word_box=False))
            out[i] = list(r.txts or [])
            els[i] = r.elapse or 0.0
        th = [threading.Thread(target=work, args=(i,)) for i in range(chunk)]
        [t.start() for t in th]
        [t.join() for t in th]
        ms = (time.perf_counter() - t0) * 1000
        merged = []
        for i in range(chunk):
            merged.extend(out[i])
        return ms, merged
    t0 = time.perf_counter()
    r = eng.text_rec(TextRecInput(img=crops, return_word_box=False))
    return (time.perf_counter() - t0) * 1000, list(r.txts or [])


def run_det_reduced(eng, img, det_max, threads=1, use_cls=False):
    t0 = time.perf_counter()
    det_ms, n, crops = _crops(eng, img, det_max)
    rec_ms, txts = _rec_batch(eng, crops, threads)
    total = (time.perf_counter() - t0) * 1000
    return {'ms': total, 'det_ms': round(det_ms, 1), 'rec_ms': round(rec_ms, 1),
            'n_crops': n, 'threads': threads, 'texts': txts, 'boxes': len(txts)}


def _quiet_cuts(img, k):
    """找 k-1 条「最安静」的水平切线（避免切字）：按行高频能量取局部极小值。"""
    g = img.astype(np.float32).mean(axis=2)
    row = np.abs(np.diff(g, axis=0)).mean(axis=1)      # 每行的水平边缘强度
    h = img.shape[0]
    cuts = []
    for i in range(1, k):
        target = int(h * i / k)
        lo, hi = max(5, target - 80), min(h - 5, target + 80)
        idx = int(np.argmin(row[lo:hi])) + lo
        cuts.append(idx)
    return sorted(set(cuts))


def run_strips(eng, img, k=4, threads=4, use_cls=False):
    """把整帧切成 k 条（切在最安静的行），每条整管线并发跑，最后偏移/合并。"""
    t0 = time.perf_counter()
    h = img.shape[0]
    cuts = [0] + _quiet_cuts(img, k) + [h]
    parts = [img[cuts[i]:cuts[i + 1]] for i in range(len(cuts) - 1)]
    out = [None] * len(parts)
    els = [None] * len(parts)
    err = [None] * len(parts)

    def work(i):
        try:
            r = eng(parts[i], use_cls=use_cls)
            out[i] = list(r.txts or [])
            els[i] = [round(x * 1000, 1) if isinstance(x, float) else x
                      for x in (r.elapse_list or [])]
        except Exception as e:                             # noqa: BLE001
            err[i] = f'{type(e).__name__}: {e}'
    th = [threading.Thread(target=work, args=(i,)) for i in range(len(parts))]
    [t.start() for t in th]
    [t.join() for t in th]
    texts = []
    for t in out:
        texts.extend(t or [])
    return {'ms': (time.perf_counter() - t0) * 1000, 'k': k, 'threads': threads,
            'cuts': cuts, 'texts': texts, 'boxes': len(texts),
            'errors': [e for e in err if e]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=12)
    ap.add_argument('--pattern', default='')
    ap.add_argument('--variants', default='baseline,det1600,det1280,det960,det1280_t4,strips4_t4,cache')
    ap.add_argument('--out', default='.scratch/gui-perf/ocr-bench.json')
    a = ap.parse_args()
    frames = load_frames(a.frames, a.pattern or None)
    log(f'frames={len(frames)} first={frames[0][0]}')
    eng, gpu_ok, why = get_engine()
    log(f'engine gpu={gpu_ok} {why}')

    # 预热（首帧 CUDA graph/arena 分配很贵，别计进读数）
    eng(frames[0][1])
    variants = [v.strip() for v in a.variants.split(',') if v.strip()]
    results = {}
    baseline_texts = {}
    cache = {}
    for v in variants:
        rows = []
        ok = 0
        for name, img in frames:
            try:
                if v == 'baseline':
                    r = run_full(eng, img)
                    baseline_texts[name] = r['texts']
                elif v.startswith('det') and '_t' not in v:
                    r = run_det_reduced(eng, img, int(v[3:]), threads=1)
                elif v.startswith('det') and '_t' in v:
                    base, th = v.split('_t')
                    r = run_det_reduced(eng, img, int(base[3:]), threads=int(th))
                elif v.startswith('strips'):
                    k, th = v.replace('strips', '').split('_t')
                    r = run_strips(eng, img, k=int(k), threads=int(th))
                elif v == 'cache':
                    key = hashlib.blake2b(img.tobytes(), digest_size=8).hexdigest()
                    t0 = time.perf_counter()
                    if key in cache:
                        r = dict(cache[key])
                        r['cached'] = True
                    else:
                        r = run_det_reduced(eng, img, 1280, threads=4)
                        cache[key] = dict(r)
                    r['ms'] = (time.perf_counter() - t0) * 1000
                else:
                    raise SystemExit(f'未知 variant {v}')
                r['frame'] = name
                rows.append(r)
                ok += 1
            except Exception as e:                          # noqa: BLE001
                rows.append({'frame': name, 'error': f'{type(e).__name__}: {e}'})
        good = [r for r in rows if 'error' not in r]
        ms = sorted(r['ms'] for r in good)
        summary = {
            'variant': v, 'ok': ok, 'n': len(rows),
            'min_ms': round(ms[0], 1) if ms else None,
            'median_ms': round(ms[len(ms) // 2], 1) if ms else None,
            'p95_ms': round(ms[min(len(ms) - 1, int(len(ms) * 0.95))], 1) if ms else None,
            'max_ms': round(ms[-1], 1) if ms else None,
            'boxes_median': int(np.median([r.get('boxes', 0) for r in good])) if good else 0,
        }
        if v != 'baseline':
            cmp_rows = []
            for r in good:
                b = baseline_texts.get(r['frame'])
                if b is not None:
                    cmp_rows.append(cmp_texts(b, r.get('texts', [])))
            if cmp_rows:
                summary['char_recall_min'] = min(c['char_recall'] for c in cmp_rows)
                summary['char_recall_mean'] = round(
                    sum(c['char_recall'] for c in cmp_rows) / len(cmp_rows), 4)
                summary['missing_any'] = any(c['missing_chars'] for c in cmp_rows)
                summary['missing_sample'] = next(
                    (c['missing_chars'] for c in cmp_rows if c['missing_chars']), '')
                summary['extra_sample'] = next(
                    (c['extra_chars'] for c in cmp_rows if c['extra_chars']), '')
        results[v] = {'summary': summary, 'rows': rows}
        log(json.dumps(summary, ensure_ascii=False))
    os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
    with open(a.out, 'w') as f:
        json.dump({'frames': [n for n, _ in frames], 'gpu': gpu_ok,
                   'results': results}, f, ensure_ascii=False, indent=1)
    log('wrote', a.out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
