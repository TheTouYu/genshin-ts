#!/usr/bin/env python3
"""Inspect one bounded custom-camera append or rewrite between immutable GIL snapshots."""

import argparse
import hashlib
import json
import runpy
import struct
from pathlib import Path

WIRE = runpy.run_path(str(Path(__file__).with_name('compare-gil-root-wire.py')))
read_fields = WIRE['read_fields']
read_varint = WIRE['read_varint']
load_gil = WIRE['load_gil']


def value(message: bytes, field):
    if field[1] == 0:
        return read_varint(message, field[4], field[5])[0]
    return message[field[4] : field[5]]


def values(message: bytes, number: int):
    return [value(message, field) for field in read_fields(message) if field[0] == number]


def summarize_inner(inner: bytes) -> list[dict]:
    summary = []
    for field in read_fields(inner):
        item = {'field': field[0], 'wireType': field[1]}
        raw = value(inner, field)
        if field[1] == 0:
            item['varint'] = raw
        else:
            item['valueBytes'] = len(raw)
            item['hex'] = raw.hex()
            if field[1] == 5:
                item['floatLE'] = struct.unpack('<f', raw)[0]
            elif not raw:
                item['presence'] = 'explicit-empty'
        summary.append(item)
    return summary


def describe(record: bytes) -> dict:
    identity = values(record, 1)
    inner = values(record, 2)
    if len(identity) != 1 or len(inner) != 1 or len(values(inner[0], 1)) != 1:
        raise ValueError('camera candidate does not match the bounded identity/name shape')
    non_name = b''.join(
        inner[0][field[2] : field[3]] for field in read_fields(inner[0]) if field[0] != 1
    )
    return {
        'identityCandidate': identity[0],
        'nameCandidate': values(inner[0], 1)[0].decode('utf-8'),
        'recordValueBytes': len(record),
        'recordSha256': hashlib.sha256(record).hexdigest(),
        'nonNameSkeletonSha256': hashlib.sha256(non_name).hexdigest(),
        'innerFieldShape': [[field[0], field[1]] for field in read_fields(inner[0])],
        'innerFields': summarize_inner(inner[0]),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('before', type=Path)
    parser.add_argument('after', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()

    before_file, before = load_gil(args.before)
    after_file, after = load_gil(args.after)
    before_root = read_fields(before)
    after_root = read_fields(after)
    if [(x[0], x[1]) for x in before_root] != [(x[0], x[1]) for x in after_root]:
        raise ValueError('root occurrence or presence changed')

    before18 = values(before, 18)
    after18 = values(after, 18)
    if len(before18) != 1 or len(after18) != 1:
        raise ValueError('expected one root 18 occurrence per snapshot')
    before_records = values(before18[0], 1)
    after_records = values(after18[0], 1)
    removed = [record for record in before_records if record not in set(after_records)]
    added = [record for record in after_records if record not in set(before_records)]
    if (len(removed), len(added)) not in {(0, 1), (1, 1)}:
        raise ValueError('expected exactly one root 18.1 append or rewrite')

    operation = 'append' if not removed else 'rewrite'
    if operation == 'rewrite' and describe(removed[0])['identityCandidate'] != describe(added[0])['identityCandidate']:
        raise ValueError('rewritten record identity changed')
    changed = [
        left[0]
        for left, right in zip(before_root, after_root)
        if before[left[2] : left[3]] != after[right[2] : right[3]]
    ]
    result = {
        'before': {
            'path': str(args.before),
            'sha256': hashlib.sha256(before_file).hexdigest(),
            'size': len(before_file),
        },
        'after': {
            'path': str(args.after),
            'sha256': hashlib.sha256(after_file).hexdigest(),
            'size': len(after_file),
        },
        'changedRootFields': changed,
        'cameraRecordPath': '18.1[*]',
        'operation': operation,
        'recordCounts': [len(before_records), len(after_records)],
        'removed': [describe(record) for record in removed],
        'added': [describe(record) for record in added],
        'warning': 'Bounded observed path only; root and nested field names are not formal schema.',
    }
    text = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text)
    else:
        print(text, end='')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (IndexError, UnicodeDecodeError, ValueError) as error:
        raise SystemExit(f'error: {error}')
