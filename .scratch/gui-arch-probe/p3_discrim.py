#!/usr/bin/env python3
"""p3_discrim — UI 容器 vs 世界平坦区：候选判别特征的实测分离度。

对 p2 检出的每个候选，算 4 个特征：
  A. 边界清晰度 crisp = bbox 四边环带上 |∇| 的 p75 / 内部 |∇| 的 p95（UI 是硬边，世界是软边）
  B. 边界闭合度 closure = bbox 周长上 |∇|>τ 的像素占比（UI 矩形四边都有边）
  C. 调色板一致性 pal = 与同帧其它候选的最小 ΔE（UI 用皮肤色，世界每块都不同）
  D. 内含文本 text_in = bbox 内是否有 OCR 框（UI 元素常带标签）
"""
import json
import numpy as np
import cv2
from PIL import Image
import sys
sys.path.insert(0, "/home/h/genshin-ts/.scratch/gui-arch-probe")
from p2_containers import to_lab, edge_energy, detect

CORPUS = "/home/h/genshin-ts/.scratch/gui-corpus"


def feats(rgb, boxes, ocr, scale=0.5):
    lab = to_lab(cv2.resize(rgb, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA))
    E = edge_energy(lab)
    H, W = E.shape
    meds = np.array([b["lab_med"] for b in boxes], dtype=np.float32)
    for i, b in enumerate(boxes):
        x0, y0, x1, y1 = [int(v * scale) for v in b["bbox"]]
        x0, y0 = max(1, x0), max(1, y0)
        x1, y1 = min(W - 2, x1), min(H - 2, y1)
        if x1 - x0 < 4 or y1 - y0 < 4:
            continue
        w = 3
        ring = np.concatenate([
            E[y0:y0 + w, x0:x1].ravel(), E[y1 - w:y1, x0:x1].ravel(),
            E[y0:y1, x0:x0 + w].ravel(), E[y0:y1, x1 - w:x1].ravel()])
        inner = E[y0 + 6:y1 - 6, x0 + 6:x1 - 6]
        ip95 = float(np.percentile(inner, 95)) if inner.size else 1.0
        b["crisp"] = round(float(np.percentile(ring, 75)) / max(ip95, 1.0), 2)
        b["closure"] = round(float((ring > 40).mean()), 2)
        d = np.linalg.norm(meds - meds[i], axis=1)
        d[i] = 1e9
        b["pal"] = round(float(d.min()), 1)
        # 内含文本（OCR 框中心落在容器内）
        cnt = 0
        for t in ocr:
            cx, cy = (t["bbox"][0] + t["bbox"][2]) / 2, (t["bbox"][1] + t["bbox"][3]) / 2
            if b["bbox"][0] <= cx <= b["bbox"][2] and b["bbox"][1] <= cy <= b["bbox"][3]:
                cnt += 1
        b["text_in"] = cnt
    return boxes


if __name__ == "__main__":
    for fr in sys.argv[1:] or ["f06", "f07"]:
        rgb = np.asarray(Image.open("%s/%s.png" % (CORPUS, fr)).convert("RGB"))
        ocr = json.load(open("/tmp/ysb/%s.json" % fr))["text"]
        boxes, _, _ = detect(rgb)
        feats(rgb, boxes, ocr)
        print("== %s  n=%d" % (fr, len(boxes)))
        for b in boxes:
            print("  %-28s crisp=%5.2f closure=%4.2f pal=%5.1f text_in=%d lab=%s" %
                  (b["bbox"], b["crisp"], b["closure"], b["pal"], b["text_in"], b["lab_med"]))
