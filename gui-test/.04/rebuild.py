#!/usr/bin/env python3
"""从 data/voices.json 重建段落与 markdown（不重跑 OCR，秒级）

改进点（对照 data/voices.json 里 ys-text 的启发式段落）：
  语音页正文是**说话人对话**，每条新行以 `派蒙：` / `透雨：` 开头 ⇒
  用"说话人前缀"切段比字号/行距启发式准（实测把 `嗯…\n透雨：…我该接话吗？` 合成了一段）。
  行级原文原样保留，段落只是视图。
"""
import json, os, re

OUT = os.path.dirname(os.path.abspath(__file__))
SPEAKER = re.compile(r'^(派蒙|透雨)\s*[：:]')


def rebuild():
    data = json.load(open(f'{OUT}/data/voices.json'))
    for r in data:
        paras, cur = [], None
        for l in r['lines']:
            t = l['text'].strip()
            if not t:
                continue
            m = SPEAKER.match(t)
            if m or cur is None:
                if cur:
                    paras.append(cur)
                cur = {'speaker': m.group(1) if m else '', 'text': t}
            else:
                cur['text'] += t
        if cur:
            paras.append(cur)
        r['paragraphs_v2'] = paras

    with open(f'{OUT}/voices/ALL.md', 'w') as f:
        f.write('# 旅行者（透雨）— 资料/语音 全部条目\n\n')
        f.write(f'共 {len(data)} 条，按游戏列表顺序。来源：`frames/*.jpg` 860×1180 裁块 OCR。\n\n')
        for r in data:
            f.write(f'## {r["idx"]:03d}. {r["title"]}\n\n')
            for p in r['paragraphs_v2']:
                f.write(p['text'] + '\n\n')

    for r in data:
        safe = re.sub(r'[^\w\u4e00-\u9fff]+', '_', r['title'])[:60]
        p = f'{OUT}/voices/{r["idx"]:03d}-{safe}.md'
        with open(p, 'w') as f:
            f.write(f'# {r["title"]}\n\n')
            f.write(f'> 证据：`{r["source"]}`（860×1180 裁块，含标题+正文；裁块原点 = 帧坐标 (1700,150)）\n\n')
            f.write('## 正文\n\n')
            for q in r['paragraphs_v2']:
                f.write(q['text'] + '\n\n')
            f.write('## 行级原文（OCR 逐行，bbox = 裁块本地坐标）\n\n')
            for l in r['lines']:
                f.write(f'- `{l["bbox"]}` score={l["score"]:.3f} {l["text"]}\n')
            if r['suspects']:
                f.write('\n## ⚠ 标志\n\n- ' + '\n- '.join(r['suspects']) + '\n')

    json.dump(data, open(f'{OUT}/data/voices.json', 'w'), ensure_ascii=False, indent=1)
    n_lines = sum(len(r['lines']) for r in data)
    n_paras = sum(len(r['paragraphs_v2']) for r in data)
    print(f'[rebuild] entries={len(data)} lines={n_lines} paragraphs={n_paras}')
    print('[rebuild] 样例：')
    for r in data[:1] + data[100:101]:
        print(f'  {r["idx"]:03d} {r["title"]}')
        for q in r['paragraphs_v2'][:3]:
            print('   -', q['text'][:60])


if __name__ == '__main__':
    rebuild()
