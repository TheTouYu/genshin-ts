#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Decode BeyondEditor <-> YuanShen IPC capture.

Wire format (recovered 2026-09-04):
  [4-byte big-endian total length]
  HAblp envelope:
    magic       u16 = 0x0656
    type/cmd    u16
    payload_len u32 (big-endian)
    payload     = XOR(0xEA) Google.Protobuf/CodedStream bytes
    trailer     2 bytes (expected 0x0666 in some frames)

Usage:
  python3 decode_ipc.py <flow.bin> [out_prefix]
"""
import struct, sys, pathlib

XOR_KEY = 0xEA
MAGIC = 0x0656

def decode_one(data: bytes, off: int):
    """Try decode one HAblp frame at off; return (next_off, info) or raise."""
    if off + 4 > len(data):
        raise ValueError("no room for outer length")
    outer_len = struct.unpack(">I", data[off:off+4])[0]
    frame_start = off + 4
    frame_end = frame_start + outer_len
    if frame_end > len(data):
        # still allow if not enough? caller handles
        raise ValueError(f"outer_len {outer_len} exceeds data")
    m = data[frame_start:frame_end]
    if len(m) < 8:
        raise ValueError("frame too short")
    magic, typ, pay_len = struct.unpack(">HHI", m[0:8])
    payload_enc = m[8:8+pay_len]
    if len(payload_enc) != pay_len:
        raise ValueError("payload truncated")
    trailer = m[8+pay_len:8+pay_len+2]
    payload = bytes(b ^ XOR_KEY for b in payload_enc)
    info = {
        "outer_len": outer_len,
        "magic": magic,
        "type": typ,
        "payload_len": pay_len,
        "trailer": trailer.hex(),
        "frame_start": frame_start,
        "frame_end": frame_end,
        "payload": payload,
    }
    return frame_end, info

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    src = pathlib.Path(sys.argv[1])
    prefix = sys.argv[2] if len(sys.argv) > 2 else src.with_suffix("")
    data = src.read_bytes()
    print(f"input {src} size={len(data)}")

    # Try first frame at 0
    try:
        next_off, info = decode_one(data, 0)
        out_payload = prefix + f"_type{info['type']}.bin"
        pathlib.Path(out_payload).write_bytes(info["payload"])
        print(f"frame0 type={info['type']} payload_len={info['payload_len']} trailer={info['trailer']} -> {out_payload}")
        print(f"payload head: {info['payload'][:64].hex(' ')}")
    except Exception as e:
        print("first frame decode error:", e)

    # Also decode rest as a simple XOR blob for exploratory search (boundary may be imperfect)
    if len(data) > 4:
        rest = bytes(b ^ XOR_KEY for b in data[4:])
        out_rest = prefix + "_xor_all.bin"
        pathlib.Path(out_rest).write_bytes(rest)
        print(f"xored whole-after-length -> {out_rest} ({len(rest)} bytes)")
    return 0

if __name__ == "__main__":
    sys.exit(main())
