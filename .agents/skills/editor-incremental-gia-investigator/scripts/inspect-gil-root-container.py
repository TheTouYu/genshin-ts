#!/usr/bin/env python3
"""Inspect a single root container's direct child records across two GIL snapshots.

Read-only: parses GIL payload bytes [20,-4], compares the direct child records of one
root field, and decodes the unique added/removed/changed records to depth 2
(field number / wire type / varint / fixed32 / UTF-8 summary).

Fails (non-zero exit) when:
  - before and after are identical, or the root field has no direct child records;
  - the record-set diff is not unique (more than one added+removed pair);
  - the requested root field is absent from either side.
"""
from __future__ import annotations

import hashlib
import json
import struct
import sys
from pathlib import Path


def varint(data, pos=0):
    r = 0
    shift = 0
    while True:
        b = data[pos]
        pos += 1
        r |= (b & 0x7F) << shift
        if not b & 0x80:
            return r, pos
        shift += 7


def fields(data):
    out = []
    pos = 0
    while pos < len(data):
        tag, pos = varint(data, pos)
        f, wt = tag >> 3, tag & 7
        if wt == 0:
            v, pos = varint(data, pos)
            out.append((f, wt, v))
        elif wt == 2:
            ln, pos = varint(data, pos)
            out.append((f, wt, data[pos:pos + ln]))
            pos += ln
        elif wt == 5:
            out.append((f, wt, data[pos:pos + 4]))
            pos += 4
        elif wt == 1:
            out.append((f, wt, data[pos:pos + 8]))
            pos += 8
        else:
            out.append((f, wt, b'?'))
            pos += 1
    return out


def payload(path):
    return open(path, 'rb').read()[20:-4]


def child_records(p, root_field):
    for f, wt, v in fields(p):
        if f == root_field and wt == 2:
            return [v2 for f2, wt2, v2 in fields(v) if f2 == 1]
    return None  # root field absent


def summarize(record, depth=2):
    out = []
    for f, wt, v in fields(record):
        if wt == 0:
            out.append({'field': f, 'wire': 'varint', 'value': v})
        elif wt == 2:
            entry = {'field': f, 'wire': 'bytes'}
            try:
                text = v.decode('utf-8')
                if text and all(ord(c) >= 32 for c in text):
                    entry['utf8'] = text
                    out.append(entry)
                    continue
            except UnicodeDecodeError:
                pass
            if depth > 1:
                try:
                    sub = summarize(v, depth - 1)
                    if sub:
                        entry['fields'] = sub
                        out.append(entry)
                        continue
                except Exception:
                    pass
            entry['hex'] = v.hex()
            out.append(entry)
        elif wt == 5:
            out.append({'field': f, 'wire': 'fixed32', 'hex': v.hex(),
                        'float': struct.unpack('<f', v)[0]})
        elif wt == 1:
            out.append({'field': f, 'wire': 'fixed64', 'hex': v.hex()})
        else:
            out.append({'field': f, 'wire': f'wt{wt}', 'hex': v.hex()})
    return out


def main() -> int:
    if len(sys.argv) != 4:
        print(f'usage: {Path(sys.argv[0]).name} <before.gil> <after.gil> <rootField>',
              file=sys.stderr)
        return 2
    before, after = (Path(x) for x in sys.argv[1:3])
    try:
        root_field = int(sys.argv[3])
    except ValueError:
        print('error: rootField must be an integer', file=sys.stderr)
        return 2

    pb, pa = payload(before), payload(after)
    if pb == pa:
        print('error: before and after payloads are identical', file=sys.stderr)
        return 1

    rb = child_records(pb, root_field)
    ra = child_records(pa, root_field)
    if rb is None or ra is None:
        print(f'error: root field {root_field} absent from one side '
              f'(before={"yes" if rb is not None else "no"}, '
              f'after={"yes" if ra is not None else "no"})', file=sys.stderr)
        return 1
    if not rb and not ra:
        print(f'error: root field {root_field} has no direct child records on either side',
              file=sys.stderr)
        return 1

    removed = [r for r in rb if r not in ra]
    added = [r for r in ra if r not in rb]
    if len(added) > 1 or len(removed) > 1 or (len(added) + len(removed)) == 0:
        reason = ('no change' if not added and not removed
                  else f'added={len(added)} removed={len(removed)}')
        print(f'error: record-set diff not unique ({reason})', file=sys.stderr)
        return 1

    result = {
        'rootField': root_field,
        'beforeRecords': len(rb),
        'afterRecords': len(ra),
        'added': [{'size': len(r), 'sha256': hashlib.sha256(r).hexdigest()[:16],
                   'fields': summarize(r)} for r in added],
        'removed': [{'size': len(r), 'sha256': hashlib.sha256(r).hexdigest()[:16],
                     'fields': summarize(r)} for r in removed],
        'warning': 'wire structure and recursive parseability do not prove field semantics',
    }
    print(json.dumps(result, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
