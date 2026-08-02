#!/usr/bin/env python3
"""Inspect the bounded level-variable list changed between two immutable GIL snapshots."""

import argparse
import hashlib
import json
import runpy
from pathlib import Path

WIRE = runpy.run_path(str(Path(__file__).with_name('compare-gil-root-wire.py')))
read_fields = WIRE['read_fields']
read_varint = WIRE['read_varint']
load_gil = WIRE['load_gil']


def field_value(message: bytes, field):
    if field[1] == 0:
        return read_varint(message, field[4], field[5])[0]
    return message[field[4] : field[5]]


def values(message: bytes, number: int):
    return [field_value(message, field) for field in read_fields(message) if field[0] == number]


def changed_record(before: bytes, after: bytes) -> tuple[bytes, bytes]:
    before_root5 = values(before, 5)[0]
    after_root5 = values(after, 5)[0]
    before_records = read_fields(before_root5)
    after_records = read_fields(after_root5)
    before_raw = {before_root5[field[2] : field[3]] for field in before_records}
    after_raw = {after_root5[field[2] : field[3]] for field in after_records}
    removed = [
        field for field in before_records if before_root5[field[2] : field[3]] not in after_raw
    ]
    added = [
        field for field in after_records if after_root5[field[2] : field[3]] not in before_raw
    ]
    if (
        len(removed) != 1
        or len(added) != 1
        or removed[0][0] != 1
        or added[0][0] != 1
    ):
        raise ValueError('expected exactly one rewritten root 5.1 record')
    return field_value(before_root5, removed[0]), field_value(after_root5, added[0])


def describe_entries(record: bytes) -> list[dict]:
    entries = values(values(values(record, 7)[0], 11)[0], 1)
    return [
        {
            'index': index,
            'name': values(entry, 2)[0].decode('utf-8'),
            'typeDiscriminator': values(entry, 3)[0],
            'valueBytes': len(entry),
            'rawSha256': hashlib.sha256(entry).hexdigest(),
            'field4Hex': values(entry, 4)[0].hex(),
            'field5Varint': values(entry, 5)[0],
            'field6Hex': values(entry, 6)[0].hex(),
        }
        for index, entry in enumerate(entries)
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('before', type=Path)
    parser.add_argument('after', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()

    before_file, before = load_gil(args.before)
    after_file, after = load_gil(args.after)
    old_record, new_record = changed_record(before, after)
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
        'changedRootFields': [
            left[0]
            for left, right in zip(read_fields(before), read_fields(after))
            if before[left[2] : left[3]] != after[right[2] : right[3]]
        ],
        'variableListPath': '5.1[changed].7[0].11.1[*]',
        'beforeEntries': describe_entries(old_record),
        'afterEntries': describe_entries(new_record),
        'warning': 'Bounded observed path only; discriminator and field names are not formal schema.',
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
