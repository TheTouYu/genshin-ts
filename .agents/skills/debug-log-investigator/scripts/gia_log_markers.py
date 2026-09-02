#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""服务端打印标记秒级时间轴（2026-09-03 足球 R3 收口沉淀）

f22 文本记录只有 rec 序没有会话秒；gia_log.py frames --rec 只输出含 f21 的记录，
服务端 f22-only 记录（打印/信号应答）拿不到 f3 秒——本脚本一次性输出：rec 号 + f3 会话秒
+ 命中的打印串 +（可选）独立 1-6 位数字串（任务 epoch/对账 mm 值），rec 号可与 text 输出对照。

用法:
  gia_log_markers.py <日志.gia>
  gia_log_markers.py <日志.gia> --markers fb:tab,fb:ack,fb:wdgate,fb:tear --digits
  gia_log_markers.py <日志.gia> --markers fb:autoarm,fb:auto1,fb:auto3,fb:auto5,fb:auto7 --limit 40
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gia_log  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description='f22 标记的秒级时间轴（f3 会话秒）')
    ap.add_argument('log', help='Beyond_Debug_Log .gia 路径')
    ap.add_argument('--markers', default='', help='逗号分隔打印串；缺省=输出全部非空 f22 串')
    ap.add_argument('--digits', action='store_true', help='--markers 时附带独立 1-6 位数字串（epoch/dmm 等）')
    ap.add_argument('--limit', type=int, default=0, help='最多输出行数（0=不限）')
    a = ap.parse_args()
    want = set(x for x in a.markers.split(',') if x)
    recs = gia_log.load(a.log)
    n = 0
    digit_pat = re.compile(r"\d{1,6}")
    for ri, r in enumerate(recs):
        info = {}
        strs = []
        for f, w, x, _ in gia_log.walk_fields(r, 0, len(r)):
            if w == 0:
                info[f] = x
            elif f == 22:
                for f2, w2, v2, _ in gia_log.walk_fields(x, 0, len(x)):
                    if f2 == 2:
                        try:
                            strs.append(v2.decode('utf-8', 'replace'))
                        except Exception:
                            pass
        sec = info.get(3)
        seen = set()
        for s in strs:
            if not s or s in seen:
                continue
            if want:
                if s in want or (a.digits and digit_pat.fullmatch(s)):
                    seen.add(s)
                else:
                    continue
            seen.add(s)
            print(f'rec{ri} f3={sec} {s}')
            n += 1
            if a.limit and n >= a.limit:
                return


if __name__ == '__main__':
    main()
