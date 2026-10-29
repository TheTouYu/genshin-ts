#!/usr/bin/env python3
"""单记录字段级深差分（GIL）——定位到「哪个字段的哪个叶子变了」。

用途：root 级差分（gil-quick-diff.py / compare-gil-root-wire.py）只告诉你
       「root5 里 f1=<id> 这条记录变了 ±N 字节」，本脚本继续往下钻到叶子。

用法：
  python3 gil-record-fielddiff.py <before.gil> <after.gil> <root号> <记录id>

  root号/记录id 的取法：root 级差分的输出行 `f1=<记录id>`；root 号即该行所在的 rootN。
  例（2026-10-24 阵营实验）：
    python3 gil-record-fielddiff.py before.gil after.gil 5 1082130442
    → CHANGED f6[3].f16.f1: ('varint', 1) -> ('varint', 2)

  `--id-field N`：记录 identity 字段号。默认 1（root5/root15 等）；
    **root9 的 UI 控件记录用 f501**，必须 `--id-field 501`（2026-10-29 实测）。
  `-` 代替文件名：该侧没有这条记录（新增/删除记录也能直接看全量叶子）。
    例：python3 gil-record-fielddiff.py - after.gil 9 1073741847 --id-field 501

输出约定：
- 叶子路径形如 `f6[3].f16.f1`（数组下标 = 该层同号字段的第 N 次出现，0 省略）。
- 叶子值一律 `(kind, value)`：varint / fixed32 / fixed64 / utf8 / bytes(hex)。
- 汇总行 `== N leaf change(s)`；0 表示该记录完全未变（可用来验证「改回去」是否逐字节还原）。

依赖同目录 gil_wire_lib.py（walk 解析器）；GIL payload 口径 = raw[20:-4]。
"""
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gil_wire_lib import try_parse, walk  # noqa: E402


def roots_of(path, root_field):
    raw = Path(path).read_bytes()
    if len(raw) < 24:
        raise SystemExit(f'{path}: too small to be a GIL file')
    return [v for fn, wt, v in walk(raw[20:-4]) if fn == root_field]


def find_record(root_bb, rid, id_field=1):
    """在 root 的直接子记录里找 identity 字段 = rid 的那条（wrapper 号无关）。

    `id_field` 默认 1（root5/root15 等记录以 f1 作 identity）；
    **root9 的 UI 控件记录以 f501 作 identity**，必须显式 `--id-field 501`。

    wrapper 字段号不写死：root5 的记录包在 `f1{}` 里，root9 的包在 `f502{}` 里
    （2026-10-29 实测：写死 `fn == 1` 会让 root9 全部查不到）。这里只认
    「非标量孩子、其直接子字段里 id_field 的第一个 varint == rid」。
    """
    for _fn, _wt, v in walk(root_bb):
        if not isinstance(v, (bytes, bytearray)):
            continue
        try:
            kids = list(walk(v))
        except Exception:
            continue
        ids = [vv for ff, ww, vv in kids if ff == id_field and ww == 'varint']
        if ids and ids[0] == rid:
            return v
    return None


def printable(b):
    try:
        t = b.decode('utf-8')
    except Exception:
        return None
    return t if t and all(31 < ord(c) < 0x10000 for c in t) else None


def flatten(buf, path=''):
    """把一条记录压成 path -> (kind, value) 的叶子表。"""
    out = []
    counters = {}
    for fn, wt, v in walk(buf):
        key = (fn, wt)
        idx = counters.get(key, 0)
        counters[key] = idx + 1
        p = f'{path}f{fn}' + (f'[{idx}]' if idx else '')
        if wt in ('varint', 'fixed32', 'fixed64'):
            out.append((p, wt, v))
            continue
        txt = printable(v)
        if txt is not None:
            out.append((p, 'utf8', txt))
            continue
        kind, val = try_parse(v)
        if kind == 'packed':
            out.append((p, 'packed', ','.join(str(x) for x in val)))
            continue
        sub = flatten(v, p + '.')
        out.extend(sub) if sub else out.append((p, 'bytes', v.hex()))
    return out


def sha(b):
    return hashlib.sha256(b).hexdigest()[:8]


def main(argv):
    args = list(argv[1:])
    id_field = 1
    pos = []
    while args:
        a = args.pop(0)
        if a == '--id-field':
            id_field = int(args.pop(0), 0)
        else:
            pos.append(a)
    if len(pos) != 4:
        print(__doc__)
        return 2
    before, after, root_field, rid = pos[0], pos[1], int(pos[2]), int(pos[3])
    rb = find_record(roots_of(before, root_field)[0], rid, id_field) if before != '-' else None
    ra = find_record(roots_of(after, root_field)[0], rid, id_field) if after != '-' else None
    if rb is None and ra is None:
        raise SystemExit(f'record {rid} not found in either side (root{root_field}, id_field={id_field})')
    fb = {p: (k, v) for p, k, v in flatten(rb)} if rb is not None else {}
    fa = {p: (k, v) for p, k, v in flatten(ra)} if ra is not None else {}
    side_b = f'before {len(rb)}B sha={sha(rb)} leaves={len(fb)}' if rb is not None else 'before (absent)'
    side_a = f'after {len(ra)}B sha={sha(ra)} leaves={len(fa)}' if ra is not None else 'after (absent)'
    print(f'record {rid} root{root_field}: {side_b} | {side_a}')
    changed = 0
    for k, val in fb.items():
        if k not in fa:
            print(f'REMOVED {k}: {val!r}')
            changed += 1
        elif fa[k] != val:
            print(f'CHANGED {k}: {val!r} -> {fa[k]!r}')
            changed += 1
    for k, val in fa.items():
        if k not in fb:
            print(f'ADDED   {k}: {val!r}')
            changed += 1
    print(f'== {changed} leaf change(s)')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
