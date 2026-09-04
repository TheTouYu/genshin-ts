#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_ui_instance_name_table.py — 从真实 .gil 的 root9 记录提取“ID → 名称/类型/parent”表。

背景:
  type1017 IPC 只对部分 UI 定义下发显示名（ui_probe.generic.json 约 107/134 条有名字），
  导致 annotate_frame_diff.py 输出大量无名 ID（如 1861/1869-1872/1893/1908/1910/1841）。
  GIL root9 记录内自带名称（f505→f12→f501 UTF-8），相邻 before/after 快照是权威补充源。

用法:
  python3 build_ui_instance_name_table.py <after.gil> --output resources/ui_instance_name_table.json
  交叉核对（records 应与下面命令输出逐字段一致）:
    npx tsx tools/wire-inspect.ts <after.gil> --list --json

解析口径 = tools/wire-inspect.ts parseRec 的同构移植（运行后必须与 TS 输出交叉核对）:
  - GIL = 20B 头 + wire 消息 + 尾部 4B（与 wire-inspect.ts 相同假设）
  - root9 = 顶层 field9 的 len-delimited 内容；其内每个 field502 = 一条记录
  - 记录字段: f501=id(varint), f504=parent(varint),
               f505(msg) → f12(msg) → f501(bytes) = UTF-8 名称,
               f502(msg) 槽内子字段 f502(varint) = type 码集合
  - size = 记录原始字节长（含 tag/长度前缀，与 wire-inspect 同口径）

只读工具，不修改任何 .gil。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_official_copy_pcap import parse_message, read_varint  # noqa: E402

GIL_HEADER = 20
GIL_TRAILER = 4
HEX_CHARS = set('0123456789abcdefABCDEF ')


def is_hexlike(s: str) -> bool:
    return bool(s) and all(c in HEX_CHARS for c in s)


def raw_walk_fields(data: bytes, start: int, end: int):
    """低层 wire 遍历：只取 len-delimited 内容的原始切片，其它 wire 正确跳过。"""
    out = []
    pos = start
    while pos < end:
        key, pos = read_varint(data, pos)
        wire = key & 7
        field = key >> 3
        if wire == 0:
            _, pos = read_varint(data, pos)
        elif wire == 1:
            pos += 8
        elif wire == 5:
            pos += 4
        elif wire == 2:
            length, pos = read_varint(data, pos)
            seg = data[pos:pos + length]
            pos += length
            out.append((field, seg))
        else:
            raise ValueError(f'未知 wire type {wire} (field {field}) @ {pos}')
    return out


def root9_record_slices(data: bytes):
    """返回 (record_raw_bytes, root9_top_summary)；解析假设失败时给诊断信息。"""
    if len(data) < GIL_HEADER + GIL_TRAILER:
        raise ValueError(f'.gil 过小({len(data)}B)，无法按 {GIL_HEADER}+{GIL_TRAILER} 布局解析')
    payload = data[GIL_HEADER:len(data) - GIL_TRAILER]
    top = raw_walk_fields(payload, 0, len(payload))
    root9 = [seg for f, seg in top if f == 9]
    if not root9:
        top_desc = ', '.join(f'f{f}' for f, _ in top[:20]) or '(空)'
        raise ValueError(f'顶层无 root9(field9 len-delimited)；实际顶层字段: {top_desc}')
    section = raw_walk_fields(root9[0], 0, len(root9[0]))
    recs = [seg for f, seg in section if f == 502]
    return recs, top


def type_codes_of(m):
    """镜像 wire-inspect.typeCodesOf：记录 f502 槽内子字段 f502 varint 列表。"""
    out = []
    for f in m:
        if f[0] != 502 or f[1] != 'msg':
            continue
        for s in f[2]:
            if s[0] == 502 and s[1] == 'var':
                out.append(s[2])
    return out


def name_of(m):
    """镜像 wire-inspect.nameOf：f505(msg) → f12(msg) → f501(bytes)=UTF-8 名称。"""
    for f in m:
        if f[0] != 505 or f[1] != 'msg':
            continue
        for s in f[2]:
            if s[0] != 12 or s[1] != 'msg':
                continue
            for s2 in s[2]:
                if s2[0] == 501 and s2[1] == 'bytes' and isinstance(s2[2], str):
                    t = s2[2]
                    if 0 < len(t) < 80 and not is_hexlike(t):
                        return t
    return ''


def parse_rec(rec_bytes: bytes) -> dict:
    """镜像 wire-inspect.parseRec；size = 记录原始字节长。"""
    m = parse_message(rec_bytes, 0, len(rec_bytes)) or []
    id_field = next((x for x in m if x[0] == 501 and x[1] == 'var'), None)
    parent_field = next((x for x in m if x[0] == 504 and x[1] == 'var'), None)
    return {
        'id': id_field[2] if id_field is not None else None,
        'name': name_of(m),
        'types': type_codes_of(m),
        'parent': parent_field[2] if parent_field is not None else None,
        'size': len(rec_bytes),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('gil', type=Path, help='真实 .gil 快照（只读）')
    ap.add_argument('--output', type=Path, required=True)
    args = ap.parse_args()

    data = args.gil.read_bytes()
    rec_slices, top_fields = root9_record_slices(data)

    records = []
    for seg in rec_slices:
        records.append(parse_rec(seg))
    records.sort(key=lambda r: (r['id'] is None, r['id'] if r['id'] is not None else 0))

    named = [r for r in records if r['name']]
    unnamed = [r['id'] for r in records if not r['name'] and r['id'] is not None]

    out = {
        'schemaVersion': 1,
        'title': 'Beyond GIL root9 记录名称表（id/name/type codes/parent/size）',
        'source': str(args.gil),
        'gilLayout': f'{GIL_HEADER}B header + wire msg + {GIL_TRAILER}B trailer (wire-inspect 同口径)',
        'topFieldSample': sorted({f for f, _ in top_fields}),
        'recordCount': len(records),
        'records': records,
        'stats': {
            'named': len(named),
            'unnamedCount': len(unnamed),
            'unnamedIds': unnamed,
        },
        'openItems': [
            '名称提取路径 = f505→f12→f501（wire-inspect 同款）；名字不在该路径的记录会落到 unnamed，'
            '需与 IPC catalog 或其它结构交叉（见 ui/mappings.md 轮48：部分容器名在记录内其它结构）。',
            'root9 同时承载素材段/布局段/控件段；角色区分（layout/container/material/control）'
            '不在此表，由消费方按 type 码与 parent 语义标注。',
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'records={len(records)} named={len(named)} unnamed={len(unnamed)}')
    print(f'wrote {args.output}')
    if unnamed:
        print('unnamed ids: ' + ', '.join(str(i) for i in unnamed))


if __name__ == '__main__':
    main()
