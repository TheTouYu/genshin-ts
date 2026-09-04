#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cross_check_component_types.py — 把 type1017 full field11 解析出的组件槽
与已知 GIL 组件类型映射做交叉校验。

用法:
  python3 cross_check_component_types.py \
    --components <component_probe_components.json> \
    --output <component_type_crosscheck.json>

已知映射来自 docs/game-engine-knowledge/components.md（更新知识后应同步本脚本）。
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

# type -> (名称, 配置字段, +10/+11)
KNOWN = {
    1: ('自定义变量组件', 11, '+10'),
    3: ('单位状态', 13, '+10'),
    4: ('基础运动器', 14, '+10'),
    6: ('特效播放', 16, '+10'),
    12: ('命中检测', 22, '+10'),
    13: ('物件镜头组件', 23, '+10'),
    14: ('模板自带UI不可见', 24, '+10'),
    16: ('全局计时器', 26, '+10'),
    17: ('选项卡', 27, '+10'),
    18: ('模板自带UI不可见(原误判)', 28, '+10'),
    19: ('模板自带UI不可见', 29, '+10'),
    27: ('铭牌', 38, '+11'),
    28: ('文本气泡', 39, '+11'),
    29: ('音效播放器', 40, '+11'),
    38: ('光源', 49, '+11'),
}


def config_field(payload: list[str]) -> int | None:
    for s in payload:
        m = re.match(r'^f(\d+)=', s)
        if m and int(m.group(1)) != 2:
            return int(m.group(1))
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--components', type=Path, required=True)
    ap.add_argument('--output', type=Path, required=True)
    args = ap.parse_args()

    comp = json.loads(args.components.read_text(encoding='utf-8'))
    f8 = comp.get('groups', {}).get('field8', [])
    rows = []
    seen = set()
    for a in f8:
        tid = a['typeId']
        if tid in seen:
            continue
        seen.add(tid)
        cfg = config_field(a.get('payload', []))
        name, expected_field, expected_rule = KNOWN.get(tid, (None, None, None))
        if name:
            match = 'OK' if cfg == expected_field else 'MISMATCH'
            rule = expected_rule
        else:
            if cfg is not None:
                rule = 'type+10' if cfg == tid + 10 else 'type+11' if cfg == tid + 11 else 'other'
            else:
                rule = '?'
            match = 'NEW'
        rows.append({
            'typeId': tid,
            'knownName': name,
            'ipcConfigField': cfg,
            'expectedField': expected_field,
            'rule': rule,
            'match': match,
        })

    out = {
        'schemaVersion': 1,
        'title': 'IPC type1017 vs GIL component type cross-check',
        'sourceComponents': str(args.components),
        'summary': {
            'OK': sum(1 for r in rows if r['match'] == 'OK'),
            'NEW': sum(1 for r in rows if r['match'] == 'NEW'),
            'MISMATCH': sum(1 for r in rows if r['match'] == 'MISMATCH'),
        },
        'rows': rows,
        'openItems': [
            'NEW types have config-field rule inferred from type+10/+11, names/params not yet confirmed.',
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'wrote {args.output}')
    print(out['summary'])
    for r in rows:
        if r['match'] != 'OK':
            print(f"  {r}")


if __name__ == '__main__':
    main()
