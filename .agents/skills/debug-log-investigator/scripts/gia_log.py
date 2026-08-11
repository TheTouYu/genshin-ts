#!/usr/bin/env python3
"""Beyond_Debug_Log .gia 调试日志解析工具（技能内置脚本）。

用法:
  gia_log.py <日志.gia> text     # 提取 f22 文本日志（按记录序）
  gia_log.py <日志.gia> records  # 记录概览（大小/级别/实体/图ID/图名/是否含f21）
  gia_log.py <日志.gia> frames   # f21 帧表（图名/节点名/head/负载/输入输出参数，已解码）
  gia_log.py <日志.gia> dump     # 逐帧原始结构 dump（无压缩，供精确核对）
  gia_log.py <日志.gia> latest   # 输出目录下最新 .gia 路径（供管道复用）

可选参数（records/frames）:
  --gil <map.gil>   加载 GIL 地图索引（图名 + 节点名标注；自动调 dump_gil_index.ts）
  --rec <n>         只看指定记录号（frames/dump）
  --graph <id>      只看指定图（frames/dump）

说明: frames 默认输出全部含 f21 的记录；帧 head 主帧号 = 图内节点序号（1 字节），
复合子帧 = {主帧号, impl 节点序号}（2 字节，需 --gil 标注 impl 节点名）。
"""
import sys, struct, glob, os, json, hashlib, subprocess, tempfile

def read_varint(buf, i):
    v = 0; shift = 0
    while True:
        b = buf[i]; i += 1
        v |= (b & 0x7f) << shift
        if not (b & 0x80): return v, i
        shift += 7

def parse_records(body):
    recs = []
    i = 0
    while i < len(body):
        tag, i = read_varint(body, i)
        field, wire = tag >> 3, tag & 7
        if wire != 2: break
        ln, i = read_varint(body, i)
        recs.append(body[i:i+ln]); i += ln
    return recs

def walk_fields(buf, i, end):
    while i < end:
        tag, i = read_varint(buf, i)
        field, wire = tag >> 3, tag & 7
        if wire == 0:
            v, i = read_varint(buf, i)
            yield field, wire, v, i
        elif wire == 2:
            ln, i = read_varint(buf, i)
            yield field, wire, buf[i:i+ln], i + ln
            i += ln
        elif wire == 1:
            yield field, wire, buf[i:i+8], i + 8
            i += 8
        elif wire == 5:
            yield field, wire, buf[i:i+4], i + 4
            i += 4
        else:
            return

def decode_str(b):
    try: return b.decode('utf-8')
    except Exception: return None

def printable(b):
    s = decode_str(b)
    if s is not None and all(ord(c) >= 32 or c in '\n\r\t' for c in s):
        return s
    return None

def load(path):
    buf = open(path, 'rb').read()
    skip = 4
    if len(buf) >= 8 and int.from_bytes(buf[4:8], 'big') == len(buf) - 8:
        skip = 8
    if len(buf) >= 4 and int.from_bytes(buf[:4], 'big') == len(buf) - 4:
        body = buf[skip:]
    else:
        body = buf
    return parse_records(body)

# ---------- VarType / ENUM_VALUE 速查（来自第三方定义，与 debug-log-format.md 一致） ----------
VARTYPE = {1:'Entity',2:'GUID',3:'Integer',4:'Boolean',5:'Float',6:'String',
           8:'List',11:'StringList',12:'Vector',14:'EnumItem',16:'LocalVariable',
           18:'VariableSnapshot',21:'PrefabId'}
ENUM_VALUE = {100:'==',101:'<',102:'<=',103:'>',104:'>=',
              200:'AND',201:'OR',202:'XOR',203:'NOT',
              300:'+',301:'-',302:'*',303:'/',304:'%',305:'^',306:'max',307:'min',308:'log',
              806:'BoolToStr',808:'FltToStr',
              1100:'完全跟随',1101:'跟随位置',1200:'相对',1201:'世界'}

