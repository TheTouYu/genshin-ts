#!/usr/bin/env python3
"""tetris v2 四会话耗时分布分析：模型生成 vs 工具执行 vs 步间空闲。
只读分析，输出 /tmp/perf-anal/out.json + stdout markdown 摘要。"""
import json, subprocess, os, sys
from datetime import datetime, timezone, timedelta

CST = timezone(timedelta(hours=8))
BASE = os.path.expanduser('~/.dsh/sessions/--home-h-genshin-ts--')
SESS = {
    'lead': 'session-4b71d96c-01ca-4c27-bdd0-a776c1cf595a',
    'core-mechanics': '0d4c9b47-7e18-415b-852b-ef99b101d901',
    'ai-driver': 'cdddbd89-460a-4306-bb17-56286f11fdf3',
    'modes-arch': 'cc2f390b-e749-4d26-9181-08ff2c2e40da',
}

def fmt_t(ms):
    return datetime.fromtimestamp(ms / 1000, CST).strftime('%H:%M:%S') if ms else '-'

def argdesc(name, args):
    try:
        a = json.loads(args) if isinstance(args, str) else (args or {})
    except Exception:
        a = {}
    if name == 'bash':
        c = (a.get('command') or a.get('cmd') or '').replace('\n', ' ; ')[:110]
        return c
    for k in ('file_path', 'path', 'pattern', 'query', 'description', 'task_id'):
        if a.get(k):
            return f"{k}={str(a[k])[:80]}"
    return str(a)[:80]

results = {}
for name, sid in SESS.items():
    path = f'{BASE}/{sid}/session.v4.jsonl.zstd'
    proc = subprocess.Popen(['zstd', '-dc', path], stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, text=True, errors='replace', bufsize=1 << 20)
    created = first_time = last_time = None
    prev_time = prev_type = None
    pending = {}          # callId -> (t, name, args)
    tool_durs = []        # (dur, name, desc, t, isErr)
    gen_gaps = []         # (gap, prev_type) before assistant/message
    turn_gaps = []        # (gap, at_turn_end_time)
    turn_durs = []        # per-turn active durations
    inbox_gaps = []       # (gap, prev_type, at) before inbox splice arrives
    n_asst = n_call = n_turn = n_err = n_unresolved = 0
    cur_turn_start = None
    last_turn_end = None
    for line in proc.stdout:
        try:
            ev = json.loads(line)
        except Exception:
            continue
        t = ev.get('type')
        if t == 'session':
            created = ev.get('createdAt')
            continue
        time = ev.get('time')
        if time is None:
            continue
        d = ev.get('data') or {}
        if t == 'assistant/message':
            n_asst += 1
            if prev_time is not None and 0 <= time - prev_time < 3600_000:
                gen_gaps.append((time - prev_time, prev_type))
        elif t == 'tool/call':
            n_call += 1
            pending[d.get('callId')] = (time, d.get('name'), d.get('arguments') or '')
        elif t == 'tool/result':
            msg = d.get('message') or {}
            cid = msg.get('toolCallId') or (msg.get('source') or {}).get('callId')
            iserr = bool(msg.get('isError'))
            if cid and cid in pending:
                pt, pn, pa = pending.pop(cid)
                tool_durs.append((time - pt, pn, argdesc(pn, pa), pt, iserr))
                if iserr:
                    n_err += 1
            else:
                n_unresolved += 1
        elif t == 'agent/inbox/spliced':
            if prev_time is not None and 0 < time - prev_time < 3600_000:
                inbox_gaps.append((time - prev_time, prev_type, fmt_t(time)))
        elif t == 'turn/start':
            if last_turn_end is not None and time - last_turn_end > 0:
                turn_gaps.append((time - last_turn_end, last_turn_end))
            cur_turn_start = time
            n_turn += 1
        elif t == 'turn/end':
            if cur_turn_start is not None:
                turn_durs.append(time - cur_turn_start)
            last_turn_end = time
        elif t == 'user/message':
            pass
        else:
            # ignore noise events for gap accounting
            prev_time, prev_type = prev_time, prev_type
            if t not in ('step/start', 'step/end'):
                last_time = last_time
            continue
        last_time = time
        if first_time is None:
            first_time = time
        prev_time, prev_type = time, t
    proc.stdout.close(); proc.wait()

    tool_total = sum(x[0] for x in tool_durs)
    gen_total = sum(g for g, _ in gen_gaps)
    gen_by_prev = {}
    for g, pt in gen_gaps:
        gen_by_prev[pt] = gen_by_prev.get(pt, 0) + g
    active_total = sum(turn_durs)
    wall = (last_time - created) if (created and last_time) else 0
    big_gaps = sorted(turn_gaps, reverse=True)[:12]

    # 分类命令模式
    def pat_total(pat):
        xs = [x for x in tool_durs if pat in (x[2] or '')]
        return {'n': len(xs), 'total_ms': sum(x[0] for x in xs),
                'avg_ms': (sum(x[0] for x in xs) / len(xs)) if xs else 0,
                'max_ms': max((x[0] for x in xs), default=0)}

    top = sorted(tool_durs, reverse=True)[:25]
    by_name = {}
    for dur, nm, _, _, _ in tool_durs:
        by_name[nm] = [by_name.get(nm, [0, 0])[0] + dur, by_name.get(nm, [0, 0])[1] + 1]

    results[name] = {
        'session': sid,
        'created': created, 'first': first_time, 'last': last_time,
        'wall_ms': wall,
        'turns': n_turn, 'assistant_msgs': n_asst,
        'tool_calls': n_call, 'tool_errors': n_err,
        'turn_active_ms': active_total,
        'turn_gap_ms_total': sum(g for g, _ in turn_gaps),
        'turn_gap_ms_sum_lt_1h': sum(g for g, _ in turn_gaps if g < 3600_000),
        'gen_total_ms': gen_total, 'gen_by_prev': gen_by_prev,
        'tool_total_ms': tool_total,
        'tool_by_name': {k: [round(v[0] / 1000, 1), v[1]] for k, v in sorted(by_name.items(), key=lambda kv: -kv[1][0])},
        'top_tools': [{'dur_s': round(d / 1000, 1), 'name': nm, 'at': fmt_t(at), 'err': er, 'desc': de}
                      for d, nm, de, at, er in top],
        'big_turn_gaps': [{'gap_s': round(g / 1000, 1), 'after': fmt_t(at)} for g, at in big_gaps],
        'unresolved_results': n_unresolved,
        'inbox_wait_gaps': sorted([{'gap_s': round(g / 1000, 1), 'prev': pt, 'at': at} for g, pt, at in inbox_gaps if g > 30000], key=lambda x: -x['gap_s'])[:10],
        'inbox_wait_total_ms': sum(g for g, _, _ in inbox_gaps),
        'pat_runner': pat_total('runner.mjs'),
        'pat_build': pat_total('build.mjs'),
        'pat_lua': pat_total('lua5.3'),
        'pat_probe': pat_total('probe'),
        'pat_git': pat_total('git '),
    }

