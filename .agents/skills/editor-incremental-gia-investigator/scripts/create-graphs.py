#!/usr/bin/env python3
"""批量创建「服务器节点定义样本图」——真实 GIL 注入工具。

把一个批次（如 10 个/50 个）第三方 Server 节点放进同一个新节点图，
节点按网格排列（不重叠），供用户打开编辑器核验节点身份/引脚与 data.json 是否一致。

依据 node-graph-systematic v1 已确认的「新建图」wire 配方：
  - root 10 的 field1 记录末尾追加图记录（双层包装: field1 -> field1 -> NodeGraph）
    NodeGraph = {1: Id{1:10000,2:20000,3:21001,5:图ID}, 2: name(UTF-8), 3: nodes[*]}
    node = {1: nodeIndex(1..N 连续), 2/3: NodeProperty{1:10001,2:20000,3:22000,5:节点ID},
            5/6: x/y fixed32}
  - root 6（f1=4 记录）的 f2.f4（「调试」文件夹）内追加 f5={1:800, 2:图ID} 条目
不模拟: root 46 等长同步 / root10 field4 的 field106（编辑器保存副作用，游戏加载不依赖）。

用法:
  python create-graphs.py <map.gil> --defs <data.json> --node-ids 1,2,5 \
      [--name 图名] [--cols 5] [--x0 0] [--y0 0] [--dx 220] [--dy 180] \
      [--graph-id N] [--locked-hash HEX] [--dry-run]

--node-ids 逗号分隔的 data.json 节点 ID；全部放入同一个新图，图名 --name（默认「样本」）。
坐标: 第 i 个节点 (i 从 0) 位于 (x0 + (i%cols)*dx, y0 + (i//cols)*dy)。
--graph-id 默认 = 当前 GIL 已用对象 ID max+1。--dry-run 只打印计划不写盘。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gil_wire_lib as w

GIL_HEADER = 20
GIL_TRAILER = 4


def varint(n: int) -> bytes:
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def ldel(field: int, content: bytes) -> bytes:
    return varint(field << 3 | 2) + varint(len(content)) + content


def f32v(field: int, x: float) -> bytes:
    return varint(field << 3 | 5) + struct.pack('<f', x)


def walk_off(buf: bytes) -> list[tuple[int, int, bytes | int, int, int]]:
    """(field, wire, value, start, end)：value 为解析值，start/end 为完整记录区间。"""
    out = []
    i = 0
    n = len(buf)
    while i < n:
        start = i
        tag = 0
        shift = 0
        while True:
            try:
                b = buf[i]
            except IndexError:
                raise ValueError(f'truncated tag at {start}')
            i += 1
            tag |= (b & 0x7F) << shift
            shift += 7
            if not (b & 0x80):
                break
        field, wire = tag >> 3, tag & 7
        if wire == 0:
            v = 0
            shift = 0
            while True:
                try:
                    b = buf[i]
                except IndexError:
                    raise ValueError(f'truncated varint at {start}')
                i += 1
                v |= (b & 0x7F) << shift
                shift += 7
                if not (b & 0x80):
                    break
            out.append((field, wire, v, start, i))
        elif wire == 2:
            ln = 0
            shift = 0
            while True:
                try:
                    b = buf[i]
                except IndexError:
                    raise ValueError(f'truncated length at {start}')
                i += 1
                ln |= (b & 0x7F) << shift
                shift += 7
                if not (b & 0x80):
                    break
            v = buf[i:i + ln]
            i += ln
            out.append((field, wire, v, start, i))
        elif wire == 5:
            v = struct.unpack('<I', buf[i:i + 4])[0]
            i += 4
            out.append((field, wire, v, start, i))
        elif wire == 1:
            v = struct.unpack('<Q', buf[i:i + 8])[0]
            i += 8
            out.append((field, wire, v, start, i))
        else:
            raise ValueError(f'unsupported wire type {wire} at {start}')
    return out


def node_prop(id5: int) -> bytes:
    return (varint(8) + varint(10001) + varint(16) + varint(20000)
            + varint(24) + varint(22000) + varint(40) + varint(id5))


def node_record(node_index: int, node_id: int, x: float, y: float) -> bytes:
    p = node_prop(node_id)
    return varint(8) + varint(node_index) + ldel(2, p) + ldel(3, p) + f32v(5, x) + f32v(6, y)


def graph_record(graph_id: int, name: str, nodes: list[bytes]) -> bytes:
    gid = (varint(8) + varint(10000) + varint(16) + varint(20000)
           + varint(24) + varint(21001) + varint(40) + varint(graph_id))
    ng = ldel(1, gid) + ldel(2, name.encode('utf-8')) + b''.join(ldel(3, n) for n in nodes)
    return ldel(1, ldel(1, ng))


def folder_entry(graph_id: int) -> bytes:
    """root6 「调试」文件夹条目: f5={1:800, 2:图ID}"""
    return ldel(5, varint(8) + varint(800) + varint(16) + varint(graph_id))


def find_graph_ids(payload: bytes) -> list[int]:
    """递归扫描全部 Id 消息的 field5，收集 1073741xxx 已用对象 ID。"""
    seen: set[bytes] = set()
    ids: set[int] = set()

    def scan(buf: bytes, depth: int = 0) -> None:
        if buf in seen or depth > 6:
            return
        seen.add(buf)
        try:
            fields = walk_off(buf)
        except (ValueError, IndexError, struct.error):
            return
        id5 = None
        for f, t, v, _s, _e in fields:
            if f == 5 and t == 0 and 1073740000 <= v <= 1073741999:
                id5 = v
            if t == 2 and isinstance(v, bytes):
                scan(v, depth + 1)
        if id5 is not None:
            ids.add(id5)

    scan(payload)
    return sorted(ids)


def find_graph_rec(payload: bytes, graph_id: int) -> tuple | None:
    """root10 中定位 Id.f5 == graph_id 的 (外层记录, NodeGraph 记录)；找不到返回 None。"""
    r10 = [r for r in walk_off(payload) if r[0] == 10 and r[1] == 2]
    if not r10:
        return None
    for r in walk_off(r10[0][2]):
        if r[0] != 1 or r[1] != 2:
            continue
        inner = [x for x in walk_off(r[2]) if x[0] == 1 and x[1] == 2]
        if not inner:
            continue
        ng = inner[0]
        ident = {}
        for f, t, v, _s, _e in walk_off(ng[2]):
            if f == 1 and t == 2:
                ident = {(f2, t2): v2 for f2, t2, v2, _s2, _e2 in walk_off(v)}
                break
        if ident.get((5, 0)) == graph_id:
            return (r, ng)
    return None


def max_node_index(ng: tuple) -> int:
    """NodeGraph 内现有最大 nodeIndex；无节点返回 0。"""
    mx = 0
    for x in walk_off(ng[2]):
        if x[0] != 3 or x[1] != 2:
            continue
        for f, t, v, _s, _e in walk_off(x[2]):
            if f == 1 and t == 0:
                mx = max(mx, v)
                break
    return mx


def graph_node_ids(ng: tuple) -> set[int]:
    """NodeGraph 内全部节点 ID（genericId.field5）。"""
    out: set[int] = set()
    for x in walk_off(ng[2]):
        if x[0] != 3 or x[1] != 2:
            continue
        for f, t, v, _s, _e in walk_off(x[2]):
            if f == 2 and t == 2:
                inner = {(f2, t2): v2 for f2, t2, v2, _s2, _e2 in walk_off(v)}
                nid = inner.get((5, 0))
                if nid:
                    out.add(nid)
                break
    return out


def used_graph_names(payload: bytes) -> set[str]:
    """root10 内全部图名。"""
    out: set[str] = set()
    r10 = [r for r in walk_off(payload) if r[0] == 10 and r[1] == 2]
    if not r10:
        return out
    for r in walk_off(r10[0][2]):
        if r[0] != 1 or r[1] != 2:
            continue
        inner = [x for x in walk_off(r[2]) if x[0] == 1 and x[1] == 2]
        if not inner:
            continue
        for f, t, v, _s, _e in walk_off(inner[0][2]):
            if f == 2 and t == 2:
                nm = v.decode('utf-8', errors='replace')
                if nm:
                    out.add(nm)
                break
    return out


def next_graph_name(payload: bytes, prefix: str) -> str:
    """prefix-XX 自动编号，跳过已用图名。"""
    used = used_graph_names(payload)
    idx = 1
    while f'{prefix}-{idx:02d}' in used:
        idx += 1
    return f'{prefix}-{idx:02d}'


def inject(map_path: Path, defs: dict, node_ids: list[int], name: str, cols: int,
           x0: float, y0: float, dx: float, dy: float, graph_id: int | None,
           dry_run: bool, locked_hash: str | None, backup: bool = True) -> int:
    raw = map_path.read_bytes()
    if locked_hash:
        cur = hashlib.sha256(raw).hexdigest()
        if cur != locked_hash:
            print(f'ERROR: locked hash mismatch: {cur} != {locked_hash}', file=sys.stderr)
            return 2
    payload = bytearray(raw[GIL_HEADER:-GIL_TRAILER])

    # 1. 节点定义校验 + 坐标网格（append 模式接续图中已有节点数，避免重叠）
    node_infos: list[tuple[int, str, float, float]] = []
    base = 0
    if graph_id:
        t0 = find_graph_rec(bytes(payload), graph_id)
        if t0:
            base = max_node_index(t0[1])
    for i, nid in enumerate(node_ids):
        node = next((n for n in defs['Nodes'] if n['ID'] == nid), None)
        if node is None:
            print(f'ERROR: node id {nid} not found in defs', file=sys.stderr)
            return 2
        iname = node.get('InGameName', {}).get('zh-Hans', '') or node.get('Identifier', f'node-{nid}')
        x = x0 + ((base + i) % cols) * dx
        y = y0 + ((base + i) // cols) * dy
        node_infos.append((nid, iname, x, y))

    # 2. 目标图：--graph-id 指向已有图 → 追加模式；否则新建
    used = find_graph_ids(bytes(payload))
    target = find_graph_rec(bytes(payload), graph_id) if graph_id else None
    if graph_id and target is None:
        print(f'ERROR: graph id {graph_id} not found (cannot append)', file=sys.stderr)
        return 2
    append_mode = target is not None
    if append_mode:
        gid = graph_id
    else:
        gid = graph_id if graph_id else (max(used) + 1 if used else 1073741836)
        if gid in used:
            print(f'ERROR: graph id {gid} already used', file=sys.stderr)
            return 2

    # 3. 构建节点记录（append 时 nodeIndex 接续现有最大）
    start_idx = max_node_index(target[1]) + 1 if append_mode else 1
    node_recs = [node_record(start_idx + i, nid, x, y)
                 for i, (nid, _iname, x, y) in enumerate(node_infos)]

    if dry_run:
        mode = 'APPEND' if append_mode else 'NEW'
        print(f'PLAN[{mode}]: graph {gid} name={name if not append_mode else "(已有图)"} nodes={len(node_recs)}')
        for i, (nid, iname, x, y) in enumerate(node_infos):
            print(f'  nodeIndex={start_idx + i} id={nid} {iname} (x={x:.0f}, y={y:.0f})')
        print(f'DRY-RUN: no write. used ids={used}')
        return 0

    # 4. root 10 修改
    root10 = [r for r in walk_off(bytes(payload)) if r[0] == 10 and r[1] == 2][0]
    if append_mode:
        ng = target[1]
        new_ng = ng[2] + b''.join(ldel(3, rec) for rec in node_recs)
        new_outer = ldel(1, ldel(1, new_ng))
        new_root10 = root10[2][:target[0][3]] + new_outer + root10[2][target[0][4]:]
    else:
        f1_recs = [r for r in walk_off(root10[2]) if r[0] == 1 and r[1] == 2]
        insert_at = f1_recs[-1][4] if f1_recs else len(root10[2])
        new_root10 = (root10[2][:insert_at]
                      + graph_record(gid, name, node_recs)
                      + root10[2][insert_at:])

    # 5. root 6（仅新建模式：f1=4 记录 → f2 → f4（「调试」文件夹）追加 folder 条目）
    if not append_mode:
        root6 = [r for r in walk_off(bytes(payload)) if r[0] == 6 and r[1] == 2][0]
        rec4 = None
        for r in walk_off(root6[2]):
            if r[0] != 1 or r[1] != 2:
                continue
            for f, t, v, _s, _e in walk_off(r[2]):
                if f == 1 and t == 0 and v == 4:
                    rec4 = r
                    break
            if rec4:
                break
        if rec4 is None:
            print('ERROR: root6 f1=4 record not found', file=sys.stderr)
            return 2
        f2s = [r for r in walk_off(rec4[2]) if r[0] == 2 and r[1] == 2]
        f4s = [r for r in walk_off(f2s[0][2]) if r[0] == 4 and r[1] == 2] if f2s else []
        if not f2s or not f4s:
            print('ERROR: root6 record4 f2.f4 not found', file=sys.stderr)
            return 2
        f2, f4 = f2s[0], f4s[0]
        new_f4 = f4[2] + folder_entry(gid)
        new_f2 = f2[2][:f4[3]] + ldel(4, new_f4) + f2[2][f4[4]:]
        new_rec4 = rec4[2][:f2[3]] + ldel(2, new_f2) + rec4[2][f2[4]:]
        new_root6 = root6[2][:rec4[3]] + ldel(1, new_rec4) + root6[2][rec4[4]:]

    # 6. 替换记录 + 更新 header 长度字段 + 备份 + 写回
    #    GIL header: [0:4]=文件总长-4, [16:20]=payload 长度（大端 uint32）；
    #    游戏加载时校验，必须同步（编辑器保存轮次 v0-v6 均如此）
    payload[root10[3]:root10[4]] = ldel(10, bytes(new_root10))
    if not append_mode:
        payload[root6[3]:root6[4]] = ldel(6, bytes(new_root6))
    new_raw = bytearray(raw)
    new_raw[GIL_HEADER:-GIL_TRAILER] = bytes(payload)
    new_raw[0:4] = struct.pack('>I', len(new_raw) - 4)
    new_raw[16:20] = struct.pack('>I', len(new_raw) - GIL_HEADER - GIL_TRAILER)
    new_raw = bytes(new_raw)
    old_sha = hashlib.sha256(raw).hexdigest()
    new_sha = hashlib.sha256(new_raw).hexdigest()
    # 自检: header 长度字段与文件一致性
    if struct.unpack('>I', new_raw[0:4])[0] != len(new_raw) - 4 or \
       struct.unpack('>I', new_raw[16:20])[0] != len(new_raw) - GIL_HEADER - GIL_TRAILER:
        print('ERROR: header length fields inconsistent', file=sys.stderr)
        return 2
    bak = map_path.with_name(
        f'{map_path.name}.before-create-graphs-{time.strftime("%Y%m%d-%H%M%S")}.bak')
    if backup:
        bak.write_bytes(raw)
        print(f'backup: {bak}')
    map_path.write_bytes(new_raw)
    print(f'before: {len(raw)}B sha256={old_sha}')
    print(f'after:  {len(new_raw)}B sha256={new_sha}')
    print(f'CREATED graph {gid} name={name} nodes={len(node_recs)}')
    for i, (nid, iname, _x, _y) in enumerate(node_infos):
        x = x0 + ((base + i) % cols) * dx
        y = y0 + ((base + i) // cols) * dy
        print(f'  nodeIndex={start_idx + i} id={nid} {iname} (x={x:.0f}, y={y:.0f})')
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description='批量创建「服务器节点定义样本图」（一图多节点网格排列）')
    ap.add_argument('map', type=Path)
    ap.add_argument('--defs', type=Path, required=True, help='第三方 data.json')
    ap.add_argument('--node-ids', default=None, help='逗号分隔节点 ID；与 --all-server 二选一')
    ap.add_argument('--all-server', action='store_true',
                    help='枚举 data.json 全部 Server 节点（按 ID 排序），自动分批注入')
    ap.add_argument('--batch-size', type=int, default=50, help='每批（每图）节点数')
    ap.add_argument('--name-prefix', default='样本', help='新图名前缀（自动编号 XX）')
    ap.add_argument('--name', default=None, help='单批模式指定图名（不编号）')
    ap.add_argument('--cols', type=int, default=5, help='每行节点数')
    ap.add_argument('--x0', type=float, default=0.0)
    ap.add_argument('--y0', type=float, default=0.0)
    ap.add_argument('--dx', type=float, default=440.0, help='列间距')
    ap.add_argument('--dy', type=float, default=360.0, help='行间距')
    ap.add_argument('--graph-id', type=int, default=None,
                    help='指定图 ID；若该图已存在则追加节点，否则新建')
    ap.add_argument('--locked-hash', default=None)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--no-backup', action='store_true', help='不写 .bak（批处理模式后续批用）')
    args = ap.parse_args()
    defs = json.loads(args.defs.read_text(encoding='utf-8'))
    if args.all_server:
        node_ids = sorted(n['ID'] for n in defs['Nodes'] if n.get('System') == 'Server')
    else:
        if not args.node_ids:
            print('ERROR: --node-ids or --all-server required', file=sys.stderr)
            return 2
        node_ids = [int(x) for x in args.node_ids.split(',') if x.strip()]
    if not node_ids:
        print('ERROR: empty node list', file=sys.stderr)
        return 2

    # 分批：--graph-id 已有图先补齐（自动跳过图中已有节点 ID），其余每批新建图
    raw = args.map.read_bytes()
    if args.locked_hash:
        if hashlib.sha256(raw).hexdigest() != args.locked_hash:
            print(f'ERROR: locked hash mismatch: {hashlib.sha256(raw).hexdigest()} != {args.locked_hash}',
                  file=sys.stderr)
            return 2
    payload = raw[GIL_HEADER:-GIL_TRAILER]
    existing = 0
    have: set[int] = set()
    if args.graph_id:
        t = find_graph_rec(payload, args.graph_id)
        if t is None:
            print(f'ERROR: graph id {args.graph_id} not found', file=sys.stderr)
            return 2
        existing = max_node_index(t[1])
        have = graph_node_ids(t[1])
        node_ids = [i for i in node_ids if i not in have]
    if not node_ids:
        print('no new nodes to inject', file=sys.stderr)
        return 1
    cap = args.batch_size - existing if args.graph_id else args.batch_size
    batches = [node_ids[:cap]]
    rest = node_ids[cap:]
    while rest:
        batches.append(rest[:args.batch_size])
        rest = rest[args.batch_size:]

    print(f'共 {len(node_ids)} 个节点，分 {len(batches)} 批')
    cur_hash = args.locked_hash
    backup = not args.no_backup
    name_used = set(used_graph_names(payload))
    for bi, batch in enumerate(batches):
        if not args.dry_run:
            payload = args.map.read_bytes()[GIL_HEADER:-GIL_TRAILER]
        if args.graph_id and bi == 0:
            gid = args.graph_id
            bname = args.name or '样本-01'
        else:
            gid = None
            if args.name:
                bname = args.name
            else:
                idx = 1
                while f'{args.name_prefix}-{idx:02d}' in name_used:
                    idx += 1
                bname = f'{args.name_prefix}-{idx:02d}'
                name_used.add(bname)
        code = inject(args.map, defs, batch, bname, args.cols, args.x0, args.y0,
                      args.dx, args.dy, gid, args.dry_run, cur_hash, backup=backup)
        if code:
            return code
        backup = False
        if not args.dry_run:
            cur_hash = hashlib.sha256(args.map.read_bytes()).hexdigest()
    return 0


if __name__ == '__main__':
    sys.exit(main())
