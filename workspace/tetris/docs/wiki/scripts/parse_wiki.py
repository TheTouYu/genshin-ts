#!/usr/bin/env python3
"""解析 biligame 原神 wiki 的 action=raw wikitext（角色页 + 语音页）。

用法：
    python3 docs/wiki/scripts/parse_wiki.py docs/wiki/raw 纳西妲
    python3 docs/wiki/scripts/parse_wiki.py docs/wiki/raw --all

输出：<raw>/../parsed/<角色>.json  +  stdout 打印紧凑摘要
不写任何 wiki 之外的位置。
"""
import json
import re
import sys
from pathlib import Path

CHARS = ['纳西妲', '刻晴', '甘雨', '哥伦比娅']


# ---------- 模板级工具 ----------
def find_template(text, start):
    """从 text[start:] 的 '{{' 起做花括号配对，返回 (content, end_index_after_}})。"""
    assert text[start:start + 2] == '{{'
    depth = 0
    i = start
    while i < len(text) - 1:
        if text[i] == '{' and text[i + 1] == '{':
            depth += 1
            i += 2
            continue
        if text[i] == '}' and text[i + 1] == '}':
            depth -= 1
            i += 2
            if depth == 0:
                return text[start + 2:i - 2], i
            continue
        i += 1
    return text[start + 2:], len(text)


def split_params(body):
    """把模板体按顶层 '|' 拆成 params（跳过嵌套 {{}} / [[ ]] 里的 |）。"""
    parts, buf = [], []
    depth_c = depth_s = 0
    i = 0
    while i < len(body):
        two = body[i:i + 2]
        if two == '{{':
            depth_c += 1
            buf.append(two)
            i += 2
            continue
        if two == '}}':
            depth_c -= 1
            buf.append(two)
            i += 2
            continue
        if two == '[[':
            depth_s += 1
            buf.append(two)
            i += 2
            continue
        if two == ']]':
            depth_s -= 1
            buf.append(two)
            i += 2
            continue
        ch = body[i]
        if ch == '|' and depth_c == 0 and depth_s == 0:
            parts.append(''.join(buf))
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    parts.append(''.join(buf))
    return parts


def to_dict(body):
    d, order = {}, []
    for p in split_params(body):
        if '=' not in p:
            continue
        k, v = p.split('=', 1)
        k = k.strip()
        if not k:
            continue
        if k in d:
            k = k + '_dup'
        d[k] = v.strip()
        order.append(k)
    return d, order


def strip_markup(s):
    """wiki 标记 → 纯文本（保留换行）。"""
    if not s:
        return ''
    s = re.sub(r'\{\{黑幕\|([^{}]*)\}\}', r'\1', s)
    # {{颜色|x|y}} / {{效果|x}} / {{图标|x}} … 逐层剥到内层文本
    for _ in range(6):
        new = re.sub(r'\{\{([^{}]*)\}\}',
                     lambda m: (m.group(1).split('|')[-1]
                                if '|' in m.group(1) else ''), s)
        if new == s:
            break
        s = new
    s = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]*)\]\]', r'\1', s)
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'</?[a-zA-Z][^>]*>', '', s)
    s = s.replace("'''", '').replace("''", '')
    s = re.sub(r'\n{3,}', '\n\n', s)
    return s.strip()


