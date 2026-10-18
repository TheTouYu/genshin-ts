#!/usr/bin/env python3
"""质检官用：对每帧算客观读数（不写任何 truth 文件）。

读数：units / kind 分布 / bbox 越界与退化 / 近重复框 / 最大对象面积占比 /
      四条边缘带（R4/R10）与左侧竖栏（R6）是否有对象 / 顶栏右簇（R1）是否有对象 /
      audit 全量未覆盖文本（按"标题类 vs 列表类"粗分）。
"""
import json
import os
import re
import sys
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import audit_truth as A  # noqa: E402

# 口径上"不算单元"的标题/分区标题（truth/_rules.md §一），audit 不认得，这里单列
TITLE_HINT = re.compile(r'^(活动一览|设置[／/]|控制|图像|声音|语言|按键|其他设置|镜头|'
                        r'邮箱|邮件珍藏盒|好友[／/]|我的好友|地图|祈愿|教程|任务|'
                        r'邀约事件|千星奇域|资源管理器|冒险之证|背包)')

BATCHES = {
    'truth': 'label/_screen',
    'truth-v2': '_qc/ocr-renamed',
    'truth-v3': '_qc/ocr-renamed',
    'truth-v4': 'video-20261018/repjson',
    'truth-v5': 'inbox/repjson',
    'truth-v6': 'inbox/repjson',
    'truth-v7': 'inbox/repjson',
}


def iou(a, b):
    ix0, iy0 = max(a[0], b[0]), max(a[1], b[1])
    ix1, iy1 = min(a[2], b[2]), min(a[3], b[3])
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    return inter / max(1.0, (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter)


def metrics(tf, ocr_dir):
    td = json.load(open(tf, encoding='utf-8'))
    W, H = (td.get('size') or [2560, 1440])[:2]
    objs = td.get('objects') or []
    bx = []
    for o in objs:
        b = o.get('bbox') or [0, 0, 0, 0]
        bx.append([b[0], b[1], b[0] + b[2], b[1] + b[3]])
    kinds = {}
    for o in objs:
        kinds[o.get('kind', '?')] = kinds.get(o.get('kind', '?'), 0) + 1
    oob = [i for i, b in enumerate(bx) if b[2] > W + 2 or b[3] > H + 2 or b[0] < -2 or b[1] < -2]
    degen = [i for i, b in enumerate(bx) if (b[2] - b[0]) >= W * 0.9 and (b[3] - b[1]) >= H * 0.9]
    bad = [i for i, b in enumerate(bx) if b[2] - b[0] < 4 or b[3] - b[1] < 4]
    dup = []
    for i in range(len(bx)):
        for j in range(i + 1, len(bx)):
            if iou(bx[i], bx[j]) > 0.9:
                dup.append((i, j, round(iou(bx[i], bx[j]), 2)))
    area_max = max([(b[2] - b[0]) * (b[3] - b[1]) for b in bx] or [0]) / float(W * H)
    # 边缘带 / 左栏 / 顶栏右簇
    right = [i for i, b in enumerate(bx) if b[2] > 2200]
    bottom = [i for i, b in enumerate(bx) if b[3] > 1300]
    left = [i for i, b in enumerate(bx) if b[0] < 140]
    left_col = [i for i, b in enumerate(bx) if b[0] < 140 and (b[3] - b[1]) > 250]
    top = [i for i, b in enumerate(bx) if b[1] < 140]
    top_right = [i for i, b in enumerate(bx) if b[1] < 140 and b[2] > 2000]
    corner = {}
    for nm, (cx, cy) in {'TL': (0, 0), 'TR': (W, 0), 'BL': (0, H), 'BR': (W, H)}.items():
        hit = [i for i, b in enumerate(bx)
               if (b[2] > cx - 160) and (b[0] < cx + 160) and (b[3] > cy - 160) and (b[1] < cy + 160)]
        corner[nm] = len(hit)
    # audit 全量
    stem = os.path.splitext(os.path.basename(tf))[0]
    unc, unc_title, unc_real = [], 0, []
    ocr_f = os.path.join(ocr_dir, stem + '.json')
    if os.path.exists(ocr_f):
        od = json.load(open(ocr_f, encoding='utf-8'))
        HUD = re.compile(r'^(DXVK|FPS|GPU|min:|max:|UID|ms|fps|i9|\d+(\.\d+)?(\s*(ms|fps|%))?$|'
                         r'[|<>=×✓·:%0-9. \-–—]{1,6}$)')
        for t in od.get('text') or []:
            txt = (t.get('text') or '').strip()
            if not txt or HUD.match(txt):
                continue
            tb = A.box_of(t)
            if not tb or tb[2] > W + 2 or tb[3] > H + 2 or tb[0] < -2 or tb[1] < -2:
                continue
            cov = A.union_cover(tb, bx)
            if cov < 0.6:
                item = {'text': txt[:30], 'bbox': [round(v) for v in tb], 'cover': round(cov, 2)}
                unc.append(item)
                if TITLE_HINT.match(txt):
                    unc_title += 1
                else:
                    unc_real.append(item)
    return {
        'frame': stem, 'units': len(objs), 'kinds': kinds, 'size': [W, H],
        'oob': oob, 'degenerate': degen, 'tiny': bad, 'dups': dup,
        'area_max_frac': round(area_max, 3),
        'right': len(right), 'bottom': len(bottom), 'left': len(left),
        'left_col': len(left_col), 'top': len(top), 'top_right': len(top_right),
        'corners': corner,
        'unc_total': len(unc), 'unc_title': unc_title, 'unc_real': unc_real,
        'unc_all': unc,
    }


def main():
    out = {}
    for d, ocr in BATCHES.items():
        for tf in sorted(glob.glob(os.path.join(d, '*.json'))):
            stem = os.path.splitext(os.path.basename(tf))[0]
            if stem.startswith('_'):
                continue
            out[f'{d}/{stem}'] = metrics(tf, ocr)
    json.dump(out, open(os.path.join(HERE, 'metrics.json'), 'w'), ensure_ascii=False, indent=1)
    print(f"{'frame':46} {'u':>4} {'areaMax':>7} {'R':>3} {'B':>3} {'L':>3} {'Lcol':>4} {'TR':>3} "
          f"{'corner':>6} {'unc':>4} {'ttl':>4} {'real':>4}")
    for k, m in out.items():
        c = m['corners']
        print(f"{k:46} {m['units']:>4} {m['area_max_frac']:>7.3f} {m['right']:>3} {m['bottom']:>3} "
              f"{m['left']:>3} {m['left_col']:>4} {m['top_right']:>3} "
              f"{sum(c.values()):>6} {m['unc_total']:>4} {m['unc_title']:>4} {len(m['unc_real']):>4}"
              + (f"  DUP{m['dups']}" if m['dups'] else '')
              + (f" OOB{m['oob']}" if m['oob'] else '')
              + (f" DEG{m['degenerate']}" if m['degenerate'] else ''))


if __name__ == '__main__':
    main()
