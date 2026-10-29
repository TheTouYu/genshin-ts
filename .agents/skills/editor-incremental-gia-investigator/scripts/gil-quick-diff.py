#!/usr/bin/env python3
"""gil-quick-diff.py — 相邻快照一条命令差分（编辑器差分轮次的高效资产）

把每轮 4 步（hash 门禁 → 快照捕获 → root 差分 → 变化记录解码）合并为一次调用，
输出紧凑摘要（每条记录一行），供大模型低输入成本消费。

用法:
  gil-quick-diff.py <before.gil> <after.gil>
      全图 root occurrence 差分；单 occurrence 且变化的 root 自动做子记录级 delta，
      新增/删除记录按紧凑格式逐条解码。
  gil-quick-diff.py <before.gil> <after.gil> --record <配置ID>
      只深解码 root15/root16 中 f1=<配置ID> 的记录前后对照（组件块逐行）。
  gil-quick-diff.py <before.gil> <after.gil> --effect-list
      只对比状态记录 f21.f1.f3 效果列表（条目/参数/引用一行一个）。
  gil-quick-diff.py <before.gil> <after.gil> --pair
      对「同 identity（f1）的增删记录」配对，直接打印叶子级字段差
      （省掉每条再跑一次 gil-record-fielddiff.py）。
  gil-quick-diff.py <before.gil> <after.gil> --root 9 [--root 46]
      只看指定 root（可重复给多次），噪声多的地图上显著短。
  gil-quick-diff.py <before.gil> <current.gil> --capture-dir <dir> --snap <名字>
      先做 hash 门禁：current 与 before 相同 → 打印 HASH_UNCHANGED 并退出码 2；
      不同 → 不覆盖地复制 current 到 <dir>/<名字>.gil（附 .sha256），随后自动差分，
      并在尾部输出下轮恢复块两行（LOCKED_BEFORE/LOCKED_HASH）。
      目标已存在视为错误（不允许覆盖快照）。

退出码: 0=正常差分; 2=HASH_UNCHANGED（先确认保存）; 3=用法/文件错误。

不内置任何地图路径、对象名或一次性 ID；差分对象不唯一或路径走不通时明确报错。

非 message 根体自动降级（2026-10-29 实修）：版本串 root43 `str "7.1.0"`、
root9.f501 顶层对象 ID 索引 `packed[1073741825,…]`。旧版对这类体直接抛
`bad wire type 7`，把后面所有 root（46/50…）一起吞掉——差分是"全或全无"的工具，
单点解析失败绝不能截断整轮结果。
"""
import hashlib
import struct
import sys
from pathlib import Path


def pf(buf):
    i = 0
    out = []
    while i < len(buf):
        t = 0
        s = 0
        while True:
            b = buf[i]
            i += 1
            t |= (b & 0x7F) << s
            s += 7
            if not b & 0x80:
                break
        fn, wt = t >> 3, t & 7
        if wt == 0:
            v = 0
            s = 0
            while True:
                b = buf[i]
                i += 1
                v |= (b & 0x7F) << s
                s += 7
                if not b & 0x80:
                    break
            out.append((fn, wt, v, b''))
        elif wt == 2:
            ln = 0
            s = 0
            while True:
                b = buf[i]
                i += 1
                ln |= (b & 0x7F) << s
                s += 7
                if not b & 0x80:
                    break
            out.append((fn, wt, None, buf[i:i + ln]))
            i += ln
        elif wt == 5:
            out.append((fn, wt, None, buf[i:i + 4]))
            i += 4
        elif wt == 1:
            out.append((fn, wt, None, buf[i:i + 8]))
            i += 8
        else:
            raise ValueError(f'bad wire type {wt} at {i}')
    return out


def lines_of(bb, mx=5):
    """紧凑解码，永远返回 list[str]（避免 += 字符串按字符展开的坑）。"""
    if mx < 0:
        return [f'<{len(bb)}B {bb.hex()[:24]}>'] if bb else ['<>']
    try:
        fs = pf(bb)
    except Exception:
        return [describe_unknown(bb)]
    r = []
    for fn, wt, v, cb in fs:
        if wt == 0:
            r.append(f'f{fn}={v}')
        elif wt == 5:
            try:
                r.append(f'f{fn}=f32({struct.unpack("<f", cb)[0]:g})')
            except Exception:
                r.append(f'f{fn}=w5{cb.hex()}')
        elif wt == 1:
            r.append(f'f{fn}=f64')
        else:
            if cb:
                try:
                    t = cb.decode('utf-8')
                    if t and all(31 < ord(c) < 0x10000 for c in t):
                        r.append(f'f{fn}="{t}"')
                        continue
                except Exception:
                    pass
            sub = lines_of(cb, mx - 1) if cb else []
            r.append(f'f{fn}{{{ " ".join(sub) }}}' if sub else f'f{fn}{{}}')
    return r