# ---------- 角色页 ----------
def parse_char(path):
    text = Path(path).read_text(encoding='utf-8')
    out = {'file': str(path)}

    # 信息框：第一个 {{角色 …}}（不是 {{角色/属性数据）
    m = re.search(r'\{\{角色\n', text)
    info = {}
    if m:
        body, _ = find_template(text, m.start())
        info, _ = to_dict(body)
    keys = ['名称', '称号', '全名', '英文名称', '稀有度', '所属', '种族', '介绍',
            '元素属性', '武器类型', '命之座', '性别', 'TAG', '限定',
            '实装日期', '实装版本', '中文CV', '神之眼描述']
    out['info'] = {k: strip_markup(info.get(k, '')) for k in keys if info.get(k)}

    # 子模板：角色/信息、角色/故事、角色/命之座
    def grab(tpl_name):
        mm = re.search(re.escape('{{' + tpl_name) + r'\n?', text)
        if not mm:
            return {}
        b, _ = find_template(text, mm.start())
        dd, _ = to_dict(b)
        return dd

    sub_asc = grab('角色/突破简')
    sub_info = grab('角色/信息')
    sub_story = grab('角色/故事')
    sub_cons = grab('角色/命之座')
    nick = strip_markup(sub_info.get('昵称/外号', ''))
    if nick:
        out['info']['昵称/外号'] = nick
    for k in ('中文CV', '日文CV', '英文CV', '韩文CV'):
        if sub_info.get(k):
            out['info'][k] = strip_markup(sub_info[k])

    asc_keys = ('突破特产材料', '突破BOSS材料', '20级新天赋', '60级新天赋')
    out['ascension'] = {k: strip_markup(sub_asc[k]) for k in asc_keys if sub_asc.get(k)}

    # 命之座 1..6
    cons = []
    for i in range(1, 7):
        nm = strip_markup(sub_cons.get(f'命之座{i}', ''))
        eff = strip_markup(sub_cons.get(f'命之座{i}效果', ''))
        if nm:
            cons.append({'n': i, 'name': nm, 'effect': eff})
    out['constellations'] = cons

    # 角色故事
    stories = []
    for i in range(1, 8):
        body_txt = strip_markup(sub_story.get(f'角色故事{i}', ''))
        if body_txt:
            stories.append({'n': i, 'text': body_txt,
                            'unlock': strip_markup(sub_story.get(f'角色故事{i}解锁条件', ''))})
    out['stories'] = stories
    for k in ('神之心', '冒险笔记', '冒险笔记名称'):
        if sub_story.get(k):
            out.setdefault('extra', {})[k] = strip_markup(sub_story[k])

    # ---- 天赋区 ----
    tal_start = text.find('\n==天赋==')
    tal_end = text.find('\n==角色搭配推荐==')
    if tal_end < 0:
        tal_end = text.find('\n==角色相关==')
    tal = text[tal_start:tal_end]

    labels = re.findall(r'\{\{角色技能/(\d)\|([^{}]+)\}\}', tal)
    labels = [(int(a), strip_markup(b)) for a, b in labels]

    blocks = []
    starts = [(m.start(), int(m.group(1)))
              for m in re.finditer(r'\{\{角色技能\|内容(\d+)开始\}\}', tal)]
    end_marks = [m.start() for m in
                 re.finditer(r'\{\{角色技能\|内容[^}]*结束\}\}', tal)]
    for pos, idx in starts:
        close = next((e for e in end_marks if e > pos), len(tal))
        seg = tal[pos:close]
        sm = seg.find('{{天赋技能|')
        if sm < 0:
            continue
        body, _ = find_template(seg, sm)
        d, order = to_dict(body)
        attr_names = [k[2:] for k in order if re.fullmatch(r'属性\d+', k)]
        attrs = []
        for an in attr_names:
            lv = {}
            base = '属性' + an
            for k in order:
                if k.startswith(base + 'LV'):
                    v = d.get(k, '')
                    if v:
                        lv[int(k[len(base) + 2:])] = strip_markup(v)
            if lv:
                lv1 = lv.get(1, '')
                lv10 = lv.get(10, '')
                last = lv[max(lv)]
                attrs.append({'name': strip_markup(d.get(base, '')), 'lv1': lv1,
                              'lv10': lv10, 'last_level': max(lv), 'last': last})
            else:
                attrs.append({'name': '', 'lv1': '', 'lv10': '',
                              'last_level': 0, 'last': ''})
        blocks.append({
            'idx': idx,
            'name': strip_markup(d.get('技能名', '')),
            'desc': strip_markup(d.get('描述', '')),
            'attrs': attrs,
        })

    for i, b in enumerate(blocks):
        b['label'] = labels[i][1] if i < len(labels) else ''
        b['kind'] = labels[i][0] if i < len(labels) else 0
    out['talents'] = blocks
    out['talent_labels'] = labels
    return out


# ---------- 语音页 ----------
def parse_voice(path):
    text = Path(path).read_text(encoding='utf-8')
    items = []
    for m in re.finditer(r'\{\{角色/语音\d*\s*\|', text):
        body, _ = find_template(text, m.start())
        d, _ = to_dict(body)
        typ = strip_markup(d.get('语音类型', ''))
        cn = strip_markup(d.get('语音内容', ''))
        if typ and cn:
            items.append({'type': typ, 'cn': cn})
    # 去重（同类多条保留顺序）
    return {'file': str(path), 'count': len(items), 'items': items}


def main(argv):
    raw_dir = Path(argv[1])
    names = CHARS if argv[2] == '--all' else [argv[2]]
    outdir = raw_dir.parent / 'parsed'
    outdir.mkdir(parents=True, exist_ok=True)
    for n in names:
        cp = raw_dir / f'{n}.wikitext'
        vp = raw_dir / f'{n}语音.wikitext'
        data = parse_char(cp)
        data['voice'] = parse_voice(vp) if vp.exists() else {'items': [], 'count': 0}
        (outdir / f'{n}.json').write_text(
            json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
        print(f'== {n}: info={len(data["info"])} 命座={len(data["constellations"])} '
              f'故事={len(data["stories"])} 天赋块={len(data["talents"])} '
              f'语音={data["voice"]["count"]} -> {outdir / (n + ".json")}')


if __name__ == '__main__':
    main(sys.argv)
