#!/usr/bin/env python3
"""ocr_bench2.py — 最终 OCR 管线：det 全尺寸 + rec 分块并行（宽行按墨量切段）+ 内容缓存。

口径（全部本机实测，见 ocr-bench.md）：
  · 全帧单次 `eng(img)`：det 2000 ≈ 130ms + cls ≈ 130ms + rec ≈ 300–700ms（框越多越慢）
  · rec 慢的真因 = **宽文本行**：73 框里十几行的 ratio 14–32（宽 400–1150px），
    识别时整批 padding 到 max_wh_ratio → 一个 1550 宽的批要 48ms；窄批只要 12ms。
    ⇒ 宽行按**列墨量最小处**切成 ≤6.7 ratio 的段（切在字间空白，不是硬切），再拼回。
  · cls 关掉：UI 文本水平，逐框分类是纯开销（实测 120–180ms）。
  · 内容寻址缓存：同帧（blake2b 前 8 字节）二次 = 0 成本。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import threading
import time
import unicodedata
from collections import Counter

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(REPO, 'tools', 'ys-editor'))
import ys_ocr  # noqa: E402

REPS = os.path.join(REPO, '.scratch/gui-corpus/video-20261018/reps')


def log(*a):
    print(*a, flush=True)


def load_frames(n, corpus='reps'):
    import glob
    if corpus == 'gui':
        # 真机/游戏 UI 帧（.scratch/gui-corpus/f*.png）：这是感知服务的**实际输入**
        fs = sorted(glob.glob(os.path.join(REPO, '.scratch/gui-corpus/f*.png')))
    else:
        fs = sorted(glob.glob(os.path.join(REPS, '*.jpg')))
    if n and n < len(fs):
        step = len(fs) / float(n)
        fs = [fs[int(i * step)] for i in range(n)]
    return [(os.path.basename(f), np.asarray(Image.open(f).convert('RGB'))) for f in fs]


def norm(t):
    t = unicodedata.normalize('NFKC', t or '')
    return ''.join(ch for ch in t if not ch.isspace())


def cmp_texts(base, var):
    nb, nv = Counter(), Counter()
    for t in base:
        nb.update(norm(t))
    for t in var:
        nv.update(norm(t))
    kept = sum((nb & nv).values())
    miss = nb - nv
    extra = nv - nb
    return {'char_recall': round(kept / max(1, sum(nb.values())), 4),
            'missing': ''.join(k * v for k, v in sorted(miss.items()))[:120],
            'extra': ''.join(k * v for k, v in sorted(extra.items()))[:120],
            'n_base': len(base), 'n_var': len(var)}


class OCR:
    def __init__(self, det_max=2000, use_gpu=True):
        ok, why = ys_ocr._enable_gpu() if use_gpu else (False, 'CPU')
        from rapidocr import RapidOCR
        params = {'Global.use_cls': False, 'EngineConfig.onnxruntime.use_cuda': bool(ok),
                  # 显存只有 ~1.5GB 可用（游戏 1.9GB + ys-lookd 2.1GB），kNextPowerOfTwo 会碎片化
                  'EngineConfig.onnxruntime.cuda_ep_cfg.arena_extend_strategy': 'kSameAsRequested'}
        self.eng = RapidOCR(params=params)
        det = self.eng.text_det or self.eng._load_det_model()
        det.limit_type = 'max'
        det.limit_side_len = int(det_max)
        self.rec = self.eng.text_rec or self.eng._load_rec_model()
        self.rec.rec_batch_num = 16
        self.det_max = det_max
        self.gpu = ok
        self.cache = {}
        self.stats = Counter()

    # ── 宽行切段（切在列墨量最小处；只丢切点处的空白，不丢字）
    @staticmethod
    def split_line(c, max_ratio=6.7):
        h, w = c.shape[:2]
        if w / float(h) <= max_ratio:
            return [c]
        seg_w = h * max_ratio
        nseg = int(math.ceil(w / seg_w))
        gray = (c.astype(np.float32).mean(axis=2) -
                c.astype(np.float32).mean())
        ink = np.abs(gray).sum(axis=0)            # 每列「偏离均值」的总量 ~ 墨量
        cuts = [0]
        for i in range(1, nseg):
            target = int(w * i / nseg)
            lo, hi = max(1, target - 40), min(w - 1, target + 40)
            cuts.append(lo + int(np.argmin(ink[lo:hi])))
        cuts.append(w)
        out = []
        for i in range(len(cuts) - 1):
            if cuts[i + 1] - cuts[i] >= 8:
                out.append(c[:, cuts[i]:cuts[i + 1]])
        return out or [c]

    def _det(self, img):
        t0 = time.perf_counter()
        d = self.eng.text_det(img)
        ms = (time.perf_counter() - t0) * 1000
        if d.boxes is None:
            return ms, []
        return ms, [np.array(b, copy=True) for b in d.boxes]

    def run(self, img, split_wide=True, batch=16, use_cache=True, det_img=None):
        t_total = time.perf_counter()
        key = None
        if use_cache:
            key = hashlib.blake2b(np.ascontiguousarray(img).tobytes(),
                                  digest_size=8).hexdigest()
            if key in self.cache:
                r = dict(self.cache[key])
                r['cache_hit'] = True
                r['ms'] = (time.perf_counter() - t_total) * 1000
                return r
        det_ms, boxes = self._det(img if det_img is None else det_img)
        if not boxes:
            return {'ms': (time.perf_counter() - t_total) * 1000, 'det_ms': det_ms,
                    'rec_ms': 0, 'n_boxes': 0, 'n_seg': 0, 'texts': [], 'cache_hit': False}
        from rapidocr.utils.process_img import get_rotate_crop_image
        from rapidocr.ch_ppocr_rec.typings import TextRecInput
        t1 = time.perf_counter()
        crops = [get_rotate_crop_image(img, b) for b in boxes]
        segs, owners = [], []
        for i, c in enumerate(crops):
            parts = self.split_line(c) if split_wide else [c]
            segs.extend(parts)
            owners.extend([i] * len(parts))
        crop_ms = (time.perf_counter() - t1) * 1000
        # 按 ratio 分桶（同桶宽度接近，减少 padding 浪费），桶内 ≤batch
        order = sorted(range(len(segs)), key=lambda i: segs[i].shape[1] / float(segs[i].shape[0]))
        t2 = time.perf_counter()
        self.rec.rec_batch_num = batch
        texts_by_seg = [None] * len(segs)
        B = batch
        for s in range(0, len(order), B):
            idxs = order[s:s + B]
            group = [segs[i] for i in idxs]
            out = self.rec(TextRecInput(img=group, return_word_box=False))
            for j, i in enumerate(idxs):
                texts_by_seg[i] = out.txts[j] if out.txts and j < len(out.txts) else ''
        rec_ms = (time.perf_counter() - t2) * 1000
        texts = [''] * len(crops)
        for seg_i, own in enumerate(owners):
            texts[own] += texts_by_seg[seg_i] or ''
        res = {'ms': (time.perf_counter() - t_total) * 1000, 'det_ms': round(det_ms, 1),
               'rec_ms': round(rec_ms, 1), 'crop_ms': round(crop_ms, 1),
               'n_boxes': len(crops), 'n_seg': len(segs), 'texts': texts,
               'cache_hit': False}
        if use_cache and key:
            self.cache[key] = dict(res, texts=list(texts))
        return res


def run_strips(ocr, img, k=4, threads=4):
    """分块并行：k 条横带，每条独立跑「det+rec」，4 线程并发。"""
    t0 = time.perf_counter()
    h = img.shape[0]
    cuts = [0] + [int(h * i / k) for i in range(1, k)] + [h]
    out = [None] * k

    def work(i):
        out[i] = ocr.run(img[cuts[i]:cuts[i + 1]], use_cache=False)
    th = [threading.Thread(target=work, args=(i,)) for i in range(k)]
    [t.start() for t in th]
    [t.join() for t in th]
    texts = []
    for o in out:
        texts.extend(o['texts'] if o else [])
    return {'ms': (time.perf_counter() - t0) * 1000, 'k': k, 'threads': threads,
            'texts': texts, 'n_boxes': len(texts), 'cache_hit': False}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=12)
    ap.add_argument('--det-max', type=int, default=2000)
    ap.add_argument('--batch', type=int, default=16)
    ap.add_argument('--out', default='.scratch/gui-perf/ocr-bench2.json')
    ap.add_argument('--corpus', default='reps', choices=['reps', 'gui'])
    ap.add_argument('--baseline-json', default='',
                    help='从已有 ocr-bench.json 复用 baseline 文本（省一次全帧 OCR + 显存）')
    a = ap.parse_args()
    frames = load_frames(a.frames, a.corpus)
    log(f'frames={len(frames)}')
    ocr = OCR(det_max=a.det_max)
    log(f'gpu={ocr.gpu} det_max={a.det_max} batch={a.batch}')
    # baseline：引擎原生全帧单次（= 改前口径的进程内版本）。有现成 JSON 就直接复用，
    # 省一次全帧 OCR（显存只剩 ~1.5GB，宽行批容易 OOM）。
    base = {}
    if a.baseline_json and os.path.exists(a.baseline_json):
        old = json.load(open(a.baseline_json))
        for row in old['results']['baseline']['rows']:
            if 'texts' in row:
                base[row['frame']] = row['texts']
        log(f'baseline reused from {a.baseline_json}: {len(base)} frames')
    else:
        sb = []
        for name, img in frames:
            t0 = time.perf_counter()
            r = ocr.eng(img)                   # use_cls 默认 True（与线上一致）
            ms = (time.perf_counter() - t0) * 1000
            base[name] = list(r.txts or [])
            sb.append(ms)
        sb.sort()
        log(json.dumps({'variant': 'baseline_full_engine', 'median_ms': round(sb[len(sb) // 2], 1),
                        'min_ms': round(sb[0], 1), 'max_ms': round(sb[-1], 1)}, ensure_ascii=False))
    variants = {}
    for label, fn in (
        ('custom_det2000_rec_split', lambda img: ocr.run(img, split_wide=True, batch=a.batch)),
        ('custom_det2000_rec_nosplit', lambda img: ocr.run(img, split_wide=False, batch=a.batch)),
        ('strips4_threads4', lambda img: run_strips(ocr, img, 4, 4)),
        ('custom_cache_2nd_pass', lambda img: ocr.run(img, split_wide=True, batch=a.batch)),
    ):
        rows = []
        ocr.cache.clear()          # 关键：variant 之间必须清缓存，否则后一个全是缓存命中（14ms 假读数）
        for name, img in frames:
            try:
                r = fn(img)
            except Exception as e:                        # noqa: BLE001
                rows.append({'frame': name, 'error': f'{type(e).__name__}: {e}'})
                continue
            r['frame'] = name
            r['cmp'] = cmp_texts(base[name], r.get('texts', []))
            rows.append(r)
        good = [r for r in rows if 'error' not in r]
        ms = sorted(r['ms'] for r in good)
        summary = {'variant': label, 'n': len(good),
                   'median_ms': round(ms[len(ms) // 2], 1) if ms else None,
                   'min_ms': round(ms[0], 1) if ms else None,
                   'p95_ms': round(ms[min(len(ms) - 1, int(len(ms) * 0.95))], 1) if ms else None,
                   'max_ms': round(ms[-1], 1) if ms else None,
                   'recall_min': min(r['cmp']['char_recall'] for r in good) if good else None,
                   'recall_mean': round(sum(r['cmp']['char_recall'] for r in good) / len(good), 4)
                   if good else None,
                   'boxes_median': int(np.median([r.get('n_boxes', 0) for r in good])) if good else 0,
                   'errors': sum(1 for r in rows if 'error' in r)}
        variants[label] = {'summary': summary, 'rows': rows}
        log(json.dumps(summary, ensure_ascii=False))
    with open(a.out, 'w') as f:
        json.dump({'frames': [n for n, _ in frames], 'gpu': ocr.gpu, 'det_max': a.det_max,
                   'batch': a.batch, 'variants': variants}, f, ensure_ascii=False, indent=1)
    log('wrote', a.out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