def f32(b): return struct.unpack('<f', b)[0] if len(b) == 4 else None

def decode_vector(v2):
    """Vector（类型12）：外层 {f1 wire2=内容}，内层 {f1/f2/f3 wire5 float}，零分量省略。
    返回 (x, y, z) 或原始 hex（解析失败）。"""
    inner = None
    try:
        for f, w, x, _ in walk_fields(v2, 0, len(v2)):
            if f == 1 and w == 2:
                inner = x
                break
    except Exception:
        pass
    comps = {}
    if inner is not None:
        try:
            for f, w, x, _ in walk_fields(inner, 0, len(inner)):
                if w == 5 and f in (1, 2, 3):
                    comps[f] = f32(x)
        except Exception:
            pass
    if len(comps) == 0:
        if inner is not None:
            return (0.0, 0.0, 0.0)
        s = printable(v2)
        return s if s is not None else v2.hex()
    return tuple(round(comps.get(i, 0.0), 4) for i in (1, 2, 3))


def decode_prefab(v2):
    """类型21 PrefabId：内部 {f1=?, f2=预制件ID}。"""
    try:
        for f, w, x, _ in walk_fields(v2, 0, len(v2)):
            if f == 2 and w == 0:
                return x
    except Exception:
        pass
    return None


def decode_param(v2):
    """参数: f1=序号(0省略), f2={f1=类型码, f2={f1=同码,f2=''}, f<类型码+10>=值}"""
    idx = typ = None; val = '?'
    try: ps = list(walk_fields(v2, 0, len(v2)))
    except Exception: return (idx, typ, val)
    for pf, pw, pv, _ in ps:
        if pf == 1 and pw == 0: idx = pv
        elif pf == 2 and pw == 2:
            try: ts = list(walk_fields(pv, 0, len(pv)))
            except Exception: continue
            for tf, tw, tv, _ in ts:
                if tf == 1 and tw == 0: typ = tv
            if typ is None: continue
            want = typ + 10  # 值字段号 = 类型码 + 10
            for tf, tw, tv, _ in ts:
                if tf != want: continue
                if tw == 5:
                    val = f32(tv)
                elif typ == 12:
                    val = decode_vector(tv)
                elif typ == 21:
                    val = decode_prefab(tv)
                elif tw == 2:
                    try: vs = list(walk_fields(tv, 0, len(tv)))
                    except Exception: vs = []
                    got = False
                    for vf, vw, vv, _ in vs:
                        if vf != 1: continue
                        if vw == 0 and isinstance(vv, int):
                            val = vv; got = True
                        elif vw == 5:
                            val = f32(vv); got = True
                        elif vw == 2 and isinstance(vv, bytes):
                            s2 = printable(vv)
                            if s2 is not None:
                                val = s2; got = True
                            elif len(vv) == 4:
                                fv = f32(vv)
                                if fv is not None:
                                    val = fv; got = True
                    if not got:
                        s = printable(tv)
                        if s is not None: val = s
                        else: val = tv.hex()
                elif tw == 0:
                    val = tv
    if isinstance(val, int) and typ == 14:
        val = f'{val}({ENUM_VALUE.get(val, "?")})'
    return (idx, typ, val)

# ---------- GIL 索引（图名/节点名标注） ----------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.abspath(os.path.join(SCRIPT_DIR, '../../../../'))


