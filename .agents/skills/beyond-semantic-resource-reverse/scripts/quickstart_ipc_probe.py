#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
quickstart_ipc_probe.py — IPC 抓包“轻量启动/收尾”。

功能:
  启动: 自动定位地图 -> 保存 before -> 启动 RawCap -> 打印 READY
  收尾: --stop 停止 RawCap; --finish 停止并把最终 pcap 复制进 evidence

用法:
  python3 quickstart_ipc_probe.py [probe-name] [--map <map.gil>] [--dry-run]
  python3 quickstart_ipc_probe.py --stop <probe-name>
  python3 quickstart_ipc_probe.py --finish <probe-name> [--force]

probe-name 可省略；省略时自动生成 probe_YYYYmmdd_HHMMSS，不要为取名停顿。
--finish 会先停止 RawCap（必要时弹 UAC），再把 C:\\beyond-ipc\\<probe>.pcap
复制到 evidence/<date>-<probe>-probe/ipc/ 并打印 sha256。
"""
from __future__ import annotations

import argparse
import hashlib
import shutil
import subprocess
import time
from datetime import datetime
from pathlib import Path

SAVE_ROOT = Path('/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal')
REPO = Path(__file__).resolve().parents[4]
RAW_CAP = Path(__file__).resolve().parent.parent / 'tools' / 'RawCap.exe'
CAPTURE_DIR = Path('/mnt/c/beyond-ipc')
POWERSHELL = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'


def auto_probe() -> str:
    return 'probe_' + datetime.now().strftime('%Y%m%d_%H%M%S')


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


def evidence_dir_for_today(probe: str) -> Path:
    date = datetime.now().strftime('%Y-%m-%d')
    return REPO / '.scratch' / 'beyond-semantic-resources' / 'evidence' / f'{date}-{probe}-probe'


def find_existing_evidence(probe: str) -> Path:
    root = REPO / '.scratch' / 'beyond-semantic-resources' / 'evidence'
    hits = []
    for d in root.glob(f'*-{probe}-probe'):
        if d.is_dir():
            hits.append(d)
    if not hits:
        raise SystemExit(f'未找到 evidence 目录: *-{probe}-probe under {root}')
    return max(hits, key=lambda p: p.stat().st_mtime)


def run_ps(command: str, capture: bool = False):
    argv = [POWERSHELL, '-NoProfile', '-Command', command]
    if capture:
        return subprocess.run(argv, capture_output=True, text=True)
    return subprocess.run(argv)


def rawcap_pids() -> list[int]:
    r = run_ps('Get-Process RawCap -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id', capture=True)
    return [int(x) for x in r.stdout.split() if x.strip().isdigit()]


def start_rawcap(pcap: Path, pid_file: Path) -> int:
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
    run_ps(ps)
    # 等 UAC/进程起来后确认
    for _ in range(20):
        pids = rawcap_pids()
        if pids:
            pid = pids[-1]
            pid_file.parent.mkdir(parents=True, exist_ok=True)
            pid_file.write_text(str(pid), encoding='utf-8')
            return pid
        time.sleep(0.5)
    raise SystemExit('RawCap did not start (UAC denied? check process)')


def stop_rawcap(pid: int) -> bool:
    # 先普通权限尝试，失败（RawCap 是管理员进程）再提权 taskkill
    run_ps(f'Stop-Process -Id {pid} -Force -ErrorAction SilentlyContinue')
    time.sleep(0.5)
    if int(pid) not in rawcap_pids():
        return True
    run_ps(
        "Start-Process -Verb RunAs -Wait -FilePath 'C:\\Windows\\System32\\taskkill.exe' "
        f"-ArgumentList '/F','/PID','{pid}'"
    )
    time.sleep(0.5)
    return int(pid) not in rawcap_pids()


def do_stop(probe: str) -> tuple[Path, int]:
    ev = find_existing_evidence(probe)
    pid_file = ev / 'rawcap.pid'
    if not pid_file.exists():
        raise SystemExit(f'pid 文件不存在: {pid_file}（可能尚未启动或已手动停止）')
    pid = int(pid_file.read_text(encoding='utf-8').strip())
    if not stop_rawcap(pid):
        raise SystemExit(f'RawCap pid={pid} 仍在运行，停止失败（UAC 被取消？）')
    try:
        pid_file.unlink()
    except OSError:
        pass
    return ev, pid


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('probe', nargs='?', default=None, help='探针名，省略则自动生成')
    ap.add_argument('--map', type=Path, default=None, help='手动指定当前地图路径')
    ap.add_argument('--dry-run', action='store_true', default=False,
                    help='只定位/保存 before，不启动 RawCap')
    ap.add_argument('--stop', action='store_true', default=False, help='停止已启动的 RawCap')
    ap.add_argument('--finish', action='store_true', default=False,
                    help='停止 RawCap 并复制最终 pcap 到 evidence/ipc')
    ap.add_argument('--force', action='store_true', default=False,
                    help='允许覆盖已存在的 pcap/复制产物')
    args = ap.parse_args()

    # ---- 收尾模式 ----
    if args.stop or args.finish:
        if not args.probe:
            raise SystemExit('--stop/--finish 必须提供 probe 名（自动名只在启动时生成）')
        ev, pid = do_stop(args.probe)
        print(f'RawCap stopped pid={pid}')
        if not args.finish:
            return
        pcap = CAPTURE_DIR / f'{args.probe}.pcap'
        if not pcap.exists():
            raise SystemExit(f'pcap 不存在: {pcap}')
        ipc_dir = ev / 'ipc'
        ipc_dir.mkdir(parents=True, exist_ok=True)
        dst = ipc_dir / pcap.name
        if dst.exists() and not args.force:
            raise SystemExit(f'pcap 已存在，拒绝覆盖: {dst}（用 --force 覆盖）')
        shutil.copy2(pcap, dst)
        h = sha256(dst)
        print('=== IPC FINISHED ===')
        print(f'probe   : {args.probe}')
        print(f'pcap    : {pcap}')
        print(f'evidence: {dst}')
        print(f'sha256  : {h}')
        return

    # ---- 启动模式 ----
    probe = args.probe or auto_probe()
    map_path = args.map or find_current_map()
    ev = evidence_dir_for_today(probe)
    before_dir = ev / 'before'
    before_dir.mkdir(parents=True, exist_ok=True)
    before_gil = before_dir / map_path.name
    if before_gil.exists():
        raise SystemExit(f'before 已存在，拒绝覆盖: {before_gil}（请换 probe 名或先归档旧实验）')
    shutil.copy2(map_path, before_gil)
    h = sha256(before_gil)

    pcap = CAPTURE_DIR / f'{probe}.pcap'
    if not args.dry_run and pcap.exists() and not args.force:
        raise SystemExit(f'pcap 已存在，拒绝覆盖: {pcap}（用 --force 覆盖或换 probe 名）')

    if args.dry_run:
        print('=== IPC DRY-RUN ===')
        print(f'probe     : {probe}')
        print(f'map       : {map_path}')
        print(f'mapId     : {map_path.stem}')
        print(f'before    : {before_gil}')
        print(f'sha256    : {h}')
        print(f'pcap      : {pcap} (not started)')
        return

    pid = start_rawcap(pcap, ev / 'rawcap.pid')

    print('=== IPC READY ===')
    print(f'probe     : {probe}')
    print(f'map       : {map_path}')
    print(f'mapId     : {map_path.stem}')
    print(f'before    : {before_gil}')
    print(f'sha256    : {h}')
    print(f'pcap      : {pcap}')
    print(f'rawcap pid: {pid}')
    print(f'pid file  : {ev / "rawcap.pid"}')
    print()
    print('请在编辑器里做一个最小变化，完成后运行：')
    print(f'  python3 .agents/skills/beyond-semantic-resource-reverse/scripts/quickstart_ipc_probe.py --finish {probe}')
    print('或直接告知“好了”。')


if __name__ == '__main__':
    main()
