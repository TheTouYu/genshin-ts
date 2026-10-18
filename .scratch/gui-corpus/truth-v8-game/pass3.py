#!/usr/bin/env python3
"""pass3.py — 按 audit --ignore-title 的未覆盖清单补框（c22 / c28 / c32）。
只补「OCR 实测有文字、真值完全没覆盖」的控件；坐标取 OCR 框 ± 皮肤 padding，
跨帧同源控件（c22 与 c24 同 UI）取 c24 已核过的值。
"""
import json
import os

GC = '/home/h/genshin-ts/.scratch/gui-corpus'
O = lambda nid, bb, kind, text, note: {
    'id': str(nid), 'parent': None, 'bbox': [int(v) for v in bb], 'kind': kind,
    'text': [text] if text else [], 'clickable': 'yes',
    'state': {'selected': False, 'focused': False, 'disabled': False},
    'badges': [], 'clipped': {'edges': [], 'cut_by': None, 'px': 0},
    'note': note, 'qc_added': '2026-10-19-v8game'}

ADD = {
    'truth-v3/c22_195158.json': [
        ([615, 255, 200, 80], 'row', '操作', '内容区列头「操作」（OCR 629..723 × 268..322；R8 列头单独成框）'),
        ([646, 1236, 1756, 75], 'row', '切换瞄准模式', '第 11 个按键行：切换瞄准模式 / R（OCR 672..877 × 1249..1293 + 2138..2200）'),
        ([1380, 1310, 480, 90], 'button', '快捷轮盘设置', '底部按钮（OCR 1540..1779 × 1333..1380；与 c24 同 UI 同值）'),
        ([1930, 1310, 420, 90], 'button', '恢复默认', '底部按钮（OCR 2103..2267 × 1333..1382）'),
    ],
    'truth-v3/c28_195235.json': [
        ([2008, 33, 282, 58], 'row', '邮件数 17/1000', '顶栏邮件数（OCR 2020..2280 × 45..79；R1 按右沿）'),
        ([148, 1314, 327, 80], 'button', '全部领取', '底部按钮（OCR 258..423 × 1330..1379；r006 同皮肤实测 148..475）'),
        ([515, 1307, 339, 92], 'button', '删除已读', '底部按钮（OCR 620..787 × 1330..1379；r006 同皮肤实测 515..854）'),
        ([2170, 1314, 300, 90], 'button', '删除', '右下删除按钮（OCR 2247..2341 × 1329..1382）'),
    ],
    'truth-v2/c32_195258.json': [
        ([1195, 138, 170, 50], 'row', '339/1000', '列表头邮件数（OCR 1211..1347 × 146..177）'),
    ],
}


def run(rel):
    p = os.path.join(GC, rel)
    d = json.load(open(p, encoding='utf-8'))
    objs = d['objects']
    n = max([int(o['id']) for o in objs if str(o['id']).isdigit()] + [0]) + 1
    added = []
    for bb, kind, text, note in ADD[rel]:
        objs.append(O(n, bb, kind, text, note))
        added.append('id=%s %s %s' % (n, bb, text))
        n += 1
    objs.sort(key=lambda o: (o['bbox'][1], o['bbox'][0]))
    d['objects'] = objs
    d['units'] = len(objs)
    qc = d.setdefault('_provenance', {}).setdefault('qc_2026_10_19', {})
    qc.setdefault('pass3_added', []).extend(added)
    json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(p, 'a', encoding='utf-8').write('\n')
    print('%-26s +%d 框 → units=%d' % (os.path.basename(rel), len(added), len(objs)))


if __name__ == '__main__':
    for r in ADD:
        run(r)
