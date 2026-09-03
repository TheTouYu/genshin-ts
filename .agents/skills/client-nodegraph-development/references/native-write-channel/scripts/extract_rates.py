#!/usr/bin/env python3
"""extract_rates.py — 原生写通道复测判读一条命令（票 14/18 判读法固化，2026-09-03）

用法：
  python3 extract_rates.py <loop帧dump> <listen帧dump> <日志.gia>

输入=两图 frames dump 文件（大日志先落文件）；输出=全部判据：
  per-instance 施放率（f8 实例偏移）/客户端 tag 发送/服务端 per-instance 到达（SVA n 计数变量）/
  HP 事件率/位置跟随（轮询变量不同值数）/秒桶。判读对照：单实例 ~15/s、N 并发 ~N×13-15、
  位置应连续变化（sin 编码时=波形采样）。
"""
import re
import subprocess
import sys
from collections import Counter

REC = re.compile(r'=== rec(\d+)')
GL = '/home/h/genshin-ts/.agents/skills/debug-log-investigator/scripts/gia_log.py'


def main(loop_dump, listen_dump, log):
    # —— 客户端：rec→f8+sec（records），帧流 tag 发送 ——
    out = subprocess.run(['python3', GL, log, 'records', '--graph', 'LOOP'],
                         capture_output=True, text=True).stdout
    # 图 ID 未知→从 dump 头读
    graph_id = None
    with open(loop_dump, errors='replace') as fh:
        for ln in fh:
            m = re.search(r'graph=(\d+)', ln)
            if m:
                graph_id = m.group(1)
                break
    out = subprocess.run(['python3', GL, log, 'records', '--graph', graph_id],
                         capture_output=True, text=True).stdout
    rec2f8, rec2sec = {}, {}
    for ln in out.splitlines():
        m = re.search(r'rec\s*(\d+)', ln)
        f = re.search(r'8:\s*(\d+)', ln)
        s = re.search(r'\b3:\s*(\d+)', ln)
        if m:
            if f:
                rec2f8[int(m.group(1))] = int(f.group(1))
            if s:
                rec2sec[int(m.group(1))] = int(s.group(1))
    total_sec = max(rec2sec.values()) if rec2sec else 1
    inst = Counter(v for v in rec2f8.values() if v >= 1000000)  # 客户端实例偏移段
    tags = Counter()
    with open(loop_dump, errors='replace') as fh:
        for ln in fh:
            tm = re.search(r'IN0:String=(SVA\d|SVT\d)', ln)
            if tm:
                tags[tm.group(1)] += 1
    print(f'== 客户端（会话 {total_sec}s）==')
    print(f'per-instance 施放: {dict(sorted(inst.items()))} → ' +
          str({k: round(v / total_sec, 1) for k, v in sorted(inst.items())}) + ' /s')
    print(f'tag 发送: {dict(sorted(tags.items()))} 合计 {sum(tags.values())} ≈{sum(tags.values()) / total_sec:.1f}/s')

    # —— 服务端：SET 计数变量/HP 事件/轮询变量值 ——
    sset, hp, tpx = Counter(), 0, {}
    with open(listen_dump, errors='replace') as fh:
        for ln in fh:
            nm = re.search(r'IN1:String=(\w+)', ln)
            vm = re.search(r'IN2:(?:Float|Integer)=([\d.\-]+)', ln)
            if nm and vm:
                name = nm.group(1)
                nkb = name.replace('fb_', '')  # 兼容模板命名（c1/sv_total/x1）与带前缀命名（fb_sv_c1/...）
                if re.fullmatch(r'(sv_)?c\d', nkb) or nkb in ('sv_total', 'hp_evt_count'):
                    sset[name] += 1
                elif re.fullmatch(r'(tp_)?x\d', nkb):
                    tpx.setdefault(nkb, set()).add(vm.group(1)[:8])
            if 'When HP Is Recovered' in ln or '(584)' in ln:
                hp += 1
    print(f'== 服务端 ==')
    per = {k: round(v / total_sec, 1) for k, v in sorted(sset.items())}
    print(f'计数变量写入: {dict(sorted(sset.items()))} → {per}')
    sva_total = sum(v for k, v in sset.items() if re.fullmatch(r'(sv_)?c\d', k.replace('fb_', '')))
    print(f'SVA 聚合到达: {sva_total} ≈{sva_total / total_sec:.1f}/s | HP 事件: {hp} ≈{hp / total_sec:.1f}/s')
    print(f'位置跟随（轮询变量不同值数，>3 且连续=跟随）: { {k: len(v) for k, v in sorted(tpx.items())} }')
    print(f'判读锚: ≥20Hz 达标 / ≥40 强 / 60 如实报（N 实例理论 N×15）')


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2], sys.argv[3])
