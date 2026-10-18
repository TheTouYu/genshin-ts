#!/usr/bin/env python3
"""按对象 OCR 基准（票 25/33）：常驻进程 ys-lookd 的 ocr_objects vs 全帧 OCR。

口径：
  · baseline = 常驻进程 `cmd=ocr` 全帧单次（含 cls；= 现有感知服务的 OCR 形状）
  · 按对象 = `cmd=ocr_objects`：整帧 det 一次（det_max=2000）→ 每个对象切片 rec（4 线程 + 内容寻址缓存）
  · 冷/热 两遍：冷=同帧第一次（缓存空），热=同帧第二次（全部切片命中缓存）
  · 召回 = 字符级多重集（NFKC + 去空白），未命中字符记 missing
"""
import argparse, glob, json, os, socket, sys, time, unicodedata
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
SOCK = os.environ.get('YS_LOOKD_SOCK', '/run/user/%d/ys-lookd.sock' % os.getuid())
REPS = os.path.join(REPO, '.scratch/gui-corpus/video-20261018/reps')


def rpc(req, timeout=180):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM); s.settimeout(timeout)
    s.connect(SOCK)
    s.sendall((json.dumps(req, ensure_ascii=False) + '\n').encode())
    buf = b''
    while not buf.endswith(b'\n'):
        chunk = s.recv(1 << 20)
        if not chunk: break
        buf += chunk
    s.close()
    return json.loads(buf.decode())


def norm(t):
    return ''.join(ch for ch in unicodedata.normalize('NFKC', t or '') if not ch.isspace())


def recall(base, var, lenient=False):
    def n(t):
        t = norm(t)
        if lenient:                       # 去标点/符号 + casefold：只比"字"
            t = ''.join(ch for ch in t.casefold() if ch.isalnum())
        return t
    nb, nv = Counter(), Counter()
    for t in base: nb.update(n(t))
    for t in var: nv.update(n(t))
    kept = sum((nb & nv).values())
    miss = nb - nv
    return (round(kept / max(1, sum(nb.values())), 4),
            ''.join(k * v for k, v in sorted(miss.items()))[:80])


SMALL_H = int(os.environ.get('YS_SMALL_FONT_H', '20'))
SMALL_RATIO = float(os.environ.get('YS_SMALL_FONT_RATIO', '0.35'))


def texts_from_ocr(res):
    return [b.get('text', '') for b in (res.get('boxes') or [])]


