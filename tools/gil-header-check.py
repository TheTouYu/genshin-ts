#!/usr/bin/env python3
"""GIL 文件头长度不变量检查（2026-10-24 事故防线）。

规则（已在 docs/game-engine-knowledge/gil-structure-semantics.md 闭合 2026-08-05，2026-10-24 复发）：
  hdr[0:4]   = 文件总长 − 4
  hdr[16:20] = payload 长度 = 文件总长 − 24
  其余 12B（schema=1 / headTag=0x0326 / fileType）/ trailer(0x0679) 保存时不变

为什么要有这条门禁：只改 payload 不同步头部两个长度字段 → **编辑器/游戏判「存档已损坏」**。
2026-10-24 我把技能变量记录写进 root15，记录字节与编辑器**逐字节一致**，但整文件重建时复制了旧
header（长度没更新），两次被判损坏。**结构对 ≠ 文件对。**

用法：
    python3 tools/gil-header-check.py <file.gil|目录> [...]        # 检查，违规 exit 1
    python3 tools/gil-header-check.py --selftest                   # 自证：好样本 PASS / 伪造坏样本 FAIL
"""
from __future__ import annotations

import argparse
import struct
import sys
from pathlib import Path

HEAD_TAG = 0x0326
TAIL_TAG = 0x0679


def check_file(path: Path) -> list[str]:
    problems: list[str] = []
    data = path.read_bytes()
    if len(data) < 24:
        return [f"{path}: 太小（{len(data)}B < 24）"]
    size = len(data)
    w0, t1, head_tag, t2, w16 = struct.unpack(">5I", data[:20])
    tail = struct.unpack(">I", data[-4:])[0]
    if w0 != size - 4:
        problems.append(f"{path}: hdr[0:4]={w0} ≠ size-4={size - 4}（差 {w0 - (size - 4)}）")
    if w16 != size - 24:
        problems.append(f"{path}: hdr[16:20]={w16} ≠ size-24={size - 24}（差 {w16 - (size - 24)}）")
    if head_tag != HEAD_TAG:
        problems.append(f"{path}: headTag=0x{head_tag:04x} ≠ 0x0326")
    if tail != TAIL_TAG:
        problems.append(f"{path}: trailer=0x{tail:04x} ≠ 0x0679")
    if t1 != 1 or t2 != 2:
        problems.append(f"{path}: schema/fileType=({t1},{t2}) 预期 (1,2)")
    return problems


def expand(targets: list[str]) -> list[Path]:
    out: list[Path] = []
    for t in targets:
        p = Path(t).expanduser()
        if p.is_dir():
            out.extend(sorted(p.rglob("*.gil")))
        elif p.is_file():
            out.append(p)
        else:
            print(f"SKIP 不存在：{p}")
    return out


def bad_fixture(tmp: Path) -> Path:
    """造一个「payload 变长但 header 没更新」的坏样本。"""
    good = tmp / "good.gil"
    payload = b"\x0a\x03abc"
    size = len(payload) + 24
    head = struct.pack(">5I", size - 4, 1, HEAD_TAG, 2, len(payload))
    good.write_bytes(head + payload + struct.pack(">I", TAIL_TAG))
    bad = tmp / "bad.gil"
    stale = struct.pack(">5I", size - 4, 1, HEAD_TAG, 2, len(payload))
    bad.write_bytes(stale + payload + b"EXTRA" + struct.pack(">I", TAIL_TAG))
    return bad


def selftest() -> int:
    import tempfile

    fails = 0
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        bad = bad_fixture(tmp)
        good = tmp / "good.gil"
        if check_file(good):
            fails += 1
            print(f"FAIL 好样本应 PASS，实得 {check_file(good)}")
        else:
            print("PASS 好样本 PASS")
        problems = check_file(bad)
        if any("hdr[0:4]" in p for p in problems) and any("hdr[16:20]" in p for p in problems):
            print(f"PASS 坏样本被抓到（{len(problems)} 条）")
        else:
            fails += 1
            print(f"FAIL 坏样本未被抓到：{problems}")
    print(f"RESULT: {'PASS' if not fails else 'FAIL'}（gil-header selftest）")
    return 0 if not fails else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="GIL 头部长度不变量检查")
    ap.add_argument("targets", nargs="*", help=".gil 文件或目录（递归）")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return selftest()
    if not args.targets:
        ap.print_help()
        return 2

    files = expand(args.targets)
    if not files:
        print("RESULT: FAIL（没有可检查的 .gil）")
        return 1
    total = 0
    for f in files:
        problems = check_file(f)
        total += len(problems)
        if problems:
            for p in problems:
                print(f"FAIL {p}")
        else:
            print(f"ok   {f}（{len(f.read_bytes())}B）")
    print(f"\n检查 {len(files)} 个文件，问题 {total} 条")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
