#!/usr/bin/env python3
"""把 clone 到新地图的模板记录里残留的 donor 模板 id 改成新 id。
template clone 会保留 donor 内部的 f505.f503 引用（形如 ... 32 <donorId>），
不修就会触发 gil-guard 的 children 悬空。只改指定记录，字段顺序不变。
用法: patch-template-refs.py <map.gil> <old:new> [<old:new> ...]
"""
import importlib.util, sys
from pathlib import Path

spec = importlib.util.spec_from_file_location('gg', '/home/h/genshin-ts/tools/gil-guard.py')
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)

def enc_varint(n):
    out = bytearray()
    while True:
        b = n & 0x7F; n >>= 7
        if n: out.append(b | 0x80)
        else: out.append(b); break
    return bytes(out)

def field(num, wire, payload):
    tag = enc_varint((num << 3) | wire)
    if wire == 2: return tag + enc_varint(len(payload)) + payload
    if wire == 0: return tag + enc_varint(payload)
    return tag + payload

def field_any(num, w, v):
    if w == 'varint': return field(num, 0, v)
    if w == 'bytes': return field(num, 2, v)
    if w == 'fixed32': return field(num, 5, int(v).to_bytes(4, 'little'))
    if w == 'fixed64': return field(num, 1, int(v).to_bytes(8, 'little'))
    raise ValueError(w)

def encode_vals(vals):
    return b''.join(enc_varint(v) for v in vals)

def transform(buf, mapping):
    out = bytearray()
    for f, w, v in g.walk(buf):
        if w == 'bytes' and f == 503:
            try:
                vals = g.packed_varints(v)
                vals2 = [mapping.get(x, x) for x in vals]
                out += field(f, 2, encode_vals(vals2))
            except Exception:
                out += field_any(f, w, v)
        elif w == 'bytes' and f == 505:
            out += field(f, 2, transform(v, mapping))
        else:
            out += field_any(f, w, v)
    return bytes(out)

def main():
    if len(sys.argv) < 3:
        print(__doc__); return 2
    path = Path(sys.argv[1])
    mapping = {}
    for spec in sys.argv[2:]:
        a, b = spec.split(':'); mapping[int(a)] = int(b)
    raw = path.read_bytes()
    payload_len = int.from_bytes(raw[16:20], 'big')
    assert payload_len == len(raw) - 24
    body = raw[20:-4]
    top = g.walk(body)
    new_top = bytearray()
    changed = 0
    for f, w, v in top:
        if f == 9 and w == 'bytes':
            sec = g.walk(v)
            new_sec = bytearray()
            for f2, w2, v2 in sec:
                if f2 == 502 and w2 == 'bytes':
                    rid = g.record_id(v2)
                    if rid in mapping.values() or rid in mapping:
                        nv = transform(v2, mapping)
                        if nv != v2: changed += 1
                        v2 = nv
                    new_sec += field_any(f2, w2, v2)
                else:
                    new_sec += field_any(f2, w2, v2)
            new_top += field(f, 2, bytes(new_sec))
        else:
            new_top += field_any(f, w, v)
    head = bytearray(raw[:20]); head[16:20] = len(new_top).to_bytes(4, 'big')
    path.write_bytes(bytes(head) + bytes(new_top) + raw[-4:])
    print(f'patched records={changed} mapping={mapping} size={path.stat().st_size}')

if __name__ == '__main__':
    sys.exit(main())
