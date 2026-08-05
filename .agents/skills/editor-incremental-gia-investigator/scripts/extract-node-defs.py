#!/usr/bin/env python3
"""从第三方仓库 data.json 提取官方节点定义（名称/属性/控制流/数据引脚）。

用法:
  python extract-node-defs.py <data.json> [--list]
  python extract-node-defs.py <data.json> <id1> [id2 ...]
输出:
  --list 时: 全部节点 ID + Identifier + 中文名（制表符分隔）
  指定 ID 时: 每节点一行 JSON: ID / Identifier / InGameName / System / Domain / Type
              / FlowPins(Identifier, Direction, ShellIndex, KernelIndex)
              / DataPins(Identifier, Direction, Type, ShellIndex, KernelIndex, Label)
用途: 与 inspect-graph-nodes.py 的实例解码对照，验证编辑器配置的节点参数顺序。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2:
        print(f'usage: {Path(sys.argv[0]).name} <data.json> [--list | id ...]', file=sys.stderr)
        return 2
    data = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    nodes = data['Nodes']
    args = sys.argv[2:]
    if '--list' in args:
        for n in sorted(nodes, key=lambda x: x['ID']):
            name = n.get('InGameName', {}).get('zh-Hans', '')
            print(f"{n['ID']}\t{n['Identifier']}\t{name}")
        return 0
    want = [int(a) for a in args if a.lstrip('-').isdigit()]
    if not want:
        print(f'usage: {Path(sys.argv[0]).name} <data.json> [--list | id ...]', file=sys.stderr)
        return 2
    for n in nodes:
        if n['ID'] not in want:
            continue
        flow = [{'Identifier': p.get('Identifier'), 'Direction': p.get('Direction'),
                 'ShellIndex': p.get('ShellIndex'), 'KernelIndex': p.get('KernelIndex')}
                for p in n.get('FlowPins', [])]
        data_pins = [{'Identifier': p.get('Identifier'), 'Direction': p.get('Direction'),
                      'Type': p.get('Type'), 'ShellIndex': p.get('ShellIndex'),
                      'KernelIndex': p.get('KernelIndex'),
                      'Label': p.get('Label', {}).get('zh-Hans')}
                     for p in n.get('DataPins', [])]
        print(json.dumps({
            'ID': n['ID'],
            'Identifier': n.get('Identifier'),
            'InGameName': n.get('InGameName', {}).get('zh-Hans'),
            'System': n.get('System'),
            'Domain': n.get('Domain'),
            'Type': n.get('Type'),
            'FlowPins': flow,
            'DataPins': data_pins,
        }, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
