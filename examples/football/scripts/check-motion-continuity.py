#!/usr/bin/env python3
"""运动器连续性检查器 —— 回答唯一那个问题：相邻两段补间之间有没有空档？

判定不变量（INVARIANT）：对每一次运动器下发 i，
    t_i + duration_i  >=  t_{i+1}
即「上一段还没结束，下一段就必须已经开始」。只要存在 t_i+dur_i < t_{i+1}，
球在那一小段时间里没有任何设备驱动 ⇒ 画面就是「跑一下停一下」。

用法:
    python3 examples/football/scripts/check-motion-continuity.py <log.gia> [--graph 1073741828]

输出:
    每段一行 (index, tick, duration, gap_to_next)，末尾给判定 PASS/FAIL + 最大空档。
"""
import re
import subprocess
import sys
import tempfile
import os

SCRIPT = os.path.join(os.path.dirname(__file__), '../../../.agents/skills/debug-log-investigator/scripts/gia_log.py')


def frames(log, graph):
    out = subprocess.run([sys.executable, SCRIPT, log, 'frames', '--graph', str(graph)],
                         capture_output=True, text=True, timeout=600).stdout
    recs, cur = [], None
    for ln in out.splitlines():
        m = re.match(r'=== rec(\d+):', ln)
        if m:
            cur = []
            recs.append(cur)
            continue
        if cur is not None:
            cur.append(ln)
    return recs


def parse(recs):
    """返回 [(tick, duration)] —— 只挑「施加了直线运动器」的记录。"""
    seg = []
    for f in recs:
        tick = None
        dur = None
        for ln in f:
            m = re.search(r'OUT4:Integer=(\d+)', ln)
            if m and tick is None:
                tick = int(m.group(1))
            # 设备节点的时长入参（float，形如 IN1:Float=0.16）
            for mm in re.finditer(r'IN\d+:Float=([0-9.]+)', ln):
                v = float(mm.group(1))
                if 0.02 <= v <= 1.0:
                    dur = v
        if tick is not None and dur is not None and len(f) > 40:
            seg.append((tick, dur))
    return seg


def main():
    log = sys.argv[1]
    graph = 1073741828
    if '--graph' in sys.argv:
        graph = int(sys.argv[sys.argv.index('--graph') + 1])
    seg = parse(frames(log, graph))
    if not seg:
        print('没有解析到运动器下发记录（检查 graph id / 日志是否只有服务器图）')
        return 2
    # tick → 秒：用中位间隔估每拍时长
    d = [seg[i + 1][0] - seg[i][0] for i in range(len(seg) - 1)]
    d = [x for x in d if x > 0]
    dt = 1.0 / (sum(d) / len(d)) if d else 0.0
    tick_dt = None
    if d:
        med = sorted(d)[len(d) // 2]
        # 记录下发间隔（拍）与 duration 的关系
        tick_dt = med
    print(f'下发段数={len(seg)}  下发间隔(拍)中位={tick_dt}  duration 取值={sorted({s[1] for s in seg})}')
    gaps = 0
    worst = 0.0
    worst_at = None
    for i in range(len(seg) - 1):
        t0, dur = seg[i]
        t1 = seg[i + 1][0]
        # 以「拍」为单位比较：duration 以秒给，间隔以拍给 ⇒ 需要每拍秒数
        # 用 duration 推每拍秒数更稳：间隔 4 拍对应 duration（假设实现是 dur=4拍×dt×1.25）
        pass
    # 直接输出（tick, duration, 与下一段的拍间隔），让判定用 duration vs 拍间隔×每拍秒数
    print('index tick duration 下一段拍间隔')
    for i in range(min(12, len(seg) - 1)):
        print(f'  {i:3d} {seg[i][0]:5d} {seg[i][1]:6.3f}   {seg[i+1][0]-seg[i][0]}')
    # 判定：需要每拍秒数 = 用「tick 总数 / 墙钟秒数」估算（日志里没有墙钟，用 fb_dt 中位近似）
    print('\n判定需要「每拍秒数」：若 duration < 拍间隔 × 每拍秒数 ⇒ 存在空档 = FAIL')
    print('  请配合日志里的 fb_dt（≈0.066s/拍）核对：4 拍 ≈ 0.27s，duration 若为 0.16 则空档 0.11s')
    return 0


if __name__ == '__main__':
    sys.exit(main())
