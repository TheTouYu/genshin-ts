#!/usr/bin/env python3
"""Beyond_Debug_Log .gia 调试日志解析工具（技能内置脚本）。

用法:
  gia_log.py <日志.gia> text     # 提取 f22 文本日志（按记录序）
  gia_log.py <日志.gia> records  # 记录概览（大小/级别/实体/图ID/是否含f21）
  gia_log.py <日志.gia> frames   # f21 帧表（head/负载/输入输出参数，已解码）
  gia_log.py <日志.gia> dump     # 逐帧原始结构 dump（无压缩，供精确核对）
  gia_log.py <日志.gia> latest   # 输出目录下最新 .gia 路径（供管道复用）

所有子命令输出到 stdout；frames/dump 只输出最后一个含 f21 的记录（新会话）。
"""
import sys, struct, glob, os

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
           12:'Vector',14:'EnumItem',16:'LocalVariable',18:'VariableSnapshot'}
ENUM_VALUE = {100:'==',101:'<',102:'<=',103:'>',104:'>=',
              200:'AND',201:'OR',202:'XOR',203:'NOT',
              300:'+',301:'-',302:'*',303:'/',304:'%',305:'^',306:'max',307:'min',308:'log',
              806:'BoolToStr',808:'FltToStr'}

def f32(b): return struct.unpack('<f', b)[0] if len(b) == 4 else None

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

def cmd_records(recs):
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
        print(f'rec{ri}: {info}')

def cmd_frames(recs):
    for ri, r in enumerate(recs):
        for f, w, x, _ in walk_fields(r, 0, len(r)):
            if f != 21: continue
            frames = frames_of(x)
            print(f'=== rec{ri}: {len(frames)} 帧 ===')
            for i, (head, ins, outs, load) in enumerate(frames):
                line = f'帧[{i}] head={head} load={load}'
                for p in ins: line += f' | IN{p[0] if p[0] is not None else 0}:{VARTYPE.get(p[1], p[1])}={p[2]}'
                for p in outs: line += f' | OUT{p[0] if p[0] is not None else 0}:{VARTYPE.get(p[1], p[1])}={p[2]}'
                print(line)

def cmd_dump(recs):
    for ri, r in enumerate(recs):
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
    recs = load(args[0])
    {'text': cmd_text, 'records': cmd_records, 'frames': cmd_frames, 'dump': cmd_dump}[args[1]](recs)
