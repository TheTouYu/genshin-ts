#!/usr/bin/env python3
"""merge_truth.py — 把多个 truth 版本按「同帧取最新」合并成单一真值集（可复算）。

规则（写死）：
  · 帧身份 = JSON 文件名去扩展名（f00 / c12_195108 / r019_snap_… / m01 都按此判同帧）
  · 版本序 = 目录名解析：`truth`=1，`truth-vN`=N，`truth-vN-fix`=N+0.5；并列时按 mtime 取新
  · 只收 `<dir>/<stem>.json`（跳过 `_` 开头、`baseline*`、`_audit`、`_coverage`、`_excluded/`）
输出：truth-merged/<stem>.json + MANIFEST.json + MERGE.md
"""
import glob, json, os, re, shutil, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
BASE = os.path.join(ROOT, '.scratch', 'gui-corpus')
OUT = os.path.join(BASE, 'truth-merged')

def ver(d):
    n = os.path.basename(d)
    if n == 'truth': return (1, 0)
    m = re.match(r'truth-v(\d+)(-fix)?$', n)
    if m: return (int(m.group(1)), 1 if m.group(2) else 0)
    return (99, 0)

def main():
    dirs = [d for d in glob.glob(os.path.join(BASE, 'truth*')) if os.path.isdir(d) and os.path.basename(d) != 'truth-merged']
    cand = {}
    for d in dirs:
        v = ver(d)
        for p in glob.glob(os.path.join(d, '*.json')):
            stem = os.path.splitext(os.path.basename(p))[0]
            if stem.startswith('_') or stem.startswith('baseline') or stem.startswith('summary'):
                continue
            try:
                doc = json.load(open(p, encoding='utf-8'))
            except Exception:
                continue
            if not isinstance(doc.get('objects'), list):
                continue
            key = (v, os.path.getmtime(p))
            cand.setdefault(stem, []).append({'path': p, 'dir': os.path.basename(d), 'ver': v, 'mtime': key[1],
                                              'units': len(doc['objects'])})
    os.makedirs(OUT, exist_ok=True)
    manifest, rows = {}, []
    for stem, lst in sorted(cand.items()):
        lst.sort(key=lambda x: (x['ver'], x['mtime']))
        win = lst[-1]
        shutil.copyfile(win['path'], os.path.join(OUT, stem + '.json'))
        manifest[stem] = {'from': win['dir'], 'path': os.path.relpath(win['path'], ROOT),
                          'units': win['units'], 'n_versions': len(lst),
                          'superseded': [{'dir': x['dir'], 'units': x['units']} for x in lst[:-1]]}
        rows.append((stem, win['dir'], win['units'], len(lst)))
    json.dump(manifest, open(os.path.join(OUT, 'MANIFEST.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    tot = sum(r[2] for r in rows)
    by_dir = {}
    for r in rows: by_dir[r[1]] = by_dir.get(r[1], 0) + 1
    lines = ['# MERGE — truth-merged 合并记录（自动生成）', '',
             '规则：帧身份=文件名；版本序=目录名（truth=1 / truth-vN=N / truth-vN-fix=N+0.5）；并列取 mtime 新者。', '',
             '| 项 | 值 |', '|---|---|',
             '| 输入版本目录 | %d 个 |' % len(dirs),
             '| 候选 JSON（去重前） | %d |' % sum(len(v) for v in cand.values()),
             '| **合并后帧数** | **%d** |' % len(rows),
             '| **合并后单元数** | **%d** |' % tot, '',
             '## 来源分布（胜出版本）', '']
    for d, n in sorted(by_dir.items(), key=lambda x: -x[1]):
        lines.append('- `%s`：%d 帧' % (d, n))
    lines += ['', '## 被覆盖版本（每帧）', '']
    for stem, d, u, n in rows:
        if n > 1:
            sup = ', '.join('%s(%d)' % (x['dir'], x['units']) for x in manifest[stem]['superseded'])
            lines.append('- `%s` ← 采用 `%s`(%d units)；覆盖：%s' % (stem, d, u, sup))
    open(os.path.join(OUT, 'MERGE.md'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print('dirs=%d candidates=%d frames=%d units=%d' % (len(dirs), sum(len(v) for v in cand.values()), len(rows), tot))
    print('by_dir=', by_dir)
    return 0

if __name__ == '__main__':
    sys.exit(main())
