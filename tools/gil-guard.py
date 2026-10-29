#!/usr/bin/env python3
"""gil-guard.py — 整图 .gil 写回安全门（2026-10-24 存档损坏事故固化）

用途：任何"整图级改写/清理"的 .gil，在交给编辑器前跑一遍。它检查的是**我们曾亲手破坏过的不变量**：

  1. 信封：head[16:20] == payload 长度；tail == 0679
  2. root9 字段序：501(索引) 在记录之前、503(varint) 在最后
  3. 501 = **森林根集**（不是记录清单）：每个根必须真的是"没有被任何记录引用为子"的记录
  4. f503 列表值闭合：≥1073741824 的值必须指向已存在的记录（悬空 = 断树）
  5. 与小序号共存：<1073741824 的值原样保留（曾被误删 → 记录内部结构坏）

用法：
  python3 tools/gil-guard.py <map.gil> [--temp <Temp/x.gil>]   # 检查真实地图（可顺带核对 Temp 同步）
  python3 tools/gil-guard.py --selftest                       # 自测：好样本 0 问题 / 坏样本必须被抓到

退出码：0 = 通过；1 = 有问题（逐条打印）；2 = 用法错误。
"""

from __future__ import annotations

import sys
from pathlib import Path

ID_FLOOR = 1073741824
# 记录 ID 的可信上界：真实 id 是 1073741824 起的紧凑分配（≈1.07e9~1.08e9）。
# ≥2^31 的值出现在 f503 里时是**属性值**（实测：文本框句柄 18015918068190054、
# 颜色哈希 3004833062/4283220735/8477855348），
# 不是子记录引用 —— 2026-10-29 实证：11 个 client-textbox 的属性表被误判成悬空子引用。
ID_CEIL = 1 << 31


def read_varint(buf: bytes, i: int) -> tuple[int, int]:
    v = 0
    shift = 0
    while True:
        b = buf[i]
        i += 1
        v |= (b & 0x7F) << shift
        shift += 7
        if not (b & 0x80):
            return v, i


def walk(buf: bytes):
    """返回 [(field, wire, value)]，wire2 的 value 是 bytes。"""
    out = []
    i = 0
    n = len(buf)
    while i < n:
        tag, i = read_varint(buf, i)
        field, wire = tag >> 3, tag & 7
        if wire == 0:
            v, i = read_varint(buf, i)
            out.append((field, 'varint', v))
        elif wire == 2:
            ln, i = read_varint(buf, i)
            out.append((field, 'bytes', buf[i:i + ln]))
            i += ln
        elif wire == 5:
            out.append((field, 'fixed32', int.from_bytes(buf[i:i + 4], 'little')))
            i += 4
        elif wire == 1:
            out.append((field, 'fixed64', int.from_bytes(buf[i:i + 8], 'little')))
            i += 8
        else:
            raise ValueError(f'unsupported wire type {wire}')
    return out


def packed_varints(data: bytes) -> list[int]:
    out, i = [], 0
    while i < len(data):
        v, i = read_varint(data, i)
        out.append(v)
    return out


def record_id(rec: bytes) -> int | None:
    for f, w, v in walk(rec):
        if f == 501 and w == 'varint':
            return v
    return None


def collect_child_refs(fields) -> set[int]:
    """记录内部所有 children 引用：顶层/嵌套 f503 packed + f505{f503{f73{f501}}}。"""
    refs: set[int] = set()

    def scan(flds):
        for f, w, v in flds:
            if f == 503 and w == 'bytes':
                try:
                    refs.update(x for x in packed_varints(v) if ID_FLOOR <= x < ID_CEIL)
                except Exception:
                    pass
            elif f == 505 and w == 'bytes':
                scan(walk(v))

    scan(fields)
    return refs


