#!/usr/bin/env python3
"""定位已标定控件模板在 11 张回归帧中的位置（exp A/B 的控件真实性背书链）。
每对 (frame, template) 跑一次全帧 NCC（tools/ys-editor/ys_look.py::_ncc_np，只读复用），
记录 top-1 位置/分数。分数 >= 该模板 controls.json 阈值 => 判定"该控件在此帧此位置"。
输出: research/template_locations.json
"""
import sys, os, json, time
sys.path.insert(0, '/home/h/genshin-ts/tools/ys-editor')
import numpy as np
from PIL import Image
import ys_look  # 只读复用，绝不修改

REG = '/home/h/genshin-ts/tools/ys-editor/calib/regress'
TPLDIR = '/home/h/genshin-ts/tools/ys-editor/templates'
OUT = '/home/h/genshin-ts/.scratch/gui-grounding/research/template_locations.json'

FRAMES = ['menu.png', 'savelist.png', 'editor-grass-shadow.png', 'playtest.png',
          'playtest2.png', 'pause.png', 'playtest3.png', 'settle.png',
          'settle2.png', 'settle3.png', 'settle4.png']
# controls.json 里的标定阈值
THRESH = {'playtest-tile': 0.9, 'direct-upload': 0.9, 'start-game': 0.9,
          'pause-abort': 0.9, 'pause-resume': 0.9, 'settle-leave': 0.9,
          'sidebar-save-mgr': 0.9, 'save-card-title': 0.9,
          'mymap-title': 0.9, 'mymap-menu-title': 0.9, 'playtest-mark': 0.9}
TEMPLATES = list(THRESH.keys())

def load_f32(p):
    return np.asarray(Image.open(p).convert('RGB'), dtype=np.float32) / 255.0

res = {}
t0 = time.perf_counter()
for fr in FRAMES:
    I = load_f32(os.path.join(REG, fr))
    for tp in TEMPLATES:
        T = load_f32(os.path.join(TPLDIR, tp + '.png'))
        h, w = T.shape[:2]
        t1 = time.perf_counter()
        x, y, s, backend = ys_look._ncc_np(I, T)
        dt = time.perf_counter() - t1
        cx, cy = x + w / 2, y + h / 2
        key = f'{tp}|{fr}'
        res[key] = dict(frame=fr, tpl=tp, w=w, h=h, x=int(x), y=int(y),
                        cx=round(cx, 1), cy=round(cy, 1), score=round(s, 4),
                        hit=bool(s >= THRESH[tp]), secs=round(dt, 3), backend=backend)
        print(f"{tp:20s} {fr:26s} top1=({cx:7.1f},{cy:7.1f}) score={s:.4f} "
              f"{'HIT' if s >= THRESH[tp] else '   '} {dt:.3f}s", flush=True)
print(f"total {time.perf_counter()-t0:.1f}s, pairs={len(res)}")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(res, open(OUT, 'w'), ensure_ascii=False, indent=1)
print("saved:", OUT)
