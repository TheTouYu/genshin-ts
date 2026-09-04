#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parse_type1017_full_components.py — 从 type1017 完整 field11 中提取组件/节点/能力槽。

适用:
  已用 summarize_hablp_pcap.py --dump-1017-dir 缓存了 type1017 payload，
  或已有单个/多个解码后的 .bin 文件。

用法:
  python3 parse_type1017_full_components.py \
    <cache目录> --asset 1077936129 --output out.json

输出结构:
  assetId / sourceEntityId / kindCode / frames /
  groups.field6|field7|field8（每个条目含 typeId 与负载字段描述）
"""
from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_official_copy_pcap import parse_message  # noqa: E402


def find_full_defs(payload: bytes, asset_id: int) -> list[dict]:
    """返回 payload 中 assetId 匹配且带 field11 的定义体。"""
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
            if aid != asset_id:
                continue
            if not any(x[0] == 11 and x[1] == 'msg' for x in body):
                continue
            out.append(body)
    return out


def describe_field(f, w, v) -> str:
    if w == 'var':
        return f'f{f}={v}'
    if w == 'fixed32':
        try:
            val = struct.unpack('<f', bytes.fromhex(v))[0]
        except Exception:
            val = None
        return f'f{f}=f32({val:g})' if val is not None else f'f{f}=w5'
    if w == 'fixed64':
        return f'f{f}=w6'
    if w == 'bytes' and isinstance(v, str):
        stripped = v.replace(' ', '')
        if stripped and all(c in '0123456789abcdefABCDEF' for c in stripped):
            return f'f{f}=bytes[{len(v)}]'
        if v:
            return f'f{f}="{v}"'
        return f'f{f}=empty'
    if w == 'msg':
        return f'f{f}=msg<{len(v)}>'
    return f'f{f}=?{w}'


def decode_body(body: dict | None) -> dict | None:
    if body is None:
        return None
    f11 = [x for x in body if x[0] == 11 and x[1] == 'msg']
    if not f11:
        return None
    entries = f11[0][2]
    entry0 = entries[0][2]
    out: dict = {
        'assetId': None,
        'sourceEntityId': None,
        'groups': {},
    }
    for x in entry0:
        if x[0] == 1 and x[1] == 'var':
            out['assetId'] = x[2]
        if x[0] == 2 and x[1] == 'var':
            out['sourceEntityId'] = x[2]
    for grp in (6, 7, 8):
        items = [x for x in entry0 if x[0] == grp and x[1] == 'msg']
        arr = []
        for i, item in enumerate(items):
            e = item[2]
            tid = None
            for f, w, v in e:
                if f == 1 and w == 'var':
                    tid = v
                    break
            payload = []
            for f, w, v in e:
                if f == 1 and w == 'var':
                    continue
                payload.append(describe_field(f, w, v))
            arr.append({'index': i, 'typeId': tid, 'payload': payload})
        out['groups'][f'field{grp}'] = arr
    if len(entries) >= 3 and entries[2][1] == 'msg':
        out['entry2Preview'] = []
        for f, w, v in entries[2][2]:
            if w == 'var':
                out['entry2Preview'].append(f'f{f}={v}')
            elif w == 'msg':
                sub = []
                for ff, ww, vv in v:
                    if ww in ('fixed64', 'var') or (ww == 'bytes' and isinstance(vv, str)):
                        sub.append(describe_field(ff, ww, vv))
                    elif ww == 'bytes':
                        sub.append(f'f{ff}=bytes')
                out['entry2Preview'].append(f'f{f}{{ {" ".join(sub)} }}')
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('inputs', nargs='+', type=Path)
    ap.add_argument('--asset', type=int, required=True)
    ap.add_argument('--output', type=Path, required=True)
    args = ap.parse_args()

    files: list[Path] = []
    for path in args.inputs:
        if path.is_dir():
            files.extend(sorted(path.glob('frame_*.bin')))
        else:
            files.append(path)

    defs = []
    frames = []
    for fp in files:
        payload = fp.read_bytes()
        hits = find_full_defs(payload, args.asset)
        for d in hits:
            dec = decode_body(d)
            if dec:
                dec['frame'] = fp.name
                defs.append(dec)
                frames.append(fp.name)

    if not defs:
        print(f'no full field11 definition found for asset {args.asset}')
        raise SystemExit(2)

    # 合并多个帧（同一个资产通常多个帧内容一致；取第一帧结构，保留帧列表）
    first = defs[0].copy()
    first['frames'] = sorted(set(frames))
    out = {
        'schemaVersion': 1,
        'title': 'Beyond type1017 full field11 component slot decoder',
        'assetId': args.asset,
        'sourceEntityId': first.get('sourceEntityId'),
        'frames': first.get('frames'),
        'groups': first.get('groups', {}),
        'entry2Preview': first.get('entry2Preview'),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'wrote {args.output}')
    print(f'frames with full def: {len(frames)}')
    for grp, arr in out['groups'].items():
        print(f'{grp}: {len(arr)} entries, typeIds={[a["typeId"] for a in arr]}')


if __name__ == '__main__':
    main()
