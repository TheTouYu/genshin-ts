#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
quickstart_ipc_probe.py — IPC 抓包“轻量启动”。

功能:
  1. 自动定位当前地图（Beyond_Local_Save_Level 下最近修改的 .gil）
  2. 保存 before 快照到 evidence/<date>-<probe>-probe/before/
  3. 启动 RawCap 到 C:\\beyond-ipc\\<probe>.pcap
  4. 打印 READY 信息和给用户的最小操作提示

用法:
  python3 quickstart_ipc_probe.py <probe-name> [--map <map.gil>]
"""
from __future__ import annotations

import argparse
import hashlib
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

SAVE_ROOT = Path('/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal')
REPO = Path(__file__).resolve().parents[4]
RAW_CAP = Path(__file__).resolve().parent.parent / 'tools' / 'RawCap.exe'
CAPTURE_DIR = Path('/mnt/c/beyond-ipc')


def find_current_map() -> Path:
    candidates = []
    for save_dir in SAVE_ROOT.glob('*/Beyond_Local_Save_Level'):
        for f in save_dir.glob('*.gil'):
            if f.name.endswith(('.bak', '.candidate', '.tmp')):
                continue
            candidates.append(f)
    if not candidates:
        raise SystemExit(f'no .gil found under {SAVE_ROOT}')
    return max(candidates, key=lambda p: p.stat().st_mtime)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def start_rawcap(pcap: Path) -> tuple[int, Path]:
    CAPTURE_DIR.mkdir(parents=True, exist_ok=True)
    if not RAW_CAP.exists():
        raise SystemExit(f'RawCap not found: {RAW_CAP}')
    dst = CAPTURE_DIR / 'RawCap.exe'
    if not dst.exists() or dst.read_bytes() != RAW_CAP.read_bytes():
        shutil.copy2(RAW_CAP, dst)
    ps = (
        "Start-Process -Verb RunAs -FilePath 'C:\\beyond-ipc\\RawCap.exe' "
        f"-ArgumentList '-s 1200 127.0.0.1 C:\\beyond-ipc\\{pcap.name}'"
    )
    subprocess.run(
        ['/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
         '-NoProfile', '-Command', ps],
        check=True,
    )
    # 等 UAC/进程起来后确认
    for _ in range(20):
        r = subprocess.run(
            ['/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
             '-NoProfile', '-Command', 'Get-Process RawCap -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id'],
            capture_output=True, text=True,
        )
        pids = [int(x) for x in r.stdout.split() if x.strip().isdigit()]
        if pids:
            return pids[-1], pcap
        import time
        time.sleep(0.5)
    raise SystemExit('RawCap did not start (UAC denied? check process)')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('probe', help='探针名，如 ui_probe / component_probe / transform_probe')
    ap.add_argument('--map', type=Path, default=None, help='手动指定当前地图路径')
    ap.add_argument('--dry-run', action='store_true', default=False,
                    help='只定位/保存 before，不启动 RawCap')
    args = ap.parse_args()

    map_path = args.map or find_current_map()
    date = datetime.now().strftime('%Y-%m-%d')
    ev = REPO / '.scratch' / 'beyond-semantic-resources' / 'evidence' / f'{date}-{args.probe}-probe'
    before_dir = ev / 'before'
    before_dir.mkdir(parents=True, exist_ok=True)
    before_gil = before_dir / map_path.name
    shutil.copy2(map_path, before_gil)
    h = sha256(before_gil)

    pcap = CAPTURE_DIR / f'{args.probe}.pcap'
    if args.dry_run:
        print('=== IPC DRY-RUN ===')
        print(f'map       : {map_path}')
        print(f'mapId     : {map_path.stem}')
        print(f"before    : {before_gil}")
        print(f"sha256    : {h}")
        print(f'pcap      : {pcap} (not started)')
        return

    pid, _ = start_rawcap(pcap)

    print('=== IPC READY ===')
    print(f'map       : {map_path}')
    print(f'mapId     : {map_path.stem}')
    print(f"before    : {before_gil}")
    print(f"sha256    : {h}")
    print(f'pcap      : {pcap}')
    print(f'rawcap pid: {pid}')
    print()
    print('请在编辑器里做一个最小变化，完成后告知“好了”。')


if __name__ == '__main__':
    main()
