#!/usr/bin/env python3
"""把 parsed/<角色>.json 渲染成 docs/wiki/<角色>.md 与 docs/wiki/INDEX.md。

原则：
- 描述/数值/命座/语音/故事 **逐字取自 wiki**（由 parse_wiki.py 解析），不做概括；
- 策划提炼（定位、机制语言、玩法映射）写在下方 NOTES，由人维护；
- 原始 wikitext 关键片段从 raw/*.wikitext 逐行回捞，便于查证。

用法：python3 docs/wiki/scripts/render_md.py
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_wiki import find_template  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]          # docs/wiki
RAW = ROOT / 'raw'
PARSED = ROOT / 'parsed'
DATE = '2026-10-29'
WIKI = 'https://wiki.biligame.com/ys/index.php?title='

CHARS = ['纳西妲', '刻晴', '甘雨', '哥伦比娅']

SLUG = {'纳西妲': '纳西妲', '刻晴': '刻晴', '甘雨': '甘雨', '哥伦比娅': '哥伦比娅'}

# ---------------- 人写的提炼层 ----------------
NOTES = {
 '纳西妲': {
  'title': '纳西妲（白草净华 / 小吉祥草王）',
  'role': '草元素法器主 C 兼精通拐。核心是「蕴种印」把敌人串成一张网，'
          '队伍在网里触发元素反应就把「灭净三业」打到全部连结目标身上；'
          'Q 展开「摩耶之殿」把 E 的伤害/频率按队伍元素类型放大，因此她的强度是**队伍配置驱动**的。',
  'mech': [
   ('蕴种印', 'E 命中后挂在敌人身上的标记；同标记的敌人互相连结，反应伤害会连锁扩散。'),
   ('灭净三业', 'E 的核心伤害：基于「攻击力% + 元素精通%」双加成，短时间至多触发一次（间隔见 E 表）。'),
   ('摩耶之殿', 'Q 展开的领域，按队伍里火/雷/水元素角色数量分别提升 E 伤害、缩短 E 触发间隔、延长领域时长。'),
   ('净善摄受明论', '固有天赋：把队伍最高基础精通的 25% 借给领域内场上角色，上限 250 点。'),
  ],
  'map': '若做她的天赋，最小可玩闭环 = 普攻 4 段 + E 点按/长按上标记 + 反应触发「灭净三业」二次伤害 + Q 领域三种元素增益。'
         '建议先把「蕴种印连结」做成数据层（敌人互相引用），再看领域增益乘区。',
  'kw': '蕴种印 · 灭净三业 · 摩耶之殿 · 净善摄受明论',
  'one': 'E 挂「蕴种印」把敌人串成网 → 队友在网内触发反应即把「灭净三业」打到全网；'
         'Q「摩耶之殿」按队内火/雷/水角色数分别加伤害、提触发频率、延长时间。',
  'voice': [0, 17, 34, 38, 41, 50, 56, 57, 59, 69],
 },
 '刻晴': {
  'title': '刻晴（霆霓快雨 / 玉衡星）',
  'role': '雷元素单手剑速攻主 C。E 投「雷楔」→ 再次施放瞬移到标记处并附魔雷元素，'
          'Q 是多段连斩的爆发；核心手感是**位移 + 附魔窗口**，而非站桩输出。',
  'mech': [
   ('雷楔', 'E 投出的标记；存续期间再次施放 E 或重击会引爆它（清标记 + 位移 + 伤害）。'),
   ('抵天雷罚', '固有天赋：雷楔存续期间再次施放 E 后的 5 秒内获得雷元素附魔——附魔窗口是她的主要输出手段。'),
   ('天街巡游', 'Q：先一次雷范围伤害，随后 8 段连斩 + 最后一击，总段数固定（见 Q 表）。'),
   ('玉衡之贵', '固有天赋：施放 Q 时暴击率 +15%、充能效率 +15%，持续 8 秒。'),
  ],
  'map': '做刻晴时先做「雷楔状态机」：投放 → 存续（可长按改方向/悬空）→ 二次施放引爆 → 附魔 5 秒。'
         '位移与附魔是她的辨识度，纯数值复刻会失去手感。',
  'kw': '雷楔 · 抵天雷罚 · 天街巡游 · 玉衡之贵',
  'one': 'E 投「雷楔」→ 存续期内二次施放瞬移引爆并获得 5 秒雷附魔，Q 是 8 段连斩 + 收尾一击；'
         '手感核心是「位移 + 附魔窗口」而非站桩输出。',
  'voice': [0, 12, 19, 41, 45, 46, 59, 64, 66, 81],
 },
 '甘雨': {
  'title': '甘雨（循循守月 / 月海亭秘书）',
  'role': '冰元素弓主 C：二段蓄力「霜华矢」是主要伤害来源（命中后再绽发一次范围冰伤）；'
          'E 放冰莲嘲讽、Q 召冰灵珠持续降冰棱。玩法节奏 = 蓄力输出 + 冰莲拉扯。',
  'mech': [
   ('霜华矢', '二段蓄力射出的箭；命中后「霜华绽发」再造成一次冰元素范围伤害（两段独立数值）。'),
   ('冰莲', 'E 留下的召唤物：持续嘲讽、耐久按甘雨生命值上限比例继承，摧毁/到期时绽放造成范围冰伤。'),
   ('冰灵珠', 'Q 召唤物，15 秒内持续降下冰棱；同一敌人有锁定间隔（见 Q 表注释）。'),
   ('唯此一心', '固有天赋：霜华矢发射后 5 秒内，后续霜华矢/霜华绽发暴击率 +20%——鼓励连续蓄力。'),
  ],
  'map': '她的辨识度是「蓄力分层」（一段冰箭 / 二段霜华矢）。先做蓄力状态机与绽发二次判定，再做冰莲嘲讽 AI。',
  'kw': '霜华矢 · 霜华绽发 · 冰莲 · 冰灵珠 · 唯此一心',
  'one': '二段蓄力「霜华矢」命中后由「霜华绽发」再炸一次（两段独立数值），'
         'E 留「冰莲」嘲讽、Q 召「冰灵珠」15 秒持续降冰棱；节奏 = 蓄力输出 + 冰莲拉扯。',
  'voice': [0, 13, 17, 35, 39, 40, 52, 55, 57, 72],
 },
 '哥伦比娅': {
  'title': '哥伦比娅（空月归乡 / 玩家口中的「少女」，水元素）',
  'role': '水元素法器角色，**【水】不是风**（曾误传）。全部数值按**生命值上限**缩放，'
          '定位是「月曜反应」（月感电/月绽放/月结晶）体系的核心发动机：E 常驻引力涟漪攒引力值 → 引力干涉，'
          'Q 铺月之领域并提升月曜反应伤害，天赋把队内感电/绽放/结晶反应**转成**月曜反应。',
  'mech': [
   ('引力涟漪', 'E 唤出、跟随场上角色的持续水伤场地（25 秒）；队友触发月曜反应时为其积攒引力值（上限 60）。'),
   ('引力干涉', '引力值满后按「积攒最多引力值的那种月曜反应类型」打出对应形态的伤害（月感电/月绽放/月结晶三套数值）。'),
   ('月之领域', 'Q 铺的领域（20 秒），领域内月曜反应伤害提升，并作为「新月自己的法则」等天赋的判定条件。'),
   ('月兆', '月曜体系的分级（月兆·满辉等）；天赋「月兆祝赐·借汝月光」直接让队伍月兆 +1 级。'),
   ('月露涤荡', '普攻栏下的特殊重击：消耗 1 枚草露，造成 3 次视作月绽放反应伤害的草元素范围伤害。'),
  ],
  'map': '【已裁决】不实现「月曜反应」反应族，她的天赋映射走我们已有的「引力/潮汐/涟漪」语言：'
         'E 的引力涟漪 = 跟随式持续伤害场地层；引力值 = 资源槽；满值打出引力干涉 = 一次强力爆发；'
         'Q 月之领域 = 领域增伤层。最小可玩切片即这四件，不需要新反应类型。',
  'kw': '引力涟漪 · 引力值 · 引力干涉 · 月之领域',
  'one': 'E 唤出「引力涟漪」跟随场上角色，队友触发反应为其攒「引力值」（上限 60），'
         '满值按攒得最多的反应类型打出「引力干涉」；Q 铺「月之领域」增伤；数值全按生命值上限缩放。'
         '【设计裁决】月曜反应族不实现，映射走我们已有的引力/潮汐/涟漪语言。',
  'voice': [3, 0, 14, 18, 41, 42, 54, 57, 59, 74],
 },
}

STAT_KEYS = ('冷却时间', '元素能量', '持续时间', '触发间隔', '间隔', '消耗')


def raw_url(name):
    from urllib.parse import quote
    return WIKI + quote(name) + '&action=raw'


def voice_url(name):
    from urllib.parse import quote
    return WIKI + quote(name + '语音') + '&action=raw'


def find_attr(t, pats):
    for a in t['attrs']:
        if any(p in a['name'] for p in pats):
            return a
    return None


def fmt_cd_energy(t):
    """从属性表抽 CD / 能量 / 持续，供速查表使用。"""
    bits = []
    for a in t['attrs']:
        n = a['name']
        if '：' in n or '，' in n:
            continue
        if any(k in n for k in ('冷却时间', '元素能量', '持续时间')):
            if a['lv1']:
                bits.append(f"{n} {a['lv1']}")
    return ' / '.join(bits)


def attr_table(t):
    rows = [a for a in t['attrs'] if a['name']]
    if not rows:
        return ''
    out = ['| 属性 | LV1 | LV10 | 满级值 |', '| --- | --- | --- | --- |']
    for a in rows:
        last = f"{a['last']}（LV{a['last_level']}）" if a['last_level'] > 10 else '—'
        out.append(f"| {a['name']} | {a['lv1']} | {a['lv10']} | {last} |")
    return '\n'.join(out)


def block_bodies(name):
    """回捞每个技能块的 {{天赋技能|...}} 原始参数文本（与 parse_wiki 同一切块逻辑）。"""
    text = (RAW / f'{name}.wikitext').read_text(encoding='utf-8')
    tal_start = text.find('\n==天赋==')
    tal_end = text.find('\n==角色搭配推荐==')
    if tal_end < 0:
        tal_end = text.find('\n==角色相关==')
    tal = text[tal_start:tal_end]
    starts = [(m.start()) for m in re.finditer(r'\{\{角色技能\|内容(\d+)开始\}\}', tal)]
    ends = [m.start() for m in re.finditer(r'\{\{角色技能\|内容[^}]*结束\}\}', tal)]
    bodies = []
    for pos in starts:
        close = next((e for e in ends if e > pos), len(tal))
        seg = tal[pos:close]
        sm = seg.find('{{天赋技能|')
        if sm < 0:
            continue
        body, _ = find_template(seg, sm)
        bodies.append(body)
    return bodies


def raw_excerpt(name, talents):
    """从原始 wikitext 逐行回捞：信息框关键字段 + 每条技能的 CD/能量/持续 原始属性行。

    关键：属性名与其 LV 值**按同一个 `属性N` 键配对**回捞（不做位置推算），
    避免张冠李戴——附录是给"查证"用的，错位比缺失更糟。
    """
    text = (RAW / f'{name}.wikitext').read_text(encoding='utf-8')
    lines = text.split('\n')
    keep = []
    box_keys = ('名称=', '称号=', '全名=', '英文名称=', '稀有度=', '所属=', '种族=',
                '元素属性=', '武器类型=', '命之座=', '限定=', '实装日期=', '实装版本=')
    for ln in lines[:60]:
        if ln.startswith('|') and any(ln.startswith('|' + k) for k in box_keys):
            keep.append(ln.strip())
    keep.append('')
    bodies = block_bodies(name)
    for body, t in zip(bodies, talents):
        keep.append(f";; —— {t['name']}" + (f"（{t['label']}）" if t['label'] != t['name'] else ""))
        names = dict(re.findall(r'\|属性(\d+)=([^\n]*)', body))
        for k in sorted(names, key=int):
            nm = names[k].strip()
            if not any(s in nm for s in STAT_KEYS):
                continue
            keep.append(f"|属性{k}={nm}")
            for lv in ('LV1', 'LV10'):
                m = re.search(rf'\|属性{k}{lv}=([^\n]*)', body)
                if m:
                    keep.append(f"|属性{k}{lv}={m.group(1).strip()}")
    return '\n'.join(keep)


def render(name, d):
    n = NOTES[name]
    info = d['info']
    L = []
    A = L.append
    A(f"# {n['title']}")
    A('')
    A(f"> **取材来源**：<{raw_url(name)}>")
    A(f"> **语音页**：<{voice_url(name)}>（MediaWiki 子页，无斜杠）")
    A(f"> **抓取**：{DATE} · `curl -sS -A 'Mozilla/5.0' '<url>&action=raw'`")
    A(f"> **落盘**：原文 `docs/wiki/raw/{name}.wikitext`、`docs/wiki/raw/{name}语音.wikitext`；"
      f"结构化 `docs/wiki/parsed/{name}.json`（`scripts/parse_wiki.py` 生成）")
    A('> **说明**：本文件所有描述/数值/命座/语音/故事均逐字取自 wiki 原文，'
      '「策划提炼」一节是人为概括，不替代原文。')
    A('')

    # 0 速览
    A('## 0. 速览')
    A('')
    A('| 项 | 值 |')
    A('| --- | --- |')
    keys = [('称号', '称号'), ('全名', '全名'), ('英文名称', '英文名'), ('元素属性', '元素'),
            ('武器类型', '武器'), ('稀有度', '稀有度'), ('所属', '所属'), ('种族', '种族'),
            ('命之座', '命之座'), ('限定', '限定'), ('实装日期', '实装日期'),
            ('实装版本', '实装版本'), ('中文CV', '中文CV'), ('日文CV', '日文CV'),
            ('TAG', '机制标签'), ('昵称/外号', '昵称/外号')]
    for k, label in keys:
        if info.get(k):
            A(f"| {label} | {info[k]} |")
    asc = d.get('ascension', {})
    if asc.get('突破特产材料'):
        A(f"| 突破材料 | 特产 {asc['突破特产材料']} / BOSS {asc.get('突破BOSS材料', '—')} |")
    if asc.get('20级新天赋') or asc.get('60级新天赋'):
        A(f"| 固有天赋解锁 | 20级「{asc.get('20级新天赋', '—')}」/ 60级「{asc.get('60级新天赋', '—')}」 |")
    if info.get('介绍'):
        A(f"| 官方简介 | {info['介绍']} |")
    A('')

    # 1 提炼
    A('## 1. 定位与机制语言（策划提炼，**非 wiki 原文**）')
    A('')
    A(f"**定位**：{n['role']}")
    A('')
    A('| 机制词 | 一句话解释（原文见后续章节） |')
    A('| --- | --- |')
    for k, v in n['mech']:
        A(f"| {k} | {v} |")
    A('')
    A(f"**玩法映射建议**：{n['map']}")
    A('')

    # 2 战斗技能
    A('## 2. 战斗技能（描述与数值：wiki 原文逐字）')
    A('')
    A('> 注：wiki 原文里各技能块的开始标记多数都写作 `{{角色技能|内容2开始}}`（原文如此，'
      '不是笔误）；解析器按「下一个结束标记」切块，不按编号配对。')
    A('')
    combat = [t for t in d['talents'] if t['kind'] in (1, 2, 3)]
    for t in combat:
        tag = {1: '普通攻击', 2: '元素战技 E', 3: '元素爆发 Q'}[t['kind']]
        A(f"### 2.{t['kind']} {tag} · {t['name']}")
        A('')
        A(f"> 来源：<{raw_url(name)}> · 技能块 `{{{{角色技能|内容{t['idx']}开始}}}}`")
        A('')
        A('**原文描述**：')
        A('')
        A(re.sub(r'\n{2,}', '\n\n', t['desc'].strip()))
        A('')
        tbl = attr_table(t)
        if tbl:
            A('**数值表（LV1 / LV10 / 满级，原文数字）**：')
            A('')
            A(tbl)
            A('')

    # 3 固有天赋
    A('## 3. 固有天赋（20/60 级突破解锁 + 其他固有）')
    A('')
    pas = [t for t in d['talents'] if t['kind'] == 4]
    if not pas:
        A('（wiki 角色页未标注固有天赋块）')
        A('')
    for t in pas:
        A(f"### 3.{pas.index(t) + 1} {t['name']}")
        A('')
        A(t['desc'] if t['desc'] else '（wiki 未给出描述）')
        A('')

    # 4 命之座
    A('## 4. 命之座（wiki 原文）')
    A('')
    A(f"命之座名称：**{info.get('命之座', '—')}**")
    A('')
    for c in d['constellations']:
        mark = ' ★' if c['n'] in (1, 2, 4, 6) else ''
        A(f"### 4.{c['n']} {c['name']}{mark}")
        A('')
        A(c['effect'])
        A('')
    A('★ = 任务要求重点复刻的 1/2/4/6 命。')
    A('')

    # 5 语音
    A('## 5. 角色语音 / 台词（wiki 原文，10 句代表性）')
    A('')
    A(f"> 来源：<{voice_url(name)}>（模板 `{{{{角色/语音1|语音类型=|语音内容=}}}}`）")
    A('')
    items = d['voice']['items']
    A('| # | 语音类型 | 原文 |')
    A('| --- | --- | --- |')
    for j, i in enumerate(n['voice'], 1):
        if i >= len(items):
            continue
        v = items[i]
        txt = v['cn'].replace('|', '\\|').replace('\n', ' ')
        A(f"| {j} | {v['type']} | {txt} |")
    A('')
    A(f'该角色语音页共 {len(items)} 条，完整清单见 `docs/wiki/parsed/{name}.json` 的 `voice.items`。')
    A('')

    # 6 故事
    A('## 6. 角色故事（wiki 原文全录）')
    A('')
    for s in d['stories']:
        A(f"### 6.{s['n']} 角色故事{s['n']}" + (f"（解锁：{s['unlock']}）" if s['unlock'] else ''))
        A('')
        A(s['text'])
        A('')
    ex = d.get('extra', {})
    for k in ('神之心', '冒险笔记'):
        if ex.get(k):
            A(f"### {k}" + (f"（{ex['冒险笔记名称']}）" if k == '冒险笔记' and ex.get('冒险笔记名称') else ''))
            A('')
            A(ex[k])
            A('')

    # 7 原始 wikitext
    A('## 7. 附录：原始 wikitext 关键片段（逐行回捞，未改写）')
    A('')
    A('完整原文见 `docs/wiki/raw/' + name + '.wikitext`；属性表的 LV1~LV15 全列由 '
      '`scripts/parse_wiki.py` 解析进 `parsed/' + name + '.json`，此节只留检索锚点。')
    A('')
    A('```wikitext')
    A(raw_excerpt(name, d['talents']))
    A('```')
    A('')
    A('---')
    A('')
    A('复现命令：`python3 docs/wiki/scripts/parse_wiki.py docs/wiki/raw ' + name +
      ' && python3 docs/wiki/scripts/render_md.py`')
    A('')
    return '\n'.join(L)


def render_index(datas):
    L = []
    A = L.append
    A('# 原神角色资料 · 四角色对照速查')
    A('')
    A(f'> 取材：B 站 wiki 原神（biligame）`action=raw`，抓取日期 {DATE}。')
    A('> 通道：`https://wiki.biligame.com/ys/index.php?title=<URL编码>&action=raw`（本机实测只有这条通道通）。')
    A('> 单角色详情（含原文全文/故事/语音 77~87 条）：`docs/wiki/<角色>.md`（**中文文件名**，'
      '便于按角色名直接找）；机器可读：`docs/wiki/parsed/<角色>.json`。')
    A('> 本目录**不受** `scripts/doc_health.py` 治理门禁约束（`in_scope_md()` 不含 `workspace/` 前缀），'
      '故无 `@status` 状态头，提交不会被拦。')
    A('')
    A('## 机制语言速查（先看这张，做玩法映射用）')
    A('')
    A('| 角色 | 官方机制关键词 | 一句话说明（玩法映射视角） |')
    A('| --- | --- | --- |')
    for n in CHARS:
        A(f"| **{n}** | {NOTES[n]['kw']} | {NOTES[n]['one']} |")
    A('')
    A('> 关键词取自 wiki 原文的技能/天赋/命座文本；说明列为人工提炼（非官方措辞），'
      '单角色文档 §1 有更细的机制词条表。')
    A('')
    A('## 机制数值锚点')
    A('')
    A('> talent-designer 做换算时的唯一数值来源；单位/口径以 raw 为准'
      '（`docs/wiki/raw/<角色>.wikitext` 的 `属性N` 行）。'
      '末列「我们游戏的对应量纲」只给**换算方向**（方块节奏：一块 ≈ 1.0~1.6 秒），'
      '按秒数严格折算、**不留手感余量**（留余量会让天赋时长与手感脱节）；'
      '换算区间一律保留到一位小数，取整写成「取上整即每 X~Y 块」并在行内注明，'
      '规则可见、不依赖记忆；具体数值由 talent-designer 定。')
    A('')
    A('| 角色 | 机制关键词 | 关键数字（原文口径） | 我们游戏的对应量纲（方向，非定值） |')
    A('| --- | --- | --- | --- |')
    keynum = {
        '纳西妲': 'E 点按 CD 5.0s / 长按 6.0s；蕴种印持续 25.0s；灭净三业触发间隔 2.5s；Q 基础持续 15.0s、CD 13.5s、能量 50',
        '刻晴': 'E 冷却 7.5s；Q 冷却 12.0s、能量 40；附魔窗口 5s（抵天雷罚）；Q 时暴击率+15%/充能+15% 持续 8s',
        '甘雨': 'E 冷却 10.0s、冰莲持续 6.0s；Q 冷却 15.0s、持续 15.0s、能量 60；霜华矢暴击率+20% 持续 5s',
        '哥伦比娅': 'E 冷却 17.0s、引力涟漪持续 25.0s、引力值上限 60；Q 冷却 15.0s、月之领域持续 20.0s、能量 60',
    }
    bridge = {
        '纳西妲': '蕴种印 25s → 每 15.6~25 块内持续；灭净三业 2.5s → 每 1.6~2.5 块结算一次'
                  '（取上整即每 2~3 块）',
        '刻晴': '雷楔 5s 窗口 → 「3~5 块内二次按 Z 触发」（严格 3.1~5.0 块）',
        '甘雨': '冰莲 6s → 「4~6 块内持续」；Q 15s → 「10~15 块内持续」',
        '哥伦比娅': '引力值上限 60／涟漪 25s → 「攒 6~8 次消行触发一次引力干涉」',
    }
    for n in CHARS:
        kw = '、'.join(k for k, _ in NOTES[n]['mech'])
        A(f"| **{n}** | {kw} | {keynum[n]} | {bridge[n]} |")
    A('')
    A('## 〇、单角色详情')
    A('')
    A('| 角色 | 文档 | 说明 |')
    A('| --- | --- | --- |')
    for n in CHARS:
        A(f"| {n} | [{SLUG[n]}.md]({SLUG[n]}.md) | 技能数值表 / 固有天赋 / 命之座 / 语音 / 角色故事全文 |")
    A('')
    A('## 一、基础信息')
    A('')
    A('| 角色 | 称号 | 元素 | 武器 | 稀有度 | 所属 | 命之座 | 实装 | 限定 |')
    A('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
    for n in CHARS:
        i = datas[n]['info']
        limited = i.get('限定') or '常驻（wiki 无「限定」字段）'
        A(f"| **{n}** | {i.get('称号', '')} | {i.get('元素属性', '')} | {i.get('武器类型', '')} "
          f"| {i.get('稀有度', '')} | {i.get('所属', '')} | {i.get('命之座', '')} "
          f"| {i.get('实装版本', '')}（{i.get('实装日期', '')}） | {limited} |")
    A('')
    A('> 重要更正：**哥伦比娅（玩家口中的「少女」）是水元素**，不是风；2026-01-14 实装、版本「月之四」、称号「空月归乡」。')
    A('')
    A('## 二、技能名 / 冷却 / 能量 / 持续时间')
    A('')
    A('| 角色 | 普通攻击 | 元素战技 E | E 的 CD 等 | 元素爆发 Q | Q 的 CD / 能量 / 持续 |')
    A('| --- | --- | --- | --- | --- | --- |')
    for n in CHARS:
        d = datas[n]
        na = next((t for t in d['talents'] if t['kind'] == 1), None)
        e = next((t for t in d['talents'] if t['kind'] == 2), None)
        q = next((t for t in d['talents'] if t['kind'] == 3), None)
        A(f"| **{n}** | {na['name'] if na else '—'} | {e['name'] if e else '—'} "
          f"| {fmt_cd_energy(e) if e else '—'} | {q['name'] if q else '—'} | {fmt_cd_energy(q) if q else '—'} |")
    A('')
    A('## 三、固有天赋')
    A('')
    A('| 角色 | 天赋名 | 等级门槛 | 效果（原文摘录，完整见单角色文档） |')
    A('| --- | --- | --- | --- |')
    for n in CHARS:
        pas = [t for t in datas[n]['talents'] if t['kind'] == 4]
        asc = datas[n].get('ascension', {})
        for j, t in enumerate(pas):
            if t['name'] == asc.get('20级新天赋'):
                lvl = '突破 20 级'
            elif t['name'] == asc.get('60级新天赋'):
                lvl = '突破 60 级'
            else:
                lvl = '其他固有天赋'
            one = t['desc'].replace('\n', ' ').replace('|', '\\|')
            if len(one) > 150:
                one = one[:150] + '…'
            A(f"| {n} | **{t['name']}** | {lvl} | {one} |")
    A('')
    A('## 四、命之座（1/2/4/6 名）')
    A('')
    A('| 角色 | 1 命 | 2 命 | 4 命 | 6 命 |')
    A('| --- | --- | --- | --- | --- |')
    for n in CHARS:
        cs = {c['n']: c['name'] for c in datas[n]['constellations']}
        A(f"| **{n}** | {cs.get(1, '—')} | {cs.get(2, '—')} | {cs.get(4, '—')} | {cs.get(6, '—')} |")
    A('')
    A('## 五、素材链路（可复现）')
    A('')
    A('```')
    A('docs/wiki/')
    A('├── INDEX.md                 ← 本文件')
    A('├── nahida.md / keqing.md / ganyu.md / columbina.md   ← 四角色详情')
    A('├── raw/                      ← action=raw 原始 wikitext（角色页 + 语音子页）')
    A('├── parsed/                   ← 解析后的 JSON（技能/数值/命座/故事/语音全量）')
    A('└── scripts/')
    A('    ├── parse_wiki.py         ← wikitext → JSON（处理嵌套模板、属性 LV1~LV15）')
    A('    └── render_md.py          ← JSON + 人工提炼 → 本文档与单角色 md')
    A('```')
    A('')
    A('复现：')
    A('')
    A('```bash')
    A('# 1) 抓原文（一次一个，别并发轰 wiki）')
    A('for c in 纳西妲 刻晴 甘雨 哥伦比娅; do')
    A('  curl -sS -m 25 -A "Mozilla/5.0" \\')
    A('    "https://wiki.biligame.com/ys/index.php?title=$(python3 -c \\')
    A('       "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$c")&action=raw" \\')
    A('    -o "docs/wiki/raw/$c.wikitext"')
    A('done')
    A('# 2) 解析 + 渲染')
    A('python3 docs/wiki/scripts/parse_wiki.py docs/wiki/raw --all')
    A('python3 docs/wiki/scripts/render_md.py')
    A('```')
    A('')
    return '\n'.join(L)


def main():
    datas = {n: json.loads((PARSED / f'{n}.json').read_text(encoding='utf-8')) for n in CHARS}
    for n in CHARS:
        out = ROOT / f"{SLUG[n]}.md"
        out.write_text(render(n, datas[n]), encoding='utf-8')
        print(f'wrote {out} ({out.stat().st_size} B)')
    idx = ROOT / 'INDEX.md'
    idx.write_text(render_index(datas), encoding='utf-8')
    print(f'wrote {idx} ({idx.stat().st_size} B)')


if __name__ == '__main__':
    main()
