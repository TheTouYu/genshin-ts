#!/usr/bin/env python3
"""Beyond_Debug_Log .gia 调试日志解析工具（技能内置脚本）。

用法:
  gia_log.py <日志.gia> text     # 提取 f22 文本日志（按记录序）
  gia_log.py <日志.gia> records  # 记录概览（大小/级别/实体/图ID/图名/是否含f21）
  gia_log.py <日志.gia> frames   # f21 帧表（图名/完整嵌套节点链/head/负载/输入输出参数，已解码）
  gia_log.py <日志.gia> perf     # 性能聚合：每秒负载（被踢指标）+ 每记录 + 按节点链统计
                                 #   真实执行性能 = 单次负载 × 执行次数（热点一目了然）
                                 #   --compare <日志2.gia> 输出两次会话逐记录帧数/负载对比
                                 #   --sec <n> 输出指定秒的节点链明细
  gia_log.py <日志.gia> dump     # 逐帧原始结构 dump（无压缩，供精确核对）
  gia_log.py <日志.gia> latest   # 输出目录下最新 .gia 路径（供管道复用）

可选参数（records/frames/perf）:
  --gil <map.gil>   加载 GIL 地图索引（图名 + 节点名标注；自动调 dump_gil_index.ts）
  --rec <n>         只看指定记录号（frames/dump/perf）
  --graph <id>      只看指定图（frames/dump/perf）
  --compare <日志>  对比两份日志逐记录帧数/负载（perf）
  --sec <n>         只看指定秒的节点链明细（perf；秒 = 记录字段 f3）

说明: frames 默认输出全部含 f21 的记录；帧 head = 调用栈字节序列（主图节点 → 复合
impl 节点 → 嵌套 impl 节点…），已递归展开为完整节点链（如
"复合:A > 复合:B > Get Node Graph Variable"）；普通节点处链结束，尾随字节为
03 主帧 / 04 子帧记录标记（忽略）。
"""
import sys, struct, glob, os, json, hashlib, subprocess, tempfile, re
from collections import defaultdict

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


def decode_list(v2):
    """解码 wire 编码的列表值为可读文本（2026-08-19 升级：避免 hex 二次解析）。
    格式：外层 {1: content}；content = 定宽 float(4B)/int(1B) 或嵌套子字段(vec3/entity/str)。
    例：0a20<8×float> → [0, 0.05, 0.1, ...]；0a08<8×int> → [0,1,2,...]。"""
    try:
        fields = list(walk_fields(v2, 0, len(v2)))
    except Exception:
        return None
    if not fields or fields[0][0] != 1 or fields[0][1] != 2:
        return None
    content = fields[0][2]
    if not isinstance(content, bytes) or len(content) == 0:
        return None
    # 定宽 float（len%4==0 且首个分量可解且非 denormal）——int 表(1B/元素)先排除
    if len(content) % 4 == 0:
        first = f32(content[0:4])
        # 允许 0.0；仅拒 denormal（~1e-38~1e-45）误判（int 表首 4B 常是微小值）
        plausible = first is not None and (first == 0.0 or abs(first) >= 1e-30) and abs(first) <= 1e30
        if plausible:
            fs = [f32(content[i:i+4]) for i in range(0, len(content), 4)]
            if all(f is not None for f in fs):
                return '[' + ', '.join(f'{f:.4g}' for f in fs) + ']'
    # 定宽 int（单字节，长度合理）
    if 0 < len(content) <= 256:
        return '[' + ', '.join(str(b) for b in content) + ']'
    # 嵌套子字段（vec3_list / entity_list / string_list）
    parts = []
    try:
        for sf, sw, sv, _ in walk_fields(content, 0, len(content)):
            if sw == 5 and len(sv) == 4:
                fv = f32(sv)
                parts.append(f'{fv:.4g}' if fv is not None else sv.hex())
            elif sw == 0:
                parts.append(str(sv))
            elif sw == 2 and isinstance(sv, bytes):
                sq = printable(sv)
                parts.append(sq if sq is not None else sv.hex())
            elif sw == 1 and isinstance(sv, bytes):
                parts.append(sv.hex())
    except Exception:
        return None
    return '[' + ', '.join(parts) + ']' if parts else None

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
                    if not vs:
                        dl = decode_list(tv)
                        if dl is not None: val = dl
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
                        else:
                            dl = decode_list(tv)
                            val = dl if dl is not None else tv.hex()
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
    """帧 head → 完整节点链。head = 调用栈字节序列（每字节一层节点号）：
    主图节点 → 复合 impl 节点 → 嵌套 impl 节点…；普通节点处链结束，
    尾随字节（03 主帧 / 04 子帧记录标记）忽略。2026-08-20 从 2 层升级为递归全链。"""
    if not gil:
        return ''
    try:
        b = bytes.fromhex(head_hex)
    except Exception:
        return ''
    g = gil['graphs'].get(str(graph_id))
    if not g:
        return ''
    labels = []
    graph = g
    for byte in b:
        node = graph['nodes'].get(str(byte))
        if node is None:
            if labels:
                break  # 记录标记等尾随字节：链已结束
            return f'n{byte}?'
        labels.append(node)
        m = re.search(r'\((\d+)\)', node)
        if not m:
            break  # 普通节点/叶：链结束
        d = gil['defs'].get(m.group(1))
        if not d or not d.get('impl'):
            break
        nxt = gil['graphs'].get(str(d['impl']))
        if not nxt:
            break
        graph = nxt
    return ' > '.join(labels)


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

