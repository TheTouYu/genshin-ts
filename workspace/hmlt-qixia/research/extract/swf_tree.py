#!/usr/bin/env python3
"""解析 Flash6 SWF：构建 DefineSprite 的 PlaceObject2/3 嵌套引用树。
用法: python3 swf_tree.py <swf> [根spriteId ...]
无根参数时打印全部 sprite 的直接子引用；有根时递归打印子树。"""
import struct, sys, zlib

def parse_tags(data, offset, end):
    while offset < end:
        if offset + 2 > end: break
        (code_len,) = struct.unpack_from('<H', data, offset)
        code = code_len >> 6
        ln = code_len & 0x3F
        offset += 2
        if ln == 0x3F:
            (ln,) = struct.unpack_from('<I', data, offset)
            offset += 4
        body = data[offset:offset+ln]
        yield code, body, offset
        offset += ln

def main():
    path = sys.argv[1]
    raw = open(path, 'rb').read()
    if raw[:1] == b'C':  # CWS zlib 压缩
        raw = b'F' + raw[1:8] + zlib.decompress(raw[8:])
    # header: FWS ver flen rect framerate framecount
    # rect: 5bit nbits, 4*nbits*2 bits
    p = 8
    b = raw[p]
    nbits = b >> 3
    total_bits = 5 + nbits * 4
    nbytes = (total_bits + 7) // 8
    p += nbytes
    framerate, framecount = struct.unpack_from('<HH', raw, p)
    p += 4
    # sprite 嵌套表: spriteId -> [(frame_idx, depth, charId)]
    nest = {}
    root_frames = []  # 主时间轴 (frame_idx, depth, charId)
    sprite_start = None
    frame_idx = 1
    # 先收集全部 DefineSprite 区段
    for code, body, off in parse_tags(raw, p, len(raw)):
        if code == 39:  # DefineSprite
            sid = struct.unpack_from('<H', body, 0)[0]
            cnt = struct.unpack_from('<H', body, 2)[0]
            inner = 4
            fi = 1
            lst = []
            sub_end = len(body)
            for c2, b2, o2 in parse_tags(body, inner, sub_end):
                if c2 in (26, 70):  # PlaceObject2/3
                    q = 1 if c2 == 26 else 2  # flags 长度
                    flags = b2[0]
                    dep = struct.unpack_from('<H', b2, q)[0]
                    if flags & 0x02:  # bit1 = has-character
                        cid = struct.unpack_from('<H', b2, q+2)[0]
                        lst.append((fi, dep, cid))
                elif c2 == 1:  # ShowFrame
                    fi += 1
            nest[sid] = lst
        elif code == 26:
            flags = raw[off]
            dep = struct.unpack_from('<H', raw, off+1)[0]
            if flags & 0x02:
                cid = struct.unpack_from('<H', raw, off+3)[0]
                root_frames.append((frame_idx, depth := dep, cid))
        elif code == 1:
            frame_idx += 1

    names = {}  # 从导出目录名收集 id->name（可选，外部传入）
    def dump(sid, indent, seen):
        if sid in seen: return
        seen.add(sid)
        for fi, dep, cid in nest.get(sid, []):
            print('  '*indent + f'frame{fi} d{dep} -> sprite {cid}')
            if cid in nest:
                dump(cid, indent+1, seen | {sid})

    args = [int(x) for x in sys.argv[2:]]
    if args:
        for sid in args:
            print(f'=== 子树 sprite {sid} ===')
            dump(sid, 1, set())
    else:
        print('=== 主时间轴 PlaceObject ===')
        for fi, dep, cid in root_frames:
            print(f'frame{fi} depth{dep} -> {cid}')
        print('=== 各 sprite 直接子引用(仅列有子的) ===')
        for sid in sorted(nest):
            if nest[sid]:
                print(f'{sid}: ' + ', '.join(f'f{f}/d{d}->{c}' for f, d, c in nest[sid][:12]))

if __name__ == '__main__':
    main()