def load_gil_index(gil):
    """调 dump_gil_index.ts 生成 {graphs, defs} 索引，按 gil 路径+mtime 缓存。"""
    tag = hashlib.md5(os.path.abspath(gil).encode()).hexdigest()[:12]
    cache = os.path.join(tempfile.gettempdir(), f'gia-gil-{tag}.json')
    if os.path.exists(cache) and os.path.exists(gil) and os.path.getmtime(cache) >= os.path.getmtime(gil):
        try:
            return json.load(open(cache))
        except Exception:
            pass
    script = os.path.join(SCRIPT_DIR, 'dump_gil_index.ts')
    tsx = os.path.join(PROJECT, 'node_modules/.bin/tsx')
    run = subprocess.run(['node', tsx, script, gil], capture_output=True, text=True, timeout=180, cwd=PROJECT)
    if run.returncode != 0:
        raise RuntimeError(f'dump_gil_index.ts 失败: {run.stderr[-500:]}')
    data = json.loads(run.stdout)
    try:
        json.dump(data, open(cache, 'w'))
    except Exception:
        pass
    return data


def graph_name(graph_id, gil):
    if not gil:
        return ''
    g = gil['graphs'].get(str(graph_id))
    return f' {g["name"]}' if g and g.get('name') else ''


def node_label(head_hex, graph_id, gil):
    """帧 head → 节点名。单字节=主图节点；双字节=复合主帧+impl 子节点。"""
    if not gil:
        return ''
    try:
        b = bytes.fromhex(head_hex)
    except Exception:
        return ''
    g = gil['graphs'].get(str(graph_id))
    if not g:
        return ''
    if len(b) == 1:
        return g['nodes'].get(str(b[0]), f'n{b[0]}?')
    main, sub = b[0], b[1]
    label = g['nodes'].get(str(main), f'n{main}?')
    m = __import__('re').search(r'\((\d+)\)', label)
    if m:
        d = gil['defs'].get(m.group(1))
        if d and d.get('impl'):
            impl = gil['graphs'].get(str(d['impl']))
            if impl:
                sub_label = impl['nodes'].get(str(sub))
                if sub_label:
                    return f'{label} > {sub_label}'
    return f'{label} > sub{sub}'


def fmt_param(p):
    idx, typ, val = p
    tn = VARTYPE.get(typ, f'类型{typ}')
    return f'IN{idx if idx is not None else 0}: {tn}={val}' if p[0] is not None or True else ''

def frames_of(f21):
    frames = []
    try: fields = list(walk_fields(f21, 0, len(f21)))
    except Exception: return frames
    for f, w, x, ni in fields:
        head = None; load = None; ins = []; outs = []
        try: fs = list(walk_fields(x, 0, len(x)))
        except Exception: continue
        for f2, w2, v2, _ in fs:
            if f2 == 1 and w2 == 2: head = v2.hex()
            elif f2 == 6 and w2 == 0: load = v2
            elif f2 in (4, 5) and w2 == 2:
                p = decode_param(v2)
                (ins if f2 == 4 else outs).append(p)
        frames.append((head, ins, outs, load))
    return frames

def dump_show(v, indent=0, maxd=8, out=None):
    if out is None: out = []
    try: fs = list(walk_fields(v, 0, len(v)))
    except Exception: return out
    for f, w, x, ni in fs:
        pad = '  ' * indent
        if w == 0:
            out.append(f'{pad}f{f} = {x}')
        else:
            s = printable(x)
            if s is not None and f != 1: out.append(f'{pad}f{f} str = {s!r}')
            elif len(x) <= 2: out.append(f'{pad}f{f} = {x.hex()}')
            else:
                out.append(f'{pad}f{f} bytes[{len(x)}]:')
                if indent < maxd: dump_show(x, indent + 1, maxd, out)
    return out

def cmd_text(recs):
    for ri, r in enumerate(recs):
        for f, w, x, _ in walk_fields(r, 0, len(r)):
            if f == 22:
                for f2, w2, v2, _ in walk_fields(x, 0, len(x)):
                    if f2 == 2: print(f'rec{ri}: {v2.decode("utf-8", "replace")}')

