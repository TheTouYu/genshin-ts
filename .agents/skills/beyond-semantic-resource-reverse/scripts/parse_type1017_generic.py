#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parse_type1017_generic.py — 通用 type1017 目录/定义解析（探索型）。

背景:
  既有 parse_official_copy_pcap.py 按“状态/效果”假设解析 type1017。
  新抓包证明 type1017 还承载“资源目录 + 预制体/实体完整定义”：
  - 每个 top-level field1 记录 = 一页目录：
      field2 repeated = 可用资源 ID 列表（条目内 field4=ID）
      field3 repeated = 定义 blob（field1 header 带 assetId）
  - 定义 blob 有两种形态：
      field12 = 摘要（含名称、sourceEntityId/field8 等）
      field11 = 完整定义（field11 内 entry0.field2=sourceEntityId，
                 entry0 的 field6/7/8 为组件序列化，schema 未闭合）
  本脚本只做“安全提取已可确认字段”，不硬猜组件 payload 的具体 schema。

用法:
  python3 parse_type1017_generic.py <capture.pcap|decoded.bin...> --output out.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_official_copy_pcap import (  # noqa: E402
    parse_message,
    parse_pcap,
    parse_tcp,
    reassemble,
    scan_frames,
)


def find_msg(node, field):
    return [x for x in node if x[0] == field and x[1] == 'msg']


def find_var(node, field):
    for x in node:
        if x[0] == field and x[1] == 'var':
            return x[2]
    return None


def find_bytes(node, field):
    for x in node:
        if x[0] == field and x[1] == 'bytes' and isinstance(x[2], str):
            return x[2]
    return None


def get_asset_id_from_def(body):
    hdr = find_msg(body, 1)
    if not hdr:
        return None
    return find_var(hdr[0][2], 4)


def get_names_from_def(body):
    names = []
    # field12 summary entries: direct child field3 = name record
    for f12 in find_msg(body, 12):
        for sub in f12[2]:
            if sub[0] == 3 and sub[1] == 'msg':
                n = find_bytes(sub[2], 2)
                if n and n not in names:
                    names.append(n)
    # field11 full entries (entry with field2 bytes name)
    for f11 in find_msg(body, 11):
        for sub in f11[2]:
            if sub[1] != 'msg':
                continue
            n = find_bytes(sub[2], 2)
            if n and n not in names:
                names.append(n)
    return names


def get_source_entity_id(body):
    # summary: field12 -> direct child field1 msg -> field8 var
    for f12 in find_msg(body, 12):
        for sub in f12[2]:
            if sub[0] == 1 and sub[1] == 'msg':
                v = find_var(sub[2], 8)
                if v is not None:
                    return v
    # full: field11 -> entry0 -> field2 var
    for f11 in find_msg(body, 11):
        if not f11[2]:
            continue
        sub = f11[2][0]
        if sub[1] != 'msg':
            continue
        # field2 may be var (source entity) or bytes (name); prefer var
        for x in sub[2]:
            if x[0] == 2 and x[1] == 'var':
                return x[2]
    return None


def get_def_extra(body):
    """Extract small summary metadata without decoding component payloads."""
    kind_codes = []
    source_flags = []
    has_component_ref = False
    for f12 in find_msg(body, 12):
        for sub in f12[2]:
            if sub[1] != 'msg':
                continue
            # name record: field3 contains name + kindCode in field8
            if sub[0] == 3:
                k = find_var(sub[2], 8)
                if k is not None and k not in kind_codes:
                    kind_codes.append(k)
            # source record: field1 contains field2 msg {1:source,2:flag}
            if sub[0] == 1:
                for x in find_msg(sub[2], 2):
                    flag = find_var(x[2], 2)
                    if flag is not None and flag not in source_flags:
                        source_flags.append(flag)
                if find_msg(sub[2], 5):
                    has_component_ref = True
    return {
        'kindCodes': kind_codes,
        'sourceFlags': source_flags,
        'hasComponentRef': has_component_ref,
    }


def get_full_def_summary(body):
    f11 = find_msg(body, 11)
    if not f11:
        return None
    entries = f11[0][2]
    res = {
        'entryCount': len(entries),
        'entryFieldCounts': [],
        'srcField6': 0,
        'srcField7': 0,
        'srcField8': 0,
    }
    for sub in entries:
        if sub[1] != 'msg':
            continue
        e = sub[2]
        res['entryFieldCounts'].append(len(e))
        if any(x[0] == 6 and x[1] == 'msg' for x in e):
            res['srcField6'] += 1
        if any(x[0] == 7 and x[1] == 'msg' for x in e):
            res['srcField7'] += 1
        if any(x[0] == 8 and x[1] == 'msg' for x in e):
            res['srcField8'] += 1
    return res


