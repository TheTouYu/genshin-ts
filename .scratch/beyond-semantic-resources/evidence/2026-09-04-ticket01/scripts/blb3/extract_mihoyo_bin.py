#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extract MiHoYoBinData (classID 1208) objects from a Unity SerializedFile.
Supports the CN 7.0.0 Excel block output:
  version=17, endian=0, type-tree disabled.

IMPORTANT (2026-09-04 corrected): CN 7.0.0 MiHoYoBinData content is NOT XORed.
The earlier 0x95 key is only for old community versions. Use --xor 0 (default now)
to obtain the raw object bytes that contain the real effectID varints.

Usage:
  python3 extract_mihoyo_bin.py <serialized.bin> [output_dir] [--xor 0]
"""
from __future__ import annotations

import argparse
import struct
import sys
from pathlib import Path

MHY_BIN_DATA_CLASS_ID = 1208


class Reader:
    def __init__(self, data: bytes, endian: str = '<'):
        self.data = data
        self.pos = 0
        self.endian = endian

    def _fmt(self, code: str) -> str:
        return self.endian + code

    def read(self, n: int) -> bytes:
        out = self.data[self.pos:self.pos + n]
        if len(out) != n:
            raise EOFError(f"read {n} at 0x{self.pos:x}, only {len(out)} left")
        self.pos += n
        return out

    def u8(self) -> int:
        return self.read(1)[0]

    def u16(self) -> int:
        return struct.unpack(self._fmt('H'), self.read(2))[0]

    def i16(self) -> int:
        return struct.unpack(self._fmt('h'), self.read(2))[0]

    def u32(self) -> int:
        return struct.unpack(self._fmt('I'), self.read(4))[0]

    def i32(self) -> int:
        return struct.unpack(self._fmt('i'), self.read(4))[0]

    def u64(self) -> int:
        return struct.unpack(self._fmt('Q'), self.read(8))[0]

    def i64(self) -> int:
        return struct.unpack(self._fmt('q'), self.read(8))[0]

    def cstr(self) -> str:
        end = self.data.find(b'\x00', self.pos)
        if end < 0:
            end = len(self.data)
        raw = self.data[self.pos:end]
        self.pos = end + 1
        return raw.decode('utf-8', errors='replace')

    def align(self, alignment: int = 4):
        mod = self.pos % alignment
        if mod:
            self.pos += alignment - mod


def parse_serialized(data: bytes, xor_key: int = 0):
    # Header is big-endian in the standard serialized file layout
    r = Reader(data, '>')
    metadata_size = r.u32()
    file_size = r.u32()
    version = r.u32()
    data_offset = r.u32()
    endianness = r.u8()
    r.read(3)  # reserved
    if endianness != 0:
        raise NotImplementedError("Only little-endian metadata is implemented; got endian byte "
                                  f"{endianness}")

    r = Reader(data, '<')
    r.pos = 20
    # Metadata fields
    if version >= 7:
        r.cstr()  # unityVersion
    if version >= 8:
        r.i32()   # target platform
    enable_type_tree = False
    if version >= 13:
        enable_type_tree = bool(r.u8())

    type_count = r.i32()
    class_ids = []
    for _ in range(type_count):
        cid = r.i32()
        if version >= 16:
            r.u8()  # isStrippedType
        if version >= 17:
            r.i16()  # scriptTypeIndex
        if version >= 13:
            # script ID for MonoBehaviour-ish types
            if (version < 16 and cid < 0) or (version >= 16 and cid == 114):
                r.read(16)
            r.read(16)  # oldTypeHash
        if enable_type_tree:
            node_count = r.i32()
            strbuf_size = r.i32()
            if version >= 19:
                node_byte_size = 2 + 1 + 1 + 4 + 4 + 4 + 4 + 4 + 8
            else:
                node_byte_size = 2 + 1 + 1 + 4 + 4 + 4 + 4 + 4
            r.pos += node_count * node_byte_size
            r.read(strbuf_size)
        if version >= 21:
            dep_count = r.i32()
            r.pos += dep_count * 4  # type dependencies are int32s
        class_ids.append(cid)

    if version >= 7 and version < 14:
        r.i32()  # bigIDEnabled

    object_count = r.i32()
    objects = []
    for _ in range(object_count):
        if version >= 14:
            r.align(4)
            path_id = r.i64()
        else:
            path_id = r.i32()
        if version >= 22:
            byte_start = r.i64() + data_offset
        else:
            byte_start = r.u32() + data_offset
        byte_size = r.u32()
        type_id = r.i32()
        class_id = class_ids[type_id]
        objects.append({
            'path_id': path_id,
            'byte_start': byte_start,
            'byte_size': byte_size,
            'type_id': type_id,
            'class_id': class_id,
        })

    mhy_objects = [o for o in objects if o['class_id'] == MHY_BIN_DATA_CLASS_ID]
    return version, data_offset, objects, mhy_objects


def extract_object_data(data: bytes, obj: dict, xor_key: int = 0) -> bytes:
    start = obj['byte_start']
    size = obj['byte_size']
    if size < 4:
        return b''
    length = struct.unpack_from('<I', data, start)[0]
    available = size - 4
    if length <= 0 or length > available:
        length = available
    raw = bytearray(data[start + 4:start + 4 + length])
    if xor_key:
        for i in range(len(raw)):
            raw[i] ^= xor_key
    return bytes(raw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input', type=Path)
    ap.add_argument('output', type=Path, nargs='?', default=None)
    ap.add_argument('--xor', type=lambda x: int(x, 0), default=0,
                    help='XOR key for old MiHoYoBinData content (default 0 = no XOR for CN 7.0.0)')
    args = ap.parse_args()

    data = args.input.read_bytes()
    version, data_offset, objects, mhy_objects = parse_serialized(data, args.xor)
    print(f"version={version} dataOffset={data_offset} objects={len(objects)} "
          f"MiHoYoBinData={len(mhy_objects)}")

    if args.output:
        args.output.mkdir(parents=True, exist_ok=True)
    total_bytes = 0
    for idx, obj in enumerate(mhy_objects):
        blob = extract_object_data(data, obj, args.xor)
        total_bytes += len(blob)
        if args.output:
            (args.output / f"obj_{obj['path_id']:06d}_{idx:04d}.bin").write_bytes(blob)
    print(f"extracted {len(mhy_objects)} blobs, total {total_bytes} bytes -> {args.output or '(memory only)'}")


if __name__ == '__main__':
    main()