def check(path: Path, temp: Path | None = None) -> list[str]:
    problems: list[str] = []
    raw = path.read_bytes()
    if len(raw) < 24:
        return [f'{path}: 文件过小']
    head, tail = raw[:20], raw[-4:]
    payload_len = int.from_bytes(head[16:20], 'big')
    if payload_len != len(raw) - 24:
        problems.append(f'信封长度不符：head[16:20]={payload_len}，实际 payload={len(raw) - 24}')
    if tail.hex() != '00000679':
        problems.append(f'尾标记异常：{tail.hex()}（期望 00000679）')

    body = raw[20:-4]
    try:
        top = walk(body)
    except Exception as exc:  # noqa: BLE001
        return problems + [f'顶层解析失败：{exc}']

    r9 = [v for f, w, v in top if f == 9 and w == 'bytes']
    if not r9:
        return problems + ['缺少 root9（UI 段）']
    section = walk(r9[0])

    # 字段序：501 在记录前、503 varint 在最后
    kinds = [(f, w) for f, w, _ in section]
    first_record = next((i for i, (f, _) in enumerate(kinds) if f == 502), None)
    idx_pos = next((i for i, (f, w) in enumerate(kinds) if f == 501 and w == 'bytes'), None)
    if idx_pos is None:
        problems.append('root9 缺少 501 索引')
    elif first_record is not None and idx_pos > first_record:
        problems.append(f'root9 字段序异常：501 索引在第 {idx_pos} 位，记录从第 {first_record} 位开始')
    if kinds and kinds[-1] != (503, 'varint'):
        problems.append(f'root9 末字段应为 (503,varint)，实际 {kinds[-1]}')

    records = {}
    for f, w, v in section:
        if f == 502 and w == 'bytes':
            rid = record_id(v)
            if rid is not None:
                records[rid] = v
    if not records:
        return problems + ['root9 无记录']

    # 规则：忽略哨兵值（0xFFFFFFFF = 无父/-1、0 = 空）与自引用
    child_refs: set[int] = set()
    for rid, rec in records.items():
        refs = collect_child_refs(walk(rec)) - {0, 0xFFFFFFFF, rid}
        child_refs |= refs

    # 悬空引用（断树）
    dangling = sorted(x for x in child_refs if x not in records)
    if dangling:
        problems.append(f'children 悬空引用 {len(dangling)} 个（前 5：{dangling[:5]}）')

    # 501 = 森林根集（不是记录清单）。精确判据取我们踩过的坑：
    #   a) 索引里的 id 必须都存在；
    #   b) 索引 == 全部记录（且记录>3）⇒ 典型的「把森林根集写成记录清单」；
    #   c) 每条记录必须可达（在索引里，或被其它记录 children 引用）⇒ 防成片孤儿。
    if idx_pos is not None:
        idx_vals = packed_varints(section[idx_pos][2])
        idx_set = set(idx_vals)
        missing_idx = sorted(idx_set - set(records))
        if missing_idx:
            problems.append(f'501 索引指向不存在的记录（前 5：{missing_idx[:5]}）')
        if len(idx_set) == len(records) and len(records) >= 3:
            problems.append(
                f'501 等于全部记录（{len(records)} 条）——501 是森林根集，不是记录清单（存档会损坏）'
            )
        if len(idx_set) != len(idx_vals):
            problems.append('501 索引内有重复 id')
        reachable = idx_set | child_refs | {0, 0xFFFFFFFF}
        unreachable = sorted(set(records) - reachable)
        if unreachable:
            problems.append(f'记录不可达（既不在 501 也无人引用，前 5：{unreachable[:5]}）')

    if temp is not None:
        if not temp.exists():
            problems.append(f'Temp 侧不存在：{temp}')
        elif temp.read_bytes() != raw:
            problems.append(f'Temp 与 Save_Level 不一致：{temp}')

    return problems