def parse_payload(payload: bytes, frame_source: str) -> dict:
    top = parse_message(payload, 0, len(payload))
    records = []
    for rec_i, rec in enumerate(top):
        if rec[0] != 1 or rec[1] != 'msg':
            continue
        rec_body = rec[2]
        ids = []
        for f2 in find_msg(rec_body, 2):
            v = find_var(f2[2], 4)
            if v is not None:
                ids.append(v)
        defs = []
        for f3 in find_msg(rec_body, 3):
            body = f3[2]
            aid = get_asset_id_from_def(body)
            if aid is None:
                continue
            extra = get_def_extra(body)
            defs.append({
                'assetId': aid,
                'names': get_names_from_def(body),
                'sourceEntityId': get_source_entity_id(body),
                'full': get_full_def_summary(body),
                **extra,
            })
        records.append({
            'recordIndex': rec_i,
            'availableCount': len(ids),
            'availableIds': ids,
            'definitions': defs,
        })
    return {'source': frame_source, 'records': records}


def collect_pcap(pcap: Path, dump_dir: Path | None = None) -> list[bytes]:
    linktype, packets = parse_pcap(pcap)
    flows = {}
    for pkt in packets:
        r = parse_tcp(pkt, linktype)
        if not r:
            continue
        key, seq, flags, payload = r
        flows.setdefault(key, []).append((seq, flags, payload))
    out = []
    for key, segs in flows.items():
        data = reassemble(segs)
        for _, _, typ, _, _, payload in scan_frames(data):
            if typ == 1017:
                out.append(payload)
    if dump_dir is not None and out:
        dump_dir.mkdir(parents=True, exist_ok=True)
        for i, payload in enumerate(out):
            (dump_dir / f'frame_{i:03d}_len{len(payload)}.bin').write_bytes(payload)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('inputs', nargs='+', type=Path)
    ap.add_argument('--output', type=Path, required=True)
    ap.add_argument('--dump-dir', type=Path, default=None)
    args = ap.parse_args()

    frames = []
    for path in args.inputs:
        if path.is_dir():
            dump_files = sorted(path.glob('frame_*.bin'))
            for i, fp in enumerate(dump_files):
                frames.append(parse_payload(fp.read_bytes(), f'{fp.name}:cache{i}'))
        elif path.suffix == '.pcap':
            payloads = collect_pcap(path, dump_dir=args.dump_dir)
            for i, payload in enumerate(payloads):
                frames.append(parse_payload(payload, f'{path.name}:frame{i}'))
        else:
            payload = path.read_bytes()
            frames.append(parse_payload(payload, path.name))

    all_ids: dict[int, int] = {}
    defs: dict[int, dict] = {}
    sources: dict[int, dict[int, list[str]]] = {}
    for frame in frames:
        for rec in frame['records']:
            for sid in rec['availableIds']:
                all_ids[sid] = all_ids.get(sid, 0) + 1
            for d in rec['definitions']:
                aid = d['assetId']
                ent = defs.setdefault(aid, {
                    'assetId': aid,
                    'names': [],
                    'sourceEntityIds': [],
                    'kindCodes': [],
                    'sourceFlags': [],
                    'hasComponentRef': False,
                    'fullCount': 0,
                    'summaryCount': 0,
                })
                for n in d['names']:
                    if n not in ent['names']:
                        ent['names'].append(n)
                if d['sourceEntityId'] is not None and d['sourceEntityId'] not in ent['sourceEntityIds']:
                    ent['sourceEntityIds'].append(d['sourceEntityId'])
                for k in d['kindCodes']:
                    if k not in ent['kindCodes']:
                        ent['kindCodes'].append(k)
                for f in d['sourceFlags']:
                    if f not in ent['sourceFlags']:
                        ent['sourceFlags'].append(f)
                if d['hasComponentRef']:
                    ent['hasComponentRef'] = True
                if d['full']:
                    ent['fullCount'] += 1
                else:
                    ent['summaryCount'] += 1
                if d['sourceEntityId'] is not None:
                    src = d['sourceEntityId']
                    bucket = sources.setdefault(src, {})
                    names = bucket.setdefault(aid, [])
                    for n in ent['names']:
                        if n not in names:
                            names.append(n)

    out = {
        'schemaVersion': 1,
        'title': 'Beyond type1017 generic catalog (exploratory)',
        'method': 'HAblp type1017 -> protobuf; extracts available ID list + definition summaries; field11 full blob shape logged but schema open',
        'frames': len(frames),
        'availableIdCount': len(all_ids),
        'availableIds': sorted(all_ids),
        'definitions': sorted(defs.values(), key=lambda x: x['assetId']),
        'sourceEntityIndex': [
            {
                'sourceEntityId': src,
                'assets': [
                    {'assetId': aid, 'names': names}
                    for aid, names in sorted(assets.items())
                ],
            }
            for src, assets in sorted(sources.items())
        ],
        'openItems': [
            'field11 full definition contains component-serialized payload (field6/7/8) whose component-type schema is not yet decoded.',
            'Definition names present in IPC are local display labels; they may be TextMap-resolvable via official entity nameTextMapHash.',
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'frames={len(frames)} availableIds={len(all_ids)} definitions={len(defs)}')
    print(f'wrote {args.output}')


if __name__ == '__main__':
    main()
