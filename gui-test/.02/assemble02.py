#!/usr/bin/env python3
"""assemble02.py — 把 .02 采集产物组装为结构化文档
输入: frames/*.png, ytext/*.wide.json (+ 窄窗 json 供锁定页)
输出: data/stories.json, stories/*.md, all-stories.md, README.md

文本口径:
  - 行文本 = ys-text 宽窗(1740,240,800,1130)读数 + 已裁定修正(见 FIXES, 每条带依据)
  - 段落 = 显示行分组(依据 .01 同像素 VL 分组 + 行尾标点核对, 见 PARAS)
  - 修正与分组均显式登记, 可审计
"""
import json, hashlib, subprocess, sys
from pathlib import Path

ROOT = Path('/home/h/genshin-ts/gui-test/.02')

CHAR = '旅行者（荧）'   # 依据：story3「了解哥哥在这世间的种种」→ 血亲为兄（空），可操作角色为荧

TABS = [
    ('profile', '角色详细', 'unlocked'),
    ('story1',  '角色故事1', 'unlocked'),
    ('story2',  '角色故事2', 'unlocked'),
    ('story3',  '角色故事3', 'unlocked'),
    ('vision',  '神之眼',   'unlocked'),
    ('story4',  '角色故事4', 'locked'),
    ('story5',  '角色故事5', 'locked'),
    ('loom',    '命运的织机', 'locked'),
]

# 已裁定的行修正: (tab, line_idx) -> (to, basis)
FIXES = {
    ('story1', 6):  ('行——', '.01同像素PaddleOCR-VL读数「灾祸横行——」；本地RapidOCR把双破折号并读'),
    ('story2', 10): ('深渊教团腐化了风神的眷属——蒙德「四风守护」中', '.01同像素VL读数为「眷属——蒙德」；本地只读出单—'),
    ('story3', 9):  ('而「深渊教团」，你的血亲所统领的组织——', '.01同像素VL读数「组织——从」；本地整个吞掉破折号'),
}

# 段落分组（宽窗行索引；依据 .01 VL 面板分组 + 破折号/省略号续行合并 + 行尾标点核对）
PARAS = {
    'profile': [[0, 1]],
    'story1':  [[0], [1, 4], [5, 10], [11, 15], [16]],
    'story2':  [[0, 2], [3, 4], [5, 11], [12, 14], [15, 18]],
    'story3':  [[0, 2], [3, 6], [7, 11], [12, 13], [14, 15]],
    'vision':  [[0, 2], [3, 4], [5, 6], [7, 11], [12, 13]],
}

def sha8(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()[:8]

def main():
    (ROOT / 'data').mkdir(exist_ok=True)
    (ROOT / 'stories').mkdir(exist_ok=True)
    out = {'schema': 'story-collect/2', 'character': CHAR,
           'collected': '2026-10-23T00:05+08:00', 'tabs': []}
    all_md = [f'# {CHAR} · 角色故事全集（ gui-test/.02 采集）\n',
              f'> 采集：2026-10-23 00:05 ｜ 来源：游戏内「资料／故事」页 ｜ 方法与验证见 README.md\n']
    for i, (tid, label, state) in enumerate(TABS, 1):
        frame_full = ROOT / 'frames' / f'{tid}-k00.png'
        frame = ROOT / 'evidence' / f'panel-{tid}.png'
        if state == 'locked':
            lines = [{'text': '完成「？？？」剧情', 'score': 1.0,
                      'note': '窄窗读数（宽窗该行右侧混入装饰噪声）'}]
            jsrc = f'ytext/{tid}.json'
        else:
            j = json.load(open(ROOT / 'ytext' / f'{tid}.wide.json'))
            lines = [{'text': l['text'], 'score': l['score'], 'bbox': l['bbox']}
                     for l in j['lines']]
            jsrc = f'ytext/{tid}.wide.json'
            for (t, idx), (to, basis) in FIXES.items():
                if t == tid and idx < len(lines):
                    lines[idx]['fix_from'] = lines[idx]['text']
                    lines[idx]['text'] = to
                    lines[idx]['fix_basis'] = basis
        paras = []
        if state == 'unlocked':
            for rng in PARAS[tid]:
                a, b = (rng * 2)[:2] if len(rng) == 1 else rng
                paras.append(''.join(l['text'] for l in lines[a:b + 1]))
        else:
            paras = ['（未解锁）故事解锁条件：完成「？？？」剧情']
        entry = {'id': tid, 'label': label, 'order': i, 'state': state,
                 'panel_header': {'unlocked': label, 'locked': '故事解锁条件'}[state],
                 'frame': f'evidence/panel-{tid}.png (裁自 frames/{tid}-k00.png, 800x1240+1740+150)',
                 'frame_sha8': sha8(frame),
                 'lines_source': jsrc, 'lines': lines, 'paragraphs': paras}
        out['tabs'].append(entry)

        md = [f'# {CHAR} · {label}', '',
              f'> 状态：{"已解锁" if state == "unlocked" else "未解锁（面板标题：故事解锁条件）"}',
              f'> 证据帧：`evidence/panel-{tid}.png`（sha8 `{entry["frame_sha8"]}`，裁自 frames/{tid}-k00.png）｜ 行级数据：`{jsrc}`', '']
        md.append('## 正文\n')
        for p in paras:
            md.append(p + '\n')
        if state == 'unlocked':
            md.append('## 行级原文（显示行）\n')
            for n, l in enumerate(lines):
                fx = f"  ←修正自「{l['fix_from']}」" if 'fix_from' in l else ''
                md.append(f"{n}. {l['text']}{fx}")
            md.append('')
        (ROOT / 'stories' / f'{i:02d}-{label}.md').write_text('\n'.join(md), encoding='utf-8')
        all_md.append(f'\n---\n\n## {label}\n')
        for p in paras:
            all_md.append(p + '\n')
    (ROOT / 'data' / 'stories.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    (ROOT / 'all-stories.md').write_text('\n'.join(all_md), encoding='utf-8')
    print('assembled:', len(out['tabs']), 'tabs')
    for t in out['tabs']:
        print(f"  {t['order']:02d} {t['label']}: {t['state']}, {len(t['lines'])}行, {len(t['paragraphs'])}段, sha8={t['frame_sha8']}")

if __name__ == '__main__':
    main()
