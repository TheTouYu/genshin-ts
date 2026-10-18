#!/usr/bin/env python3
"""predict.py — 用训练好的检测器跑推理，输出「真值同构」的 JSON，供审阅/修正后回流成训练数据。

用法：
  python3 .scratch/gui-detect/predict.py --model .scratch/gui-detect/train-v4/latest.pt \
      --out-dir .scratch/gui-corpus/truth-v9-pred --thresh 0.30 img1.jpg img2.png ...

输出每帧一个 <stem>.json：{image, layout, size, objects:[{id,bbox,kind,score}], _provenance:{model,thresh}}
bbox 用 [x,y,w,h]（与 truth 一致）；image 写相对仓库根路径。
"""
import argparse
import json
import os
import sys

import numpy as np
import torch
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import train as T  # noqa: E402


def _iou(a, b):
    ax0, ay0, ax1, ay1 = a[0], a[1], a[0] + a[2], a[1] + a[3]
    bx0, by0, bx1, by1 = b[0], b[1], b[0] + b[2], b[1] + b[3]
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    iw, ih = max(0, ix1 - ix0), max(0, iy1 - iy0)
    inter = iw * ih
    ua = (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - inter
    return inter / ua if ua > 0 else 0


def postprocess(objs, w0, h0, nms_thr=0.5, min_side=8):
    """裁剪到画面内（不丢弃）+ 类无关 NMS。

    实测（r028 编辑器帧，vs 人工修正真值）：raw 精 0.241 → clamp+NMS0.5 精 0.325、召回不变。
    注意：**不要按越界直接丢**——部分真对象框本来就越界，丢了会掉召回（实测 28→22）。
    """
    out = []
    for o in objs:
        x, y, w, h = o["bbox"]
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(w0, x + w), min(h0, y + h)
        if x1 - x0 < min_side or y1 - y0 < min_side:
            continue
        out.append({**o, "bbox": [x0, y0, x1 - x0, y1 - y0]})
    keep = []
    for o in sorted(out, key=lambda z: -z.get("score", 0)):
        if all(_iou(o["bbox"], k["bbox"]) < nms_thr for k in keep):
            keep.append(o)
    return keep


def predict_one(model, path, thresh):
    im = Image.open(path).convert("RGB")
    w0, h0 = im.size
    im2 = im.resize((T.W, T.H), Image.BILINEAR)
    arr = np.asarray(im2, dtype=np.float32) / 255.0
    arr = (arr - 0.5) / 0.5
    x = torch.from_numpy(arr.transpose(2, 0, 1)).unsqueeze(0).to(T.DEV)
    with torch.no_grad():
        ph, pwh = model(x)
    dets = T.decode(ph[0].float().cpu(), pwh[0].float().cpu(), thr=thresh)
    # decode 输出按 2560×1440 还原；若原图尺寸不同要按比例缩放
    sx, sy = w0 / 2560.0, h0 / 1440.0
    raw = []
    for d in dets:
        bx, by, bw, bh = d["bbox"]
        raw.append({"id": 0, "bbox": [round(bx * sx), round(by * sy), round(bw * sx), round(bh * sy)],
                    "kind": d["kind"], "score": round(d["score"], 3), "text": ""})
    out = postprocess(raw, w0, h0)
    for i, o in enumerate(out):
        o["id"] = i
    return out, (w0, h0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=".scratch/gui-detect/train-v4/latest.pt")
    ap.add_argument("--out-dir", default=".scratch/gui-corpus/truth-v9-pred")
    ap.add_argument("--thresh", type=float, default=0.30)
    ap.add_argument("--layout", default="模型预测")
    ap.add_argument("images", nargs="+")
    a = ap.parse_args()

    ck = torch.load(a.model, map_location="cpu", weights_only=False)
    model = T.Net().to(T.DEV)
    model.load_state_dict(ck["model"])
    model.eval()
    os.makedirs(a.out_dir, exist_ok=True)
    for p in a.images:
        stem = os.path.splitext(os.path.basename(p))[0]
        objs, (w, h) = predict_one(model, p, a.thresh)
        rec = {"image": os.path.abspath(p), "layout": a.layout, "size": [w, h],
               "units": len(objs), "objects": objs,
               "_provenance": {"model": os.path.abspath(a.model), "thresh": a.thresh,
                               "note": "模型预测，供审阅修正后回流为真值"}}
        out = os.path.join(a.out_dir, stem + ".json")
        json.dump(rec, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"{stem}: {len(objs)} objects -> {out}")


if __name__ == "__main__":
    main()