def brief(bb, limit=400):
    s = ' '.join(lines_of(bb))
    return s[:limit] + ('…' if len(s) > limit else '')


def printable(b):
    try:
        t = b.decode('utf-8')
    except Exception:
        return None
    return t if t and all(31 < ord(c) < 0x10000 for c in t) else None


def packed_varints(bb):
    """整段恰好是一串 varint 就返回列表，否则 None（packed 列表 vs 二进制体）。"""
    vals = []
    i = 0
    while i < len(bb):
        v = 0
        s = 0
        while True:
            if i >= len(bb):
                return None
            b = bb[i]
            i += 1
            v |= (b & 0x7F) << s
            s += 7
            if not b & 0x80:
                break
        vals.append(v)
    return vals or None


def describe_unknown(bb):
    """非 message 根体的可读形态：UTF-8 字符串 > packed varint 列表 > 原始 hex。

    实证（2026-10-29 地图 1073741846）：root43 = "7.1.0" 客户端版本串；
    root9.f501 = 顶层对象 ID 索引 packed[1073741825,1073741840,…]。两者都不是 message。
    """
    if not bb:
        return '<empty>'
    txt = printable(bb)
    if txt is not None:
        return f'str "{txt}"'
    vals = packed_varints(bb)
    if vals is not None:
        return 'packed[' + ','.join(map(str, vals)) + ']'
    return f'raw {bb[:24].hex()}' + ('…' if len(bb) > 24 else '')


def is_msg(bb):
    try:
        pf(bb)
        return True
    except Exception:
        return False


def rec_id(bb):
    """取记录 identity（顶层 f1 varint）；取不到就 None（用于 --pair 配对）。"""
    try:
        fs = pf(bb)
    except Exception:
        return None
    for f, w, v, cb in fs:
        if f == 1 and w == 0:
            return v
    return None


def leaves(buf, path=''):
    """把一条记录压成 [(path, kind, value)]，供 --pair 打印叶子级字段差。"""
    try:
        fs = pf(buf)
    except Exception:
        return [(path.rstrip('.') or '.', 'text', describe_unknown(buf))]
    out = []
    counters = {}
    for fn, wt, v, cb in fs:
        idx = counters.get(fn, 0)
        counters[fn] = idx + 1
        p = f'{path}f{fn}' + (f'[{idx}]' if idx else '')
        if wt == 0:
            out.append((p, 'varint', v))
        elif wt == 5:
            try:
                out.append((p, 'fixed32', f'{struct.unpack("<f", cb)[0]:g}'))
            except Exception:
                out.append((p, 'w5', cb.hex()))
        elif wt == 1:
            out.append((p, 'fixed64', cb.hex()))
        else:
            txt = printable(cb)
            if txt is not None:
                out.append((p, 'utf8', txt))
                continue
            sub = leaves(cb, p + '.')
            out.extend(sub if sub else [(p, 'bytes', cb.hex())])
    return out


def load_roots(path):
    raw = Path(path).read_bytes()
    if len(raw) < 24:
        raise ValueError(f'{path}: too small')
    return pf(raw[20:-4])


def occ_map(roots):
    d = {}
    for fn, wt, v, bb in roots:
        d.setdefault(fn, []).append(bb)
    return d


def sha(b):
    return hashlib.sha256(b).hexdigest()


def child_delta(before_bb, after_bb):
    """子记录集合差；任一侧不是合法 message 时返回 (None,None,0,0) 交由调用方降级。"""
    try:
        a = [cb for f, w, v, cb in pf(before_bb)]
        b = [cb for f, w, v, cb in pf(after_bb)]
    except Exception:
        return None, None, 0, 0
    sa = [sha(x) for x in a]
    sb = [sha(x) for x in b]
    added = [x for x, h in zip(b, sb) if h not in sa]
    removed = [x for x, h in zip(a, sa) if h not in sb]
    return added, removed, len(a), len(b)


