#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
quickstart_diff_ipc.py — “差分 + IPC 抓包”一次轻量启动 / 收尾。

当用户说“直接轻量启动差分和抓包 / 差分+抓包 / diff+抓包”时，只运行本脚本，
不要再分别读两个 SKILL 长文、不要查看板猜 probe 名。

启动:
  python3 .agents/skills/beyond-semantic-resource-reverse/scripts/quickstart_diff_ipc.py [probe-name] [--map <map.gil>]

收尾（用户已做完最小变化并保存后）:
  python3 .agents/skills/beyond-semantic-resource-reverse/scripts/quickstart_diff_ipc.py --finish <probe-name>

本脚本会:
  1. 调用 editor-incremental-gia-investigator/scripts/quickstart_diff.py 保存 GIL before
  2. 调用同目录 quickstart_ipc_probe.py 保存 IPC before 并启动 RawCap
  3. 打印统一的 READY；收尾时停止 RawCap 并复制最终 pcap 到 evidence
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import datetime
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
EDITOR_DIFF = REPO / '.agents/skills/editor-incremental-gia-investigator/scripts/quickstart_diff.py'
IPC_PROBE = Path(__file__).resolve().parent / 'quickstart_ipc_probe.py'
CAPTURE_DIR = Path('/mnt/c/beyond-ipc')


def auto_probe() -> str:
    return 'probe_' + datetime.now().strftime('%Y%m%d_%H%M%S')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('probe', nargs='?', default=None, help='实验名，省略则自动生成')
    ap.add_argument('--map', type=Path, default=None, help='手动指定当前地图路径')
    ap.add_argument('--finish', action='store_true', default=False,
                    help='停止 RawCap 并复制最终 pcap（差分 after 随后用 gil-quick-diff 处理）')
    args = ap.parse_args()

    if args.finish:
        if not args.probe:
            raise SystemExit('--finish 必须提供 probe 名')
        subprocess.run(
            [sys.executable, str(IPC_PROBE), '--finish', args.probe],
            check=True,
        )
        print()
        print('差分 after 请继续用 gil-quick-diff.py：')
        print(f'  python3 .agents/skills/editor-incremental-gia-investigator/scripts/gil-quick-diff.py \\')
        print(f'    <before.gil> <当前地图.gil> --capture-dir <实验目录>/raw --snap <语义名-vN>')
        return

    probe = args.probe or auto_probe()
    if not EDITOR_DIFF.exists():
        raise SystemExit(f'找不到差分脚本: {EDITOR_DIFF}')

    # 先差分 before（不启动 RawCap），成功后再抓包；任一步失败都不留下半启动状态
    subprocess.run(
        [sys.executable, str(EDITOR_DIFF), probe] +
        (['--map', str(args.map)] if args.map else []),
        check=True,
    )
    subprocess.run(
        [sys.executable, str(IPC_PROBE), probe] +
        (['--map', str(args.map)] if args.map else []),
        check=True,
    )

    date = datetime.now().strftime('%Y-%m-%d')
    diff_ev = REPO / '.scratch/editor-incremental-evidence' / f'{date}-{probe}'
    ipc_ev = REPO / '.scratch/beyond-semantic-resources/evidence' / f'{date}-{probe}-probe'
    print()
    print('=== DIFF + IPC READY (unified) ===')
    print(f'probe       : {probe}')
    print(f'diff before : {diff_ev / "before"}')
    print(f'ipc before  : {ipc_ev / "before"}')
    print(f'pcap        : {CAPTURE_DIR / f"{probe}.pcap"}')
    print()
    print('请在编辑器做一个最小变化并保存，完成后告知“好了”。')
    print(f'收尾命令：python3 {Path(__file__).resolve()} --finish {probe}')


if __name__ == '__main__':
    main()
