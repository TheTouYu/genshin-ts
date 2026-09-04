#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
process_type1017_capture.py — 一键处理一次 type1017 IPC 抓包，产出全套工作流产物。

一次调用完成:
  1. HAblp 类型直方图（summarize_hablp_pcap.py）
  2. 缓存 type1017 payload（--dump-1017-dir）
  3. 通用 type1017 解析（parse_type1017_generic.py，读缓存目录，不再重扫 pcap）
  4. 可选：合并官方实体映射（build_official_entity_mapping.py）
  5. 可选：写 Markdown 简报

用法:
  python3 process_type1017_capture.py <capture.pcap> \
    --prefix .scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/ipc/multi_type \
    --entity-data .scratch/beyond-semantic-resources/data/animegamedata-cn7.0.0/beyond_excel/BeyondOfficialEntityExcelConfigData.json \
    --textmap .scratch/beyond-semantic-resources/data/animegamedata-cn7.0.0/TextMapCHS.json \
    --mapping-output resources/official_entity_ipc_mapping.json \
    --report .scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/ipc/multi_type.report.md
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def run(script: str, args: list[str]) -> None:
    cmd = [sys.executable, str(HERE / script), *args]
    print(f'[run] {Path(script).name} ' + ' '.join(args))
    subprocess.run(cmd, check=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('pcap', type=Path)
    ap.add_argument('--prefix', type=Path, required=True,
                    help='输出前缀，例如 .../ipc/multi_type')
    ap.add_argument('--entity-data', type=Path, default=None,
                    help='BeyondOfficialEntityExcelConfigData.json；提供时构建 mapping')
    ap.add_argument('--textmap', type=Path, default=None)
    ap.add_argument('--mapping-output', type=Path,
                    default=Path('resources/official_entity_ipc_mapping.json'))
    ap.add_argument('--report', type=Path, default=None)
    args = ap.parse_args()

    prefix = args.prefix
    summary_out = prefix.with_name(prefix.name + '.hablp-summary.json')
    generic_out = prefix.with_name(prefix.name + '.generic.json')
    dump_dir = prefix.with_name(prefix.name + '_1017')

    # 清空旧缓存，避免残留 frame_*.bin 干扰
    if dump_dir.exists():
        shutil.rmtree(dump_dir)

    # 1+2: 直方图 + 缓存 1017 payload（一次 pcap 扫描）
    run('summarize_hablp_pcap.py', [
        str(args.pcap),
        '--output', str(summary_out),
        '--dump-1017-dir', str(dump_dir),
    ])

    # 3: 从缓存目录解析，不再重扫 pcap
    run('parse_type1017_generic.py', [
        str(dump_dir),
        '--output', str(generic_out),
    ])

    # 4: 构建官方实体映射
    if args.entity_data:
        build_args = [
            '--catalog', str(generic_out),
            '--entity-data', str(args.entity_data),
            '--output', str(args.mapping_output),
        ]
        if args.textmap:
            build_args += ['--textmap', str(args.textmap)]
        run('build_official_entity_mapping.py', build_args)

    # 汇总输出
    summary = json.loads(summary_out.read_text(encoding='utf-8'))
    generic = json.loads(generic_out.read_text(encoding='utf-8'))
    print('\n=== result ===')
    print(f"HAblp types: {[(x['type'], x['count']) for x in summary['typeHistogram']]}")
    print(f"available IDs: {generic['availableIdCount']}")
    print(f"definitions: {len(generic['definitions'])}")
    if args.entity_data:
        mapping = json.loads(args.mapping_output.read_text(encoding='utf-8'))
        print(f"official entity mappings: {mapping['count']}")

    # 5: Markdown 简报
    if args.report:
        hist_lines = [f"- type {x['type']}: {x['count']} frames" for x in summary['typeHistogram']]
        report = f"""# type1017 处理简报

- 来源 pcap: `{args.pcap}`
- HAblp 类型:
{chr(10).join(hist_lines)}
- available IDs: {generic['availableIdCount']}
- definitions: {len(generic['definitions'])}
- 产物:
  - `{summary_out}`
  - `{generic_out}`
"""
        if args.entity_data:
            report += f"  - `{args.mapping_output}`\n"
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(report, encoding='utf-8')
        print(f'wrote {args.report}')


if __name__ == '__main__':
    main()