def cmd_records(recs, gil=None, summary=False):
    if summary:
        from collections import defaultdict
        agg = defaultdict(lambda: [0, 0, None, None])  # 图 -> [条数, f21字节, f8min, f8max]
        secs = []
        for ri, r in enumerate(recs):
            info = {}
            for f, w, x, _ in walk_fields(r, 0, len(r)):
                if w == 0:
                    info[f] = x
                elif f in (7, 21):
                    if f == 7:
                        for f2, w2, v2, _ in walk_fields(x, 0, len(x)):
                            if f2 == 2:
                                info['graph'] = v2 if isinstance(v2, int) else int.from_bytes(v2, 'big') if len(v2) <= 4 else v2.hex()
                    elif f == 21:
                        info['f21'] = len(x)
            if 3 in info:
                secs.append(info[3])
            gid = info.get('graph')
            if gid is None:
                continue
            a = agg[gid]
            a[0] += 1
            a[1] += info.get('f21', 0)
            if 8 in info:
                a[2] = info[8] if a[2] is None else min(a[2], info[8])
                a[3] = info[8] if a[3] is None else max(a[3], info[8])
        print(f'=== 记录摘要：{len(recs)} 条 | f3 秒范围 {min(secs)}..{max(secs)}（会话秒）===')
        print(f'{"图":>12} {"条数":>5} {"f8范围":>14} {"f21总量":>10}  图名')
        for gid, a in sorted(agg.items(), key=lambda kv: -kv[1][0]):
            nm = graph_name(gid, gil).strip() if gil else ''
            f8r = f'{a[2]}..{a[3]}' if a[2] is not None else '-'
            print(f'{gid:>12} {a[0]:>5} {f8r:>14} {a[1]:>9}B  {nm}')
        return
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


