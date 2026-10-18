#!/usr/bin/env python3
"""p1_signals — 量化「容器边界」与「容器内部」的像素可分辨性。

问题：在「半透明面板 + 无硬边框 + 背景是 3D 世界」前提下，容器边界能不能被阈值法抓住？
方法：对每个**人工指认的容器**，沿其四条边取法向剖面，量
  step  = 边外 6px 环中位数 与 边内 6px 环中位数 的 |Δ|（L、a、b 三通道分别算）
  noise = 容器内部同尺寸环的中位数扰动的 σ（作为对照噪声）
  snr   = step / noise
只读语料，纯 numpy/PIL。
"""
import json
import sys
import numpy as np
from PIL import Image

CORPUS = "/home/h/genshin-ts/.scratch/gui-corpus"
FR = ["f%02d" % i for i in range(8)]

# 人工指认的容器（全分辨率 2560x1440 坐标），kind 是我对人眼所见的判断
BOXES = {
    "f00": [
        ("left_panel_dark", [264, 258, 657, 1216], "半透明深色列表面板"),
        ("avatar1", [1724, 406, 1820, 510], "角色头像(纯图形)"),
        ("reward_tile", [1600, 870, 1720, 990], "奖励图标底块"),
        ("btn_start_trial", [1926, 1010, 2276, 1140], "主按钮(开始试用)"),
        ("content_area", [15, 270, 2545, 1200], "整页内容区(大圆角)"),
    ],
    "f04": [
        ("left_panel_dark", [264, 258, 657, 1216], "半透明深色列表面板"),
        ("card_shop", [1277, 552, 2260, 682], "白色卡片(千星商城)"),
        ("card_join", [1280, 690, 1690, 830], "白色卡片(参与绮星盛会)"),
        ("card_banner", [1280, 900, 2260, 1075], "深色横幅(奇域佳选)"),
        ("gift_card", [745, 945, 1110, 1105], "左下赠礼卡"),
    ],
    "f05": [
        ("btn_qianwang1", [1541, 1049, 1859, 1127], "白色药丸按钮"),
        ("task_card", [1520, 900, 2270, 1030], "任务卡(白)"),
        ("left_panel_dark", [264, 258, 657, 1216], "半透明深色列表面板"),
    ],
    "f06": [
        ("tile_shangcheng", [150, 450, 1025, 530], "深色网格格子(商城)"),
        ("beige_panel", [0, 430, 1035, 1440], "浅米色面板底"),
    ],
    "f07": [
        ("tile_adventurer", [152, 452, 252, 532], "深色网格格子(冒险之证)"),
        ("beige_band", [0, 940, 1035, 1030], "分区标题带(千星奇域)"),
        ("beige_panel_gap", [0, 900, 100, 1000], "左侧图标列底(米色)"),
    ],
}


def load(fr):
    return np.asarray(Image.open("%s/%s.png" % (CORPUS, fr)).convert("RGB"), dtype=np.float32)


def to_lab(rgb):
    """sRGB(0..255) -> CIE Lab (D65)。只用于局部对比，用简化式。"""
    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805],
                  [0.2126, 0.7152, 0.0722],
                  [0.0193, 0.1192, 0.9505]], dtype=np.float32)
    xyz = c @ M.T
    xyz /= np.array([0.95047, 1.0, 1.08883], dtype=np.float32)
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], -1).astype(np.float32)


def ring(lab, x0, y0, x1, y1, d):
    """取矩形 bbox 向外/向内 d 像素的环带采样（只在图像内）。"""
    H, W = lab.shape[:2]
    x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
    out, inn = [], []
    # 上边
    ys = np.clip(np.arange(y0 - d, y0), 0, H - 1)
    xs = np.clip(np.arange(x0 + d, x1 - d), 0, W - 1)
    if len(xs):
        out.append(lab[np.ix_(ys, xs)]); inn.append(lab[np.ix_(np.clip(np.arange(y0, y0 + d), 0, H - 1), xs)])
    ys = np.clip(np.arange(y1, y1 + d), 0, H - 1)
    if len(xs):
        out.append(lab[np.ix_(ys, xs)]); inn.append(lab[np.ix_(np.clip(np.arange(y1 - d, y1), 0, H - 1), xs)])
    ys = np.clip(np.arange(y0 + d, y1 - d), 0, H - 1)
    xs = np.clip(np.arange(x0 - d, x0), 0, W - 1)
    if len(ys):
        out.append(lab[np.ix_(ys, xs)]); inn.append(lab[np.ix_(ys, np.clip(np.arange(x0, x0 + d), 0, W - 1))])
    xs = np.clip(np.arange(x1, x1 + d), 0, W - 1)
    if len(ys):
        out.append(lab[np.ix_(ys, xs)]); inn.append(lab[np.ix_(ys, np.clip(np.arange(x1 - d, x1), 0, W - 1))])
    cat = lambda L: np.concatenate([x.reshape(-1, 3) for x in L], 0)
    return cat(out), cat(inn)


def stats(fr, name, bbox, kind, d=6):
    rgb = load(fr)
    lab = to_lab(rgb)
    x0, y0, x1, y1 = bbox
    o, i = ring(lab, x0, y0, x1, y1, d)
    step = np.abs(np.median(o, 0) - np.median(i, 0))
    # 噪声：容器内部两条"假边"（取内部 30% 与 60% 线）的差值
    noise = []
    for frac in (0.3, 0.6):
        yy = int(y0 + (y1 - y0) * frac)
        band = lab[max(0, yy - d):yy, x0 + 10:x1 - 10]
        band2 = lab[max(0, yy):yy + d, x0 + 10:x1 - 10]
        if band.size and band2.size:
            noise.append(np.abs(np.median(band, (0, 1)) - np.median(band2, (0, 1))))
    noise = np.median(np.array(noise), 0) if noise else np.zeros(3)
    dE_step = float(np.linalg.norm(step))
    dE_noise = float(max(np.linalg.norm(noise), 0.35))
    return dict(fr=fr, name=name, kind=kind, box=[int(v) for v in bbox],
                dL=round(float(step[0]), 1), da=round(float(step[1]), 1), db=round(float(step[2]), 1),
                dE_step=round(dE_step, 1), dE_noise=round(dE_noise, 1),
                snr=round(dE_step / dE_noise, 1))


def main():
    rows = []
    for fr, boxes in BOXES.items():
        for name, bbox, kind in boxes:
            rows.append(stats(fr, name, bbox, kind))
    print("%-5s %-18s %-8s %6s %6s %6s %8s" % ("fr", "container", "snr", "dL", "dE", "noise", "box"))
    for r in sorted(rows, key=lambda r: -r["snr"]):
        print("%-5s %-18s %6.1f %6.1f %6.1f %6.1f  %s  # %s" %
              (r["fr"], r["name"], r["snr"], r["dL"], r["dE_step"], r["dE_noise"], r["box"], r["kind"]))
    json.dump(rows, open("/tmp/ysb/p1.json", "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
