#!/usr/bin/env python3
# 票 19 · 5.2 接管阶段 apply 率判读（2026-09-03）
# 口径（durable #8 + fb-server 源码 L513-535）：
#   apply 拍 = onSignal(fb_ball_state) 中 isP∧(tick==cur) 通过 → fb_mirror_apply 写
#   fb_ball_tick = nt(=cur+1) 严格递增 —— Set 帧天然 first-wins 去重
#   apply 率 = tick 写次数 / 施法活跃时长（首 apply 秒 ~ 末 apply 秒）
#   到达率   = 监听信号帧 tag='P' 的记录数（原始含 dup/stale，勿当 apply）
# 用法：python3 19-takeover-rates.py <日志.gia> [--gil 地图.gil] [--out 输出.tsv]
import re
import subprocess
import sys

SCRIPTS = '/home/h/genshin-ts/.agents/skills/debug-log-investigator/scripts/gia_log.py'
FB_SERVER = '1073741830'


def run(args):
    return subprocess.run(['python3', SCRIPTS] + args, capture_output=True, text=True).stdout


def main():
    log = sys.argv[1]
    gil = None
    out = None
    if '--gil' in sys.argv:
        gil = sys.argv[sys.argv.index('--gil') + 1]
    if '--out' in sys.argv:
        out = sys.argv[sys.argv.index('--out') + 1]

    # ① records：rec -> f3 秒（输出格式 `recN: {1: 会话, 3: 秒, ...}`，f3 缺省=0 秒段）
    recs = run([log, 'records', '--graph', FB_SERVER])
    rec_sec = {}
    for line in recs.splitlines():
        m = re.match(r"rec(\d+):", line)
        if m:
            cur = int(m.group(1))
            sm = re.search(r"\b3:\s*(\d+)", line)
            rec_sec[cur] = int(sm.group(1)) if sm else 0

    # ② frames：apply 写（Set fb_ball_tick IN2:Integer=v）与到达（OUT3:String=P）
    fargs = [log, 'frames', '--graph', FB_SERVER]
    if gil:
        fargs += ['--gil', gil]
    frames = run(fargs)
    cur_rec = None
    applies = []   # (rec, tick)
    arrivals = 0
    for line in frames.splitlines():
        m = re.match(r"=== rec(\d+)", line)
        if m:
            cur_rec = int(m.group(1))
            continue
        if 'IN1:String=fb_ball_tick' in line and 'IN2:Integer=' in line:
            vm = re.search(r'IN2:Integer=(-?\d+)', line)
            if vm and cur_rec is not None:
                applies.append((cur_rec, int(vm.group(1))))
        if 'OUT3:String=P' in line:
            arrivals += 1

    if not applies:
        print('NO_APPLIES fb-server 记录中无 fb_ball_tick 写——检查详情日志是否开 fb-server/会话是否含踢球段')
        return 1
    rows = [(r, rec_sec.get(r), t) for r, t in applies]
    secs = [s for _, s, _ in rows if s is not None]
    span = (max(secs) - min(secs)) if len(secs) >= 2 and max(secs) > min(secs) else None
    n = len(applies)
    ticks = [t for _, t in applies]
    monotonic = all(b > a for a, b in zip(ticks, ticks[1:]))
    rate = n / span if span else None
    print(f'applies={n} arrivals_P={arrivals}')
    print(f'tick_range={min(ticks)}..{max(ticks)} strictly_increasing={monotonic}')
    print(f'active_span_sec={span} rate={rate:.1f}/s' if rate else 'active_span_sec=<单秒窗口，率不可分>')
    if out:
        with open(out, 'w') as f:
            f.write('rec\tsec\ttick\n')
            for r, s, t in rows:
                f.write(f'{r}\t{s if s is not None else ""}\t{t}\n')
        print(f'tsv={out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