def texts_from_objects(res):
    return [o.get('text', '') for o in (res.get('objects') or [])]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=110)
    ap.add_argument('--corpus', default='reps', choices=['reps', 'gui'])
    ap.add_argument('--det-max', type=int, default=2000)
    ap.add_argument('--parallel', type=int, default=4)
    ap.add_argument('--out', default='.scratch/gui-perf/ocr-objects-bench.json')
    ap.add_argument('--sequence', action='store_true', help='连拍序列模式（增量缓存命中率）')
    a = ap.parse_args()
    if a.corpus == 'gui':
        fs = sorted(glob.glob(os.path.join(REPO, '.scratch/gui-corpus/f*.png')))
    elif a.sequence:
        fs = sorted(glob.glob(os.path.join(REPO, '.scratch/gui-corpus/video-20261018/frames/*.jpg')))[100:100+a.frames]
    else:
        fs = sorted(glob.glob(os.path.join(REPS, '*.jpg')))
    if a.frames and a.frames < len(fs):
        step = len(fs) / float(a.frames)
        fs = [fs[int(i*step)] for i in range(a.frames)]
    rows = []
    try:
        rpc({'cmd': 'ocr_objects', 'reset': True, 'frame': fs[0]})   # 清空对象/帧缓存（冷态口径）
        print(json.dumps({'reset': True}), flush=True)
    except Exception as e:                                # noqa: BLE001
        print(json.dumps({'reset_failed': str(e)}), flush=True)
    for i, f in enumerate(fs):
        name = os.path.basename(f)
        try:
            t0 = time.perf_counter(); base = rpc({'cmd': 'ocr', 'frame': f}); base_ms = (time.perf_counter()-t0)*1000
            btxt = texts_from_ocr(base)
            t0 = time.perf_counter()
            cold = rpc({'cmd': 'ocr_objects', 'frame': f, 'cache': True, 'parallel': a.parallel,
                        'det_max': a.det_max}); cold_ms = (time.perf_counter()-t0)*1000
            t0 = time.perf_counter()
            warm = rpc({'cmd': 'ocr_objects', 'frame': f, 'cache': True, 'parallel': a.parallel,
                        'det_max': a.det_max}); warm_ms = (time.perf_counter()-t0)*1000
            r_cold, miss_cold = recall(btxt, texts_from_objects(cold))
            r_warm, miss_warm = recall(btxt, texts_from_objects(warm))
            r_cold_len, _ = recall(btxt, texts_from_objects(cold), lenient=True)
            # 小字号占比（多阈值记录，后续用于选兜底阈值；高度单位 = 原图像素）
            hs = [int(o['bbox'][3]) for o in (cold.get('objects') or []) if o.get('bbox')]
            small = {str(t): (round(sum(1 for h in hs if h < t) / max(1, len(hs)), 4) if hs else 0.0)
                     for t in (16, 18, 20, 22, 24, 26, 30)}
            small20 = sum(1 for h in hs if h < SMALL_H) / max(1, len(hs))
            trigger = small20 >= SMALL_RATIO
            row = {'frame': name, 'trigger_fallback': trigger, 'fallback_ms_est': round(base_ms, 1),
                   'heights_median': sorted(hs)[len(hs)//2] if hs else None,
                   'small_ratio': small,
                   'base_ms': round(base_ms, 1), 'cold_ms': round(cold_ms, 1),
                   'warm_ms': round(warm_ms, 1), 'det_ms': cold.get('det_ms'),
                   'rec_ms': cold.get('rec_ms'), 'crop_ms': cold.get('crop_ms'),
                   'n_base': len(btxt), 'n_objects': cold.get('n_objects'),
                   'n_ocr_cold': cold.get('n_ocr'), 'n_cached_warm': warm.get('n_cached'),
                   'recall_cold': r_cold, 'recall_warm': r_warm, 'recall_cold_lenient': r_cold_len,
                   'miss_cold': miss_cold, 'err': cold.get('error') or warm.get('error')}
            rows.append(row)
            print(json.dumps({k: row[k] for k in ('frame', 'base_ms', 'cold_ms', 'warm_ms', 'det_ms',
                                                   'rec_ms', 'n_objects', 'n_cached_warm',
                                                   'recall_cold', 'err')}, ensure_ascii=False), flush=True)
        except Exception as e:                                # noqa: BLE001
            rows.append({'frame': name, 'err': f'{type(e).__name__}: {e}'})
            print(json.dumps({'frame': name, 'err': rows[-1]['err']}, ensure_ascii=False), flush=True)
    good = [r for r in rows if not r.get('err')]
    def med(key):
        v = sorted(r[key] for r in good if isinstance(r.get(key), (int, float)))
        return round(v[len(v)//2], 1) if v else None
    summary = {'corpus': a.corpus, 'sequence': a.sequence, 'n': len(good), 'errors': len(rows)-len(good),
               'base_ms_median': med('base_ms'), 'cold_ms_median': med('cold_ms'),
               'warm_ms_median': med('warm_ms'), 'det_ms_median': med('det_ms'),
               'rec_ms_median': med('rec_ms'), 'objects_median': med('n_objects'),
               'recall_cold_min': round(min(r['recall_cold'] for r in good), 4) if good else None,
               'recall_cold_mean': round(sum(r['recall_cold'] for r in good)/len(good), 4) if good else None,
               'recall_warm_min': round(min(r['recall_warm'] for r in good), 4) if good else None,
               'recall_warm_mean': round(sum(r['recall_warm'] for r in good)/len(good), 4) if good else None,
               'cache_hit_rate_warm': round(sum(r['n_cached_warm'] for r in good)/max(1, sum(r['n_objects'] for r in good)), 4) if good else None,
               'recall_lenient_mean': round(sum(r['recall_cold_lenient'] for r in good)/len(good), 4) if good else None,
               'recall_lenient_min': round(min(r['recall_cold_lenient'] for r in good), 4) if good else None,
               'fallback_trigger_rate': round(sum(1 for r in good if r['trigger_fallback'])/max(1,len(good)), 4),
               'fallback_frames_recall': round(sum(1 for r in good if r['trigger_fallback'] and r['recall_cold']>=0.97)/max(1,sum(1 for r in good if r['trigger_fallback'])), 4) if any(r['trigger_fallback'] for r in good) else None,
               'effective_ms_median_with_fallback': None}
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    json.dump({'summary': summary, 'rows': rows}, open(a.out, 'w'), ensure_ascii=False, indent=1)
    return 0


if __name__ == '__main__':
    sys.exit(main())
