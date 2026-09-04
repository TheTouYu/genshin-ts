#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Blb\\x03 extractor ported from AnimeStudio (Escartem/AnimeStudio).

References:
  AnimeStudio/AnimeStudio/BlbFile.cs
  AnimeStudio/AnimeStudio/Crypto/BlbUtils.cs
  AnimeStudio/AnimeStudio/Crypto/CryptoHelper.cs
  AnimeStudio/AnimeStudio/LZ4/LZ4.cs

Usage:
  python3 blb3_extract.py <input.blk> [output_dir]

Only the first 128 bytes of each block/header are encrypted by this scheme.
Compression types supported here: None(0), LZ4(2), LZ4HC(3).
Oodle(9) requires a native Oodle decoder and is reported as unsupported.
"""
from __future__ import annotations

import argparse
import os
import struct
import sys
from pathlib import Path

# This file is generated from CryptoHelper.cs and contains:
# Blb3AESSBox, Blb3AESShift, Blb3RC4Key, Blb3SBox, Blb3ShiftRow,
# Blb3Key, Blb3Mul, GF256Exp, GF256Log
sys.path.insert(0, str(Path(__file__).resolve().parent))
from crypto_blb3 import (  # noqa: E402
    Blb3AESSBox,
    Blb3AESShift,
    Blb3RC4Key,
    Blb3SBox,
    Blb3ShiftRow,
    Blb3Key,
    Blb3Mul,
    GF256Exp,
    GF256Log,
)

# ---------------------------------------------------------------------------
# Reader helpers
# ---------------------------------------------------------------------------

class Reader:
    def __init__(self, data: bytes, pos: int = 0):
        self.data = data
        self.pos = pos

    def read(self, n: int) -> bytes:
        if self.pos + n > len(self.data):
            raise EOFError(f"tried to read {n} bytes at 0x{self.pos:x}, len={len(self.data):x}")
        out = self.data[self.pos:self.pos + n]
        self.pos += n
        return out

    def u8(self) -> int:
        return self.read(1)[0]

    def u16(self) -> int:
        return struct.unpack('<H', self.read(2))[0]

    def u32(self) -> int:
        return struct.unpack('<I', self.read(4))[0]

    def i32(self) -> int:
        return struct.unpack('<i', self.read(4))[0]

    def u64(self) -> int:
        return struct.unpack('<Q', self.read(8))[0]

    def i64(self) -> int:
        return struct.unpack('<q', self.read(8))[0]

    def cstr(self) -> str:
        end = self.data.find(b'\x00', self.pos)
        if end < 0:
            end = len(self.data)
        raw = self.data[self.pos:end]
        self.pos = end + 1
        return raw.decode('utf-8', errors='replace')

    def align4(self):
        mod = self.pos % 4
        if mod:
            self.pos += 4 - mod

    def seek(self, pos: int):
        self.pos = pos


# ---------------------------------------------------------------------------
# GF(256), custom AES and Blb3 decrypt
# ---------------------------------------------------------------------------

def _mul2(a: int) -> int:
    a &= 0xFF
    return ((a << 1) & 0xFF) ^ (0x1B if (a & 0x80) else 0)


def _mul3(a: int) -> int:
    return _mul2(a) ^ a


# AES mix-column lookup tables (2/3 multiplications in GF(2^8))
LOOKUP_G2 = [_mul2(i) for i in range(256)]
LOOKUP_G3 = [_mul3(i) for i in range(256)]

SHIFT_ROWS_TABLE = bytes([
    0, 5, 10, 15, 4, 9, 14, 3, 8, 13, 2, 7, 12, 1, 6, 11,
])
POWER_SCHEDULE = bytes([0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1B, 0x36])


def _xor_round_key(state: bytearray, keys: bytearray, round_: int) -> None:
    for i in range(4):
        for j in range(4):
            state[i * 4 + j] ^= keys[i + j * 4 + round_ * 16]


def _sub_bytes(state: bytearray) -> None:
    for i in range(len(state)):
        state[i] ^= Blb3AESSBox[state[i]]


def _shift_rows(state: bytearray) -> None:
    old = bytes(state)
    for i in range(16):
        state[i] = old[SHIFT_ROWS_TABLE[i]]


def _mix_col(state: bytearray, off: int) -> None:
    a0, a1, a2, a3 = state[off:off + 4]
    state[off + 0] = LOOKUP_G2[a0] ^ LOOKUP_G3[a1] ^ a2 ^ a3
    state[off + 1] = LOOKUP_G2[a1] ^ LOOKUP_G3[a2] ^ a3 ^ a0
    state[off + 2] = LOOKUP_G2[a2] ^ LOOKUP_G3[a3] ^ a0 ^ a1
    state[off + 3] = LOOKUP_G2[a3] ^ LOOKUP_G3[a0] ^ a1 ^ a2


def _mix_cols(state: bytearray) -> None:
    for off in (0, 4, 8, 12):
        _mix_col(state, off)


def _aes_expand(key: bytes) -> bytearray:
    keys = bytearray(176)
    for i in range(16):
        keys[i] = key[Blb3AESShift[i]]
    offset = 0x1F
    for rnd in range(10):
        a = Blb3AESSBox[keys[offset - 0x14]]
        b = Blb3AESSBox[keys[offset - 0x10]]
        c = (Blb3AESSBox[keys[offset - 0x18]] ^ keys[offset - 0x18]
             ^ POWER_SCHEDULE[rnd] ^ keys[offset - 0x1F])
        d = Blb3AESSBox[keys[offset - 0x1C]]
        temp = 0

        keys[offset - 0x0F] = c
        temp = a ^ keys[offset - 0x14] ^ keys[offset - 0x1B]
        keys[offset - 0x0B] = temp
        a = b ^ keys[offset - 0x10] ^ keys[offset - 0x17]
        keys[offset - 7] = a
        b = d ^ keys[offset - 0x1C] ^ keys[offset - 0x13]
        keys[offset - 3] = b

        c ^= keys[offset - 0x1E]
        keys[offset - 0x0E] = c
        temp ^= keys[offset - 0x1A]
        keys[offset - 10] = temp
        a ^= keys[offset - 0x16]
        keys[offset - 6] = a
        b ^= keys[offset - 0x12]
        keys[offset - 2] = b

        c ^= keys[offset - 0x1D]
        keys[offset - 0x0D] = c
        temp ^= keys[offset - 0x19]
        keys[offset - 9] = temp
        a ^= keys[offset - 0x15]
        keys[offset - 5] = a
        b ^= keys[offset - 0x11]
        keys[offset - 1] = b

        keys[offset - 0x0C] = c ^ keys[offset - 0x1C]
        keys[offset - 8] = temp ^ keys[offset - 0x18]
        keys[offset - 4] = a ^ keys[offset - 0x14]
        keys[offset] = b ^ keys[offset - 0x10]

        offset += 0x10
    return keys


def _aes_encrypt_custom(block: bytes, key: bytes) -> bytes:
    """Port of AnimeStudio BlbAES.Encrypt (bespoke AES variant)."""
    keys = _aes_expand(key)
    c = bytearray(block[:16])
    _xor_round_key(c, keys, 0)
    for i in range(9):
        _sub_bytes(c)
        _shift_rows(c)
        _mix_cols(c)
        _xor_round_key(c, keys, i + 1)
    _sub_bytes(c)
    _shift_rows(c)
    _xor_round_key(c, keys, 10)
    return bytes(c)


def _gf256_mul(a: int, b: int) -> int:
    if a == 0 or b == 0:
        return 0
    return GF256Exp[(GF256Log[a] + GF256Log[b]) % 0xFF]


def _descramble(buf: bytearray) -> None:
    n = len(buf)
    for i in range(3):
        vector = bytearray(n)
        for j in range(n):
            k = Blb3ShiftRow[(2 - i) * 0x10 + j]
            idx = j % 8
            vector[j] = (Blb3Key[idx] ^ Blb3SBox[(j % 4 * 0x100)
                         | _gf256_mul(Blb3Mul[idx], buf[k % n])])
        buf[:] = vector


def _rc4(buf: bytearray) -> None:
    S = bytearray(Blb3RC4Key[:256])
    T = bytearray(256)
    for i in range(0, 256, 2):
        T[i] = buf[i & 6]
        T[i + 1] = buf[(i + 1) & 7]
    j = 0
    for i in range(256):
        j = (j + S[i] + T[i]) % 256
        S[i], S[j] = S[j], S[i]
    i = j = 0
    for iteration in range(len(buf) - 16):
        i = (i + 1) % 256
        j = (j + S[i]) % 256
        S[i], S[j] = S[j], S[i]
        K = S[(S[j] + S[i]) % 256]
        mode = buf[(i % 8) + 8] % 3
        idx = iteration + 16
        if mode == 0:
            buf[idx] ^= K
        elif mode == 1:
            buf[idx] = (buf[idx] - K) & 0xFF
        else:
            buf[idx] = (buf[idx] + K) & 0xFF


def blb3_decrypt(header: bytes, data: bytearray) -> None:
    """Decrypt in-place the first min(128, len(data)) bytes."""
    count = min(128, len(data))
    if count <= 0:
        return
    buf = memoryview(data)[:count]
    # Initial XOR with header
    for i in range(min(count, len(header))):
        buf[i] ^= header[i]
    if count >= 16:
        enc = _aes_encrypt_custom(bytes(buf[:16]), header)
        buf[:16] = enc
        if count > 16:
            tmp = bytearray(buf)
            _rc4(tmp)
            buf[:] = tmp
        tmp16 = bytearray(buf[:16])
        _descramble(tmp16)
        buf[:16] = tmp16


# ---------------------------------------------------------------------------
# LZ4 block decompressor (AnimeStudio LZ4.cs port)
# ---------------------------------------------------------------------------

def lz4_decompress(cmp: bytes, dec_size: int) -> bytes:
    dec = bytearray()
    cmp_pos = 0
    cmp_len = len(cmp)

    def get_literal_token():
        nonlocal cmp_pos
        token = cmp[cmp_pos]
        cmp_pos += 1
        return token & 0x0F, (token >> 4) & 0x0F

    def get_length(length: int) -> int:
        nonlocal cmp_pos
        if length == 0x0F:
            while True:
                b = cmp[cmp_pos]
                cmp_pos += 1
                length += b
                if b != 0xFF:
                    break
        return length

    while cmp_pos < cmp_len and len(dec) < dec_size:
        enc_count, lit_count = get_literal_token()
        lit_count = get_length(lit_count)
        dec += cmp[cmp_pos:cmp_pos + lit_count]
        cmp_pos += lit_count
        if cmp_pos >= cmp_len:
            break
        # compressed (match) part
        back = cmp[cmp_pos] | (cmp[cmp_pos + 1] << 8)
        cmp_pos += 2
        enc_count = get_length(enc_count) + 4
        enc_pos = len(dec) - back
        if enc_count <= back:
            dec += dec[enc_pos:enc_pos + enc_count]
        else:
            for _ in range(enc_count):
                dec.append(dec[enc_pos])
                enc_pos += 1
        if len(dec) >= dec_size:
            break
    return bytes(dec[:dec_size])


# ---------------------------------------------------------------------------
# Blb3 container parser
# ---------------------------------------------------------------------------

class StorageBlock:
    def __init__(self, compressed_size: int, uncompressed_size: int, flags: int):
        self.compressed_size = compressed_size
        self.uncompressed_size = uncompressed_size
        self.flags = flags


class Node:
    def __init__(self, offset: int, size: int, flags: int, path: str):
        self.offset = offset
        self.size = size
        self.flags = flags
        self.path = path


def parse_blb3(data: bytes) -> tuple[bytes, list[StorageBlock], list[Node]]:
    r = Reader(data)
    magic = r.read(4)
    if magic != b'Blb\x03':
        raise ValueError(f"not a Blb3 file: {magic!r}")

    compressed_blocks_info_size = r.u32()
    _unknown = r.u32()          # skipped in AnimeStudio
    header = r.read(16)

    header_data = bytearray(r.read(compressed_blocks_info_size))
    blb3_decrypt(header, header_data)

    hr = Reader(bytes(header_data))
    hr.pos = 0
    size = hr.u32()
    last_uncompressed_size = hr.u32()
    hr.read(4)
    blob_offset = hr.i32()
    blob_size = hr.u32()
    compression_type = hr.u8()
    uncompressed_size = 1 << hr.u8()
    hr.align4()

    blocks_info_count = hr.i32()
    nodes_count = hr.i32()

    blocks_info_offset = hr.pos + hr.i64()
    nodes_info_offset = hr.pos + hr.i64()
    flag_info_offset = hr.pos + hr.i64()

    hr.seek(blocks_info_offset)
    blocks_info: list[StorageBlock] = []
    for i in range(blocks_info_count):
        csize = hr.u32()
        usize = last_uncompressed_size if i == blocks_info_count - 1 else uncompressed_size
        blocks_info.append(StorageBlock(csize, usize, compression_type))

    # Convert cumulative compressed sizes into per-block sizes (AnimeStudio behavior)
    for i in range(len(blocks_info) - 1, 0, -1):
        blocks_info[i].compressed_size -= blocks_info[i - 1].compressed_size
        if blocks_info[i].compressed_size == blocks_info[i].uncompressed_size:
            blocks_info[i].flags = 0  # CompressionType.None

    hr.seek(nodes_info_offset)
    nodes: list[Node] = []
    for i in range(nodes_count):
        offset = hr.u32()
        node_size = hr.u32()
        pos_before_flag = hr.pos
        hr.seek(flag_info_offset + (i // 32) * 4)
        flag_word = hr.u32()
        node_flags = 4 if ((flag_word >> (i % 32)) & 1) != 0 else 0
        hr.seek(pos_before_flag)
        path_offset = hr.pos + hr.i64()
        pos_after = hr.pos
        hr.seek(path_offset)
        path = hr.cstr()
        hr.seek(pos_after)
        nodes.append(Node(offset, node_size, node_flags, path))

    return header, blocks_info, nodes


def read_blocks(data: bytes, header: bytes, blocks_info: list[StorageBlock]) -> bytes:
    r = Reader(data)
    # Start of file data after the header section: magic(4)+u32(4)+u32(4)+16(16)+blocks_info_size
    r.pos = 4 + 4 + 4 + 16 + (data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24))

    out = bytearray()
    for idx, block in enumerate(blocks_info):
        ctype = block.flags & 0x3F
        csize = block.compressed_size
        usize = block.uncompressed_size
        if ctype == 0:  # None
            raw = bytearray(r.read(usize))
            blb3_decrypt(header, raw)
            out += raw
        elif ctype in (2, 3):  # LZ4 / LZ4HC
            raw = bytearray(r.read(csize))
            if csize > 6:
                blb3_decrypt(header, raw)
            dec = lz4_decompress(bytes(raw), usize)
            if len(dec) != usize:
                raise ValueError(f"block {idx}: LZ4 expected {usize} bytes, got {len(dec)}")
            out += dec
        elif ctype == 1:  # LZMA
            raise NotImplementedError("LZMA compressed blocks are not implemented in this port")
        elif ctype == 9:  # Oodle
            raise NotImplementedError("Oodle compressed blocks require the native Oodle decoder")
        else:
            raise NotImplementedError(f"unsupported compression type {ctype} in block {idx}")
    return bytes(out)


def extract_blb3(path: Path, out_dir: Path) -> list[tuple[str, int, str]]:
    data = path.read_bytes()
    header, blocks_info, nodes = parse_blb3(data)
    blocks = read_blocks(data, header, blocks_info)
    out_dir.mkdir(parents=True, exist_ok=True)

    entries = []
    for node in nodes:
        # path may contain slash/backslash; keep only basename for flat output
        safe = Path(node.path).name if node.path else f"node_{len(entries):04d}"
        dest = out_dir / safe
        blob = blocks[node.offset:node.offset + node.size]
        dest.write_bytes(blob)
        entries.append((node.path, node.size, str(dest)))
    return entries


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input', type=Path)
    ap.add_argument('output', type=Path, nargs='?', default=None)
    args = ap.parse_args()

    if not args.input.exists():
        print(f"file not found: {args.input}", file=sys.stderr)
        return 2

    out = args.output or args.input.with_suffix('.unpacked')
    entries = extract_blb3(args.input, out)
    print(f"extracted {len(entries)} files -> {out}")
    for path, size, dest in entries[:200]:
        print(f"  {size:>10}  {path}  ->  {dest}")
    if len(entries) > 200:
        print(f"  ... and {len(entries) - 200} more")


if __name__ == '__main__':
    main()
