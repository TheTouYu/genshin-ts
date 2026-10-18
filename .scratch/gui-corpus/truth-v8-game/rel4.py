#!/usr/bin/env python3
"""rel4.py — 给 truth-v8-game 的 4 帧补结构关系（parent + groups），供 D3 分组评估。

规则（用户口径）：
  · 行 → 所属列表区/面板；卡片 → 卡片网格区；按钮 → 所在面板；面板自身 parent=null
  · 弹窗内元素 parent = 弹窗 id
  · groups：{id, kind(panel|row_stack|grid), bbox, members[...]}，members 是**直接子对象**

新增 1 个容器对象 'hud'（录制 HUD 层）：四角 HUD 件原来无处可挂（parent=null 会拉低覆盖率），
给它们一个真实存在的层容器。note 里标了"非游戏 UI"，可按 note 过滤。

同时输出「组几何统计」（pitch / gap / 首沿对齐 / 尺寸一致性）供"游戏里什么算一个组"。
"""
import json
import os

DIR = '/home/h/genshin-ts/.scratch/gui-corpus/truth-v8-game'


def union(objs, pad=0):
    x0 = min(o['bbox'][0] for o in objs) - pad
    y0 = min(o['bbox'][1] for o in objs) - pad
    x1 = max(o['bbox'][0] + o['bbox'][2] for o in objs) + pad
    y1 = max(o['bbox'][1] + o['bbox'][3] for o in objs) + pad
    return [max(0, x0), max(0, y0), min(2560, x1) - max(0, x0), min(1440, y1) - max(0, y0)]


def geom_grid(objs):
    xs = sorted({o['bbox'][0] for o in objs})
    ys = sorted({o['bbox'][1] for o in objs})
    col = [xs[i + 1] - xs[i] for i in range(len(xs) - 1)]
    row = [ys[i + 1] - ys[i] for i in range(len(ys) - 1)]
    w = max(o['bbox'][2] for o in objs)
    h = max(o['bbox'][3] for o in objs)
    m = lambda v: round(sum(v) / len(v), 1) if v else 0
    return {'n': len(objs), 'cols': len(xs), 'rows': len(ys),
            'col_pitch': m(col), 'row_pitch': m(row),
            'col_gap_over_pitch': round((m(col) - w) / m(col), 3) if col and m(col) else 0,
            'row_gap_over_pitch': round((m(row) - h) / m(row), 3) if row and m(row) else 0,
            'col_spread': round(max(col) - min(col), 1) if col else 0,
            'row_spread': round(max(row) - min(row), 1) if row else 0}


def geom(objs, axis):
    bs = sorted([o['bbox'] for o in objs], key=lambda b: b[1] if axis == 'y' else b[0])
    if len(bs) < 2:
        return None
    pos = [b[1] for b in bs] if axis == 'y' else [b[0] for b in bs]
    ext = [b[3] for b in bs] if axis == 'y' else [b[2] for b in bs]
    cross = [b[0] for b in bs] if axis == 'y' else [b[1] for b in bs]
    pit = [pos[i + 1] - pos[i] for i in range(len(pos) - 1)]
    gap = [pit[i] - ext[i] for i in range(len(pit))]
    m = lambda v: sum(v) / len(v)
    return {'n': len(bs), 'pitch': round(m(pit), 1), 'pitch_spread': round(max(pit) - min(pit), 1),
            'gap': round(m(gap), 1), 'gap_over_pitch': round(m(gap) / m(pit), 3) if m(pit) else 0,
            'align_spread': round(max(cross) - min(cross), 1), 'size_spread': round(max(ext) - min(ext), 1)}


