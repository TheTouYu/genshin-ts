#!/usr/bin/env python3
"""OmniParser icon_detect 零样本验证（只读）。

用法：
  .scratch/gui-detect/venv-detect/bin/python .scratch/gui-detect/zero_shot.py \
      --weights .scratch/gui-detect/weights/icon_detect.pt \
      --frames .scratch/gui-corpus/f06.png .scratch/gui-corpus/capture-2026-10-18/reps/c18_195129.png \
      --truth-dir .scratch/gui-corpus/truth --out .scratch/gui-detect/zeroshot

产出：
  <out>/<stem>.json   每帧的框（原帧坐标 xyxy）+ 置信度
  <out>/<stem>-ol.png 叠加图（编号+框）
  <out>/summary.json  逐帧：det 数 / truth 数 / IoU>=0.5 命中数 / 命中率
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def load_truth(path):
    if not os.path.exists(path):
        return None
    d = json.load(open(path, encoding="utf-8"))
    return d.get("objects") or d.get("units_list")


def truth_boxes(d):
    if not d:
        return []
    out = []
    if isinstance(d, list):
        for u in d:
            b = u.get("bbox") or u.get("box")
            if b:
                out.append(b)
    return out


def iou(a, b):
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    iw, ih = max(0, ix1 - ix0), max(0, iy1 - iy0)
    inter = iw * ih
    ua = (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - inter
    return inter / ua if ua > 0 else 0.0


def xywh_to_xyxy(b):
    x, y, w, h = b
    return [x, y, x + w, y + h]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", required=True)
    ap.add_argument("--frames", nargs="+", required=True)
    ap.add_argument("--truth-dir", default=".scratch/gui-corpus/truth")
    ap.add_argument("--out", default=".scratch/gui-detect/zeroshot")
    ap.add_argument("--conf", type=float, default=0.25)
    ap.add_argument("--imgsz", type=int, default=640)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    from ultralytics import YOLO

    model = YOLO(args.weights)
    summary = []
    for fp in args.frames:
        im = Image.open(fp).convert("RGB")
        W, H = im.size
        t0 = __import__("time").perf_counter()
        res = model.predict(np.asarray(im), imgsz=args.imgsz, conf=args.conf, verbose=False)
        ms = (__import__("time").perf_counter() - t0) * 1000
        boxes = res[0].boxes
        xyxy = boxes.xyxy.cpu().numpy().tolist() if boxes is not None and len(boxes) else []
        conf = boxes.conf.cpu().numpy().tolist() if boxes is not None and len(boxes) else []

        stem = os.path.splitext(os.path.basename(fp))[0]
        draw = ImageDraw.Draw(im)
        for i, (b, c) in enumerate(zip(xyxy, conf)):
            draw.rectangle(b, outline=(255, 0, 0), width=3)
            draw.text((b[0] + 3, b[1] + 3), f"{i}:{c:.2f}", fill=(255, 255, 0))

        tpath = os.path.join(args.truth_dir, stem + ".json")
        td = load_truth(tpath)
        tb = truth_boxes(td)
        hit, matched = 0, set()
        if tb:
            for t in tb:
                txy = xywh_to_xyxy(t) if len(t) == 4 else t
                best = max((iou(txy, d) for d in xyxy), default=0.0)
                if best >= 0.5:
                    hit += 1
        im.save(os.path.join(args.out, stem + "-ol.png"))
        json.dump({"frame": fp, "w": W, "h": H, "ms": round(ms, 1),
                   "n_det": len(xyxy), "boxes": xyxy, "conf": conf},
                  open(os.path.join(args.out, stem + ".json"), "w"), ensure_ascii=False, indent=1)
        rec = {"frame": stem, "det": len(xyxy), "truth": len(tb), "hit": hit,
               "rate": round(hit / len(tb), 3) if tb else None, "ms": round(ms, 1)}
        summary.append(rec)
        print(f"  {stem:<18} det={len(xyxy):<3} truth={len(tb):<3} hit={hit:<3} rate={rec['rate']}  {ms:.0f}ms")

    json.dump(summary, open(os.path.join(args.out, "summary.json"), "w"), ensure_ascii=False, indent=1)
    print("->", os.path.join(args.out, "summary.json"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
