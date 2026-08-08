#!/usr/bin/env python3
"""Inspect a bounded static-prefab material/aux delta from adjacent GIL snapshots."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

from gil_wire_lib import f32, one_root, packed_varints, record_id, records, walk


def matches(message: bytes, field: int, kind: str):
    return [value for number, wire, value in walk(message) if number == field and wire == kind]


def one(message: bytes, field: int, kind: str):
    found = matches(message, field, kind)
    if len(found) != 1:
        raise ValueError(f'expected one {field}/{kind}, found {len(found)}')
    return found[0]


def find_record(payload: bytes, root_field: int, identity: int) -> bytes:
    found = []
    for record in records(payload, root_field):
        try:
            candidate = record_id(record)
        except ValueError:
            continue
        if candidate == identity:
            found.append(record)
    if len(found) != 1:
        raise ValueError(f'expected one root {root_field} record {identity}, found {len(found)}')
    return found[0]


def slot(record: bytes, owner_field: int, slot_type: int) -> bytes:
    found = [
        value
        for value in matches(record, owner_field, 'bytes')
        if one(value, 1, 'varint') == slot_type
    ]
    if len(found) != 1:
        raise ValueError(
            f'expected one field {owner_field} slot {slot_type}, found {len(found)}'
        )
    return found[0]


def vector(message: bytes) -> list[float]:
    values = {number: f32(value) for number, kind, value in walk(message) if kind == 'fixed32'}
    return [values.get(axis, 0.0) for axis in (1, 2, 3)]


def material_summary(record: bytes, owner_field: int) -> dict:
    material = one(slot(record, owner_field, 22), 32, 'bytes')
    fields = []
    values = {}
    for number, kind, value in walk(material):
        fields.append(number)
        values[str(number)] = f32(value) if kind == 'fixed32' else value
    return {
        'fields': fields,
        'values': values,
        'rawHex': material.hex(),
        'rawSha256': hashlib.sha256(material).hexdigest(),
    }


def aux_ids(record: bytes, owner_field: int) -> list[int]:
    container = one(slot(record, owner_field, 40), 50, 'bytes')
    packed = matches(container, 501, 'bytes')
    if not packed:
        return []
    if len(packed) != 1:
        raise ValueError(f'expected at most one packed field 501, found {len(packed)}')
    return packed_varints(packed[0])


def aux_summary(section: int, record: bytes) -> dict:
    name_slot = slot(record, 4, 1)
    owner_slot = slot(record, 4, 40)
    transform_slot = slot(record, 5, 1)
    name_box = one(name_slot, 11, 'bytes')
    owner_box = one(owner_slot, 50, 'bytes')
    transform = one(transform_slot, 11, 'bytes')
    transform_fields = {number: value for number, kind, value in walk(transform) if kind == 'bytes'}
    relation = matches(record, 12, 'bytes')
    if len(relation) > 1:
        raise ValueError(f'expected at most one f12 relation, found {len(relation)}')
    relation_value = relation[0] if relation else None
    return {
        'section': section,
        'id': record_id(record),
        'resourceId': one(record, 2, 'varint'),
        'name': one(name_box, 1, 'bytes').decode('utf-8'),
        'ownerId': one(owner_box, 502, 'varint'),
        'f3': matches(record, 3, 'varint'),
        'f4SlotTypes': [one(value, 1, 'varint') for value in matches(record, 4, 'bytes')],
        'f5SlotTypes': [one(value, 1, 'varint') for value in matches(record, 5, 'bytes')],
        'transform': {
            'position': vector(transform_fields.get(1, b'')),
            'rotation': vector(transform_fields.get(2, b'')),
            'scale': vector(transform_fields.get(3, b'')),
        },
        'material': material_summary(record, 5),
        'f11Present': bool(matches(record, 11, 'bytes')),
        'f12Present': relation_value is not None,
        'f12ExplicitEmpty': relation_value == b'',
        'f12Reference': record_id(relation_value) if relation_value else None,
        'rawSha256': hashlib.sha256(record).hexdigest(),
        'rawBytes': len(record),
    }


def root22(payload: bytes) -> dict:
    message = one_root(payload, 22)
    flags = one(message, 2, 'bytes')
    return {
        'names': [value.decode('utf-8') for value in matches(message, 1, 'bytes')],
        'flagsHex': flags.hex(),
    }


def root45_colors(payload: bytes) -> list[int]:
    colors = []
    for record in records(payload, 45):
        f11 = one(record, 11, 'bytes')
        inner = one(f11, 1, 'bytes')
        colors.extend(packed_varints(one(inner, 3, 'bytes')))
    return colors


def root27_delta(before: bytes, after: bytes, maximum: int) -> dict:
    def entries(payload: bytes):
        message = one_root(payload, 27)
        return [
            (section, value)
            for section, kind, value in walk(message)
            if section in (1, 2) and kind == 'bytes'
        ]

    left, right = entries(before), entries(after)
    added = list((Counter(right) - Counter(left)).elements())
    removed = list((Counter(left) - Counter(right)).elements())
    if len(added) + len(removed) > maximum:
        raise ValueError(
            f'root 27 delta exceeds --max-aux-delta {maximum}: '
            f'added={len(added)} removed={len(removed)}'
        )
    before_raw, after_raw = one_root(before, 27), one_root(after, 27)
    return {
        'beforeCount': len(left),
        'afterCount': len(right),
        'rawEqual': before_raw == after_raw,
        'beforeSha256': hashlib.sha256(before_raw).hexdigest(),
        'afterSha256': hashlib.sha256(after_raw).hexdigest(),
        'added': [aux_summary(section, record) for section, record in added],
        'removed': [aux_summary(section, record) for section, record in removed],
    }


def root_summary(before: bytes, after: bytes) -> dict:
    left, right = walk(before), walk(after)
    left_keys = [(field, kind) for field, kind, _ in left]
    right_keys = [(field, kind) for field, kind, _ in right]
    if left_keys != right_keys:
        raise ValueError('root presence/order/wire type changed; use compare-gil-root-wire.py')
    return {
        'presenceOrderWireStable': True,
        'beforeOccurrences': len(left),
        'afterOccurrences': len(right),
        'changedFields': sorted(
            {a[0] for a, b in zip(left, right, strict=True) if a[2] != b[2]}
        ),
    }


def inspect(args) -> dict:
    before_file, after_file = args.before.read_bytes(), args.after.read_bytes()
    if len(before_file) < 24 or len(after_file) < 24:
        raise ValueError('GIL files must be at least 24 bytes')
    before, after = before_file[20:-4], after_file[20:-4]
    def_before = find_record(before, 4, args.definition_id)
    def_after = find_record(after, 4, args.definition_id)
    inst_before = find_record(before, 8, args.instance_id)
    inst_after = find_record(after, 8, args.instance_id)
    return {
        'schemaVersion': 1,
        'before': {
            'path': str(args.before.resolve()),
            'sha256': hashlib.sha256(before_file).hexdigest(),
            'size': len(before_file),
        },
        'after': {
            'path': str(args.after.resolve()),
            'sha256': hashlib.sha256(after_file).hexdigest(),
            'size': len(after_file),
        },
        'roots': root_summary(before, after),
        'host': {
            'definitionId': args.definition_id,
            'instanceId': args.instance_id,
            'definitionAuxIds': {
                'before': aux_ids(def_before, 6),
                'after': aux_ids(def_after, 6),
            },
            'instanceAuxIds': {
                'before': aux_ids(inst_before, 5),
                'after': aux_ids(inst_after, 5),
            },
            'definitionMaterial': {
                'before': material_summary(def_before, 7),
                'after': material_summary(def_after, 7),
            },
            'instanceMaterial': {
                'before': material_summary(inst_before, 6),
                'after': material_summary(inst_after, 6),
            },
        },
        'root22': {'before': root22(before), 'after': root22(after)},
        'root27': root27_delta(before, after, args.max_aux_delta),
        'root45': {
            'beforeColors': root45_colors(before),
            'afterColors': root45_colors(after),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('before', type=Path)
    parser.add_argument('after', type=Path)
    parser.add_argument('--definition-id', type=int, required=True)
    parser.add_argument('--instance-id', type=int, required=True)
    parser.add_argument('--max-aux-delta', type=int, default=10)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    try:
        result = inspect(args)
    except (ValueError, IndexError, UnicodeDecodeError) as error:
        parser.exit(1, f'error: {error}\n')
    encoded = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded)
        print(
            f'PASS changedRoots={result["roots"]["changedFields"]} '
            f'root27Added={len(result["root27"]["added"])} '
            f'root27Removed={len(result["root27"]["removed"])} '
            f'output={args.output}'
        )
    else:
        print(encoded, end='')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