def run(stem, hud_ids, parents, groups_defs, note=''):
    p = os.path.join(DIR, stem + '.json')
    d = json.load(open(p, encoding='utf-8'))
    objs = {str(o['id']): o for o in d['objects']}
    # 1) HUD 层容器
    if 'hud' not in objs:
        box = union([objs[str(i)] for i in hud_ids])
        d['objects'].append({'id': 'hud', 'parent': None, 'bbox': box, 'kind': 'unknown', 'text': [],
                             'clickable': 'no',
                             'state': {'selected': False, 'focused': False, 'disabled': False},
                             'badges': [], 'clipped': {'edges': [], 'cut_by': None, 'px': 0},
                             'note': '录制 HUD 层（DXVK/FPS/GPU + min/max ms + UID 水印），非游戏 UI；'
                                     '加它只为让四角件有容器可挂（可按 note 过滤）'})
        objs = {str(o['id']): o for o in d['objects']}
    # 2) parent
    full = dict(parents)
    for i in hud_ids:
        full[str(i)] = 'hud'
    full['hud'] = None
    for oid, par in full.items():
        oid = str(oid)
        assert oid in objs, 'no id %s in %s' % (oid, stem)
        assert par is None or str(par) in objs, 'no parent %s for %s' % (par, oid)
        assert str(par) != oid
        objs[oid]['parent'] = None if par is None else str(par)
    for oid in objs:
        seen, cur = set(), oid
        while cur is not None:
            assert cur not in seen, 'cycle at %s (%s)' % (oid, stem)
            seen.add(cur)
            cur = objs[cur]['parent']
    # 3) groups
    groups = []
    for gid, kind, members, axis, gnote in groups_defs:
        ms = [str(m) for m in members]
        for m in ms:
            assert m in objs, 'group %s member %s missing (%s)' % (gid, m, stem)
        g = {'id': gid, 'kind': kind, 'bbox': union([objs[m] for m in ms]),
             'members': ms, 'note': gnote}
        kinds = {objs[m]['kind'] for m in ms}
        st = (geom_grid([objs[m] for m in ms]) if kind == 'grid'
              else (geom([objs[m] for m in ms], axis) if len(kinds) == 1 else None))
        if st:
            g['geom'] = st
        groups.append(g)
    # HUD 组
    g = {'id': 'g_hud', 'kind': 'panel', 'bbox': union([objs[str(i)] for i in hud_ids]),
         'members': [str(i) for i in hud_ids], 'note': '录制 HUD 四角件（父容器 = hud 层）'}
    groups.append(g)
    d['groups'] = groups
    # 4) 覆盖率
    total = len(objs)
    has_par = sum(1 for o in objs.values() if o['parent'] is not None)
    non_hud = [o for o in objs.values() if 'HUD' not in (o.get('note') or '') and o['id'] != 'hud']
    par_non_hud = sum(1 for o in non_hud if o['parent'] is not None)
    in_group = set()
    for g in groups:
        in_group.update(g['members'])
    roots = {oid for oid, o in objs.items() if o['parent'] is None}
    cov = in_group | roots
    unc = sorted(set(objs) - cov)
    d['_provenance']['relations'] = {
        'parent_coverage_all': '%d/%d = %.1f%%' % (has_par, total, 100.0 * has_par / total),
        'parent_coverage_excl_hud': '%d/%d = %.1f%%' % (par_non_hud, len(non_hud), 100.0 * par_non_hud / len(non_hud)),
        'roots': sorted(roots),
        'groups': len(groups),
        'group_kinds': {k: sum(1 for g in groups if g['kind'] == k) for k in ('panel', 'row_stack', 'grid')},
        'objects_in_group_or_root': '%d/%d' % (len(cov), total),
        'uncovered': unc,
        'note': note,
    }
    json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(p, 'a', encoding='utf-8').write('\n')
    print('%-32s units=%-3d parent %d/%d=%.1f%%（去HUD %d/%d=%.1f%%） groups=%d  组/根覆盖 %d/%d'
          % (stem[:32], total, has_par, total, 100.0 * has_par / total,
             par_non_hud, len(non_hud), 100.0 * par_non_hud / len(non_hud), len(groups), len(cov), total))
    for g in groups:
        st = g.get('geom')
        if st and g['kind'] == 'grid':
            print('   %-6s grid      n=%-2d %d×%d  列pitch=%.1f(散%.1f) 行pitch=%.1f(散%.1f)  列gap/pitch=%.3f 行gap/pitch=%.3f'
                  % (g['id'], st['n'], st['cols'], st['rows'], st['col_pitch'], st['col_spread'],
                     st['row_pitch'], st['row_spread'], st['col_gap_over_pitch'], st['row_gap_over_pitch']))
        elif st:
            print('   %-6s %-9s n=%-2d bbox=%-24s pitch=%6.1f(散%5.1f) gap/pitch=%.3f 对齐散=%4.0f 尺寸散=%3.0f'
                  % (g['id'], g['kind'], st['n'], str(g['bbox']), st['pitch'], st['pitch_spread'],
                     st['gap_over_pitch'], st['align_spread'], st['size_spread']))


