#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
annotate_frame_diff.py — 把 type1017 逐帧 diff 翻译成“步骤级”可读描述（v2 语义版）。

输入:
  --diff     diff_type1017_frames.py 的输出 JSON
  --catalog  parse_type1017_generic.py 的输出 JSON（提供 assetId -> names）
  --names    （可选）build_ui_instance_name_table.py 的输出 JSON（GIL root9 名称表，
             回填 IPC 缺失名；记录字段: id/name/types/parent/size）
  --rules    （可选）resources/ui_ipc_diff_rules.json 规则账本（当前为知识记录；
             启发式语义在代码内实现，见规则账本 r-ui-mem-*）
  --output   输出 markdown 文件

v2 语义层（2026-09-05 票04 UI 差分轮）:
  1) 名称合并：GIL root9 名（权威、全量）优先，IPC 目录名回退；
     消除“只有 ID 没名字”的缺口（默认模式保持 v1 行为，供基线回归）。
  2) 布局/容器 f503 packed 成员列表的 **追加**解码成语义动作
     （角色来自已验证 ID 集：1825 默认布局 / 1840 控件组容器 / 1845 自定义布局等，
      见 ui/mappings.md §1、ui-controls.md「布局引用规律」、ui-probe PROGRESS 语义对齐实验）。
  3) 未知结构 fail-closed：仍输出 v1 式 raw 行，并在文末统计中量化
     （raw 行数/无名资产/规则命中），供后续轮定向补规则。
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

# 已验证角色（成员列表语义；依据 ui-controls.md 布局引用规律 + ui/mappings.md §1）
# label=分组标题名, role=动作短语主语, memberKind=f503 成员
KNOWN_ROLES = {
    1073741825: {'label': '默认布局', 'role': '默认布局'},
    1073741840: {'label': '控件组容器(未入布局实例列表)', 'role': '控件组容器'},
    1073741845: {'label': '自定义布局', 'role': '自定义布局'},
}

# 已验证的“布局/容器 f503 packed 成员列表”位置：
#   v1 位置路径 [1][2][0][2][3][2]（ui-probe PROGRESS 语义对齐实验）；
#   v1.1 字段号链 = UI 记录容器 f17 → f1（记录体）→ f503（成员列表 bytes），
#   实证样本链: [[17,17,1],[1,1,0],[503,503,3]]（1840/1845 帧对，v1.1 diff 重放）。
MEMBER_LEAF_PATHS = {'[1][2][0][2][3][2]'}
MEMBER_CHAIN_SIG = ((17, 1), (1, 0), (503, 3))


def chain_sig(ch):
    """chain（第 4/5 元素）→ 归一化签名；无链返回 None。"""
    if len(ch) < 5 or not isinstance(ch[4], list):
        return None
    out = []
    for step in ch[4]:
        try:
            a, b, i = step
        except (TypeError, ValueError):
            return None
        out.append((a, i) if a == b else ((a, b), i))
    return tuple(out)


def short(v, limit=80):
    s = json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v
    return s if len(s) <= limit else s[:limit] + '…'


def decode_varint_list(hex_str):
    b = bytes.fromhex(hex_str)
    pos = 0
    out = []
    while pos < len(b):
        v = 0
        shift = 0
        start = pos
        while pos < len(b):
            byte = b[pos]
            pos += 1
            v |= (byte & 0x7f) << shift
            if not (byte & 0x80):
                break
            shift += 7
            if pos - start > 6:
                return out
        out.append(v)
    return out


def decode_varints_exact(hex_str):
    """整段必须是合法 varint 序列，否则返回 None（语义解码 fail-closed）。"""
    b = bytes.fromhex(hex_str)
    pos = 0
    out = []
    while pos < len(b):
        v = 0
        shift = 0
        n = 0
        while pos < len(b):
            byte = b[pos]
            pos += 1
            n += 1
            v |= (byte & 0x7f) << shift
            if not (byte & 0x80):
                break
            shift += 7
            if n > 10:
                return None
        out.append(v)
    return out if pos == len(b) else None


