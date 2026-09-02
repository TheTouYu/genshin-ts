#!/usr/bin/env python3
"""gia_log_align.py —— 多图 frames dump 合并时间线（2026-09-02 3093 会话方法论沉淀）.

用途：排查「规划→发布→执行→状态回读」多图协作类问题（求解器/状态机/队列）时，
把各图的 gia_log.py frames dump 中关键事件提取出来，按记录号合并成单表——
回退/破坏发生在哪一轮一眼锁定，避免手工凑错轮次对应。

用法（两步）：
  1) 每图落一份 dump（工作区目录，/tmp 不跨命令持久）：
     gia_log.py <日志.gia> frames --gil <地图.gil> --graph 1073741834 > plan_frames.txt
     gia_log.py <日志.gia> frames --gil <地图.gil> --graph 1073741833 > solver_frames.txt
     gia_log.py <日志.gia> frames --gil <地图.gil> --graph 1073741835 > turn_frames.txt
  2) 合并：
     gia_log_align.py plan_frames.txt solver_frames.txt turn_frames.txt [--mask-var solveMask]
                      [--lookup-vars mP mLen] [--publish-vars solve_len]
                      [--state-vars solver_cp solver_co solver_ep solver_eo]

提取的事件类型（每行输出 `rec  TYPE  值`）：
  MASK      Set 图变量 <mask-var>（状态机进度，如 solveMask）
  LOOKUP    Set 图变量 <lookup-vars>（查表参数，如 mP/mLen/mIdx）
  DBG       Set 图变量 dbgVal（DBG 标签轨迹）
  PUBLISH   Set Custom Variable <publish-vars>（规划→执行握手，如 solve_len/solve_seq）
  EXEC      复合:发送信号 IN0/IN1（op 码 + val，BigInt 负值语义解码）
  STATE     Set Custom Variable <state-vars>（状态发布回读，List 值 uint8 负值还原）

注意（技能坑清单同步）：
  - 负整数必须 BigInt：Integer 字段 uint64（-2=18446744073709551614）、List 元素 uint8（-2=254）。
  - Integer 显示「空」≠ 0 也 ≠ 失败：3093 实证 p=0 有效表值显示空——对齐结果定性前必须
    与源码表值/期望值离线对照（O-2026-09-04-02 语义未闭合）。
"""
import argparse
import re
import sys

REC_HEAD = re.compile(r'^=== rec(\d+):\s*graph=(\d+)\s+(\S+)')
U64 = 1 << 64


def to_signed(v: int) -> int:
    return v - U64 if v >= U64 / 2 else v


def list_items(raw: str):
    """'6, 3, 2, 254' → [6, 3, 2, -2]（uint8 负值还原）"""
    out = []
    for x in raw.split(','):
        x = x.strip()
        if not x:
            continue
        try:
            v = int(x)
        except ValueError:
            return None  # 非 int 列表（如 raw hex）整条跳过
        out.append(v - 256 if v > 127 else v)
    return out


def parse_dump(path, opt):
    """单份 frames dump → 事件列表 [(rec, TYPE, 值文本)]"""
    events = []
    rec = None
    graph = ''
    try:
        fh = open(path, encoding='utf-8', errors='replace')
    except OSError as e:
        print(f'无法读取 {path}: {e}', file=sys.stderr)
        return events
    for ln in fh:
        m = REC_HEAD.match(ln)
        if m:
            rec, graph = int(m.group(1)), m.group(3)
            continue
        if rec is None or '|' not in ln:
            continue
        if 'Set Node Graph Variable' in ln:
            mv = re.search(r'IN1:String=([\w]+)', ln)
            val = re.search(r'IN2:(Integer|String)=([^|]*)', ln)
            if not (mv and val):
                continue
            name = mv.group(1)
            v = val.group(2).strip()
            if name == opt.mask_var:
                events.append((rec, 'MASK', f'{graph} {name}={v or "(空)"}'))
            elif name in opt.lookup_vars:
                events.append((rec, 'LOOKUP', f'{graph} {name}={v or "(空)"}'))
            elif name == 'dbgVal':
                events.append((rec, 'DBG', f'{graph} {v}'))
        elif 'Set Custom Variable' in ln:
            mv = re.search(r'IN1:String=([\w]+)', ln)
            if not mv:
                continue
            name = mv.group(1)
            if name in opt.publish_vars:
                val = re.search(r'IN2:Integer=([^|]*)', ln)
                events.append((rec, 'PUBLISH', f'{graph} {name}={val.group(1).strip() if val else "?"}'))
            elif name in opt.state_vars:
                lv = re.search(r'IN2:List=\[([^\]]*)\]', ln)
                items = list_items(lv.group(1)) if lv else None
                if items is not None:
                    shown = items[:12]
                    more = f'…+{len(items)-12}' if len(items) > 12 else ''
                    events.append((rec, 'STATE', f'{graph} {name}={shown}{more}'))
        elif '复合:发送信号' in ln:
            op = re.search(r'IN0:Integer=(\d+)', ln)
            v = re.search(r'IN1:Integer=(\d+)', ln)
            if op and v:
                events.append((rec, 'EXEC', f'{graph} op{op.group(1)} val={to_signed(int(v.group(1)))}'))
    return events


def main():
    ap = argparse.ArgumentParser(description='多图 frames dump 合并时间线')
    ap.add_argument('dumps', nargs='+', help='gia_log.py frames 输出文件（每图一份）')
    ap.add_argument('--mask-var', default='solveMask')
    ap.add_argument('--lookup-vars', nargs='*', default=['mP', 'mLen', 'mIdx'])
    ap.add_argument('--publish-vars', nargs='*', default=['solve_len'])
    ap.add_argument('--state-vars', nargs='*', default=['solver_cp', 'solver_co', 'solver_ep', 'solver_eo'])
    ap.add_argument('--types', nargs='*', default=None, help='只保留指定类型（MASK/LOOKUP/DBG/PUBLISH/EXEC/STATE）')
    opt = ap.parse_args()

    all_ev = []
    for p in opt.dumps:
        all_ev.extend(parse_dump(p, opt))
    all_ev.sort(key=lambda e: e[0])
    for rec, kind, val in all_ev:
        if opt.types and kind not in opt.types:
            continue
        print(f'rec{rec:6d}  {kind:8s} {val}')


if __name__ == '__main__':
    main()