def find_asset_records(root_bb, record_id):
    """root15 定义记录（f1=id）或 root16 容器记录（f1=f2=id）；返回 [(容器字段, 记录bytes)]。"""
    hits = []
    for f, w, v, cb in pf(root_bb):
        if f not in (1,):
            continue
        top = pf(cb)
        ids = [v2 for f2, w2, v2, c2 in top if f2 == 1 and w2 == 0]
        if ids and ids[0] == record_id:
            hits.append(cb)
    return hits


def effect_list_of(record_bb, comp_container_fld):
    """record(容器 f3 / 定义 f4) → kind=6 组件 → f21.f1.f3 返回 (效果列表f3块, 组件kind序)。"""
    for f, w, v, cb in pf(record_bb):
        if f != comp_container_fld:
            continue
        kids = pf(cb)
        if not kids or kids[0][0] != 1 or kids[0][2] is None:
            continue
        if kids[0][2] != 6:
            continue
        f21 = [c2 for f2, w2, v2, c2 in kids if f2 == 21]
        if not f21:
            continue
        f1 = [c2 for f2, w2, v2, c2 in pf(f21[0]) if f2 == 1]
        if not f1:
            continue
        f3 = [c2 for f2, w2, v2, c2 in pf(f1[0]) if f2 == 3]
        if f3:
            return f3[0]
    return None


def dump_effects(f3):
    if f3 is None:
        print('    <无效果列表>')
        return
    ents = [c for f, w, v, c in pf(f3) if f == 1]
    blob = [c for f, w, v, c in pf(f3) if f == 2]
    for i, e in enumerate(ents):
        eid = None
        params = []
        for f, w, v, cb in pf(e):
            if f == 1:
                eid = v
            elif f == 2:
                kdesc = []
                for kf, kw, kv, kcb in pf(cb):
                    if kw == 0 and kf != 1:
                        kdesc.append(f'f{kf}={kv}')
                    elif kw == 5 and len(kcb) == 4:
                        try:
                            kdesc.append(f'f{kf}=f32({struct.unpack("<f", kcb)[0]:g})')
                        except Exception:
                            kdesc.append(f'f{kf}=w5')
                    elif kf == 1:
                        kdesc.append(f'类型{kv}')
                    else:
                        kdesc.append(f'f{kf}[{len(kcb)}B]{kcb.hex() if len(kcb) < 12 else ""}')
                params.append('{' + ' '.join(kdesc) + '}')
        print(f'    [{i}] 效果ID={eid}: ' + ' '.join(params))
    for b in blob:
        print(f'    f2blob={b.hex()}')


