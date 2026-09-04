#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
quickstart_diff.py — 编辑器差分“轻量启动”。

功能:
  1. 自动定位当前地图（Beyond_Local_Save_Level 下最近修改的 .gil）
  2. 物理复制 before 快照到实验目录 + 记录 SHA-256
  3. 打印 READY 信息，等待用户做最小变化

用法:
  python3 quickstart_diff.py <probe-name> [--map <map.gil>]
"""
from __future__ import annotations

import argparse
import hashlib
import shutil
from datetime import datetime
from pathlib import Path

SAVE_ROOT = Path('/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal')
REPO = Path(__file__).resolve().parents[4]


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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('probe', help='实验名，如 ui-diff / component-diff / transform-diff')
    ap.add_argument('--map', type=Path, default=None, help='手动指定当前地图路径')
    args = ap.parse_args()

    map_path = args.map or find_current_map()
    date = datetime.now().strftime('%Y-%m-%d')
    ev = REPO / '.scratch' / 'editor-incremental-evidence' / f'{date}-{args.probe}'
    before_dir = ev / 'before'
    before_dir.mkdir(parents=True, exist_ok=True)
    before_gil = before_dir / map_path.name
    shutil.copy2(map_path, before_gil)
    h = sha256(before_gil)

    print('=== DIFF READY ===')
    print(f'map       : {map_path}')
    print(f'mapId     : {map_path.stem}')
    print(f'before    : {before_gil}')
    print(f'sha256    : {h}')
    print()
    print('请在编辑器做一个最小变化并保存，完成后告知“好了”。')


if __name__ == '__main__':
    main()
