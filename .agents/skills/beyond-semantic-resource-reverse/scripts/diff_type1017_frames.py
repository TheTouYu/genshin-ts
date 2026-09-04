#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
diff_type1017_frames.py — 从 type1017 帧序列中做“同一资产逐帧结构差分”。

目标:
  即使一次抓包包含多个变更，也能按 assetId 还原“帧与帧之间改了哪些字段”，
  从而把包序列当作 IPC 差分源。

字段号链（v1.1，2026-09-05 票04 UI 差分轮）:
  位置路径（如 [1][2][0][2][3][2]）随解析树形态变化会错位（msg↔bytes 翻转、
  槽位增删），语义标注需要每层“真实字段号 + 组内序号”。
  每条 change 追加第 4/5 元素 chain：
    CHANGE:   [kind, path, old, new, chain]
    ADD/REMOVE:[kind, path, payload, chain]
  chain = [[fieldA, fieldB, idx], ...]：按消息层从根到叶；fieldA==fieldB 表示两侧
  同字段号（直接用 fieldA），不同 = 该层发生了字段错位（结构重排信号）。

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


def _chain_step(node_a, node_b, idx):
    """chain 一步：两侧同字段号用单值，不同保留两侧（错位信号）。"""
    fa = node_a[0] if node_a is not None else None
    fb = node_b[0] if node_b is not None else None
    return [fa, fb, idx]


def diff_fields(la, lb, path, chain, out):
    """la/lb = 同一消息层的字段列表（元素 = [f,w,v] 节点）。"""
    for i in range(max(len(la), len(lb))):
        p = f'{path}[{i}]'
        if i >= len(la):
            out.append(['ADD', p, lb[i], chain + [_chain_step(None, lb[i], i)]])
        elif i >= len(lb):
            out.append(['REMOVE', p, la[i], chain + [_chain_step(la[i], None, i)]])
        else:
            if la[i] == lb[i]:
                continue
            diff_node(la[i], lb[i], p, chain + [_chain_step(la[i], lb[i], i)], out)


def diff_node(a, b, path, chain, out):
    """a/b = 节点 [f,w,v]；逐槽比较，msg 值继续进 diff_fields。"""
    for j in range(3):
        p = f'{path}[{j}]'
        va, vb = a[j], b[j]
        if va == vb:
            continue
        if isinstance(va, list) and isinstance(vb, list):
            diff_fields(va, vb, p, chain, out)
        else:
            out.append(['CHANGE', p, va, vb, chain])


def diff(a, b, path='', chain=None, out=None):
    """保持 v1 位置路径语义的树差分；chain 记录 msg 层字段号链。"""
    changes = [] if out is None else out
    diff_fields(a, b, path, chain if chain is not None else [], changes)
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
