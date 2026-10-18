#!/usr/bin/env python3
"""分块 + 增量缓存 OCR：把帧切成 N 块，只对**内容变过的块**跑 OCR，其余直接复用上一帧结果。

为什么这样切（实测依据，见 ocr-bench.md）：
  · 全帧 det（2000 输入）单独就要 **130–150ms**，比 200ms 目标的一半还多 ⇒ 全帧 OCR 不可能 <200ms；
  · 于是把「<200ms」押在**增量**上：静止 UI 的大部分块逐字节不变（crc32 相同），只需 OCR 变的那几块；
  · 文本等价性由构造保证：未变的块=上一帧同块的识别结果（同一像素输入）。
"""
from __future__ import annotations
import argparse, glob, json, os, sys, threading, time, unicodedata
from collections import Counter
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(REPO, 'tools', 'ys-editor'))
import ys_ocr
from rapidocr import RapidOCR
from rapidocr.utils.process_img import get_rotate_crop_image
from rapidocr.ch_ppocr_rec.typings import TextRecInput

FRAMES = os.path.join(REPO, '.scratch/gui-corpus/video-20261018/frames')


def norm(t):
    return ''.join(ch for ch in unicodedata.normalize('NFKC', t or '') if not ch.isspace())


class IncOCR:
    def __init__(self, rows=2, cols=2, det_max=2000, use_gpu=True):
        ok, why = ys_ocr._enable_gpu() if use_gpu else (False, 'CPU')
        self.eng = RapidOCR(params={'Global.use_cls': False,
                                    'EngineConfig.onnxruntime.use_cuda': bool(ok),
                                    'EngineConfig.onnxruntime.cuda_ep_cfg.arena_extend_strategy': 'kSameAsRequested'})
        self.rec = self.eng.text_rec or self.eng._load_rec_model()
        self.det = self.eng.text_det or self.eng._load_det_model()
        self.rows, self.cols, self.det_max = rows, cols, det_max
        self.cache = {}          # tile index -> (crc32, texts)

    def _tiles(self, img):
        h, w = img.shape[:2]
        for r in range(self.rows):
            for c in range(self.cols):
                y0, y1 = int(h * r / self.rows), int(h * (r + 1) / self.rows)
                x0, x1 = int(w * c / self.cols), int(w * (c + 1) / self.cols)
                yield (r, c), img[y0:y1, x0:x1]

    def _ocr_tile(self, tile):
        self.det.limit_type = 'max'; self.det.limit_side_len = self.det_max
        d = self.eng.text_det(tile)
        if d.boxes is None:
            return []
        crops = [get_rotate_crop_image(tile, np.array(b, copy=True)) for b in d.boxes]
        self.rec.rec_batch_num = 16
        out = self.rec(TextRecInput(img=crops, return_word_box=False))
        return list(out.txts or [])

    def frame(self, img, parallel=True):
        t0 = time.perf_counter()
        todo = []
        hits = 0
        for key, tile in self._tiles(img):
            import zlib
            crc = zlib.crc32(np.ascontiguousarray(tile)) & 0xffffffff
            if key in self.cache and self.cache[key][0] == crc:
                hits += 1
                continue
            todo.append((key, tile, crc))
        results = {k: (c, list(t)) for k, (c, t) in self.cache.items()}
        if todo:
            if parallel and len(todo) > 1:
                got = [None] * len(todo)
                def w(i):
                    got[i] = self._ocr_tile(todo[i][1])
                th = [threading.Thread(target=w, args=(i,)) for i in range(len(todo))]
                [t.start() for t in th]; [t.join() for t in th]
                for i, (key, tile, crc) in enumerate(todo):
                    results[key] = (crc, got[i] or [])
            else:
                for key, tile, crc in todo:
                    results[key] = (crc, self._ocr_tile(tile))
        self.cache = results
        texts = []
        for key in sorted(results):
            texts.extend(results[key][1])
        return {'ms': (time.perf_counter() - t0) * 1000, 'tiles': self.rows * self.cols,
                'tiles_ocr': len(todo), 'tiles_hit': hits, 'texts': texts}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--start', type=int, default=100)
    ap.add_argument('--n', type=int, default=12)
    ap.add_argument('--rows', type=int, default=2); ap.add_argument('--cols', type=int, default=2)
    ap.add_argument('--out', default='.scratch/gui-perf/ocr-incremental.json')
    a = ap.parse_args()
    fs = sorted(glob.glob(os.path.join(FRAMES, '*.jpg')))[a.start:a.start + a.n]
    inc = IncOCR(a.rows, a.cols)
    rows = []
    for i, f in enumerate(fs):
        img = np.asarray(Image.open(f).convert('RGB'))
        r = inc.frame(img)
        r['frame'] = os.path.basename(f)
        rows.append(r)
        print(json.dumps({k: r[k] for k in ('frame', 'ms', 'tiles_ocr', 'tiles_hit')}, ensure_ascii=False), flush=True)
    ms = sorted(r['ms'] for r in rows[1:])          # 首帧是冷启动，不计入
    summary = {'variant': f'incremental_{a.rows}x{a.cols}', 'frames': len(rows),
               'cold_ms': round(rows[0]['ms'], 1),
               'warm_median_ms': round(ms[len(ms) // 2], 1) if ms else None,
               'warm_min_ms': round(ms[0], 1) if ms else None,
               'warm_max_ms': round(ms[-1], 1) if ms else None,
               'tiles_ocr_median': int(np.median([r['tiles_ocr'] for r in rows[1:]])),
               'tiles_total': inc.rows * inc.cols}
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    with open(a.out, 'w') as fh:
        json.dump({'summary': summary, 'rows': rows}, fh, ensure_ascii=False, indent=1)
    return 0


if __name__ == '__main__':
    sys.exit(main())
