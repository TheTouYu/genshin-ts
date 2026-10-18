#!/usr/bin/env python3
"""OCR 两步优化验收（110 帧 reps）：① ROI 面积占比 ② rec 按行宽分桶（冷态 det/rec/总耗时 + 召回）。

对每帧跑三条：
  base = cmd=ocr（全帧单次，参照文本）
  A    = cmd=ocr_objects {rec_buckets:false, cache:false}   （旧行为）
  B    = cmd=ocr_objects {rec_buckets:true,  cache:false}   （新：按行宽分桶）
ROI：用 A 的对象框算并集包围盒面积 / 全帧面积。
"""
import argparse, glob, json, os, socket, sys, time, unicodedata
from collections import Counter

SOCK = os.environ.get('YS_LOOKD_SOCK', '/run/user/%d/ys-lookd.sock' % os.getuid())
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
REPS = os.path.join(REPO, '.scratch/gui-corpus/video-20261018/reps')


def rpc(req, timeout=240):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM); s.settimeout(timeout)
    s.connect(SOCK); s.sendall((json.dumps(req) + '\n').encode()); buf = b''
    while not buf.endswith(b'\n'):
        c = s.recv(1 << 20)
        if not c: break
        buf += c
    s.close(); return json.loads(buf)


def norm(t):
    return ''.join(ch for ch in unicodedata.normalize('NFKC', t or '') if not ch.isspace())


def recall(base, var):
    nb, nv = Counter(), Counter()
    for t in base: nb.update(norm(t))
    for t in var: nv.update(norm(t))
    kept = sum((nb & nv).values())
    return round(kept / max(1, sum(nb.values())), 4)


def bbox_union(objects, W=2560, H=1440):
    if not objects: return 0.0
    xs0 = min(o['bbox'][0] for o in objects); ys0 = min(o['bbox'][1] for o in objects)
    xs1 = max(o['bbox'][0] + o['bbox'][2] for o in objects)
    ys1 = max(o['bbox'][1] + o['bbox'][3] for o in objects)
    return round(((xs1 - xs0) * (ys1 - ys0)) / float(W * H), 4)


def texts_ocr(res): return [b.get('text', '') for b in (res.get('boxes') or [])]
def texts_obj(res): return [o.get('text', '') for o in (res.get('objects') or [])]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=110)
    ap.add_argument('--out', default='.scratch/gui-perf/ocr-opt-bench.json')
    a = ap.parse_args()
    fs = sorted(glob.glob(os.path.join(REPS, '*.jpg')))
    if a.frames < len(fs):
        step = len(fs) / float(a.frames); fs = [fs[int(i * step)] for i in range(a.frames)]
    rows = []
    for i, f in enumerate(fs):
        name = os.path.basename(f)
        try:
            t0 = time.perf_counter(); base = rpc({'cmd': 'ocr', 'frame': f}); base_ms = (time.perf_counter() - t0) * 1000
            t0 = time.perf_counter(); A = rpc({'cmd': 'ocr_objects', 'frame': f, 'cache': False, 'rec_buckets': False}); a_ms = (time.perf_counter() - t0) * 1000
            t0 = time.perf_counter(); B = rpc({'cmd': 'ocr_objects', 'frame': f, 'cache': False, 'rec_buckets': True}); b_ms = (time.perf_counter() - t0) * 1000
            bt = texts_ocr(base); at = texts_obj(A); bt2 = texts_obj(B)
            row = {'frame': name, 'base_ms': round(base_ms, 1), 'a_ms': round(a_ms, 1), 'b_ms': round(b_ms, 1),
                   'a_det': A.get('det_ms'), 'a_rec': A.get('rec_ms'), 'a_jobs': A.get('rec_jobs'),
                   'b_det': B.get('det_ms'), 'b_rec': B.get('rec_ms'), 'b_jobs': B.get('rec_jobs'),
                   'n_obj': A.get('n_objects'), 'roi_ratio': bbox_union(A.get('objects') or []),
                   'recall_a': recall(bt, at), 'recall_b': recall(bt, bt2),
                   'a_eq_b': sorted(norm(x) for x in at) == sorted(norm(x) for x in bt2),
                   'err': A.get('error') or B.get('error')}
            rows.append(row)
            print(json.dumps({k: row[k] for k in ('frame', 'a_ms', 'b_ms', 'a_det', 'a_rec', 'b_rec', 'roi_ratio', 'recall_a', 'recall_b', 'a_eq_b')}, ensure_ascii=False), flush=True)
        except Exception as e:                                # noqa: BLE001
            rows.append({'frame': name, 'err': f'{type(e).__name__}: {e}'})
            print(json.dumps({'frame': name, 'err': rows[-1]['err']}, ensure_ascii=False), flush=True)
    good = [r for r in rows if not r.get('err')]
    def med(k):
        v = sorted(r[k] for r in good if isinstance(r.get(k), (int, float)))
        return round(v[len(v)//2], 1) if v else None
    summary = {'n': len(good), 'errors': len(rows) - len(good),
               'base_ms_median': med('base_ms'),
               'a_ms_median': med('a_ms'), 'b_ms_median': med('b_ms'),
               'a_det_median': med('a_det'), 'a_rec_median': med('a_rec'),
               'b_det_median': med('b_det'), 'b_rec_median': med('b_rec'),
               'roi_ratio_median': med('roi_ratio'), 'roi_ratio_mean': round(sum(r['roi_ratio'] for r in good)/max(1,len(good)), 4),
               'roi_ge_90_frac': round(sum(1 for r in good if r['roi_ratio'] >= 0.9)/max(1,len(good)), 4),
               'recall_a_min': min((r['recall_a'] for r in good), default=None),
               'recall_a_mean': round(sum(r['recall_a'] for r in good)/max(1,len(good)), 4),
               'recall_b_min': min((r['recall_b'] for r in good), default=None),
               'recall_b_mean': round(sum(r['recall_b'] for r in good)/max(1,len(good)), 4),
               'a_eq_b_frac': round(sum(1 for r in good if r['a_eq_b'])/max(1,len(good)), 4)}
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    json.dump({'summary': summary, 'rows': rows}, open(a.out, 'w'), ensure_ascii=False, indent=1)
    return 0


if __name__ == '__main__':
    sys.exit(main())
