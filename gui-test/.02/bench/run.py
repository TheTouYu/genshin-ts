#!/usr/bin/env python3
"""bench/run.py — 本地 RapidOCR(GPU/CUDA) vs 远端 PaddleOCR-VL 在「切割后的中文行条」上的质量/速度对账
集: 52 条 = story1(17)+story2(19)+story3(16) 行条（紧 bbox±6px, 裁自 .02 证据帧）
GT: gui-test/.02/data/stories.json 已裁定行文本（含破折号/行尾标点终判）
变体: local-1x / local-2x（LANCZOS 放大） / remote-2x（云端, --jobs 并发）
指标: 字符准确率=1-levenshtein/len(gt)；全对率；秒/条；特例（破折号/行尾标点）单独报
用法:
  python3 bench/run.py build     # 生成 strips + gt.json
  python3 bench/run.py local     # 跑本地两变体（快）
  python3 bench/run.py remote    # 提交云端（慢, 后台）
  python3 bench/run.py report    # 汇总三通道 → bench/report.json + 表格
"""
import json, os, subprocess, sys, time
from pathlib import Path

ROOT = Path('/home/h/genshin-ts/gui-test/.02')
BENCH = ROOT / 'bench'
STRIPS = BENCH / 'strips'
GTJ = BENCH / 'gt.json'
VL_CLIENT = os.path.expanduser('~/.agents/skills/paddle-vl-ocr/scripts/paddle_vl_client.py')
TABS = ['story1', 'story2', 'story3']

def build():
    STRIPS.mkdir(parents=True, exist_ok=True)
    data = json.load(open(ROOT / 'data' / 'stories.json'))
    items = []
    for tab in TABS:
        t = next(x for x in data['tabs'] if x['id'] == tab)
        frame = ROOT / 'frames' / f'{tab}-k00.png'
        from PIL import Image
        im = Image.open(frame)
        for i, l in enumerate(t['lines']):
            x0, y0, x1, y1 = l['bbox']
            p = 6
            c = im.crop((x0 - p, y0 - p, x1 + p, y1 + p))
            f1 = STRIPS / f'{tab}-{i:02d}-1x.png'
            c.save(f1)
            c2 = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
            f2 = STRIPS / f'{tab}-{i:02d}-2x.png'
            c2.save(f2)
            items.append({'id': f'{tab}-{i:02d}', 'tab': tab, 'i': i, 'gt': l['text'],
                          's1': str(f1), 's2': str(f2)})
    GTJ.write_text(json.dumps(items, ensure_ascii=False, indent=1))
    print(f'built {len(items)} strips → {STRIPS}')

def lev(a, b):
    m, n = len(a), len(b)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev = dp[0]; dp[0] = i
        for j in range(1, n + 1):
            cur = dp[j]
            dp[j] = min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] != b[j - 1]))
            prev = cur
    return dp[n]

def clean(md):
    import re
    s = md.strip()
    s = re.sub(r'^#+\s*', '', s)
    s = s.replace('\\', '')
    s = re.sub(r'\s+', '', s)
    return s

def local_run():
    items = json.load(open(GTJ))
    out = {}
    for var, key in [('local-1x', 's1'), ('local-2x', 's2')]:
        recs = []
        t0 = time.time()
        for it in items:
            t1 = time.time()
            r = subprocess.run([sys.executable, 'tools/ys-editor/ys_ocr.py', 'ocr', '--json', it[key]],
                               capture_output=True, text=True, timeout=60)
            ms = (time.time() - t1) * 1000
            try:
                boxes = json.loads(r.stdout).get('boxes', [])
                pred = ''.join(b['text'] for b in boxes)
            except Exception:
                pred = '<ERR>'
            acc = 1 - lev(pred, it['gt']) / max(1, len(it['gt']))
            recs.append({'id': it['id'], 'gt': it['gt'], 'pred': pred, 'acc': round(acc, 4), 'ms': round(ms)})
        wall = time.time() - t0
        out[var] = {'recs': recs, 'wall_s': round(wall, 1)}
        print(f'{var}: wall={wall:.1f}s mean_acc={sum(r["acc"] for r in recs)/len(recs):.4f} '
              f'exact={sum(1 for r in recs if r["acc"]==1)}/{len(recs)}')
    (BENCH / 'local.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))

def remote_run(jobs=6):
    items = json.load(open(GTJ))
    outdir = BENCH / 'vl-out'
    outdir.mkdir(exist_ok=True)
    t0 = time.time()
    r = subprocess.run([sys.executable, VL_CLIENT] + [it['s2'] for it in items] +
                       ['-o', str(outdir), '--poll', '1.0', '--jobs', str(jobs)],
                       capture_output=True, text=True)
    wall = time.time() - t0
    recs = []
    for it in items:
        d = outdir / (Path(it['s2']).stem)
        pred = ''
        if d.is_dir():
            for n in sorted(os.listdir(d)):
                if n.startswith('doc_'):
                    pred = clean(open(d / n, encoding='utf-8').read())
                    break
        acc = 1 - lev(pred, it['gt']) / max(1, len(it['gt']))
        recs.append({'id': it['id'], 'gt': it['gt'], 'pred': pred, 'acc': round(acc, 4)})
    (BENCH / 'remote.json').write_text(
        json.dumps({'remote-2x': {'recs': recs, 'wall_s': round(wall, 1), 'jobs': jobs}},
                   ensure_ascii=False, indent=1))
    print(f'remote-2x: wall={wall:.1f}s jobs={jobs} '
          f'mean_acc={sum(r["acc"] for r in recs)/len(recs):.4f} '
          f'exact={sum(1 for r in recs if r["acc"]==1)}/{len(recs)}')

def report():
    rows = {}
    for f, k in [('local.json', None), ('remote.json', None)]:
        p = BENCH / f
        if p.exists():
            rows.update(json.load(open(p)))
    items = json.load(open(GTJ))
    print(f"{'变体':<12}{'秒/条':>8}{'字符准确率':>10}{'全对率':>10}")
    summary = {}
    for var, d in rows.items():
        recs = d['recs']
        n = len(recs)
        sps = d['wall_s'] / n
        acc = sum(r['acc'] for r in recs) / n
        ex = sum(1 for r in recs if r['acc'] == 1) / n
        summary[var] = {'per_strip_s': round(sps, 2), 'mean_char_acc': round(acc, 4),
                        'exact_rate': round(ex, 3), 'wall_s': d['wall_s'], 'n': n,
                        'worst': sorted(recs, key=lambda r: r['acc'])[:8]}
        print(f"{var:<12}{sps:>8.2f}{acc:>10.4f}{ex:>10.3f}")
    # 特例：破折号与行尾标点行
    special = [f'{t}-{i:02d}' for t, ids in [('story1', [6, 11, 16]), ('story2', [8, 10, 15]),
                                             ('story3', [0, 9, 13])] for i in ids]
    print('\n特例行（破折号/行尾标点）:')
    for sid in special:
        print(f'  {sid} GT={next(i["gt"] for i in items if i["id"]==sid)!r}')
        for var, d in rows.items():
            r = next((x for x in d['recs'] if x['id'] == sid), None)
            if r:
                print(f'    {var:<11} acc={r["acc"]:.3f} {r["pred"]!r}')
    (BENCH / 'report.json').write_text(json.dumps(summary, ensure_ascii=False, indent=1))

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'build'
    {'build': build, 'local': local_run, 'remote': remote_run, 'report': report}[cmd]()