# ---------------------------------------------------------------- r003 派蒙菜单
run('r003_snap_2026-10-19_00-17-26', [47, 48, 49],
    dict([(1, 0), (2, 4), (3, 4), (4, 0), (5, 0), (6, 0), (7, 0), (8, 0), (9, 0), (10, 0), (11, 0), (12, 0), (13, 0)]
         + [(i, 14) for i in range(15, 23)]
         + [(i, 23) for i in range(24, 47)]
         + [(0, None), (14, None), (23, None)]),
    [('g1', 'panel', range(1, 14), 'y', '玩家信息卡：头像/名字/签名/4 属性行/UID/复制/铅笔/ⓘ2'),
     ('g2', 'row_stack', range(15, 21), 'y', '左图标栏图标列（竖排 6 个）'),
     ('g3', 'grid', range(24, 44), 'x', '4×5 功能格网格（行内 4 列 + 5 行）'),
     ('g4', 'row_stack', [21, 22], 'y', '左栏通知角标带'),
     ('g6', 'panel', [44, 45, 46], 'x', '网格内通知角标')],
    '标题区 [4] 是信息卡内二级容器，2/3 挂在 4 下；四角件挂 hud 层。')

# ---------------------------------------------------------------- r013 邀约事件
run('r013_snap_2026-10-19_00-23-53', [29, 30, 31],
    dict([(i, 0) for i in range(1, 11)]
         + [(i, 11) for i in range(12, 18)]
         + [(18 + i, 12 + i) for i in range(6)]
         + [(25, 24), (26, 24), (27, 24), (28, 24)]
         + [(0, None), (11, None), (24, None)]),
    [('g1', 'panel', range(1, 11), 'x', '顶栏（标题/3 页签/Q·E/钥匙计数/?/X）'),
     ('g2', 'grid', range(12, 18), 'x', '6 张邀约卡横排（pitch 416）'),
     ('g3', 'row_stack', range(18, 24), 'x', '6 张卡内「已达成结局 x/5」状态行（同一控件在卡内重复）'),
     ('g4', 'panel', [25, 26, 27, 28], 'x', '底部操作带：钥匙图标 + 8/8 + 提示行 + 领取钮')],
    '「领取」[28] 与提示条同底带（弱归属，写在这里供过滤）。')

# ---------------------------------------------------------------- r021 好友
run('r021_snap_2026-10-19_00-24-58', [42, 43, 44],
    dict([(i, 0) for i in range(1, 10)]
         + [(i, 10) for i in list(range(11, 18)) + [39, 40, 41]]
         + [(18 + i, 11 + i) for i in range(7)]
         + [(25 + i, 11 + i) for i in range(7)]
         + [(32 + i, 11 + i) for i in range(7)]
         + [(0, None), (10, None)]),
    [('g1', 'panel', range(1, 10), 'x', '顶栏'),
     ('g2', 'row_stack', range(11, 18), 'y', '好友列表 7 行（pitch 166.5）'),
     ('g3', 'row_stack', range(18, 25), 'y', '行内头像列'),
     ('g4', 'row_stack', range(25, 32), 'y', '行内动作按钮列'),
     ('g5', 'row_stack', range(32, 39), 'y', '行内私聊气泡列'),
     ('g6', 'panel', [39, 40, 41], 'x', '列表翻页箭头 ×2 + 黑名单管理（列表页级操作，弱归属到列表区）')],
    '行内三列与 7 条行是一一对应但不嵌套：行是父，列是同轴重复带。')

# ---------------------------------------------------------------- r022 好友+弹窗
run('r022_snap_2026-10-19_00-25-06', [41, 42, 43],
    dict([(i, 0) for i in range(1, 7)]
         + [(i, 7) for i in list(range(8, 15)) + [40]]
         + [(i, 15) for i in range(16, 31)]
         + [(i, 31) for i in range(32, 40)]
         + [(0, None), (7, None), (15, None)]),
    [('g1', 'panel', range(1, 7), 'x', '顶栏'),
     ('g2', 'row_stack', range(8, 15), 'y', '背景好友行 7 条（被弹窗压住）'),
     ('g3', 'panel', range(16, 32), 'x', '角色展柜弹窗内：名片/资料/数值行/页签/关闭'),
     ('g4', 'grid', range(32, 40), 'x', '右页角色卡 4×2 网格'),
     ('g5', 'panel', [40], 'x', '页面级黑名单钮（弱归属到好友列表区）')],
    '弹窗 [15] 是 g3 的父；卡片区 [31] 属 g3，其 8 张卡属 g4（两级容器都保留）。')