def main(argv):
    args = list(argv[1:])
    record_id = None
    effect_list = False
    pair = False
    root_filter = set()
    cap_dir = None
    snap = None
    pos = []
    while args:
        a = args.pop(0)
        if a == '--record':
            record_id = int(args.pop(0), 0)
        elif a == '--effect-list':
            effect_list = True
        elif a == '--pair':
            pair = True
        elif a == '--root':
            root_filter.add(int(args.pop(0), 0))
        elif a == '--capture-dir':
            cap_dir = args.pop(0)
        elif a == '--snap':
            snap = args.pop(0)
        else:
            pos.append(a)
    if len(pos) != 2:
        print(__doc__)
        return 3
    before_p, after_p = pos
    try:
        before_raw = Path(before_p).read_bytes()
        after_raw = Path(after_p).read_bytes()
    except OSError as e:
        print(f'[error] {e}')
        return 3
    hb, ha = sha(before_raw), sha(after_raw)
    if hb == ha:
        print('HASH_UNCHANGED（两文件相同——先向用户确认是否真的保存成功）')
        return 2
    if cap_dir is not None:
        if not snap:
            print('[error] --capture-dir 需要 --snap <名字>')
            return 3
        dst = Path(cap_dir) / f'{snap}.gil'
        if dst.exists():
            print(f'[error] 快照已存在，不允许覆盖: {dst}')
            return 3
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(after_raw)
        (Path(cap_dir) / f'{snap}.gil.sha256').write_text(f'{ha}  {dst.name}\n')
        print(f'快照: {dst}')
        print(f'sha256: {ha}')
    print(f'before: {len(before_raw)}B sha={hb[:16]}…  after: {len(after_raw)}B sha={ha[:16]}… (Δ{len(after_raw)-len(before_raw):+d}B)')
    o1, o2 = occ_map(load_roots(before_p)), occ_map(load_roots(after_p))
    changed = []
    for fn in sorted(set(o1) | set(o2)):
        s1 = {sha(x) for x in o1.get(fn, [])}
        s2 = {sha(x) for x in o2.get(fn, [])}
        if s1 != s2:
            changed.append(fn)
    print('roots 变化: ' + (', '.join(map(str, changed)) if changed else '(无)'))
    for fn in changed:
        if root_filter and fn not in root_filter:
            continue
        n1, n2 = len(o1.get(fn, [])), len(o2.get(fn, []))
        if n1 == 1 and n2 == 1:
            added, removed, ca, cb_ = child_delta(o1[fn][0], o2[fn][0])
            if added is None:
                # 非 message 根体（版本串 / packed ID 索引）：直接给前后可读形态
                print(f'root{fn}: 非 message 体 {len(o1[fn][0])}B→{len(o2[fn][0])}B')
                print(f'  before {describe_unknown(o1[fn][0])}')
                print(f'  after  {describe_unknown(o2[fn][0])}')
                continue
            print(f'root{fn}: 子记录 {ca}→{cb_}')
            paired_a, paired_r = set(), set()
            if pair and added and removed:
                rem_by_id = {}
                for i, x in enumerate(removed):
                    rem_by_id.setdefault(rec_id(x), []).append(i)
                for i, x in enumerate(added):
                    cand = rem_by_id.get(rec_id(x))
                    if not cand:
                        continue
                    j = cand.pop(0)
                    paired_a.add(i)
                    paired_r.add(j)
                    lb = {p: (k, v) for p, k, v in leaves(removed[j])}
                    la = {p: (k, v) for p, k, v in leaves(x)}
                    chg = [(p, lb.get(p), la.get(p)) for p in sorted(set(lb) | set(la))
                           if lb.get(p) != la.get(p)]
                    print(f'  ~ f1={rec_id(x)}: {len(removed[j])}B→{len(x)}B  '
                          f'{len(chg)} leaf change(s)')
                    for p, o, n in chg[:12]:
                        print(f'      {p}: {o} -> {n}')
                    if len(chg) > 12:
                        print(f'      … 还有 {len(chg) - 12} 处')
            for i, x in enumerate(added):
                if i in paired_a:
                    continue
                print(f'  + {len(x)}B {brief(x)}')
            for i, x in enumerate(removed):
                if i in paired_r:
                    continue
                print(f'  - {len(x)}B {brief(x)}')
        else:
            print(f'root{fn}: occurrence {n1}→{n2}')
            for x in o2.get(fn, []):
                if sha(x) not in {sha(y) for y in o1.get(fn, [])}:
                    print(f'  + {len(x)}B {brief(x, 250)}')
            for x in o1.get(fn, []):
                if sha(x) not in {sha(y) for y in o2.get(fn, [])}:
                    print(f'  - {len(x)}B {brief(x, 250)}')
    # 聚焦模式
    if record_id is not None or effect_list:
        for fld, tag in ((16, '容器'), (15, '定义')):
            rb = o2.get(fld, [None])[0] or o1.get(fld, [None])[0]
            if rb is None:
                continue
            print(f'-- root{fld}({tag}) 记录 {record_id if record_id is not None else "(状态)"}:')
            for side_name, src in (('before', o1), ('after', o2)):
                base = src.get(fld, [None])[0]
                if base is None:
                    continue
                recs = find_asset_records(base, record_id) if record_id is not None else [
                    c2 for f2, w2, v2, c2 in pf(base) if f2 == 1][:1]
                if not recs:
                    print(f'  [{side_name}] (未找到 f1={record_id} 的记录)')
                    continue
                rec = recs[0]
                if effect_list:
                    print(f'  [{side_name}] 效果列表:')
                    dump_effects(effect_list_of(rec, 3 if fld == 16 else 4))
                else:
                    print(f'  [{side_name}] {len(rec)}B: {brief(rec, 600)}')
    if cap_dir is not None:
        print(f'LOCKED_BEFORE={Path(cap_dir)}/{snap}.gil')
        print(f'LOCKED_HASH={ha}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