def cmd_ops(recs, gil=None):
    """操作时间线：以客户端记录（f8=2097154）为界，把整段日志聚类成一次次操作。
    每条客户端记录 = 一次技能实例释放；其后跟随的服务端记录 = 该次操作的响应（26 块等）。"""
    infos = []
    for ri, r in enumerate(recs):
        info = {'sec': None, 'f8': None, 'graph': None, 'f21': 0}
        for f, w, x, _ in walk_fields(r, 0, len(r)):
            if w == 0 and f == 3:
                info['sec'] = x
            elif w == 0 and f == 8:
                info['f8'] = x
            elif f == 7:
                for f2, w2, v2, _ in walk_fields(x, 0, len(x)):
                    if f2 == 2:
                        info['graph'] = v2 if isinstance(v2, int) else int.from_bytes(v2, 'big') if len(v2) <= 4 else v2.hex()
            elif f == 21:
                info['f21'] = len(x)
        infos.append(info)

    def client_instr(ri):
        """客户端记录 → 指令码：解码 f21 找 head=0x72（n114 设置局部变量[指令]）的 IN1:String。"""
        r = recs[ri]
        for f, w, x, _ in walk_fields(r, 0, len(r)):
            if f != 21:
                continue
            for head, ins, outs, ld in frames_of(x):
                if head != '72':
                    continue
                for idx, typ, val in ins:
                    if idx == 1 and typ == 6:
                        return val
        return None

    ops = []
    cur = None
    for ri, info in enumerate(infos):
        if info['f8'] == 2097154:
            cur = {'start': ri, 'sec': info['sec'], 'client_frames': None, 'recs': []}
            ops.append(cur)
        elif cur is not None:
            cur['recs'].append((ri, info))
        elif ops:
            ops[-1]['recs'].append((ri, info))

    if not ops:
        print('未发现客户端记录（f8=2097154）；尝试按秒聚类请用 records --summary')
        return

    print(f'=== 操作时间线：{len(ops)} 次操作（客户端记录 f8=2097154 为界）===')
    for oi, op in enumerate(ops):
        client_frames = 0
        r = recs[op['start']]
        for f, w, x, _ in walk_fields(r, 0, len(r)):
            if f == 21:
                client_frames = len(frames_of(x))
        instr = client_instr(op['start'])
        from collections import defaultdict
        by_graph = defaultdict(lambda: [0, 0, 0])  # 图 -> [条数, 帧数, 负载]
        f8s = defaultdict(set)
        moved = set()  # 魔方块-旋转：真正转动的块（大记录 f21>1KB）
        secs = [op['sec']] if op['sec'] is not None else []
        for ri, info in op['recs']:
            if info['sec'] is not None:
                secs.append(info['sec'])
            gid = info['graph']
            if gid is None:
                continue
            a = by_graph[gid]
            a[0] += 1
            r2 = recs[ri]
            for f, w, x, _ in walk_fields(r2, 0, len(r2)):
                if f == 21:
                    frs = frames_of(x)
                    a[1] += len(frs)
                    a[2] += sum(fr[3] or 0 for fr in frs)
            if info['f8'] is not None and info['f8'] <= 65535:
                f8s[gid].add(info['f8'])
                if gid == 1073741835 and info['f21'] > 1000:
                    moved.add(info['f8'])
        srv = ', '.join(
            f'{gid}{(" " + graph_name(gid, gil).strip()) if gil else ""}×{a[0]}'
            for gid, a in sorted(by_graph.items(), key=lambda kv: -kv[1][0]))
        blocks = sorted(f8s.get(1073741835, set()))
        sel = sorted(f8s.get(1073741852, set()))
        settle = '，含结算' if 1073741854 in by_graph else ''
        print(f'op{oi + 1:>2} rec{op["start"]:>3} sec{str(op["sec"]):>4} 指令={instr or "?"} '
              f'客户端{client_frames}帧'
              f'{" | 服务端: " + srv if srv else ""}'
              f'{" | 转动块f8=" + str(sorted(moved)) if moved else ""}'
              f'{" | 选中f8=" + str(sel) if sel else ""}{settle}')


def cmd_frames(recs, gil=None, rec_filter=None, graph_filter=None, contains=None):
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
                if contains is None or contains in line: print(line)


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


