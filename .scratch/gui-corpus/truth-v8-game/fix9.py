#!/usr/bin/env python3
"""fix9.py — 把 9 帧游戏族老真值修到 A 级（区域级 / 四角 / 行沿 / 去重）。

判据（来自质检报告 + D402/D404）：
  · A 级 = 最大对象 ≥ 屏 10%（有区域级对象）+ 未覆盖文本 < 3（--ignore-title）+ 无重复框
  · 区域级对象派生法（D404 验证过）：成员并集 ± 固定 padding，不手编坐标
  · 行沿（R8）：同一竖直栈的行，x0/x1 取中位，偏离 >25px 的吸附回来
  · 四角（R4/R10）：三处录制 HUD 角件，若已有框覆盖 ≥50% 则不重复加
  · 去重：两框 IoU ≥ 0.98 视为重复，保留面积大的

写回原路径，原文件备份到 truth-v8-game/_pre_fix_backup/<dir>/<name>.json
"""
import json
import os
import shutil

ROOT = '/home/h/genshin-ts'
GC = os.path.join(ROOT, '.scratch/gui-corpus')
BK = os.path.join(GC, 'truth-v8-game/_pre_fix_backup')

FILES = ['truth-v2/c12_195108.json', 'truth-v2/c25_195214.json', 'truth-v2/c18_195129.json',
         'truth-v3/c22_195158.json', 'truth-v2/c24_195206.json', 'truth-v2/c32_195258.json',
         'truth-v3/c28_195235.json', 'truth-v3/c03_194915.json', 'truth-v3/c36_195316.json']

CORNERS = [(0, 0, 128, 96), (0, 1292, 300, 34), (2250, 1395, 260, 45)]


def xyxy(o):
    x, y, w, h = o['bbox']
    return (x, y, x + w, y + h)


