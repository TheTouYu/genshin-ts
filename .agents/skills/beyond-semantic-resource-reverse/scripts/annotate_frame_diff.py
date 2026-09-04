#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
annotate_frame_diff.py — 把 type1017 逐帧 diff 翻译成“步骤级”可读描述。

输入:
  --diff     diff_type1017_frames.py 的输出 JSON
  --catalog  parse_type1017_generic.py 的输出 JSON（提供 assetId -> names）
  --output   输出 markdown 文件

原理:
  已有 names 表 + 变化类型（ADD/REMOVE/CHANGE）+ 文本/字节特征，
  生成“step”列表，供人工核对/继续补语义规则。
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def short(v, limit=80):
    s = json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v
    return s if len(s) <= limit else s[:limit] + '…'


def kind_of(change):
    k = change[0]
    path = change[1]
    payload = change[2:]
    if k == 'ADD':
        return f'新增列表项 @ {path}'
    if k == 'REMOVE':
        return f'移除列表项 @ {path}'
    # CHANGE
    old, new = payload[0], payload[1]
    if isinstance(old, str) and isinstance(new, str):
        if re.fullmatch(r'[0-9a-fA-F ]+', old) and re.fullmatch(r'[0-9a-fA-F ]+', new):
            # byte list growth heuristic
            if new.startswith(old + ' '):
                added = new[len(old):].strip()
                return f'字节列表追加 @ {path} (+{added})'
            return f'字节变化 @ {path}'
        return f'文本变化 @ {path}: {short(old)} → {short(new)}'
    return f'字段变化 @ {path}'

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--diff', type=Path, required=True)
    ap.add_argument('--catalog', type=Path, required=True)
    ap.add_argument('--output', type=Path, required=True)
    args = ap.parse_args()

    diff = json.loads(args.diff.read_text(encoding='utf-8'))
    catalog = json.loads(args.catalog.read_text(encoding='utf-8'))
    name_by_id = {}
    for d in catalog.get('definitions', []):
        if d.get('names'):
            name_by_id[d['assetId']] = d['names'][0]

    lines = []
    lines.append('# type1017 逐帧差分解读（自动注释）\n')
    lines.append(f'- 来源 diff: `{args.diff}`')
    lines.append(f'- 资产数: {diff.get("assetCount")}, 变更数: {len(diff.get("changes", []))}\n')

    for c in diff.get('changes', []):
        aid = c['assetId']
        name = name_by_id.get(aid, f'<{aid}>')
        lines.append(f'## ${aid} {name}')
        lines.append(f'- {c["from"]} → {c["to"]}')
        for ch in c['changes'][:10]:
            lines.append(f'  - {kind_of(ch)}')
        if c.get('truncated'):
            lines.append(f'  - ...（共 {c["changeCount"]} 条，截断显示）')
        lines.append('')

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text('\n'.join(lines), encoding='utf-8')
    print(f'wrote {args.output}')


if __name__ == '__main__':
    main()