def _collect_perf(recs, gil, rec_filter, graph_filter):
    """逐记录 + 逐秒 + 逐节点链聚合。

    真实执行性能 = 单次负载 × 执行次数。
    超载/被踢的核心指标 = 每秒负载（记录字段 f3 = 会话内已过秒数，秒桶内所有帧 f6 之和）。
    """
    rec_stats = {}   # rec -> (sec, 帧数, 总负载)
    sec_stats = defaultdict(lambda: [0, 0])   # sec -> [帧数, 总负载]
    node_stats = defaultdict(lambda: [0, 0])  # 节点链 -> [次数, 总负载]
    sec_node_stats = defaultdict(lambda: defaultdict(lambda: [0, 0]))  # sec -> 节点链 -> [次数, 总负载]
    for ri, r in enumerate(recs):
        if rec_filter is not None and ri != rec_filter: continue
        graph = None; sec = None
        for f, w, x, _ in walk_fields(r, 0, len(r)):
            if f == 3 and w == 0:
                sec = x
            elif f == 7:
                for f2, w2, v2, _ in walk_fields(x, 0, len(x)):
                    if f2 == 2:
                        graph = v2 if isinstance(v2, int) else int.from_bytes(v2, 'big') if len(v2) <= 4 else v2.hex()
        if graph_filter is not None and graph != graph_filter: continue
        for f, w, x, _ in walk_fields(r, 0, len(r)):
            if f != 21: continue
            frames = frames_of(x)
            cnt = len(frames)
            tot_load = sum(fr[3] or 0 for fr in frames)
            rec_stats[ri] = (sec, cnt, tot_load)
            if sec is not None:
                sec_stats[sec][0] += cnt
                sec_stats[sec][1] += tot_load
            for head, ins, outs, ld in frames:
                nl = node_label(head, graph, gil)
                key = nl if nl else f'head={head}'
                node_stats[key][0] += 1
                node_stats[key][1] += ld or 0
                if sec is not None:
                    sec_node_stats[sec][key][0] += 1
                    sec_node_stats[sec][key][1] += ld or 0
    return rec_stats, sec_stats, node_stats, sec_node_stats