def iou(a, b):
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    ua = (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - inter
    return inter / ua if ua else 0.0


def cover(box, members):
    """box 被已有成员覆盖的比例（用并集近似：取与任一成员的最大重叠占比）"""
    bx0, by0, bx1, by1 = box
    area = (bx1 - bx0) * (by1 - by0)
    best = 0.0
    for m in members:
        mx0, my0, mx1, my1 = xyxy(m)
        ix0, iy0 = max(bx0, mx0), max(by0, my0)
        ix1, iy1 = min(bx1, mx1), min(by1, my1)
        if ix1 > ix0 and iy1 > iy0:
            best = max(best, (ix1 - ix0) * (iy1 - iy0) / area)
    return best


def union(objs, pad_x=10, pad_y=10):
    bs = [xyxy(o) for o in objs]
    x0 = min(b[0] for b in bs) - pad_x
    y0 = min(b[1] for b in bs) - pad_y
    x1 = max(b[2] for b in bs) + pad_x
    y1 = max(b[3] for b in bs) + pad_y
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(2560, x1), min(1440, y1)
    return [x0, y0, x1 - x0, y1 - y0]


def stacks(objs, kinds=('row', 'tile', 'card', 'chip')):
    """按 x 沿相同 + 竖直相邻，切出竖直栈"""
    cand = [o for o in objs if o['kind'] in kinds]
    cand.sort(key=lambda o: (o['bbox'][1], o['bbox'][0]))
    out = []
    used = set()
    for i, a in enumerate(cand):
        if i in used:
            continue
        grp = [a]
        ax0, aw = a['bbox'][0], a['bbox'][2]
        for j in range(i + 1, len(cand)):
            if j in used:
                continue
            b = cand[j]
            if abs(b['bbox'][0] - ax0) <= 14 and abs(b['bbox'][2] - aw) <= 40:
                last = grp[-1]['bbox']
                gap = b['bbox'][1] - (last[1] + last[3])
                if -10 <= gap <= 260:
                    grp.append(b)
                    used.add(j)
        used.add(i)
        if len(grp) >= 3:
            out.append(grp)
    return out


def merge_clusters(groups):
    """把 y 区间重叠 ≥70% 且 x 相邻（gap ≤60）的栈合成一个网格簇（4×5 格子这类）"""
    cl = [list(g) for g in groups]
    changed = True
    while changed:
        changed = False
        for i in range(len(cl)):
            for j in range(i + 1, len(cl)):
                a = union(cl[i], 0, 0)
                b = union(cl[j], 0, 0)
                ay0, ay1 = a[1], a[1] + a[3]
                by0, by1 = b[1], b[1] + b[3]
                ov = min(ay1, by1) - max(ay0, by0)
                if ov < 0.7 * min(a[3], b[3]):
                    continue
                ax1 = a[0] + a[2]
                if a[0] - (b[0] + b[2]) <= 60 and b[0] - ax1 <= 60:
                    cl[i] = cl[i] + cl[j]
                    del cl[j]
                    changed = True
                    break
            if changed:
                break
    return cl


# ---------------------------------------------------------------- 几何复核（按画面实测重定）
def geo_fix(stem, objs):
    """逐帧几何复核：只动实测证伪的框（皮肤沿/行高），并补 R6 整栏。"""
    log = []
    if stem == 'c12_195108':
        for o in objs:
            if o['kind'] == 'tile':
                c = round((o['bbox'][0] - 165) / 208.0)
                r = round((o['bbox'][1] - 470) / 189.0)
                nb = [165 + 208 * c, 470 + 189 * r, 192, 173]
                if o['bbox'] != nb:
                    log.append('tile %s %s→%s' % (o['id'], o['bbox'], nb))
                    o['bbox'] = nb
        objs.append(new_obj(900, [8, 23, 118, 1385], 'panel',
                            'R6 补：左图标栏整条（x 0..127 暗底实测；与 r003 同皮肤 h1 [8,23,118,1385]）'))
    if stem == 'c25_195214':
        ymap = {542: 541, 738: 730, 1038: 1030, 1227: 1219}
        for o in objs:
            if o['kind'] == 'tile':
                c = round((o['bbox'][0] - 165) / 208.0)
                y = ymap.get(o['bbox'][1], o['bbox'][1])
                nb = [165 + 208 * c, y, 192, 173]
                if o['bbox'] != nb:
                    log.append('tile %s %s→%s' % (o['id'], o['bbox'], nb))
                    o['bbox'] = nb
            elif o['kind'] == 'chip' and o['bbox'][1] < 500:
                c = round((o['bbox'][0] - 165) / 208.0)
                nb = [165 + 208 * c, 444, 192, 81]
                if o['bbox'] != nb:
                    log.append('chip %s %s→%s' % (o['id'], o['bbox'], nb))
                    o['bbox'] = nb
        objs.append(new_obj(900, [8, 23, 118, 1385], 'panel',
                            'R6 补：左图标栏整条（与 c12/r003 同皮肤）'))
    if stem == 'c03_194915':
        bands = [155, 321, 486, 654, 820, 986, 1152]
        rows = sorted([o for o in objs if o['kind'] == 'row'], key=lambda o: o['bbox'][1])
        if len(rows) == 7:
            for o, y in zip(rows, bands):
                log.append('row %s y=%d h=%d→y=%d h=152' % (o['id'], o['bbox'][1], o['bbox'][3], y))
                o['bbox'] = [148, y, 2262, 152]
    return log


def new_obj(nid, bbox, kind, note, parent=None):
    return {'id': str(nid), 'parent': parent, 'bbox': [int(v) for v in bbox], 'kind': kind,
            'text': [], 'clickable': 'no',
            'state': {'selected': False, 'focused': False, 'disabled': False},
            'badges': [], 'clipped': {'edges': [], 'cut_by': None, 'px': 0},
            'note': note, 'qc_added': '2026-10-19-v8game'}


def fix(path):
    full = os.path.join(GC, path)
    d = json.load(open(full, encoding='utf-8'))
    objs = d['objects']
    orig_n = len(objs)
    log = {'regions': [], 'corners': [], 'dedup': [], 'rows_snapped': [],
           'geo': geo_fix(os.path.basename(path)[:-5], objs)}

    # 1) 行沿吸附（R8）
    for grp in stacks(objs):
        xs = sorted(o['bbox'][0] for o in grp)
        med = xs[len(xs) // 2]
        for o in grp:
            if abs(o['bbox'][0] - med) > 25:
                log['rows_snapped'].append('%s x %d→%d' % (o['id'], o['bbox'][0], med))
                o['bbox'][0] = med

    nid = max([int(o['id']) for o in objs if str(o['id']).isdigit()] + [0]) + 1

    # 2) 区域级对象（成员并集派生；先把同高相邻栈合成网格簇）
    for grp in merge_clusters(stacks(objs)):
        u = union(grp)
        area_frac = u[2] * u[3] / (2560.0 * 1440.0)
        if area_frac < 0.04:
            continue
        if cover(u, objs) >= 0.90:
            continue
        vert = '竖列' if u[3] > u[2] else '横行'
        no = new_obj(nid, u, 'panel', 'QC 补区域：%s %d 项成员并集 ±10px（%d 项，占比 %.1f%%）'
                      % (vert, len(grp), len(grp), area_frac * 100))
        objs.append(no)
        log['regions'].append('id=%s %s %s' % (no['id'], u, no['note']))
        nid += 1

    # 2b) 顶栏整条（有 ≥2 个顶栏成员且没有整宽顶栏框时）
    top = [o for o in objs if o['bbox'][1] <= 60 and o['bbox'][1] + o['bbox'][3] <= 130 and o is not None]
    if len(top) >= 2:
        y1 = max(o['bbox'][1] + o['bbox'][3] for o in top) + 6
        box = [0, 0, 2560, min(140, y1)]
        if cover(box, objs) < 0.50:
            no = new_obj(nid, box, 'panel', 'QC 补区域：顶栏整条（y 0..%d，容纳 %d 个顶栏控件）' % (box[3], len(top)))
            objs.append(no)
            log['regions'].append('id=%s %s' % (no['id'], box))
            nid += 1

    # 3) 四角
    for cx, cy, cw, ch in CORNERS:
        box = [cx, cy, cw, ch]
        if cover(box, objs) >= 0.50:
            continue
        no = new_obj(nid, box, 'unknown', 'QC 补四角（R4/R10）：录制 HUD/角件，非游戏 UI')
        objs.append(no)
        log['corners'].append('id=%s %s' % (no['id'], box))
        nid += 1

    # 4) 去重（IoU ≥ 0.98 保留大者）
    keep = []
    for o in sorted(objs, key=lambda o: -(o['bbox'][2] * o['bbox'][3])):
        dup = None
        for k in keep:
            if iou(xyxy(o), xyxy(k)) >= 0.98:
                dup = k
                break
        if dup is None:
            keep.append(o)
        else:
            log['dedup'].append('删 id=%s %s（与 id=%s 重复）' % (o['id'], o['bbox'], dup['id']))
    keep.sort(key=lambda o: (o['bbox'][1], o['bbox'][0]))

    d['objects'] = keep
    d['units'] = len(keep)
    prov = d.setdefault('_provenance', {})
    qc = prov.setdefault('qc_2026_10_19', {})
    qc.update({'by': 'fix9.py（成员并集派生区域 + 四角 + 行沿吸附 + IoU≥0.98 去重）',
               'units_before': orig_n, 'units_after': len(keep),
               'geo_fixed': log['geo'], 'regions_added': log['regions'], 'corners_added': log['corners'],
               'dedup_removed': log['dedup'], 'rows_snapped': log['rows_snapped']})

    os.makedirs(os.path.join(BK, os.path.dirname(path)), exist_ok=True)
    shutil.copy2(full, os.path.join(BK, path))
    with open(full, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
        f.write('\n')
    A = max(o['bbox'][2] * o['bbox'][3] for o in keep)
    print('%-26s units %2d→%2d  几何核=%2d 区域+%d 四角+%d 去重-%d 吸附=%d  最大块=%5.1f%%'
          % (os.path.basename(path), orig_n, len(keep), len(log['geo']), len(log['regions']),
             len(log['corners']), len(log['dedup']), len(log['rows_snapped']), 100 * A / 3686400))
    return log


if __name__ == '__main__':
    for p in FILES:
        fix(p)
