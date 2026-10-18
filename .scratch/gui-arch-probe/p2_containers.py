#!/usr/bin/env python3
"""p2_containers — 「平坦区 + 矩形」容器分割原型（纯 cv2/numpy，无新依赖）。

假设（待证）：界面容器（面板/卡片/格子/按钮）在 **Lab 边缘能量** 上表现为
  「内部平坦（E 低） + 边界是一圈台阶（E 高） + 外接矩形规整」。
世界背景的平坦区（天空/地面/水面）也平坦，但**矩形规整度低**——这是本原型的判别器。

输出：每个候选 {bbox, 面积, 矩形度, 内部色, 边缘台阶}, 以及耗时分解；叠加图存 /tmp/ysb/ov_<fr>.png
"""
import json
import sys
import time
import numpy as np
import cv2
from PIL import Image

CORPUS = "/home/h/genshin-ts/.scratch/gui-corpus"
OUT = "/tmp/ysb"


def to_lab(rgb8):
    return cv2.cvtColor(rgb8, cv2.COLOR_RGB2LAB).astype(np.float32)


def edge_energy(lab):
    """三通道 Sobel 的合能量（Lab 已按 cv2 编码：L 0..255, a/b 0..255 偏移 128）"""
    e = None
    for c in range(3):
        g = cv2.Sobel(lab[..., c], cv2.CV_32F, 1, 0, ksize=3)
        h = cv2.Sobel(lab[..., c], cv2.CV_32F, 0, 1, ksize=3)
        m = g * g + h * h
        e = m if e is None else e + m
    return np.sqrt(e)


def detect(rgb, scale=0.5, t_edge=6.0, close=5, min_w=40, min_h=26, min_rect=0.55):
    """返回候选容器列表（全分辨率坐标）。"""
    h0, w0 = rgb.shape[:2]
    small = cv2.resize(rgb, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    lab = to_lab(small)
    E = edge_energy(lab)
    # 三通道归一：cv2 的 L 0..255、a/b 也是 0..255，量纲一致，直接阈值
    flat = (E < t_edge).astype(np.uint8)
    if close:
        flat = cv2.morphologyEx(flat, cv2.MORPH_CLOSE,
                                np.ones((close, close), np.uint8))
    n, lab_img, stats, cent = cv2.connectedComponentsWithStats(flat, 8)
    out = []
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if w < min_w or h < min_h:
            continue
        rect = a / float(w * h)
        if rect < min_rect:
            continue
        sub = lab[y:y + h, x:x + w]
        m = lab_img[y:y + h, x:x + w] == i
        med = np.median(sub[m], 0)
        out.append(dict(bbox=[int(x / scale), int(y / scale),
                              int((x + w) / scale), int((y + h) / scale)],
                        area_small=int(a), rect=round(float(rect), 2),
                        lab_med=[round(float(v), 1) for v in med]))
    out.sort(key=lambda d: -d['area_small'])
    return out, E, small


def overlay(path, boxes, out_path, tag):
    im = Image.open(path).convert("RGB")
    from PIL import ImageDraw
    d = ImageDraw.Draw(im)
    for i, b in enumerate(boxes):
        bb = b['bbox'] if isinstance(b, dict) else b
        bb = tuple(int(v) for v in bb)
        d.rectangle(bb, outline=(255, 0, 255), width=3)
        d.text((bb[0] + 4, bb[1] + 2), "%d" % i, fill=(0, 255, 0))
    d.text((10, 10), tag, fill=(255, 255, 0))
    im.save(out_path)


if __name__ == "__main__":
    frames = sys.argv[1:] or ["f06", "f07", "f04", "f00"]
    for fr in frames:
        p = "%s/%s.png" % (CORPUS, fr)
        t0 = time.time()
        rgb = np.asarray(Image.open(p).convert("RGB"))
        t1 = time.time()
        boxes, E, small = detect(rgb)
        t2 = time.time()
        overlay(p, boxes, "%s/ov_%s.png" % (OUT, fr), "%s n=%d" % (fr, len(boxes)))
        print("%s decode=%dms detect=%dms n=%d" %
              (fr, (t1 - t0) * 1000, (t2 - t1) * 1000, len(boxes)))
        for b in boxes[:40]:
            print("   ", b['bbox'], "rect=%.2f area=%d lab=%s" % (b['rect'], b['area_small'], b['lab_med']))
        json.dump(boxes, open("%s/boxes_%s.json" % (OUT, fr), "w"), ensure_ascii=False, indent=1)