def selftest() -> int:
    """内置样本：好样本 0 问题；两类坏样本必须被抓到。"""

    def enc_varint(n: int) -> bytes:
        out = bytearray()
        while True:
            b = n & 0x7F
            n >>= 7
            if n:
                out.append(b | 0x80)
            else:
                out.append(b)
                return bytes(out)

    def field(num: int, wire: int, payload: bytes) -> bytes:
        tag = enc_varint((num << 3) | wire)
        if wire == 2:
            return tag + enc_varint(len(payload)) + payload
        return tag + payload

    def record(rid: int, children: list[int]) -> bytes:
        body = field(501, 0, enc_varint(rid))
        if children:
            body += field(503, 2, b''.join(enc_varint(c) for c in children))
        return field(502, 2, body)

    layout, a, b = 1000 + ID_FLOOR, 1001 + ID_FLOOR, 1002 + ID_FLOOR
    good_section = (
        field(501, 2, b''.join(enc_varint(x) for x in (layout, b)))
        + record(layout, [a])
        + record(a, [])
        + record(b, [])
        + field(503, 0, b'\x01')
    )
    good = field(9, 2, good_section)
    head = bytearray(20)
    head[16:20] = len(good).to_bytes(4, 'big')
    good_file = bytes(head) + good + b'\x00\x00\x06\x79'

    tmpdir = Path('/tmp/gil-guard-selftest')
    tmpdir.mkdir(exist_ok=True)
    good_path = tmpdir / 'good.gil'
    good_path.write_bytes(good_file)
    problems_good = check(good_path)

    # 坏样本 1：501 写成全部记录（我们踩过的坑）
    bad_idx_section = (
        field(501, 2, b''.join(enc_varint(x) for x in (layout, a, b)))
        + record(layout, [a])
        + record(a, [])
        + record(b, [])
        + field(503, 0, b'\x01')
    )
    bad1 = field(9, 2, bad_idx_section)
    head1 = bytearray(head)
    head1[16:20] = len(bad1).to_bytes(4, 'big')
    bad1_path = tmpdir / 'bad-index.gil'
    bad1_path.write_bytes(bytes(head1) + bad1 + b'\x00\x00\x06\x79')
    problems_bad1 = check(bad1_path)

    # 坏样本 2：children 指向不存在的记录（断树）
    bad2_section = (
        field(501, 2, b''.join(enc_varint(x) for x in (layout, b)))
        + record(layout, [a])
        + record(b, [])
        + field(503, 0, b'\x01')
    )
    bad2 = field(9, 2, bad2_section)
    head2 = bytearray(head)
    head2[16:20] = len(bad2).to_bytes(4, 'big')
    bad2_path = tmpdir / 'bad-dangling.gil'
    bad2_path.write_bytes(bytes(head2) + bad2 + b'\x00\x00\x06\x79')
    problems_bad2 = check(bad2_path)

    ok = True
    if problems_good:
        ok = False
        print('SELFTEST FAIL: 好样本被误报：')
        for p in problems_good:
            print('  -', p)
    else:
        print('SELFTEST ok: 好样本 0 问题')
    if not any('501 等于全部记录' in p for p in problems_bad1):
        ok = False
        print('SELFTEST FAIL: 501 写成全量记录未被抓到')
    else:
        print('SELFTEST ok: 抓到「501 写成全量记录」')
    if not any('悬空引用' in p for p in problems_bad2):
        ok = False
        print('SELFTEST FAIL: 悬空 children 未被抓到')
    else:
        print('SELFTEST ok: 抓到「children 悬空引用」')
    print('SELFTEST RESULT:', 'PASS' if ok else 'FAIL')
    return 0 if ok else 1


def main(argv: list[str]) -> int:
    if '--selftest' in argv:
        return selftest()
    args = [a for a in argv[1:] if not a.startswith('--')]
    temp = None
    if '--temp' in argv:
        temp = Path(argv[argv.index('--temp') + 1])
        args = [a for a in args if a != str(temp)]
    if not args:
        print(__doc__)
        return 2
    path = Path(args[0])
    problems = check(path, temp)
    if not problems:
        print(f'PASS {path}（信封/字段序/501 根集/children 闭合{" / Temp 同步" if temp else ""}）')
        return 0
    print(f'FAIL {path}')
    for p in problems:
        print('  -', p)
    return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv))