def chain_breadcrumb(chain):
    """字段号链 → 可读位置：f17→f1→f505#4→f12→f501。
    ADD/REMOVE 单侧字段（None）取有效侧；错位步（两侧字段号不同）显示 (fA|fB)。"""
    if not chain:
        return None
    parts = []
    for step in chain:
        if not isinstance(step, (list, tuple)) or len(step) != 3:
            return None
        a, b, i = step
        if a is None:
            a = b
        if b is None:
            b = a
        if a == b:
            parts.append(f'f{a}' + (f'#{i}' if i else ''))
        else:
            parts.append(f'(f{a}|f{b})#{i}')
    return '→'.join(parts)


def chain_of(change):
    """ADD/REMOVE 链在第 4 位，CHANGE 链在第 5 位（v1.1 输出格式）。"""
    k = change[0]
    if k == 'CHANGE':
        return change[4] if len(change) >= 5 else None
    return change[3] if len(change) >= 4 else None


def kind_of_v1(change, name_by_id=None, path_disp=None):
    """v1 输出（默认/回退），保持字节级兼容——回归基线与旧产物一致。
    path_disp：语义模式把位置路径换成字段号链面包屑。"""
    k = change[0]
    path = path_disp or change[1]
    payload = change[2:]
    name_by_id = name_by_id or {}
    if k == 'ADD':
        return f'新增列表项 @ {path}'
    if k == 'REMOVE':
        return f'移除列表项 @ {path}'
    # CHANGE
    old, new = payload[0], payload[1]
    if isinstance(old, str) and isinstance(new, str):
        if re.fullmatch(r'[0-9a-fA-F ]+', old) and re.fullmatch(r'[0-9a-fA-F ]+', new):
            if new.startswith(old + ' '):
                added_hex = new[len(old):].strip()
                ids = decode_varint_list(added_hex)
                if ids:
                    labels = []
                    for i in ids:
                        n = name_by_id.get(i)
                        labels.append(f'{i}' + (f'({n})' if n else ''))
                    return f'packed ID 列表追加 @ {path} (+{[short(x, 40) for x in labels]})'
                return f'字节列表追加 @ {path} (+{added_hex})'
            return f'字节变化 @ {path}'
        if path_disp:
            old_d = short(old) if old else '(空)'
            new_d = short(new) if new else '(空)'
            return f'文本变化 @ {path}: {old_d} → {new_d}'
        return f'文本变化 @ {path}: {short(old)} → {short(new)}'
    return f'字段变化 @ {path}'

def member_op(old_hex, new_hex):
    """精确解码 f503 packed 成员列表 追加/移除/替换；无法整段解码返回 None。"""
    lo, ln = decode_varints_exact(old_hex), decode_varints_exact(new_hex)
    if lo is None or ln is None:
        return None
    n = 0
    while n < min(len(lo), len(ln)) and lo[n] == ln[n]:
        n += 1
    if lo[:n] == ln[:n]:
        if len(ln) > len(lo):
            return 'append', ln[n:]
        if len(lo) > len(ln):
            return 'remove', lo[n:]
    return None


