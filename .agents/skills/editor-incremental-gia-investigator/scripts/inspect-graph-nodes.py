#!/usr/bin/env python3
"""列出 GIL 中目标 NodeGraph 的所有节点摘要；--pins 时输出每个实例 pin 的详细解码。

用法:
  python inspect-graph-nodes.py <map.gil> <graphId> [--pins]
输出:
  每节点一行 JSON: nodeIndex / genericId / concreteId / pinCount / x / y (float)
  --pins 时每个 pin 附 i1/i2(kind/index) / type(VarType) / value 摘要
背景: 系统性节点图调查资产; 只读, 不修改文件。
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gil_wire_lib as w

GIL_HEADER = 20
GIL_TRAILER = 4

# NodePin_Index_Kind / VarBase_Class / VarType 名称表（vendor gia.proto 对照）
KIND_NAMES = {1: 'InFlow', 2: 'OutFlow', 3: 'InParam', 4: 'OutParam', 5: 'ClientExecNode', 6: 'ClientSignal'}
CLASS_NAMES = {1: 'IdBase', 2: 'IntBase', 4: 'FloatBase', 5: 'StringBase', 6: 'EnumBase',
               7: 'VectorBase', 10000: 'ConcreteBase', 10001: 'StructBase', 10002: 'ArrayBase'}
VARBASE_ONEOF = {101: 'bId', 102: 'bInt', 104: 'bFloat', 105: 'bString', 106: 'bEnum',
                 107: 'bVector', 108: 'bStruct', 109: 'bArray', 110: 'bConcreteValue',
                 111: 'bMapPair', 112: 'bMap'}


def load_payload(path: Path) -> bytes:
    data = path.read_bytes()
    if len(data) < GIL_HEADER + GIL_TRAILER:
        raise ValueError(f'not a GIL (too short): {path}')
    return data[GIL_HEADER:-GIL_TRAILER]


def find_graph(payload: bytes, graph_id: int) -> bytes | None:
    """root 10 -> field 1[*] (双层包装) -> 内层 NodeGraph, 按 Id.field5 匹配。"""
    root10 = [v for f, wt, v in w.walk(payload) if f == 10 and wt == 'bytes']
    if not root10:
        return None
    for f, wt, rec in w.walk(root10[0]):
        if f != 1 or wt != 'bytes':
            continue
        inners = [v2 for f2, t2, v2 in w.walk(rec) if f2 == 1 and t2 == 'bytes']
        if not inners:
            continue
        ng = inners[0]
        ident = {}
        for f2, t2, v2 in w.walk(ng):
            if f2 == 1 and t2 == 'bytes':
                ident = {(f3, t3): v3 for f3, t3, v3 in w.walk(v2)}
                break
        if ident.get((5, 'varint')) == graph_id:
            return ng
    return None


def decode_index(buf: bytes) -> dict:
    """NodePin_Index: {1: kind, 2: index}。"""
    fields = {(f, t): v for f, t, v in w.walk(buf)}
    kind = fields.get((1, 'varint'), 0)
    idx = fields.get((2, 'varint'))
    return {'kind': kind, 'kindName': KIND_NAMES.get(kind, '?'), 'index': idx}


def decode_value(buf: bytes) -> dict:
    """VarBase 摘要: class / alreadySetVal / itemType VarType / oneof 值。"""
    out: dict = {}
    for f, t, v in w.walk(buf):
        if (f, t) == (1, 'varint'):
            out['class'] = v
            out['className'] = CLASS_NAMES.get(v, '?')
        elif (f, t) == (2, 'varint'):
            out['alreadySetVal'] = bool(v)
        elif f == 4 and t == 'bytes':
            inner = {(f2, t2): v2 for f2, t2, v2 in w.walk(v)}
            ts = inner.get((100, 'bytes'))
            if ts:
                vtype = {(f3, t3): v3 for f3, t3, v3 in w.walk(ts)}.get((1, 'varint'))
                out['varType'] = vtype
        elif f in VARBASE_ONEOF and t == 'bytes':
            oneof = VARBASE_ONEOF[f]
            inner = {(f2, t2): v2 for f2, t2, v2 in w.walk(v)}
            if oneof == 'bVector':
                vec = {(f2, t2): v2 for f2, t2, v2 in w.walk(inner.get((1, 'bytes'), b''))}
                out[oneof] = [w.f32(vec[(i, 'fixed32')]) if (i, 'fixed32') in vec else None for i in (1, 2, 3)]
            else:
                val = inner.get((1, 'varint'))
                if val is not None:
                    out[oneof] = val
                elif oneof == 'bString':
                    s = inner.get((1, 'bytes'))
                    out[oneof] = w.utf8_or_none(s) if s is not None else None
                else:
                    out[oneof] = f'<{len(v)}B>'
        elif f in VARBASE_ONEOF and t == 'varint':
            # 罕见: 空 oneof 消息以零长出现, 忽略
            pass
    return out


def decode_pin(buf: bytes) -> dict:
    """单个 NodePin: i1 / i2 / value / type。"""
    out: dict = {}
    for f, t, v in w.walk(buf):
        if f == 1 and t == 'bytes':
            out['i1'] = decode_index(v)
        elif f == 2 and t == 'bytes':
            out['i2'] = decode_index(v)
        elif f == 3 and t == 'bytes':
            out['value'] = decode_value(v)
        elif f == 4 and t == 'varint':
            out['type'] = v
        elif f == 5 and t == 'bytes':
            out['connects'] = len([1 for _ in w.walk(v) if True])  # 连接数(粗)
        elif f == 7 and t == 'varint':
            out['compositePinIndex'] = v
    return out


def node_summary(node: bytes, with_pins: bool = False) -> dict:
    fields: dict = {}
    pins: list[bytes] = []
    for f, t, v in w.walk(node):
        if f == 4 and t == 'bytes':
            pins.append(v)
        elif t == 'bytes':
            fields[f] = v
        else:
            fields[f] = v
    generic = fields.get(2, b'')
    concrete = fields.get(3, b'')
    ident = lambda b: {f: v for f, _, v in w.walk(b)}.get(5, 0)  # noqa: E731
    out = {
        'nodeIndex': fields.get(1, 0),
        'genericId': ident(generic) if generic else None,
        'concreteId': ident(concrete) if concrete else None,
        'pinCount': len(pins),
        'x': round(w.f32(fields[5]), 2) if 5 in fields else None,
        'y': round(w.f32(fields[6]), 2) if 6 in fields else None,
    }
    if with_pins:
        out['pins'] = [decode_pin(p) for p in pins]
    return out


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    with_pins = '--pins' in sys.argv[1:]
    if len(args) != 2:
        print(f'usage: {Path(sys.argv[0]).name} <map.gil> <graphId> [--pins]', file=sys.stderr)
        return 2
    gil, graph_id = Path(args[0]), int(args[1])
    ng = find_graph(load_payload(gil), graph_id)
    if ng is None:
        print(f'graph {graph_id} not found in {gil}', file=sys.stderr)
        return 1
    nodes = [v for f, t, v in w.walk(ng) if f == 3]
    for n in nodes:
        print(json.dumps(node_summary(n, with_pins), ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
