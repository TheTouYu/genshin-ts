#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parse_official_copy_pcap.py — 从 RawCap pcap 一键提取“官方状态复制为自定义”的 type1017 目录。

用法:
  python3 parse_official_copy_pcap.py <capture.pcap> [--output out.json]

流程:
  1. 读取 pcap（RawCap linktype=101 / Ethernet 通用）
  2. 按 TCP 流重组字节
  3. 识别 HAblp 帧（4B大端长度 + 0x0656 magic + XOR 0xEA payload）
  4. 收集 type1017 分片
  5. 用 protobuf 递归解析 available status ids + definitions
  6. 输出 JSON

适用: BeyondEditor <-> YuanShen 官方状态/单位状态“复制为自定义状态”流程。
"""
from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

XOR_KEY = 0xEA
HA_MAGIC = 0x0656


# ---------------- pcap ----------------

def parse_pcap(path: Path):
    data = path.read_bytes()
    if len(data) < 24:
        raise ValueError('pcap too small')
    be = data[:4] == b'\xa1\xb2\xc3\xd4'
    def u32(off: int) -> int:
        return struct.unpack('>I' if be else '<I', data[off:off + 4])[0]
    linktype = u32(20)
    off = 24
    packets = []
    while off + 16 <= len(data):
        sec, usec, incl, orig = struct.unpack('>IIII', data[off:off + 16])
        pkt = data[off + 16:off + 16 + incl]
        off += 16 + incl
        packets.append(pkt)
    return linktype, packets


def parse_tcp(pkt: bytes, linktype: int):
    start = 0 if linktype == 101 else 14 if linktype == 1 else 4
    if len(pkt) < start + 20:
        return None
    p = pkt[start:]
    if (p[0] >> 4) != 4:
        return None
    ihl = (p[0] & 0x0F) * 4
    if p[9] != 6 or len(p) < ihl + 20:
        return None
    sport, dport = struct.unpack('>HH', p[ihl:ihl + 4])
    seq, ack = struct.unpack('>II', p[ihl + 4:ihl + 12])
    doff = (p[ihl + 12] >> 4) * 4
    flags = p[ihl + 13]
    if doff < 20 or len(p) < ihl + doff:
        return None
    payload = p[ihl + doff:]
    src_ip = '.'.join(str(x) for x in p[12:16])
    dst_ip = '.'.join(str(x) for x in p[16:20])
    return (src_ip, sport, dst_ip, dport), seq, flags, payload


def reassemble(segments):
    if not segments:
        return b''
    base = None
    for seq, flags, payload in segments:
        if flags & 0x02:
            base = seq + 1
            break
    if base is None:
        base = min(seq for seq, _, _ in segments)
    segments.sort(key=lambda x: x[0])
    out = bytearray()
    cur = base
    for seq, flags, payload in segments:
        if not payload:
            continue
        if seq < cur:
            skip = cur - seq
            if len(payload) <= skip:
                continue
            payload = payload[skip:]
            seq = cur
        if seq > cur:
            # gap: skip missing bytes, continue (best effort)
            pass
        out.extend(payload)
        cur = seq + len(payload)
    return bytes(out)


# ---------------- HAblp ----------------

def scan_frames(flow: bytes):
    frames = []
    pos = 0
    n = len(flow)
    while pos + 4 <= n:
        L = struct.unpack('>I', flow[pos:pos + 4])[0]
        if 10 <= L <= n - pos - 4:
            body_start = pos + 4
            body = flow[body_start:body_start + L]
            if len(body) >= 10 and body[:2] == b'\x06\x56':
                typ = struct.unpack('>H', body[2:4])[0]
                u32 = struct.unpack('>I', body[4:8])[0]
                trailer = body[L - 2:L]
                if u32 == L - 10 or trailer == b'\x06\x66':
                    payload_len = u32 if u32 == L - 10 else L - 10
                    if payload_len >= 0 and 8 + payload_len + 2 <= L:
                        enc = body[8:8 + payload_len]
                    else:
                        enc = body[8:L - 2]
                    decoded = bytes(b ^ XOR_KEY for b in enc)
                    frames.append((pos, L, typ, u32, trailer.hex(), decoded))
                    pos = body_start + L
                    continue
        pos += 1
    return frames


# ---------------- protobuf recursive ----------------

def read_varint(data: bytes, pos: int) -> tuple[int, int]:
    value = 0
    shift = 0
    while True:
        if pos >= len(data):
            raise ValueError('varint eof')
        b = data[pos]
        pos += 1
        value |= (b & 0x7F) << shift
        if not (b & 0x80):
            return value, pos
        shift += 7
        if shift > 70:
            raise ValueError('varint too long')


def parse_message(data: bytes, start: int, end: int, depth: int = 0) -> list:
    out = []
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
                try:
                    text = raw.decode('utf-8')
                    if any(ord(c) < 32 and c not in '\n\r\t' for c in text):
                        text = None
                except UnicodeDecodeError:
                    text = None
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


def collect_texts(node: list) -> list[str]:
    out = []
    for f, w, v in node:
        if w == 'bytes' and isinstance(v, str) and v:
            # skip raw hex dumps like 'fc 0a fd 0a'
            if all(ch in '0123456789abcdefABCDEF ' for ch in v) and ' ' in v:
                pass
            else:
                out.append(v)
        elif w == 'msg':
            out.extend(collect_texts(v))
    return out


def collect_ids(node: list) -> list[int]:
    out = []
    for f, w, v in node:
        if w == 'var' and 100000 <= v <= 999999999:
            out.append(v)
        elif w == 'msg':
            out.extend(collect_ids(v))
    return out


def parse_catalog_payload(payload: bytes) -> dict:
    top = parse_message(payload, 0, len(payload))
    ids: list[int] = []
    defs: dict[int, dict] = {}
    records = []
    for f, w, v in top:
        if f == 1 and w == 'msg':
            records.append(v)
    for cat in records:
        for f, w, v in cat:
            if f == 2 and w == 'msg':
                sid = None
                for ff, ww, vv in v:
                    if ff == 4 and ww == 'var':
                        sid = vv
                if sid is not None:
                    ids.append(sid)
            elif f == 3 and w == 'msg':
                status_id = None
                texts = collect_texts(v)
                for item in v:
                    if item[0] == 1 and item[1] == 'msg':
                        for ff, ww, vv in item[2]:
                            if ff == 4 and ww == 'var':
                                status_id = vv
                    if status_id is None and item[0] in (14, 16) and item[1] == 'msg':
                        for ff, ww, vv in item[2]:
                            if ff == 1 and ww == 'msg':
                                for fff, www, vvv in vv:
                                    if fff == 1 and www == 'var':
                                        status_id = vvv
                if status_id is None:
                    continue
                effs = [x for x in collect_ids(v) if x != status_id]
                entry = defs.setdefault(status_id, {'statusId': status_id, 'names': [], 'effectIds': []})
                for t in texts:
                    if t not in entry['names']:
                        entry['names'].append(t)
                for e in effs:
                    if e not in entry['effectIds']:
                        entry['effectIds'].append(e)
    return {'ids': ids, 'definitions': defs}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pcap', type=Path)
    ap.add_argument('--output', type=Path, default=None)
    args = ap.parse_args()
    linktype, packets = parse_pcap(args.pcap)
    flows: dict[tuple, list] = {}
    for pkt in packets:
        r = parse_tcp(pkt, linktype)
        if not r:
            continue
        key, seq, flags, payload = r
        flows.setdefault(key, []).append((seq, flags, payload))
    all_defs: dict[int, dict] = {}
    available: dict[int, int] = {}
    type1017_count = 0
    flow_hits = []
    for key, segs in flows.items():
        data = reassemble(segs)
        frames = scan_frames(data)
        hits = [f for f in frames if f[2] == 1017]
        if not hits:
            continue
        flow_hits.append((key, len(hits)))
        type1017_count += len(hits)
        for _, _, _, _, _, payload in hits:
            parsed = parse_catalog_payload(payload)
            for sid in parsed['ids']:
                available[sid] = available.get(sid, 0) + 1
            for sid, defn in parsed['definitions'].items():
                all_defs.setdefault(sid, {'statusId': sid, 'names': [], 'effectIds': []})
                for n in defn['names']:
                    if n not in all_defs[sid]['names']:
                        all_defs[sid]['names'].append(n)
                for e in defn['effectIds']:
                    if e not in all_defs[sid]['effectIds']:
                        all_defs[sid]['effectIds'].append(e)
    out = {
        'schemaVersion': 1,
        'title': 'Beyond official status copy capture (pcap -> type1017)',
        'source': str(args.pcap),
        'status': 'auto-parse; mapping to official status IDs depends on copy order/naming',
        'type1017Count': type1017_count,
        'flowsWithType1017': flow_hits,
        'availableStatusIds': sorted(available),
        'definitions': sorted(all_defs.values(), key=lambda x: x['statusId']),
    }
    dest = args.output or args.pcap.with_suffix('.catalog.json')
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'type1017 frames: {type1017_count}')
    print(f'wrote {dest}')
    if not type1017_count:
        print('no type1017 found; check capture contains BeyondEditor/YuanShen IPC', file=sys.stderr)


if __name__ == '__main__':
    main()
