#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Parse decoded type1017 catalog fragments (CN 7.0.0 / ticket 01).

This is an exploratory parser. It does NOT assume a full schema; it extracts:
  - the "available status ID list" repeated in each record
  - status definition blobs (statusId, name text, effect records found by
    EffectStateRecord-like shape: message has field1=varint effectId and field2=msg params)
Output is JSON written to the path given by --output.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

CJK_RE = re.compile(r'[\u4e00-\u9fff]')


def read_varint(data: bytes, pos: int) -> tuple[int, int]:
    value = 0
    shift = 0
    while True:
        b = data[pos]
        pos += 1
        value |= (b & 0x7F) << shift
        if not (b & 0x80):
            return value, pos
        shift += 7
        if shift > 70:
            raise ValueError('varint too long')


def try_utf8(data: bytes) -> str | None:
    try:
        text = data.decode('utf-8')
    except UnicodeDecodeError:
        return None
    if any(ord(c) < 32 and c not in '\n\r\t' for c in text):
        return None
    return text


def parse_message(data: bytes, start: int, end: int, depth: int = 0) -> list:
    out: list = []
    pos = start
    while pos < end:
        try:
            key, pos = read_varint(data, pos)
        except Exception:
            break
        field = key >> 3
        wire = key & 7
        if wire == 0:
            try:
                value, pos = read_varint(data, pos)
            except Exception:
                break
            out.append((field, 'var', value))
        elif wire == 2:
            try:
                length, pos = read_varint(data, pos)
            except Exception:
                break
            sub_start = pos
            pos += length
            sub_end = pos
            if sub_end > end:
                break
            child = None
            if depth < 12:
                child = parse_message(data, sub_start, sub_end, depth + 1)
                if not child:
                    child = None
            if child is not None:
                out.append((field, 'msg', child))
            else:
                raw = data[sub_start:sub_end]
                text = try_utf8(raw)
                out.append((field, 'bytes', text if text is not None else raw.hex(' ')))
        elif wire == 1:
            out.append((field, 'fixed64', data[pos:pos + 8].hex(' ')))
            pos += 8
        elif wire == 5:
            out.append((field, 'fixed32', data[pos:pos + 4].hex(' ')))
            pos += 4
        else:
            break
    return out


def parse_catalog_file(path: Path) -> list[dict]:
    data = path.read_bytes()
    top = parse_message(data, 0, len(data))
    records: list[dict] = []
    for item in top:
        if item[0] != 1 or item[1] != 'msg':
            continue
        cat = item[2]
        header = None
        ids: list[int] = []
        defs: list[list] = []
        for f, w, v in cat:
            if f == 1 and w == 'msg':
                header = v
            elif f == 2 and w == 'msg':
                status_id = None
                for ff, ww, vv in v:
                    if ff == 4 and ww == 'var':
                        status_id = vv
                if status_id is not None:
                    ids.append(status_id)
            elif f == 3 and w == 'msg':
                defs.append(v)
        records.append({'header': header, 'ids': ids, 'defs': defs})
    return records


def collect_text(node: list) -> list[str]:
    texts: list[str] = []
    for f, w, v in node:
        if w == 'bytes' and isinstance(v, str) and CJK_RE.search(v):
            texts.append(v)
        elif w == 'msg':
            texts.extend(collect_text(v))
    return texts


def collect_effect_ids(node: list, exclude: int | None = None) -> list[int]:
    """Collect effectId-like field-1 varints recursively.

    Within status definition blobs, effect records appear as messages whose
    field 1 is the effect id (e.g. 2010001/2060001/410001/480001). We filter
    out the status id itself and small component-type ids.
    """
    ids: list[int] = []
    for f, w, v in node:
        if f == 1 and w == 'var' and 100000 <= v <= 999999999 and v != exclude:
            ids.append(v)
        elif w == 'msg':
            ids.extend(collect_effect_ids(v, exclude=exclude))
    return ids


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('inputs', nargs='+', type=Path)
    ap.add_argument('--output', type=Path, required=True)
    args = ap.parse_args()

    available: dict[int, int] = {}
    definitions: dict[int, dict] = {}
    sources = []
    for path in sorted(args.inputs):
        sources.append(str(path))
        for rec in parse_catalog_file(path):
            for sid in rec['ids']:
                available[sid] = available.get(sid, 0) + 1
            for d in rec['defs']:
                # first msg inside def often carries statusId
                status_id = None
                for f, w, v in d:
                    if f == 1 and w == 'msg':
                        for ff, ww, vv in v:
                            if ff == 4 and ww == 'var':
                                status_id = vv
                    if f in (14, 16) and w == 'msg':
                        # try inside status object
                        for ff, ww, vv in v:
                            if ff == 1 and ww == 'msg':
                                for fff, www, vvv in vv:
                                    if fff == 1 and www == 'var':
                                        status_id = vvv
                if status_id is None:
                    continue
                texts = collect_text(d)
                effs = collect_effect_ids(d, exclude=status_id)
                entry = definitions.setdefault(status_id, {
                    'statusId': status_id,
                    'names': [],
                    'effectIds': [],
                })
                for t in texts:
                    if t not in entry['names']:
                        entry['names'].append(t)
                for e in effs:
                    if e not in entry['effectIds']:
                        entry['effectIds'].append(e)

    catalog = {
        'schemaVersion': 1,
        'title': 'Beyond type1017 status catalog (partial exploratory parse)',
        'source': 'catalog_decoded_type1017_*.bin (IPC type1017 fragments)',
        'status': 'partial-draft',
        'coverage': 'available status ID list + one custom status definition seen in fragments',
        'sources': sources,
        'availableStatusIds': sorted(available),
        'definitions': sorted(definitions.values(), key=lambda x: x['statusId']),
        'openItems': [
            'type1017 fragments only contain full definition for the custom status being edited (1077936130); '
            'official status 10100002..10100017 and 10100101..10100116 are present only as IDs, not definitions.',
            'Names for official statuses are not embedded in these fragments; need TextMap hash bridge or further capture.',
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'wrote {args.output}')


if __name__ == '__main__':
    main()
