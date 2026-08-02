#!/usr/bin/env python3
"""Compare every GIL root occurrence by raw protobuf wire bytes."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

Field = tuple[int, int, int, int, int, int]


def read_varint(data: bytes, position: int, end: int) -> tuple[int, int]:
    value = 0
    shift = 0
    while position < end and shift < 70:
        byte = data[position]
        position += 1
        value |= (byte & 0x7f) << shift
        if not byte & 0x80:
            return value, position
        shift += 7
    raise ValueError('invalid varint')


def read_fields(data: bytes, start: int = 0, end: int | None = None) -> list[Field]:
    end = len(data) if end is None else end
    position = start
    result: list[Field] = []
    while position < end:
        field_start = position
        key, position = read_varint(data, position, end)
        field_number, wire_type = key >> 3, key & 7
        if field_number == 0:
            raise ValueError('field number zero')
        data_start = position
        if wire_type == 0:
            _, position = read_varint(data, position, end)
        elif wire_type == 1:
            position += 8
        elif wire_type == 2:
            length, position = read_varint(data, position, end)
            data_start = position
            position += length
        elif wire_type == 5:
            position += 4
        else:
            raise ValueError(f'unsupported wire type {wire_type}')
        if position > end:
            raise ValueError('field overruns message')
        result.append((field_number, wire_type, field_start, position, data_start, position))
    return result


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_gil(path: Path) -> tuple[bytes, bytes]:
    data = path.read_bytes()
    if len(data) < 24:
        raise ValueError(f'GIL is shorter than header + trailer: {path}')
    return data, data[20:-4]


def field_key(message: bytes, field: Field) -> tuple[int, int, int, str]:
    raw = message[field[2]:field[3]]
    return field[0], field[1], len(raw), sha256(raw)


def describe_field(message: bytes, field: Field) -> dict[str, Any]:
    raw = message[field[2]:field[3]]
    value = message[field[4]:field[5]]
    result: dict[str, Any] = {
        'fieldNumber': field[0],
        'wireType': field[1],
        'encodedBytes': len(raw),
        'valueBytes': len(value),
        'rawSha256': sha256(raw),
    }
    if field[1] == 0:
        result['presence'] = 'explicit-varint'
        result['varintValue'] = read_varint(message, field[4], field[5])[0]
    elif field[1] == 2:
        result['presence'] = 'explicit-empty-length-delimited' if not value else 'explicit-length-delimited'
    else:
        result['presence'] = 'explicit-fixed-width'
    return result


def group_fields(message: bytes) -> dict[tuple[int, int], list[Field]]:
    grouped: dict[tuple[int, int], list[Field]] = defaultdict(list)
    for field in read_fields(message):
        grouped[(field[0], field[1])].append(field)
    return grouped


def summarize_root(message: bytes) -> list[dict[str, Any]]:
    result = []
    for (number, wire_type), fields in sorted(group_fields(message).items()):
        encoded_sizes = [field[3] - field[2] for field in fields]
        value_sizes = [field[5] - field[4] for field in fields]
        result.append({
            'fieldNumber': number,
            'wireType': wire_type,
            'count': len(fields),
            'encodedBytes': sum(encoded_sizes),
            'valueBytes': sum(value_sizes),
            'emptyLengthDelimited': sum(
                wire_type == 2 and field[5] == field[4] for field in fields
            ),
            'occurrenceRawSha256': [
                sha256(message[field[2]:field[3]]) for field in fields
            ],
        })
    return result


def bounded_delta(
    before_message: bytes,
    after_message: bytes,
    before_fields: list[Field],
    after_fields: list[Field],
    limit: int,
) -> dict[str, Any]:
    before_counts = Counter(field_key(before_message, field) for field in before_fields)
    after_counts = Counter(field_key(after_message, field) for field in after_fields)
    added_keys = list((after_counts - before_counts).elements())
    removed_keys = list((before_counts - after_counts).elements())

    def describe(
        message: bytes, fields: list[Field], keys: list[tuple[int, int, int, str]]
    ) -> list[dict[str, Any]]:
        available = list(fields)
        result = []
        for key in keys[:limit]:
            index = next(i for i, field in enumerate(available) if field_key(message, field) == key)
            result.append(describe_field(message, available.pop(index)))
        return result

    return {
        'beforeRecordCount': len(before_fields),
        'afterRecordCount': len(after_fields),
        'addedCount': len(added_keys),
        'removedCount': len(removed_keys),
        'added': describe(after_message, after_fields, added_keys),
        'removed': describe(before_message, before_fields, removed_keys),
        'truncated': len(added_keys) > limit or len(removed_keys) > limit,
    }


def compare(before_path: Path, after_path: Path, max_records: int) -> dict[str, Any]:
    before_data, before_payload = load_gil(before_path)
    after_data, after_payload = load_gil(after_path)
    before_fields = read_fields(before_payload)
    after_fields = read_fields(after_payload)
    before_groups = group_fields(before_payload)
    after_groups = group_fields(after_payload)
    changed = []

    for key in sorted(set(before_groups) | set(after_groups)):
        old = before_groups.get(key, [])
        new = after_groups.get(key, [])
        old_raw = [before_payload[field[2]:field[3]] for field in old]
        new_raw = [after_payload[field[2]:field[3]] for field in new]
        if old_raw == new_raw:
            continue
        old_size = sum(len(value) for value in old_raw)
        new_size = sum(len(value) for value in new_raw)
        item: dict[str, Any] = {
            'fieldNumber': key[0],
            'wireType': key[1],
            'beforeCount': len(old),
            'afterCount': len(new),
            'beforeEncodedBytes': old_size,
            'afterEncodedBytes': new_size,
            'equalLengthContentChange': old_size == new_size and old_raw != new_raw,
        }
        if len(old) == len(new) == 1 and key[1] == 2:
            old_body = before_payload[old[0][4]:old[0][5]]
            new_body = after_payload[new[0][4]:new[0][5]]
            try:
                item['directChildDelta'] = bounded_delta(
                    old_body,
                    new_body,
                    read_fields(old_body),
                    read_fields(new_body),
                    max_records,
                )
            except ValueError as error:
                item['directChildDelta'] = {'parseable': False, 'error': str(error)}
        changed.append(item)

    return {
        'before': {
            'path': str(before_path),
            'size': len(before_data),
            'sha256': sha256(before_data),
            'payloadBytes': len(before_payload),
            'rootOccurrences': len(before_fields),
            'rootFields': summarize_root(before_payload),
        },
        'after': {
            'path': str(after_path),
            'size': len(after_data),
            'sha256': sha256(after_data),
            'payloadBytes': len(after_payload),
            'rootOccurrences': len(after_fields),
            'rootFields': summarize_root(after_payload),
        },
        'rootPresenceStable': [field[:2] for field in before_fields]
        == [field[:2] for field in after_fields],
        'changedRootFields': changed,
        'method': {
            'scope': 'GIL payload bytes [20,-4]',
            'comparison': 'every root occurrence raw encoded bytes, in wire order',
            'maxDirectChildRecordsPerSide': max_records,
            'warning': 'wire structure and recursive parseability do not prove field semantics',
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description='Compare all GIL root occurrences, including equal-length raw-byte changes.'
    )
    parser.add_argument('before', type=Path)
    parser.add_argument('after', type=Path)
    parser.add_argument('--max-records', type=int, default=20)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.max_records < 0:
        parser.error('--max-records must be non-negative')
    try:
        result = compare(args.before.expanduser().resolve(), args.after.expanduser().resolve(), args.max_records)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    text = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text)
    else:
        print(text, end='')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
