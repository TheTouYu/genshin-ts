#!/usr/bin/env python3
"""活动分布画像（2026-09-03 足球 R2.4b/c 排查沉淀，日志技能资产）。

一句话：**记录体积聚类 = 执行路径指纹**——不解码任何帧，按会话秒聚合每张图的
记录条数/体积桶，直接回答「计算/计算拍何时开始、何时停止、频率多少、哪条路径在跑」。

用法:
  python3 gia_log_activity.py <日志.gia> [--graph <id>] [--big 3000] [--gil <地图.gil>]

输出:
  1. 每会话秒一行：记录数 / 大记录数(> --big 字节，默认 3000=重执行路径) / 总字节
  2. 尾部：体积桶聚类指纹（1KB 档=空转/轻拍、3-10KB=中拍、30KB+=重计算拍）

实证（足球 3096 会话，定位"球原地冻结"）：
  fb-phys(1082130433) 秒 6..50 每秒 10~30 个 >3KB 计算拍从未停 → 物理链活着、
  球没进 Rest → 配合 frames --rec 定位到分类器不动点陷阱（vy=0.8086 恒 Bouncing）。
"""
import sys
import os
import collections

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gia_log  # noqa: E402


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(2)
    path = args[0]
    graph = None
    big = 3000
    gil = None
    if '--graph' in args:
        graph = int(args[args.index('--graph') + 1])
    if '--big' in args:
        big = int(args[args.index('--big') + 1])
    if '--gil' in args:
        gil = args[args.index('--gil') + 1]

    recs = gia_log.load(path)
    per_sec = collections.defaultdict(lambda: [0, 0, 0])
    buckets = collections.Counter()
    gname = None
    if gil:
        idx = gia_log.load_gil_index(gil)
        if graph:
            gname = gia_log.graph_name(graph, idx)

    title = 'graph %s%s' % (graph, (' (%s)' % gname) if gname else '') if graph else 'all graphs'
    print('=== 活动分布: %s | big>%dB ===' % (title, big))
    for r in recs:
        info = {}
        for f, w, x, _ in gia_log.walk_fields(r, 0, len(r)):
            if w == 0:
                info[f] = x
            elif f == 7:
                for f2, w2, v2, _ in gia_log.walk_fields(x, 0, len(x)):
                    if f2 == 2:
                        info['graph'] = v2 if isinstance(v2, int) else (
                            int.from_bytes(v2, 'big') if len(v2) <= 4 else None)
            elif f == 21:
                info['f21'] = len(x)
        gid = info.get('graph')
        if graph is not None and gid != graph:
            continue
        if gid is None or 'f21' not in info or 3 not in info:
            continue
        sec = info[3]
        f21 = info['f21']
        d = per_sec[sec]
        d[0] += 1
        d[1] += 1 if f21 > big else 0
        d[2] += f21
        kb = f21 // 1024
        buckets['%dKB' % (kb if kb < 3 else (3 if kb < 10 else (10 if kb < 30 else 30)))] += 1

    for sec in sorted(per_sec):
        c, b, tot = per_sec[sec]
        print('sec%4d: recs=%4d big=%4d bytes=%8d' % (sec, c, b, tot))
    print('--- 体积桶指纹: %s' % ', '.join(
        '%s×%d' % kv for kv in sorted(buckets.items(), key=lambda x: x[0])))


if __name__ == '__main__':
    main()
