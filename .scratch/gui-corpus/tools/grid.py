#!/usr/bin/env python3
"""grid.py — 给帧/裁剪块叠加**带坐标标签**的网格，用于人眼（多模态模型）量 bbox。

用法：
  python3 .scratch/gui-corpus/tools/grid.py <src.png> <out.png> [--crop x0,y0,x1,y1]
            [--step 50] [--scale 1.0]

坐标标签永远是**原帧坐标系**（裁剪不改变读数），所以看图上数字直接写进 truth JSON。
只依赖 PIL。产物落 workspace（默认同目录 _grid/）。
"""
import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFont


def load_font(size=14):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return ImageFont.load_default()


def parse_crop(s):
    v = [int(x) for x in s.replace(' ', '').split(',')]
    if len(v) != 4:
        raise SystemExit('--crop 需要 x0,y0,x1,y1')
    return v


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--crop', default=None)
    ap.add_argument('--step', type=int, default=50)
    ap.add_argument('--scale', type=float, default=1.0)
    a = ap.parse_args(argv)

    im = Image.open(a.src).convert('RGB')
    W, H = im.size
    ox, oy = 0, 0
    if a.crop:
        x0, y0, x1, y1 = parse_crop(a.crop)
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(W, x1), min(H, y1)
        im = im.crop((x0, y0, x1, y1))
        ox, oy = x0, y0
    if a.scale != 1.0:
        im = im.resize((int(im.width * a.scale), int(im.height * a.scale)), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    f = load_font(13)
    step = a.step
    # 竖线：原帧 x 坐标
    x = ((ox + step - 1) // step) * step
    while x < ox + im.width / max(a.scale, 1e-9) and x < W:
        px = int((x - ox) * a.scale)
        d.line([(px, 0), (px, im.height)], fill=(255, 0, 255), width=1)
        d.text((px + 2, 2), str(x), fill=(255, 255, 0), font=f,
               stroke_width=2, stroke_fill=(0, 0, 0))
        x += step
    y = ((oy + step - 1) // step) * step
    while y < oy + im.height / max(a.scale, 1e-9) and y < H:
        py = int((y - oy) * a.scale)
        d.line([(0, py), (im.width, py)], fill=(0, 255, 255), width=1)
        d.text((2, py + 1), str(y), fill=(255, 255, 0), font=f,
               stroke_width=2, stroke_fill=(0, 0, 0))
        y += step
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    im.save(a.out)
    print('%s %dx%d crop=(%d,%d) step=%d scale=%.2f' %
          (a.out, im.width, im.height, ox, oy, step, a.scale))
    return 0


if __name__ == '__main__':
    sys.exit(main())
