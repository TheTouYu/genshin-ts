#!/usr/bin/env python3
"""Shared minimal protobuf-wire helpers for GIL snapshot investigation scripts.

Extracted from repeated per-experiment decoding (nameplate-component exp1..14).
Field numbers are evidence-bounded, not a formal schema.
"""

from __future__ import annotations

import hashlib
import struct
from pathlib import Path


def walk(buf: bytes):
    """Minimal protobuf wire walker (varint / length-delimited / fixed32 / fixed64).

    Returns a list of (field_number, 'varint'|'bytes'|'fixed32'|'fixed64', value)
    preserving occurrence order (repeated fields appear multiple times).
    """
    out = []
    i = 0
    n = len(buf)
    while i < n:
        tag = 0
        shift = 0
        while True:
            b = buf[i]
            i += 1
            tag |= (b & 0x7F) << shift
            shift += 7
            if not (b & 0x80):
                break
        field, wire = tag >> 3, tag & 7
        if wire == 0:
            v = 0
            shift = 0
            while True:
                b = buf[i]
                i += 1
                v |= (b & 0x7F) << shift
                shift += 7
                if not (b & 0x80):
                    break
            out.append((field, 'varint', v))
        elif wire == 2:
            ln = 0
            shift = 0
            while True:
                b = buf[i]
                i += 1
                ln |= (b & 0x7F) << shift
                shift += 7
                if not (b & 0x80):
                    break
            sub = buf[i:i + ln]
            i += ln
            out.append((field, 'bytes', sub))
        elif wire == 5:
            out.append((field, 'fixed32', int.from_bytes(buf[i:i + 4], 'little')))
            i += 4
        elif wire == 1:
            out.append((field, 'fixed64', int.from_bytes(buf[i:i + 8], 'little')))
            i += 8
        else:
            raise ValueError(f'unsupported wire type {wire}')
    return out


def root_field1_records(payload: bytes, root_field: int):
    """Yield direct field-1 length-delimited records of a root field occurrence."""
    i = 0
    while i < len(payload):
        tag = 0
        shift = 0
        while True:
            b = payload[i]
            i += 1
            tag |= (b & 0x7F) << shift
            shift += 7
            if not (b & 0x80):
                break
        field, wire = tag >> 3, tag & 7
        if wire == 2:
            ln = 0
            shift = 0
            while True:
                b = payload[i]
                i += 1
                ln |= (b & 0x7F) << shift
                shift += 7
                if not (b & 0x80):
                    break
            sub = payload[i:i + ln]
            i += ln
            if field == root_field:
                j = 0
                while j < len(sub):
                    t2 = 0
                    s2 = 0
                    while True:
                        b = sub[j]
                        j += 1
                        t2 |= (b & 0x7F) << s2
                        s2 += 7
                        if not (b & 0x80):
                            break
                    f2, w2 = t2 >> 3, t2 & 7
                    if w2 == 2:
                        l2 = 0
                        s2 = 0
                        while True:
                            b = sub[j]
                            j += 1
                            l2 |= (b & 0x7F) << s2
                            s2 += 7
                            if not (b & 0x80):
                                break
                        r = sub[j:j + l2]
                        j += l2
                        if f2 == 1:
                            yield r
                    elif w2 == 0:
                        v = 0
                        s2 = 0
                        while True:
                            b = sub[j]
                            j += 1
                            v |= (b & 0x7F) << s2
                            s2 += 7
                            if not (b & 0x80):
                                break
                        if f2 == 1:
                            yield ('varint', v)
                    else:
                        raise ValueError(f'unsupported sub wire {w2}')
        else:
            if wire == 0:
                v = 0
                shift = 0
                while True:
                    b = payload[i]
                    i += 1
                    v |= (b & 0x7F) << shift
                    shift += 7
                    if not (b & 0x80):
                        break
            else:
                raise ValueError(f'unsupported root wire {wire}')


def root_occurrences(payload: bytes, root_field: int, kind: str = 'bytes') -> list[bytes | int]:
    """Return every matching root occurrence without collapsing repeated fields."""
    return [value for field, wire, value in walk(payload) if field == root_field and wire == kind]


def one_root(payload: bytes, root_field: int) -> bytes:
    """Return one length-delimited root occurrence, failing on absent/duplicate roots."""
    matches = root_occurrences(payload, root_field)
    if len(matches) != 1 or not isinstance(matches[0], bytes):
        raise ValueError(f'expected one bytes root {root_field}, found {len(matches)}')
    return matches[0]


def records(payload: bytes, root_field: int, child_field: int = 1) -> list[bytes]:
    """Return direct length-delimited child records in occurrence order."""
    return [
        value
        for field, wire, value in walk(one_root(payload, root_field))
        if field == child_field and wire == 'bytes' and isinstance(value, bytes)
    ]


def record_id(record: bytes) -> int:
    """Read one direct field-1 varint identity, failing on ambiguity."""
    matches = [value for field, wire, value in walk(record) if field == 1 and wire == 'varint']
    if len(matches) != 1 or not isinstance(matches[0], int):
        raise ValueError(f'expected one record ID, found {len(matches)}')
    return matches[0]


def packed_varints(data: bytes) -> list[int]:
    """Decode a length-delimited packed varint payload."""
    out = []
    i = 0
    while i < len(data):
        value = shift = 0
        while True:
            if i >= len(data):
                raise ValueError('truncated packed varint')
            byte = data[i]
            i += 1
            value |= (byte & 0x7F) << shift
            if not byte & 0x80:
                break
            shift += 7
        out.append(value)
    return out


def f32(raw: int) -> float:
    return struct.unpack('<f', struct.pack('<I', raw))[0]


def utf8_or_none(b: bytes):
    try:
        s = b.decode('utf-8')
        if all(ord(c) >= 32 or c in '\n\r\t' for c in s) and s:
            return s
    except Exception:
        pass
    return None


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()
