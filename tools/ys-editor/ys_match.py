#!/usr/bin/env python3
"""ys_match — 在**指定图片**上做模板匹配（离线可用，供回归集使用）。
ys_look.py find 只能抓实时屏幕；回归集需要对已知截图判定，故拆出这个纯函数入口。
用法: ys_match.py <img.png> <tpl.png> [x y w h]
输出: "<x> <y> <score>"；出错退 3。"""
import sys, os, subprocess
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ys_look import ncc  # noqa: E402

def load(p):
    p = os.path.abspath(p)
    if not os.path.exists(p):
        sys.stderr.write(f"[ys_match] 不存在: {p}\n"); sys.exit(3)
    d = subprocess.run(["identify", "-format", "%w %h", p], capture_output=True, text=True).stdout.split()
    if len(d) < 2:
        sys.stderr.write(f"[ys_match] 读不出尺寸: {p}\n"); sys.exit(3)
    w, h = int(d[0]), int(d[1])
    b = subprocess.run(["magick", p, "-depth", "8", "rgb:-"], capture_output=True).stdout
    return np.frombuffer(b, dtype=np.uint8).reshape(h, w, 3).astype(np.float32) / 255.0

img, tpl = sys.argv[1], sys.argv[2]
I, T = load(img), load(tpl)
if len(sys.argv) > 6:
    x, y, w, h = map(int, sys.argv[3:7])
    I = I[y:y + h, x:x + w]
    ox, oy = x, y
else:
    ox, oy = 0, 0
if I.shape[0] < T.shape[0] or I.shape[1] < T.shape[1]:
    print("0 0 0.0000"); sys.exit(0)
mx, my, s, _ = ncc(I, T)
print(f"{ox + mx + T.shape[1] // 2} {oy + my + T.shape[0] // 2} {s:.4f}")
