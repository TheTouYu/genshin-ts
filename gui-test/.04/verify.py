#!/usr/bin/env python3
"""gui-test/.04 采集完整性对账（只读，离线）

用法: verify.py p3 p4 p5 [top]
检查项：
  1. 逐趟序列内**无重复**（重复 = 某次按键被吞，读到同一条）；
  2. 跨趟拼接后仍无重复（重复 = 趟与趟之间重叠/回退）；
  3. `top` 趟（p1，已知会跳条）的标题**全部被并集覆盖** —— 若 p5 已到列表末尾，
     这一项应全绿（证明后几趟没漏掉 p1 到过的地方）；
  4. 可疑标题（汉字 <2 个 / 空）单独列出。
"""
import json, os, re, sys

OUT = os.path.dirname(os.path.abspath(__file__))
RAW = f'{OUT}/raw'


def norm(s):
    return re.sub(r'[^0-9A-Za-z\u4e00-\u9fff]', '', s or '').lower()


def load(tag):
    p = f'{RAW}/entries-{tag}.jsonl'
    if not os.path.exists(p):
        return []
    out = []
    for line in open(p):
        line = line.strip()
        if not line:
            continue
        d = json.loads(line)
        if d.get('crop'):
            out.append(d)
    return out


def main():
    tags = sys.argv[1:] or ['p3', 'p4', 'p5', 'top']
    seq = []
    print('=== 逐趟 ===')
    for t in tags:
        recs = load(t)
        keys = [norm(r['title']) for r in recs]
        dup = [k for k in set(keys) if keys.count(k) > 1]
        print(f'  {t:>4}: {len(recs):3d} 条  dup={dup or "-"}  '
              f'first={recs[0]["title"] if recs else "-"}  last={recs[-1]["title"] if recs else "-"}')
        if t != 'top':
            seq += recs

    keys = [norm(r['title']) for r in seq]
    dup = sorted({k for k in keys if keys.count(k) > 1})
    print(f'\n=== 拼接（不含 top）===')
    print(f'  合计 {len(seq)} 条；重复 {len(dup)} 个：{dup[:10]}')
    print(f'  第一条 = {seq[0]["title"]}')
    print(f'  最后一条 = {seq[-1]["title"]}')

    s = set(keys)
    p1 = load('top')
    miss = [r['title'] for r in p1 if norm(r['title']) not in s]
    print(f'\n=== 与 p1（会跳条的那趟）对账 ===')
    print(f'  p1 {len(p1)} 条中未被并集覆盖的：{len(miss)}')
    for m in miss[:20]:
        print('   -', m)

    bad = [r['title'] for r in seq if len(re.findall(r'[\u4e00-\u9fff]', r['title'])) < 2]
    print(f'\n=== 可疑标题（汉字<2）=== {len(bad)} 条 {bad[:10]}')
    json.dump({'count': len(seq), 'titles': [r['title'] for r in seq],
               'dup': dup, 'uncovered_from_p1': miss, 'suspicious_titles': bad},
              open(f'{OUT}/data/verify.json', 'w'), ensure_ascii=False, indent=1)
    print('\n→ data/verify.json')


if __name__ == '__main__':
    main()
