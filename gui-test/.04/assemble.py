#!/usr/bin/env python3
"""gui-test/.04 离线组装：裁块 → 行/段落 → 结构化文档

输入：frames/<tag>-NNNN.jpg（860x1180 裁块，原点 = 帧坐标 (1700,150)）+ raw/entries-*.jsonl
输出：data/voices.json、voices/NNN-title.md、README.md（另附 stats.json）

判据：
  · 行框 bbox 输出为**裁块本地坐标**（与帧坐标差 (1700,150)）；
  · 正文区 = 本地 (40, 95, 800, 1075)（全局 1740..2540 × 245..1320，覆盖实测文字列 1754–2480）；
  · 标题区 = 本地 (50, 15, 780, 75)；
  · 每帧打 suspect 标记：正文 0 行 / 标题空 / 行 bbox 贴边（截断嫌疑）。
"""
import os, sys, re, json, subprocess

ROOT = '/home/h/genshin-ts'
OUT = f'{ROOT}/gui-test/.04'
YSTEXT = f'{ROOT}/tools/ys-editor/ys-text'
BODY_LOCAL = (40, 95, 800, 1075)
TITLE_LOCAL = (50, 15, 780, 75)


def ocr(frame, region, js):
    r = subprocess.run([YSTEXT, frame, '--region', ' '.join(map(str, region)),
                        '--only', 'both', '--json-out', js], capture_output=True, text=True)
    if r.returncode != 0:
        return None
    try:
        return json.load(open(js))
    except Exception:
        return None


def load_records(tags):
    recs = []
    for order, tag in enumerate(tags):
        fn = f'entries-{tag}.jsonl'
        path = f'{OUT}/raw/{fn}'
        if not os.path.exists(path):
            print(f'[asm] skip missing {fn}', flush=True)
            continue
        for line in open(path):
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            if d.get('crop') and d.get('title'):
                d['_tag'] = tag
                d['_order'] = order
                recs.append(d)
    return recs


def norm(s):
    return re.sub(r'[^0-9A-Za-z\u4e00-\u9fff]', '', s or '').lower()


def main():
    tags = sys.argv[1:] or ['p3', 'p4', 'p5', 'top']
    os.makedirs(f'{OUT}/data', exist_ok=True)
    os.makedirs(f'{OUT}/voices', exist_ok=True)
    recs = load_records(tags)
    # 去重（同一标题只留第一次出现），保持采集顺序
    seen, uniq = set(), []
    for d in recs:
        k = norm(d['title'])
        if not k or k in seen:
            continue
        seen.add(k)
        uniq.append(d)
    print(f'[asm] records={len(recs)} unique={len(uniq)}', flush=True)

    out = []
    for i, d in enumerate(uniq, 1):
        frame = f"{OUT}/{d['crop']}"
        js = f'/tmp/asm-{i:04d}.json'
        body = ocr(frame, BODY_LOCAL, js)
        tdoc = ocr(frame, TITLE_LOCAL, js.replace('.json', '-t.json'))
        title = (tdoc or {}).get('lines') and ' '.join(l['text'] for l in tdoc['lines']) or d['title']
        lines = [{'text': l['text'].strip(), 'score': round(l.get('score', 0), 4),
                  'bbox': l['bbox']} for l in (body or {}).get('lines', [])]
        paras = [p.get('text', '') for p in (body or {}).get('paragraphs', [])]
        suspects = []
        if not lines:
            suspects.append('body-empty')
        if not title.strip():
            suspects.append('title-empty')
        for l in lines:
            x0, y0, x1, y1 = l['bbox']
            if x1 >= BODY_LOCAL[0] + BODY_LOCAL[2] - 3 or x0 <= BODY_LOCAL[0] + 3:
                suspects.append('edge-截断嫌疑')
                break
        rec = {'idx': i, 'title': title, 'source': d['crop'], 'tag': d['_tag'],
               'settle_ms': d.get('settle_ms'), 'lines': lines, 'paragraphs': paras,
               'suspects': suspects}
        out.append(rec)
        # 单篇 markdown
        safe = re.sub(r'[^\w\u4e00-\u9fff]+', '_', title)[:60]
        with open(f'{OUT}/voices/{i:03d}-{safe}.md', 'w') as f:
            f.write(f'# {title}\n\n')
            f.write(f'> 采集：{d["crop"]}（860×1180 裁块，含标题+正文）｜settle {d.get("settle_ms")}ms\n\n')
            f.write('## 正文（段落）\n\n')
            for p in paras:
                f.write(p + '\n\n')
            f.write('## 行级原文（OCR 逐行，含 bbox 裁块坐标）\n\n')
            for l in lines:
                f.write(f'- `{l["bbox"]}` score={l["score"]:.3f} {l["text"]}\n')
            if suspects:
                f.write(f'\n## ⚠ 可疑\n\n- ' + '\n- '.join(suspects) + '\n')
        print(f'[{i:03d}] {title}  lines={len(lines)} paras={len(paras)} '
              f'suspect={suspects or "-"}', flush=True)

    with open(f'{OUT}/voices/ALL.md', 'w') as f:
        f.write(f'# 旅行者（透雨）— 资料/语音 全部条目\n\n')
        f.write(f'共 {len(out)} 条，按游戏列表顺序。来源：gui-test/.04/frames/*.jpg 裁块 OCR。\n\n')
        for r in out:
            f.write(f'## {r["idx"]:03d}. {r["title"]}\n\n')
            for p in r['paragraphs']:
                f.write(p + '\n\n')
    json.dump(out, open(f'{OUT}/data/voices.json', 'w'), ensure_ascii=False, indent=1)
    json.dump({'count': len(out), 'with_suspect': sum(1 for r in out if r['suspects']),
               'titles': [r['title'] for r in out]},
              open(f'{OUT}/data/stats.json', 'w'), ensure_ascii=False, indent=1)
    print(f'[asm] wrote {len(out)} entries → data/voices.json + voices/*.md', flush=True)


if __name__ == '__main__':
    main()