def fmt_ids(ids, name_by_id, limit=6):
    labels = []
    for i in ids[:limit]:
        nm = name_by_id.get(i)
        labels.append(f'{i}' + (f'({nm})' if nm else ''))
    tail = f' 等 {len(ids)} 个' if len(ids) > limit else ''
    return ', '.join(labels) + tail


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--diff', type=Path, required=True)
    ap.add_argument('--catalog', type=Path, required=True)
    ap.add_argument('--names', type=Path, default=None, help='GIL root9 名称表 JSON（可选）')
    ap.add_argument('--rules', type=Path, default=None, help='路径→动作规则账本 JSON（可选，知识记录）')
    ap.add_argument('--output', type=Path, required=True)
    args = ap.parse_args()

    diff = json.loads(args.diff.read_text(encoding='utf-8'))
    catalog = json.loads(args.catalog.read_text(encoding='utf-8'))

    # 名称合并：IPC（catalog）为回退，GIL root9 名称表优先
    ipc_by_id = {}
    for d in catalog.get('definitions', []):
        if d.get('names'):
            ipc_by_id[d['assetId']] = d['names'][0]
    gil_by_id = {}
    if args.names:
        names_doc = json.loads(args.names.read_text(encoding='utf-8'))
        for rec in names_doc.get('records', []):
            if rec.get('name') and rec.get('id') is not None:
                gil_by_id.setdefault(rec['id'], rec['name'])

    semantic_on = args.names is not None or args.rules is not None

    def name_label(aid):
        # 默认模式必须与 v1 逐字节一致（回归基线）：仅保留 1840 特例。
        if not semantic_on:
            if aid == 1073741840:
                return KNOWN_ROLES[aid]['label']
            return ipc_by_id.get(aid, f'<{aid}>')
        role = KNOWN_ROLES.get(aid)
        if role:
            return role['label']
        if aid in gil_by_id:
            return gil_by_id[aid]
        return ipc_by_id.get(aid, f'<{aid}>')

    def member_phrase(aid):
        role = KNOWN_ROLES.get(aid)
        return role['role'] if role else None

    # 统计（语义模式）
    tally = {'groups': 0, 'leaves': 0, 'member_append': 0, 'member_remove': 0,
             'raw_path': 0, 'unnamed_groups': []}

    lines = []
    lines.append('# type1017 逐帧差分解读（自动注释）\n')
    lines.append(f'- 来源 diff: `{args.diff}`')
    if semantic_on:
        mode_bits = []
        if args.names:
            mode_bits.append(f'名称表: `{args.names}`')
        if args.rules:
            mode_bits.append(f'规则账本: `{args.rules}`')
        lines.append('- 语义层: ' + '; '.join(mode_bits))
    lines.append(f'- 资产数: {diff.get("assetCount")}, 变更数: {len(diff.get("changes", []))}\n')

    for c in diff.get('changes', []):
        aid = c['assetId']
        lines.append(f'## ${aid} {name_label(aid)}')
        lines.append(f'- {c["from"]} → {c["to"]}')
        role = member_phrase(aid)
        for idx, ch in enumerate(c['changes'][:10]):
            k = ch[0]
            merged_names = {**ipc_by_id, **gil_by_id}
            if semantic_on:
                crumb = chain_breadcrumb(chain_of(ch))
                rendered = kind_of_v1(ch, merged_names, path_disp=('链 ' + crumb if crumb else ch[1]))
            else:
                rendered = kind_of_v1(ch, merged_names)
            is_member_leaf = (ch[1] in MEMBER_LEAF_PATHS) or (chain_sig(ch) == MEMBER_CHAIN_SIG)
            if semantic_on and role and k == 'CHANGE' and is_member_leaf:
                old, new = ch[2], ch[3]
                if isinstance(old, str) and isinstance(new, str) and \
                        re.fullmatch(r'[0-9a-fA-F ]+', old) and re.fullmatch(r'[0-9a-fA-F ]+', new):
                    op = member_op(old, new)
                    # 铁律：语义只给有样本的形态（追加已由 1840/1845 帧对验证）；
                    # 移除/替换暂无样本 → 保持 v1 raw 输出（fail-closed）。
                    if op and op[0] == 'append':
                        _, ids = op
                        rendered = f'{role} f503 成员追加: +{fmt_ids(ids, merged_names)}'
                        tally['member_append'] += 1
            lines.append(f'  - {rendered}')
            if '@ [' in rendered:
                tally['raw_path'] += 1
            tally['leaves'] += 1
        tally['groups'] += 1
        label = name_label(aid)
        if label.startswith('<') and aid not in tally['unnamed_groups']:
            tally['unnamed_groups'].append(aid)
        if c.get('truncated'):
            lines.append(f'  - ...（共 {c["changeCount"]} 条，截断显示）')
        lines.append('')

    if semantic_on:
        lines.append('# 语义化统计（自动）\n')
        lines.append(f'- 变更组: {tally["groups"]}, 展示叶子: {tally["leaves"]}')
        lines.append(f'- f503 成员追加(语义化): {tally["member_append"]}（移除/替换暂无样本，暂 raw 输出）')
        lines.append(f'- raw 路径叶子: {tally["raw_path"]}')
        if tally['unnamed_groups']:
            ids_txt = ', '.join(str(i) for i in tally['unnamed_groups'])
            lines.append(f'- 仍无名字的资产（GIL/IPC 均缺）: {ids_txt}')
        else:
            lines.append('- 仍无名字的资产: 无')
        lines.append('- 规则账本引用: 见 `ui_ipc_diff_rules.json`/`ui-ipc-diff-rules.md`（r-ui-mem-*）')
        lines.append('- fail-closed: 未命中语义的叶子按 v1 raw 输出，统计见上，供下轮补规则\n')

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text('\n'.join(lines), encoding='utf-8')
    print(f'wrote {args.output}')


if __name__ == '__main__':
    main()
