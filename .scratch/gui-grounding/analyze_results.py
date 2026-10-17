#!/usr/bin/env python3
"""汇总 expA/expB 结果 -> results/summary.md + viz/expA_*.png, viz/expB_*.png
所有数字直接来自 results/expA.json / results/expB.json（可重算）。"""
import json, os
import numpy as np
from PIL import Image, ImageDraw

ROOT = '/home/h/genshin-ts/.scratch/gui-grounding'
A = json.load(open(f'{ROOT}/results/expA.json'))
rows = [r for r in A['rows'] if not r['tf'].startswith('NEG:')]
negs = [r for r in A['rows'] if r['tf'].startswith('NEG:')]

def agg(rs, pre):
    n = len(rs)
    if not n:
        return dict(n=0)
    err = np.array([r[f'{pre}_err'] for r in rs], dtype=float)
    sc = np.array([r['s1_score' if pre == 's1' else f'{pre}_score'] for r in rs], dtype=float)
    return dict(n=n, hit=int((err <= 8).sum()), hit_rate=round(float((err <= 8).mean()), 3),
                false=int(((err > 32) & (sc > 0.8)).sum()),
                med_err=round(float(np.median(err)), 1),
                secs=round(float(np.mean([r[f'{pre}_secs'] for r in rs])), 2))

lines = ['# 实验 A 汇总（源: results/expA.json）', '',
         '| 变换 | n | 原尺度命中(err≤8) | 原尺度假命中(err>32&sc>0.8) | 原尺度中位err | 原尺度均耗时 | 多尺度命中 | 多尺度假命中 | 多尺度中位err | 多尺度均耗时 |',
         '|---|---|---|---|---|---|---|---|---|---|']
groups = {}
for r in rows:
    groups.setdefault(r['tf'], []).append(r)
for tf in ['scale0.75', 'scale0.9', 'scale1.1', 'scale1.25', 'shift+64x', 'shift-64x',
           'shift+64y', 'shift-64y', 'bright+10%', 'bright-10%', 'combo1', 'combo2']:
    if tf not in groups:
        continue
    g = groups[tf]
    a1, a2 = agg(g, 's1'), agg(g, 'ms')
    lines.append(f"| {tf} | {a1['n']} | {a1.get('hit','?')}/{a1['n']} ({a1.get('hit_rate','?')}) "
                 f"| {a1.get('false','?')} | {a1.get('med_err','?')}px | {a1.get('secs','?')}s "
                 f"| {a2.get('hit','?')}/{a2['n']} ({a2.get('hit_rate','?')}) | {a2.get('false','?')} "
                 f"| {a2.get('med_err','?')}px | {a2.get('secs','?')}s |")
# 按类聚合
def cls(tf):
    return ('缩放' if tf.startswith('scale') else '平移' if tf.startswith('shift')
            else '亮度' if tf.startswith('bright') else '组合')
for c in ['缩放', '平移', '亮度', '组合', 'ALL']:
    rs = rows if c == 'ALL' else [r for r in rows if cls(r['tf']) == c]
    a1, a2 = agg(rs, 's1'), agg(rs, 'ms')
    lines.append(f"\n**{c}**: n={a1['n']} 原尺度 hit={a1['hit_rate']} false={a1['false']} "
                 f"med_err={a1['med_err']}px {a1['secs']}s | 多尺度 hit={a2['hit_rate']} "
                 f"false={a2['false']} med_err={a2['med_err']}px {a2['secs']}s")
lines.append('\n## 负样本（模板 vs 异态真实帧, 原尺度全帧 NCC）')
lines.append(f"n={len(negs)}, score>0.8: {sum(1 for r in negs if r['s1_score'] > 0.8)}, "
             f"score>0.9: {sum(1 for r in negs if r['s1_score'] > 0.9)}")
for r in negs:
    if r['s1_score'] > 0.8:
        lines.append(f"- {r['tpl']} vs {r['tf'][4:]}: {r['s1_score']} @ {r['s1_pos']}")
sk = A.get('skipped', [])
lines.append(f"\n跳过样本 {len(sk)}（出界/自检不过）: " + '; '.join(sk[:12]))

# ---- viz expA ----
os.makedirs(f'{ROOT}/viz', exist_ok=True)
BY_TF = {('menu', 'scale0.75'): ('playtest-tile', 120), ('menu', 'scale1.25'): ('playtest-tile', 120),
         ('menu', 'combo2'): ('playtest-tile', 120), ('menu', 'combo1'): ('playtest-tile', 120)}
for (base, tf), (tpl, side) in BY_TF.items():
    m = [r for r in rows if r['base'] == f'{base}.png' and r['tf'] == tf and r['tpl'] == tpl]
    if not m:
        continue
    r = m[0]
    im = Image.open(f'{ROOT}/crops/{base}_{tf}.png').convert('RGB')
    d = ImageDraw.Draw(im)
    for (px, py), col, lab in [( (r['ex'], r['ey']), (0,255,0), 'expected'),
                                ((r['s1_pos'][0], r['s1_pos'][1]), (255,0,0), 'single'),
                                ((r['ms_pos'][0], r['ms_pos'][1]), (0,120,255), 'multi')]:
        s = side / 2
        d.rectangle([px - s, py - s, px + s, py + s], outline=col, width=5)
        d.text((px - s, py - s - 26), lab, fill=col)
    p = f'{ROOT}/viz/expA_{base}_{tf}_{tpl}.png'
    im.save(p); lines.append(f'viz: {p} (single sc={r["s1_score"]} err={r["s1_err"]}px | multi sc={r["ms_score"]} err={r["ms_err"]}px f={r["ms_factor"]})')

# ---- expB ----
if os.path.exists(f'{ROOT}/results/expB.json'):
    B = json.load(open(f'{ROOT}/results/expB.json'))
    lines += ['', '# 实验 B 汇总（源: results/expB.json）', '',
              '| 被测帧 | 接受 | inliers | s_hat | t_hat | s误差% | t误差px | 全锚点定位中位err | 耗时 |',
              '|---|---|---|---|---|---|---|---|---|']
    for r in B['results']:
        lines.append(f"| {r['frame']} | {r['accepted']} | {r.get('inliers',0)} | {r.get('s_hat','-')} "
                     f"| {r.get('t_hat','-')} | {r.get('scale_err_pct','-')} | {r.get('trans_err_px','-')} "
                     f"| {r.get('anchor_loc_med_px','-')}px | {r.get('secs','-')}s |")
    acc = [r for r in B['results'] if r['accepted']]
    negs_b = [r for r in B['results'] if r['frame'].startswith('NEG:')]
    pos_b = [r for r in B['results'] if not r['frame'].startswith('NEG:')]
    lines.append(f"\n正样本(13): 接受 {sum(1 for r in pos_b if r['accepted'])}/{len(pos_b)}，"
                 f"假接受 {sum(1 for r in pos_b if r.get('false_accept'))}")
    lines.append(f"负样本(异态帧 {len(negs_b)}): 错误接受 {sum(1 for r in negs_b if r['accepted'])}")
    lines.append(f"接受帧的锚点定位中位err: {sorted(r.get('anchor_loc_med_px', 999) for r in pos_b if r['accepted'])}")
    lines.append(f"耗时: 均值 {round(sum(r.get('secs',0) for r in pos_b)/max(1,len(pos_b)),2)}s/帧")

open(f'{ROOT}/results/summary.md', 'w').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
