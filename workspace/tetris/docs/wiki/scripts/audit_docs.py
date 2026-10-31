#!/usr/bin/env python3
"""docs/wiki 产物核验（可复现，退出码即判据）。

检查 5 类：
  A 结构完整性：四角色 md 的章节/技能块/命座 6 条/故事 5 条/语音 10 句
  B 数值逐字性：关键 CD/能量/持续 数字必须与 wiki 原文一致（硬编码期望值，
    期望值本身取自 raw/*.wikitext 的 `|属性NLV1=` 行）
  C 附录保真：附录里每对「属性名 + LV1/LV10」必须在 raw 原文中以同一 `属性N` 键出现
  D INDEX 覆盖：五张表各含四角色行；哥伦比娅必须为水/法器
  E 版本一致性：parsed JSON 的命座数/故事数/语音数与 md 声明一致

用法：python3 docs/wiki/scripts/audit_docs.py    （0=PASS，1=FAIL）
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW, PARSED = ROOT / 'raw', ROOT / 'parsed'
SLUG = {'纳西妲': '纳西妲.md', '刻晴': '刻晴.md', '甘雨': '甘雨.md', '哥伦比娅': '哥伦比娅.md'}

# B：关键数值期望（人工从 raw 的 `|属性NLV1=` 行抄录，改 wiki 时同步改这里）
EXPECT = {
 '纳西妲': ['点按冷却时间 | 5.0秒', '长按冷却时间 | 6.0秒', '蕴种印持续时间 | 25.0秒',
            '灭净三业触发间隔 | 2.5秒', '基础持续时间 | 15.0秒', '冷却时间 | 13.5秒',
            '元素能量 | 50'],
 '刻晴': ['冷却时间 | 7.5秒', '冷却时间 | 12.0秒', '元素能量 | 40'],
 '甘雨': ['冷却时间 | 10.0秒', '持续时间 | 6.0秒', '冷却时间 | 15.0秒',
          '持续时间 | 15.0秒', '元素能量 | 60'],
 '哥伦比娅': ['冷却时间 | 17.0秒', '引力值上限 | 60', '引力涟漪持续时间 | 25.0秒',
              '月之领域持续时间 | 20.0秒', '冷却时间 | 15.0秒', '元素能量 | 60'],
}

FIXED_BLOCK = re.compile(r'(?<![~\d.])\d+\s*块')
# 判据 D：量纲列禁「留余量」的模糊措辞（留余量会让天赋时长与手感脱节）
VAGUE = re.compile(r'约|大约|大概|左右|差不多|凑|余量|酌情|视情况')
fails = []


def check(cond, msg):
    if not cond:
        fails.append(msg)


def main():
    datas = {n: json.loads((PARSED / f'{n}.json').read_text(encoding='utf-8')) for n in SLUG}

    # ---- A + B + C + E ----
    for cn, md_name in SLUG.items():
        p = ROOT / md_name
        check(p.exists(), f'A 缺文件 {md_name}')
        if not p.exists():
            continue
        t = p.read_text(encoding='utf-8')
        raw = (RAW / f'{cn}.wikitext').read_text(encoding='utf-8')
        d = datas[cn]

        # A 结构
        for sec in ('## 0. 速览', '## 1. 定位与机制语言', '## 2. 战斗技能',
                    '## 3. 固有天赋', '## 4. 命之座', '## 5. 角色语音',
                    '## 6. 角色故事', '## 7. 附录'):
            check(sec in t, f'A {md_name} 缺章节 {sec}')
        n_skill = len(re.findall(r'^### 2\.\d (?:普通攻击|元素战技 E|元素爆发 Q) · \S+', t, re.M))
        check(n_skill == 3, f'A {md_name} 战斗技能块 {n_skill} != 3')
        n_cons = len(re.findall(r'^### 4\.\d ', t, re.M))
        check(n_cons == 6, f'A {md_name} 命座数 {n_cons} != 6')
        for n in (1, 2, 4, 6):
            check(re.search(rf'^### 4\.{n} .*★', t, re.M) is not None,
                  f'A {md_name} {n} 命未标 ★（任务要求重点复刻）')
        n_story = len(re.findall(r'^### 6\.\d ', t, re.M))
        check(n_story >= 5, f'A {md_name} 故事数 {n_story} < 5')
        n_voice = len(re.findall(r'^\| \d+ \| ', t, re.M))
        check(5 <= n_voice <= 12, f'A {md_name} 语音行 {n_voice} 不在 5~12')
        pas = len(re.findall(r'^### 3\.\d ', t, re.M))
        check(pas >= 2, f'A {md_name} 固有天赋块 {pas} < 2')

        # 速览四要素
        for k in ('元素', '武器', '所属', '称号'):
            check(f'| {k} | ' in t, f'A {md_name} 速览缺 {k}')

        # B 数值逐字
        for needle in EXPECT[cn]:
            check(needle in t, f'B {md_name} 缺数值「{needle}」')

        # C 附录保真
        app = t.split('附录：原始 wikitext 关键片段')[-1]
        grp = re.findall(r'\|属性(\d+)=([^\n]+)\n\|属性\1LV1=([^\n]+)\n\|属性\1LV10=([^\n]+)',
                         app)
        check(len(grp) >= 3, f'C {md_name} 附录组数 {len(grp)} < 3')
        for k, nm, v1, v10 in grp:
            for s in (f'|属性{k}={nm}', f'|属性{k}LV1={v1}', f'|属性{k}LV10={v10}'):
                check(s in raw, f'C {md_name} 附录片段在原文找不到：{s}')
            if any(w in nm for w in ('冷却', '持续', '间隔', '能量', '消耗')):
                check(re.search(r'(秒|点|^\d+$)', v1) is not None,
                      f'C {md_name} 语义错位 {nm}={v1}')

        # E 与 JSON 一致
        check(len(d['constellations']) == 6, f'E {cn} JSON 命座 != 6')
        check(len(d['stories']) == 5, f'E {cn} JSON 故事 != 5')
        check(d['voice']['count'] >= 70, f'E {cn} 语音数异常 {d["voice"]["count"]}')

    # ---- F 标记泄漏（正文里不应有未渲染的 wikitext；内联代码与附录除外）----
    for cn, md_name in SLUG.items():
        body = (ROOT / md_name).read_text(encoding='utf-8').split('## 7. 附录')[0]
        for ln in body.split('\n'):
            if '`' in ln:      # 故意引用的模板名（内联代码）
                continue
            if re.search(r'\{\{|\}\}|\[\[|\]\]|\|属性\d+LV', ln):
                check(False, f'F {md_name} 正文残留 wikitext：{ln[:60]}')

    # ---- D INDEX ----
    idx = (ROOT / 'INDEX.md').read_text(encoding='utf-8')
    # 顶部机制语言表（talent-designer 的入口）
    mech = idx.split('## 机制语言速查')[1].split('## 〇')[0] if '## 机制语言速查' in idx else ''
    check('| 角色 | 官方机制关键词 | 一句话说明' in mech, 'D INDEX 顶部机制表表头异常')
    for cn in SLUG:
        check(f'| **{cn}** |' in mech, f'D INDEX 顶部机制表缺 {cn} 行')
    check('***' not in idx and '**中**' not in idx, 'D INDEX 存在错字/坏加粗')
    # 新判据 1：机制数值锚点表的位置/用途句/列名/四行齐全，且旧标题不得残留
    check('## 机制数值锚点' in idx, 'D 缺「机制数值锚点」表')
    check('## 三、关键机制数值' not in idx, 'D 旧「三、关键机制数值」残留（应已上移改名）')
    if '## 机制数值锚点' in idx:
        pos_mech = idx.index('## 机制语言速查')
        pos_anchor = idx.index('## 机制数值锚点')
        pos_next = idx.index('## 〇、单角色详情')
        check(pos_mech < pos_anchor < pos_next,
              'D 「机制数值锚点」未位于「机制语言速查」正下方')
        seg_anchor = idx[pos_anchor:pos_next]
        check('唯一数值来源' in seg_anchor, 'D 锚点表缺用途句「唯一数值来源」')
        check('我们游戏的对应量纲' in seg_anchor, 'D 锚点表缺「我们游戏的对应量纲」列')
        for cn in SLUG:
            check(f'| **{cn}** |' in seg_anchor, f'D 锚点表缺 {cn} 行')
        # 新判据 2：量纲列只给方向——每行需有 → 与「块/消行」，且不得出现固定块数
        for ln in seg_anchor.split('\n'):
            if not ln.startswith('| **'):
                continue
            cell = ln.split('|')[-2]
            check('→' in cell, f'D 量纲列缺换算箭头：{ln[:40]}')
            check('块' in cell or '消行' in cell, f'D 量纲列未用方块节奏语言：{ln[:40]}')
            check(FIXED_BLOCK.search(cell) is None,
                  f'D 量纲列写了固定块数（应只给范围/方向）：{cell.strip()[:40]}')
            check(VAGUE.search(cell) is None,
                  f'D 量纲列出现留余量/模糊措辞：{cell.strip()[:40]}')

    # 判据 B 自检：闸门本身必须仍然"会拦"（防有人把正则改松后静默失效）
    must_block = ['写死成 3 块内', '固定 7 块', '每 4 块一次']
    must_pass = ['每 2~3 块结算', '3~5 块内触发', '每 1.6~2.5 块一次',
                 '每 15.6~25 块内持续', '攒 6~8 次消行触发一次']
    for c in must_block:
        check(FIXED_BLOCK.search(c) is not None, f'B 闸门自检失效，漏放：{c}')
    for c in must_pass:
        check(FIXED_BLOCK.search(c) is None, f'B 闸门自检过严，误拦：{c}')
    # 判据 D 自检
    for c in ['约 4 块内', '留点余量', '大概 5 块', '酌情取 3 块']:
        check(VAGUE.search(c) is not None, f'D 闸门自检失效，漏放：{c}')
    for c in ['每 1.6~2.5 块结算一次（取上整即每 2~3 块）', '3~5 块内二次按 Z 触发']:
        check(VAGUE.search(c) is None, f'D 闸门自检过严，误拦：{c}')

    for tbl, head in (('一、基础信息', '| 角色 | 称号 |'), ('二、技能名', '| 角色 | 普通攻击 |'),
                      ('三、固有天赋', '| 角色 | 天赋名 |'),
                      ('四、命之座', '| 角色 | 1 命 |')):
        seg = idx.split(f'## {tbl}')[1] if f'## {tbl}' in idx else ''
        check(head in seg, f'D INDEX {tbl} 表头异常')
        for cn in SLUG:
            check(f'**{cn}**' in seg or f'| {cn} |' in seg,
                  f'D INDEX {tbl} 缺 {cn} 行')
    check(re.search(r'\*\*哥伦比娅\*\* \| 空月归乡 \| 水 \| 法器', idx) is not None,
          'D INDEX 哥伦比娅 记录非「水 / 法器」')
    check('空月归乡' in idx and '月之四' in idx, 'D INDEX 缺哥伦比娅实装信息')

    print(f'checked {len(SLUG)} 角色文档 + INDEX')
    if fails:
        print(f'FAIL {len(fails)} 项：')
        for f in fails:
            print('  -', f)
        return 1
    print('AUDIT PASS：结构 / 数值逐字 / 附录保真 / INDEX 五表 / 机制锚点表位置与量纲方向 / JSON 一致性 / 标记泄漏 全部通过')
    return 0


if __name__ == '__main__':
    sys.exit(main())
