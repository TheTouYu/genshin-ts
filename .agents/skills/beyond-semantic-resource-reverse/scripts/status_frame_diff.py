#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
status_frame_diff.py — type1017 状态目录“帧流语义差分”。

原理（2026-09-05 用户定则）:
  抓包自带差分属性：同一 pcap 内连续 type1017 帧的差异 = 多次最小差分。
  本脚本把每帧解析成 {statusId -> names/effectIds}，然后逐相邻帧输出
  状态新增/删除/改名/效果逐个追加，还原用户连续操作的步骤。

用法:
  python3 status_frame_diff.py <frame-dir|pcap> [--output out.txt]

输入:
  - 目录：包含 frame_*.bin（summarize_hablp_pcap.py --dump-1017-dir 产物）
  - pcap：RawCap 抓包文件（自动提取 type1017 payload）

输出:
  人类可读的帧间变化清单（默认 stdout；--output 同时写文件）。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_official_copy_pcap import (  # noqa: E402
    parse_catalog_payload,
    parse_pcap,
    parse_tcp,
    reassemble,
    scan_frames,
)


def collect_payloads(src: Path) -> list[tuple[str, bytes]]:
    if src.is_dir():
        out = []
        for fp in sorted(src.glob('frame_*.bin')):
            out.append((fp.name, fp.read_bytes()))
        return out
    if src.suffix == '.pcap':
        linktype, packets = parse_pcap(src)
        flows: dict[tuple, list] = {}
        for pkt in packets:
            r = parse_tcp(pkt, linktype)
            if not r:
                continue
            key, seq, flags, payload = r
            flows.setdefault(key, []).append((seq, flags, payload))
        out = []
        idx = 0
        for key, segs in flows.items():
            data = reassemble(segs)
            for _, _, typ, _, _, payload in scan_frames(data):
                if typ == 1017:
                    out.append((f'frame_{idx:03d}_len{len(payload)}.bin', payload))
                    idx += 1
        return out
    raise SystemExit(f'不支持的输入（需要目录或 .pcap）: {src}')


def render(lines: list[str]) -> str:
    return '\n'.join(lines) + '\n'


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('input', type=Path, help='frame_*.bin 目录或 .pcap')
    ap.add_argument('--output', type=Path, default=None, help='可选输出文件（默认 stdout）')
    args = ap.parse_args()

    payloads = collect_payloads(args.input)
    prev_defs: dict[int, dict] = {}
    lines = [f'frames={len(payloads)}']

    for i, (name, payload) in enumerate(payloads):
        parsed = parse_catalog_payload(payload)
        cur_defs = {
            sid: {'names': d['names'][:], 'effectIds': d['effectIds'][:]}
            for sid, d in parsed['definitions'].items()
        }
        changes = []
        for sid in sorted(set(prev_defs) | set(cur_defs)):
            old = prev_defs.get(sid)
            new = cur_defs.get(sid)
            if old is None:
                changes.append(f'+status {sid} {new["names"]} eff={new["effectIds"]}')
            elif new is None:
                changes.append(f'-status {sid} {old["names"]}')
            else:
                if old['effectIds'] != new['effectIds']:
                    oldset = set(old['effectIds'])
                    newset = set(new['effectIds'])
                    added = sorted(newset - oldset)
                    removed = sorted(oldset - newset)
                    changes.append(
                        f'~status {sid} {new["names"]} eff {len(old["effectIds"])}->{len(new["effectIds"])} '
                        f'+{added} -{removed}'
                    )
                elif old['names'] != new['names']:
                    changes.append(f'~status {sid} names {old["names"]}->{new["names"]}')
        if changes:
            lines.append(f'frame {i:03d} ({name}):')
            lines.extend('  ' + c for c in changes)
        prev_defs = cur_defs

    text = render(lines)
    print(text, end='')
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding='utf-8')


if __name__ == '__main__':
    main()
