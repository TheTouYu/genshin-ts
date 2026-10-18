#!/usr/bin/env python3
"""expC2: 给 PaddleOCR-VL 云端结果按 expC 同一判据打分（逐标签字符正确率, difflib 对齐）。
输入: paddle_vl_out/<crop>/doc_0.md + meta.json
输出: results/expC2_paddle_vl.json
"""
import json, os, re, difflib

ROOT = '/home/h/genshin-ts/.scratch/gui-grounding'
CASES = {
    'pause-buttons': ['继续挑战', '重新挑战', '中断挑战'],
    'settle2-leave': ['离开'],
    'pause-abort-tpl': ['中断挑战'],
}

def norm(s):
    return re.sub(r'\s+', '', s)

def label_score(ref, text):
    t = norm(text)
    m = sum(b.size for b in difflib.SequenceMatcher(None, ref, t).get_matching_blocks())
    # 在整页文本里找该标签的最长连续命中（子串优先）
    return round(m / len(ref), 3), ref in t

out = []
for name, refs in CASES.items():
    d = f'{ROOT}/paddle_vl_out/{name}'
    meta = json.load(open(f'{d}/meta.json'))
    md = ''.join(open(f'{d}/doc_{i}.md', encoding='utf-8').read()
                 for i in range(meta['pages']))
    flat = norm(md)
    rec = dict(case=name, total_secs=meta['total_secs'], submit_secs=meta['submit_secs'],
               raw_chars=len(flat), labels={})
    for ref in refs:
        acc, exact = label_score(ref, md)
        rec['labels'][ref] = dict(char_acc=acc, exact_substr=exact)
    out.append(rec)
    print(f"{name:18s} {meta['total_secs']:5.1f}s  " +
          ' '.join(f"{r}:{v['char_acc']:.2f}{'(精确)' if v['exact_substr'] else ''}"
                   for r, v in rec['labels'].items()))

# menu 全帧：无逐字基准，只登记读到的原文与耗时
d = f'{ROOT}/paddle_vl_out/menu'
meta = json.load(open(f'{d}/meta.json'))
md = ''.join(open(f'{d}/doc_{i}.md', encoding='utf-8').read() for i in range(meta['pages']))
out.append(dict(case='menu-fullframe', total_secs=meta['total_secs'],
                submit_secs=meta['submit_secs'], raw_chars=len(norm(md)),
                markdown_preview=norm(md)[:400]))
print(f"menu 全帧 {meta['total_secs']:5.1f}s  读到 {len(norm(md))} 字")

json.dump(out, open(f'{ROOT}/results/expC2_paddle_vl.json', 'w'), ensure_ascii=False, indent=1)
print('saved results/expC2_paddle_vl.json')