def cmd_records(recs, gil=None):
    for ri, r in enumerate(recs):
        info = {}
        for f, w, x, _ in walk_fields(r, 0, len(r)):
            if w == 0: info[f] = x
            elif f in (7, 9, 10, 21, 22):
                if f == 7:
                    for f2, w2, v2, _ in walk_fields(x, 0, len(x)):
                        if f2 == 2:
                            if isinstance(v2, int): info['graph'] = v2
                            else: info['graph'] = int.from_bytes(v2, 'big') if len(v2) <= 4 else v2.hex()
                elif f == 21: info['f21'] = f'f21:{len(x)}B'
                elif f == 22: info['f22'] = 'log'
                else: info[f] = len(x)
        if 'graph' in info and gil:
            info['graph'] = f"{info['graph']}{graph_name(info['graph'], gil)}"
        print(f'rec{ri}: {info}')


def cmd_frames(recs, gil=None, rec_filter=None, graph_filter=None):
    for ri, r in enumerate(recs):
        if rec_filter is not None and ri != rec_filter: continue
        graph = None
        for f, w, x, _ in walk_fields(r, 0, len(r)):
            if f == 7:
                for f2, w2, v2, _ in walk_fields(x, 0, len(x)):
                    if f2 == 2:
                        graph = v2 if isinstance(v2, int) else int.from_bytes(v2, 'big') if len(v2) <= 4 else v2.hex()
                continue
            if f != 21: continue
            if graph_filter is not None and graph != graph_filter: continue
            frames = frames_of(x)
            print(f'=== rec{ri}: graph={graph}{graph_name(graph, gil)} | {len(frames)} 帧 ===')
            for i, (head, ins, outs, load) in enumerate(frames):
                nl = node_label(head, graph, gil)
                line = f'[{i}] {nl + " | " if nl else ""}head={head} load={load}'
                for p in ins: line += f' | IN{p[0] if p[0] is not None else 0}:{VARTYPE.get(p[1], p[1])}={p[2]}'
                for p in outs: line += f' | OUT{p[0] if p[0] is not None else 0}:{VARTYPE.get(p[1], p[1])}={p[2]}'
                print(line)


def cmd_dump(recs, rec_filter=None):
    for ri, r in enumerate(recs):
        if rec_filter is not None and ri != rec_filter: continue
        for f, w, x, _ in walk_fields(r, 0, len(r)):
            if f != 21: continue
            frames = []
            try: fields = list(walk_fields(x, 0, len(x)))
            except Exception: continue
            for ff, fw, fx, fni in fields: frames.append(fx)
            print(f'=== rec{ri}: {len(frames)} 帧 ===')
            for i, fr in enumerate(frames):
                print(f'--- 帧[{i}] ---')
                for l in dump_show(fr): print(l)

def cmd_latest(d):
    files = sorted(glob.glob(os.path.join(d, '*.gia')), key=os.path.getmtime)
    print(files[-1] if files else '')

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--noinject']
    if not args: print(__doc__); sys.exit(1)
    if args[0] == 'latest':
        cmd_latest(args[1] if len(args) > 1 else
                   '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Debug_Log')
        sys.exit(0)
    gil = None; rec_filter = None; graph_filter = None
    rest = []
    i = 1
    while i < len(args):
        if args[i] == '--gil':
            gil = args[i + 1]; i += 2
        elif args[i] == '--rec':
            rec_filter = int(args[i + 1]); i += 2
        elif args[i] == '--graph':
            graph_filter = int(args[i + 1]); i += 2
        else:
            rest.append(args[i]); i += 1
    if not rest: print(__doc__); sys.exit(1)
    recs = load(args[0])
    if gil:
        gil = load_gil_index(gil)
    cmd = rest[0]
    if cmd == 'records': cmd_records(recs, gil)
    elif cmd == 'frames': cmd_frames(recs, gil, rec_filter, graph_filter)
    elif cmd == 'dump': cmd_dump(recs, rec_filter)
    elif cmd == 'text': cmd_text(recs)
    else:
        print(__doc__); sys.exit(1)