with open('/tmp/perf-anal/out.json', 'w') as f:
    json.dump(results, f, ensure_ascii=False, indent=1)

print('=' * 72)
for name, r in results.items():
    print(f"\n### {name}  ({r['session'][:12]})")
    print(f"created={fmt_t(r['created'])} first={fmt_t(r['first'])} last={fmt_t(r['last'])} wall={r['wall_ms']/60000:.1f}min")
    print(f"turns={r['turns']} asst_msgs={r['assistant_msgs']} tool_calls={r['tool_calls']} tool_errs={r['tool_errors']}")
    at = r['turn_active_ms'] / 60000
    tt = r['tool_total_ms'] / 60000
    gt = r['gen_total_ms'] / 60000
    tg = r['turn_gap_ms_sum_lt_1h'] / 60000
    print(f"turn_active={at:.1f}min | tool_exec={tt:.1f}min | gen_gap={gt:.1f}min | between_turn_gaps={tg:.1f}min")
    print(f"gen_by_prev: { {k: round(v/60000,1) for k,v in r['gen_by_prev'].items()} }")
    print('tool_by_name(min):', {k: v for k, v in list(r['tool_by_name'].items())[:8]})
    print(f"runner: n={r['pat_runner']['n']} total={r['pat_runner']['total_ms']/60000:.1f}min avg={r['pat_runner']['avg_ms']/1000:.0f}s max={r['pat_runner']['max_ms']/1000:.0f}s")
    print(f"build : n={r['pat_build']['n']} total={r['pat_build']['total_ms']/60000:.1f}min avg={r['pat_build']['avg_ms']/1000:.0f}s")
    print(f"lua   : n={r['pat_lua']['n']} total={r['pat_lua']['total_ms']/60000:.1f}min")
    print(f"probe : n={r['pat_probe']['n']} total={r['pat_probe']['total_ms']/60000:.1f}min avg={r['pat_probe']['avg_ms']/1000:.0f}s max={r['pat_probe']['max_ms']/1000:.0f}s")
    print('top tools:')
    for x in r['top_tools'][:12]:
        print(f"  {x['dur_s']:>8.1f}s {x['at']} [{'E' if x['err'] else ' '}] {x['name']}: {x['desc'][:95]}")
    print('big turn gaps:', r['big_turn_gaps'][:8])
    print(f"unresolved_results={r['unresolved_results']} inbox_wait_total={r['inbox_wait_total_ms']/60000:.1f}min")
    print('inbox waits >30s (等指令/等唤醒):', r['inbox_wait_gaps'][:6])
