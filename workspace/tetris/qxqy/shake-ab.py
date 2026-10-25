#!/usr/bin/env python3
"""抖屏对照图：把 shot.mjs 出的两张**真实渲染帧**（preview-shake-base / preview-shake）
棋盘左边缘一带裁出来，4× 最近邻放大后左右拼成 docs/preview-shake-ab.png。

为什么要有这张：整帧 1280×720 上 7~9px 的位移肉眼不好比，放大 4× 后位移变成 28~36px 一眼可辨。
左=抖动前（基准），右=抖动中（同一台相机、同一布局）。**两张都是模拟器真实出图，不是手绘**。

用法：node qxqy/shot.mjs && python3 qxqy/shake-ab.py
"""
from PIL import Image, ImageDraw
from pathlib import Path

root = Path(__file__).resolve().parent.parent
docs = root / "docs"
base = Image.open(docs / "preview-shake-base.png").convert("RGB")
shake = Image.open(docs / "preview-shake.png").convert("RGB")

# 棋盘左上角那一块：外框是 2px 纯色线，位移在边界上最清楚（x/y 两个方向同时可见）
BOX = (470, 40, 610, 180)
ZOOM = 4
crops = [(name, img.crop(BOX).resize(((BOX[2] - BOX[0]) * ZOOM, (BOX[3] - BOX[1]) * ZOOM), Image.NEAREST))
         for name, img in (("BASE  offset 0px", base), ("SHAKE frame 1  (+5.8,-4.7)px", shake))]
pad, label_h = 12, 26
width = sum(c.width for _, c in crops) + pad * 3
height = max(c.height for _, c in crops) + pad * 2 + label_h
out = Image.new("RGB", (width, height), (10, 12, 18))
draw = ImageDraw.Draw(out)
x = pad
for label, crop in crops:
    draw.text((x, pad), label, fill=(200, 220, 240))
    out.paste(crop, (x, pad + label_h))
    x += crop.width + pad
target = docs / "preview-shake-ab.png"
out.save(target)
print(f"preview-shake-ab.png  {out.width}x{out.height}  {target.stat().st_size}B  "
      f"（左=抖屏前基准，右=抖屏帧；{ZOOM}× 最近邻放大）")
