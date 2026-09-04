#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
summarize_hablp_pcap.py — 对任意 RawCap pcap 做 HAblp 类型直方图（通用探针）。

用途:
  在新官方资产“复制/另存为自定义”抓包后，先看本次出现了哪些 HAblp type，
  再决定用 parse_official_copy_pcap.py（type1017）还是按新消息结构继续分析。

依赖:
  复用同目录 parse_official_copy_pcap.py 的 pcap/TCP/HAblp 扫描逻辑，无第三方库。

用法:
  python3 summarize_hablp_pcap.py <capture.pcap> [--output out.json]
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_official_copy_pcap import parse_pcap, parse_tcp, reassemble, scan_frames  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('pcap', type=Path)
    ap.add_argument('--output', type=Path, default=None)
    ap.add_argument('--dump-1017-dir', type=Path, default=None)
    ap.add_argument('--frames', action='store_true', default=False,
                    help='在输出 JSON 中附带逐帧明细（每条 HAblp 帧一行）')
    args = ap.parse_args()

    linktype, packets = parse_pcap(args.pcap)
    flows: dict[tuple, list] = {}
    for pkt in packets:
        r = parse_tcp(pkt, linktype)
        if not r:
            continue
        key, seq, flags, payload = r
        flows.setdefault(key, []).append((seq, flags, payload))

    type_counter: Counter = Counter()
    type_flows: dict[int, set] = defaultdict(set)
    type_payload_lens: dict[int, list[int]] = defaultdict(list)
    flow_details = []
    frame_details = []
    frame_index = 0

    dump_index = 0
    for key, segs in flows.items():
        data = reassemble(segs)
        frames = scan_frames(data)
        if not frames:
            continue
        flow_hits = Counter(f[2] for f in frames)
        flow_details.append({
            'flow': [key[0], key[1], key[2], key[3]],
            'frameCount': len(frames),
            'types': {str(t): c for t, c in sorted(flow_hits.items())},
        })
        for pos, L, typ, u32, trailer, payload in frames:
            type_counter[typ] += 1
            type_flows[typ].add(key)
            type_payload_lens[typ].append(len(payload))
            frame_details.append({
                'index': frame_index,
                'flow': [key[0], key[1], key[2], key[3]],
                'offset': pos,
                'outerLen': L,
                'type': typ,
                'payloadLen': len(payload),
                'trailer': trailer,
            })
            frame_index += 1
            if typ == 1017 and args.dump_1017_dir:
                args.dump_1017_dir.mkdir(parents=True, exist_ok=True)
                (args.dump_1017_dir / f'frame_{dump_index:03d}_len{len(payload)}.bin').write_bytes(payload)
                dump_index += 1

    out = {
        'schemaVersion': 1,
        'title': 'HAblp type histogram (generic pcap probe)',
        'source': str(args.pcap),
        'linktype': linktype,
        'packetCount': len(packets),
        'tcpFlowCount': len(flows),
        'flowCountWithHablp': len(flow_details),
        'typeHistogram': [
            {
                'type': typ,
                'count': n,
                'flowCount': len(type_flows[typ]),
                'payloadLenMin': min(type_payload_lens[typ]),
                'payloadLenMax': max(type_payload_lens[typ]),
                'payloadLenAvg': round(sum(type_payload_lens[typ]) / len(type_payload_lens[typ]), 1),
            }
            for typ, n in sorted(type_counter.items(), key=lambda x: (-x[1], x[0]))
        ],
        'flows': flow_details,
    }
    if args.frames:
        out['frames'] = frame_details

    dest = args.output or args.pcap.with_suffix('.hablp-summary.json')
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print(f'packets={len(packets)} flows={len(flows)} flowsWithHablp={len(flow_details)}')
    for row in out['typeHistogram']:
        print(f"  type {row['type']}: {row['count']} frames across {row['flowCount']} flows "
              f"len {row['payloadLenMin']}..{row['payloadLenMax']} avg {row['payloadLenAvg']}")
    print(f'wrote {dest}')


if __name__ == '__main__':
    main()
