#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
diff_type1017_frames.py — 从 type1017 帧序列中做“同一资产逐帧结构差分”。

目标:
  即使一次抓包包含多个变更，也能按 assetId 还原“帧与帧之间改了哪些字段”，
  从而把包序列当作 IPC 差分源。

用法:
  python3 diff_type1017_frames.py <cache目录> --output diff.json
  python3 diff_type1017_frames.py <cache目录> --asset 1077936129 --output diff.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_official_copy_pcap import parse_message  # noqa: E402


def is_hexlike(s: str) -> bool:
    t = s.replace(' ', '')
    return bool(t) and all(c in '0123456789abcdefABCDEF' for c in t)


def norm_node(node):
    out = []
    for f, w, v in node:
        if w == 'msg':
            out.append([f, 'msg', norm_node(v)])
        elif w == 'var':
            out.append([f, 'var', v])
        elif w == 'fixed32':
            out.append([f, 'fixed32', v])
        elif w == 'fixed64':
            out.append([f, 'fixed64', v])
        elif w == 'bytes':
            if isinstance(v, str) and v and not is_hexlike(v):
                out.append([f, 'str', v])
            else:
                out.append([f, 'bytes', v if isinstance(v, str) else v.hex(' ')])
        else:
            out.append([f, w, v])
    return out


def diff(a, b, path=''):
    changes = []
    if isinstance(a, list) and isinstance(b, list):
        for i in range(max(len(a), len(b))):
            p = f'{path}[{i}]'
            if i >= len(a):
                changes.append(['ADD', p, b[i]])
            elif i >= len(b):
                changes.append(['REMOVE', p, a[i]])
            else:
                changes.extend(diff(a[i], b[i], p))
    elif type(a) != type(b):
        changes.append(['CHANGE', path, a, b])
    elif a != b:
        changes.append(['CHANGE', path, a, b])
    return changes


def defs_in_payload(payload: bytes):
    top = parse_message(payload, 0, len(payload))
    out = []
    for rec in top:
        if rec[0] != 1 or rec[1] != 'msg':
            continue
        for f3 in rec[2]:
            if f3[0] != 3 or f3[1] != 'msg':
                continue
            body = f3[2]
            aid = None
            for hdr in [x for x in body if x[0] == 1 and x[1] == 'msg']:
                for x in hdr[2]:
                    if x[0] == 4 and x[1] == 'var':
                        aid = x[2]
            if aid is None:
                continue
            out.append((aid, body))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('inputs', nargs='+', type=Path)
    ap.add_argument('--asset', type=int, default=None)
    ap.add_argument('--output', type=Path, required=True)
    args = ap.parse_args()

    files: list[Path] = []
    for path in args.inputs:
        if path.is_dir():
            files.extend(sorted(path.glob('frame_*.bin')))
        else:
            files.append(path)

    # asset -> [(frame_name, state)]
    timeline: dict[int, list[tuple[str, list]]] = {}
    for fp in files:
        payload = fp.read_bytes()
        for aid, body in defs_in_payload(payload):
            if args.asset is not None and aid != args.asset:
                continue
            timeline.setdefault(aid, []).append((fp.name, norm_node(body)))

    changes_out = []
    frame_seq_out = []
    for aid in sorted(timeline):
        seq = timeline[aid]
        frame_seq_out.append({'assetId': aid, 'frames': [f for f, _ in seq]})
        last = seq[0][1]
        for i in range(1, len(seq)):
            frame_from, state_from = seq[i - 1]
            frame_to, state_to = seq[i]
            # 列表是可变容器，deep compare via json serialization fallback
            if state_from == state_to:
                continue
            d = diff(state_from, state_to)
            if d:
                changes_out.append({
                    'assetId': aid,
                    'from': frame_from,
                    'to': frame_to,
                    'changeCount': len(d),
                    'changes': d[:200],
                    'truncated': len(d) > 200,
                })

    out = {
        'schemaVersion': 1,
        'title': 'type1017 per-asset frame diff (IPC differential from packet sequence)',
        'source': [str(x) for x in args.inputs],
        'assetCount': len(timeline),
        'frameSequence': frame_seq_out,
        'changes': changes_out,
        'openItems': [
            'Frame sequence reflects IPC messages, not necessarily one user operation per frame.',
            'Scene entity transform is NOT carried in type1017; GIL diff remains authoritative for that domain.',
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'assets={len(timeline)} frames={sum(len(v) for v in timeline.values())} changes={len(changes_out)}')
    print(f'wrote {args.output}')


if __name__ == '__main__':
    main()