def cmd_perf(recs, gil=None, rec_filter=None, graph_filter=None, compare_path=None, sec_filter=None):
    """性能聚合视图：按秒负载定位超载（被踢关键指标）+ 记录/节点链热点。"""
    rec_stats, sec_stats, node_stats, sec_node_stats = _collect_perf(recs, gil, rec_filter, graph_filter)

    print('=== 每秒负载（f3 秒桶：帧数 / 总负载 / 均负载，按负载降序 TOP 15）===')
    print('   超载风险高→低；这是“1秒内平均负载过高被踢”的直接指标。')
    for sec, (cnt, tot_load) in sorted(sec_stats.items(), key=lambda kv: -kv[1][1])[:15]:
        avg = f'{tot_load / cnt:.1f}' if cnt else '-'
        print(f'sec{sec:>4}: 帧={cnt:>6} 负载={tot_load:>7} 均={avg}')

    print('\n=== 每秒负载（时间序，峰值用 <<< 标记）===')
    max_sec = max(sec_stats, key=lambda s: sec_stats[s][1]) if sec_stats else None
    for sec in sorted(sec_stats):
        cnt, tot_load = sec_stats[sec]
        avg = f'{tot_load / cnt:.1f}' if cnt else '-'
        mark = ' <<< PEAK' if sec == max_sec else ''
        print(f'sec{sec:>4}: 帧={cnt:>6} 负载={tot_load:>7} 均={avg}{mark}')

    if sec_filter is not None:
        print(f'\n=== sec{sec_filter} 节点链明细（单次负载 × 次数 = 真实消耗，TOP 30）===')
        sub = sec_node_stats.get(sec_filter, {})
        if not sub:
            print('（该秒无帧记录）')
        for node, (cnt, tot_load) in sorted(sub.items(), key=lambda kv: -kv[1][1])[:30]:
            avg = f'{tot_load / cnt:.1f}' if cnt else '-'
            print(f'{cnt:5d} {tot_load:7d} {avg:>6}  {node[:110]}')

    print('\n=== 每记录：秒 / 帧数 / 总负载 / 均负载 ===')
    for ri in sorted(rec_stats):
        sec, cnt, tot_load = rec_stats[ri]
        avg = f'{tot_load / cnt:.1f}' if cnt else '-'
        print(f'rec{ri}: sec={sec} 帧={cnt} 负载={tot_load} 均={avg}')

    print(f'\n=== 节点链性能（单次负载 × 次数 = 真实消耗，按总负载降序 TOP 40）===')
    print(f'{"次数":>5} {"总负载":>7} {"均负载":>6}  节点链')
    for node, (cnt, tot_load) in sorted(node_stats.items(), key=lambda kv: -kv[1][1])[:40]:
        avg = f'{tot_load / cnt:.1f}' if cnt else '-'
        print(f'{cnt:5d} {tot_load:7d} {avg:>6}  {node[:110]}')

    if compare_path:
        cmp_recs = load(compare_path)
        cmp_rec_stats, cmp_sec_stats, _, _ = _collect_perf(cmp_recs, gil, rec_filter, graph_filter)
        print(f'\n=== 对比（当前 vs {os.path.basename(compare_path)}，按 rec 对齐）===')
        print(f'{"rec":>5} {"当前秒":>6} {"当前帧":>6} {"对比帧":>6} {"Δ帧":>6} {"当前负载":>8} {"对比负载":>8} {"Δ负载":>8}')
        for ri in sorted(rec_stats):
            s1, c1, l1 = rec_stats[ri]
            s2, c2, l2 = cmp_rec_stats.get(ri, (None, 0, 0))
            print(f'rec{ri:>2} {str(s1):>6} {c1:6d} {c2:6d} {c2 - c1:6d} {l1:8d} {l2:8d} {l2 - l1:8d}')
        print(f'\n=== 每秒负载对比（当前 vs 对比，按秒对齐）===')
        print(f'{"sec":>5} {"当前帧":>6} {"对比帧":>6} {"Δ帧":>6} {"当前负载":>8} {"对比负载":>8} {"Δ负载":>8}')
        for sec in sorted(set(sec_stats) | set(cmp_sec_stats)):
            c1, l1 = sec_stats.get(sec, (0, 0))
            c2, l2 = cmp_sec_stats.get(sec, (0, 0))
            print(f'{sec:>5} {c1:6d} {c2:6d} {c2 - c1:6d} {l1:8d} {l2:8d} {l2 - l1:8d}')


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
    gil = None; rec_filter = None; graph_filter = None; contains = None; compare_path = None; sec_filter = None
    summary = False
    rest = []
    i = 1
    while i < len(args):
        if args[i] == '--gil':
            gil = args[i + 1]; i += 2
        elif args[i] == '--rec':
            rec_filter = int(args[i + 1]); i += 2
        elif args[i] == '--graph':
            graph_filter = int(args[i + 1]); i += 2
        elif args[i] == '--contains':
            contains = args[i + 1]; i += 2
        elif args[i] == '--compare':
            compare_path = args[i + 1]; i += 2
        elif args[i] == '--sec':
            sec_filter = int(args[i + 1]); i += 2
        elif args[i] == '--summary':
            summary = True; i += 1
        else:
            rest.append(args[i]); i += 1
    if not rest: print(__doc__); sys.exit(1)
    recs = load(args[0])
    if gil:
        gil = load_gil_index(gil)
    cmd = rest[0]
    if cmd == 'records': cmd_records(recs, gil, summary)
    elif cmd == 'ops': cmd_ops(recs, gil)
    elif cmd == 'frames': cmd_frames(recs, gil, rec_filter, graph_filter, contains)
    elif cmd == 'perf': cmd_perf(recs, gil, rec_filter, graph_filter, compare_path, sec_filter)
    elif cmd == 'dump': cmd_dump(recs, rec_filter)
    elif cmd == 'text': cmd_text(recs)
    else:
        print(__doc__); sys.exit(1)
