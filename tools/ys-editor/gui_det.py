#!/usr/bin/env python3
"""gui_det.py — GUI 对象检测器（D2）推理模块，供 ys_lookd 常驻服务直接调用。

模型：CenterNet-lite 640×360，8 类（panel/row/button/tile/chip/icon/card/avatar），
训练代码见 `.scratch/gui-detect/train.py`，本模块只做推理（不依赖训练期数据管线）。

用法（服务内）：
    import gui_det
    det = gui_det.Detector()          # 懒加载一次
    objs = det.detect(rgb_array)      # → [{id,bbox:[x,y,w,h],kind,score}]

后处理（实测有效，见 D2 反馈轮）：
  · clamp 到画面（**不要丢**：部分真对象框本就跨边界，丢了掉召回）
  · 类无关 NMS 0.5（同一框会被 5 个类各报一次，按类 NMS 让它活 5 次）
"""
import os

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

W, H = 640, 360
STRIDE = 4
OW, OH = W // STRIDE, H // STRIDE
KINDS = ["panel", "row", "button", "tile", "chip", "icon", "card", "avatar"]
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MODEL = os.path.join(HERE, "models", "gui-det-v1.pt")


def _conv(cin, cout, k=3, s=1):
    return nn.Sequential(nn.Conv2d(cin, cout, k, s, k // 2, bias=False), nn.BatchNorm2d(cout), nn.ReLU(True))


class Net(nn.Module):
    def __init__(self, nc=len(KINDS)):
        super().__init__()
        self.e1 = nn.Sequential(_conv(3, 32), _conv(32, 32))
        self.e2 = nn.Sequential(_conv(32, 64, s=2), _conv(64, 64))
        self.e3 = nn.Sequential(_conv(64, 128, s=2), _conv(128, 128))
        self.e4 = nn.Sequential(_conv(128, 256, s=2), _conv(256, 256))
        self.up3 = _conv(256 + 128, 128)
        self.head = nn.Sequential(_conv(128, 64), nn.Conv2d(64, nc + 2, 1))

    def forward(self, x):
        e1 = self.e1(x)
        e2 = self.e2(e1)
        e3 = self.e3(e2)
        e4 = self.e4(e3)
        u3 = self.up3(torch.cat([F.interpolate(e4, scale_factor=2, mode="nearest"), e3], 1))
        out = self.head(u3)
        return out[:, :len(KINDS)], out[:, len(KINDS):]


def _iou(a, b):
    ax0, ay0, ax1, ay1 = a[0], a[1], a[0] + a[2], a[1] + a[3]
    bx0, by0, bx1, by1 = b[0], b[1], b[0] + b[2], b[1] + b[3]
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    iw, ih = max(0, ix1 - ix0), max(0, iy1 - iy0)
    inter = iw * ih
    ua = (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - inter
    return inter / ua if ua > 0 else 0


def decode(logits, wh, src_w, src_h, thr=0.35, topk=120):
    hm = torch.sigmoid(logits)
    pool = F.max_pool2d(hm.unsqueeze(0), 3, 1, 1)[0]
    peaks = (hm >= pool - 1e-6) & (hm > thr)
    cand = []
    for c in range(hm.shape[0]):
        ys, xs = torch.nonzero(peaks[c], as_tuple=True)
        for y, x in zip(ys.tolist(), xs.tolist()):
            cand.append((float(hm[c, y, x]), c, y, x))
    cand.sort(reverse=True)
    out = []
    for sc, c, y, x in cand[:topk]:
        w = float(wh[0, y, x]) * OW * STRIDE * (src_w / W)
        h = float(wh[1, y, x]) * OH * STRIDE * (src_h / H)
        cx = (x + 0.5) * STRIDE * (src_w / W)
        cy = (y + 0.5) * STRIDE * (src_h / H)
        if w < 8 or h < 8:
            continue
        out.append({"bbox": [cx - w / 2, cy - h / 2, w, h], "kind": KINDS[c], "score": sc})
    return out


def postprocess(objs, w0, h0, nms_thr=0.5, min_side=8):
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


class Detector:
    """懒加载 + 常驻复用。首次调用加载权重与 CUDA kernel（~1s），之后单帧 ~20–40ms。"""

    def __init__(self, model_path=None, device=None, thresh=0.35):
        self.model_path = model_path or DEFAULT_MODEL
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.thresh = thresh
        self.model = None
        self.err = None

    def _ensure(self):
        if self.model is not None or self.err:
            return
        try:
            ck = torch.load(self.model_path, map_location="cpu", weights_only=False)
            m = Net().to(self.device)
            m.load_state_dict(ck["model"])
            m.eval()
            self.model = m
        except Exception as e:                      # noqa: BLE001 —— fail-closed 到 err
            self.err = f"{type(e).__name__}: {e}"

    def detect(self, rgb, thresh=None):
        """rgb: HxWx3 uint8 → [{'id','bbox'(xywh),'kind','score'}]；失败返回 []，err 带原因。"""
        self._ensure()
        if self.model is None:
            return []
        try:
            from PIL import Image
            h0, w0 = rgb.shape[:2]
            im = Image.fromarray(rgb).resize((W, H), Image.BILINEAR)
            arr = np.asarray(im, dtype=np.float32) / 255.0
            arr = (arr - 0.5) / 0.5
            x = torch.from_numpy(arr.transpose(2, 0, 1)).unsqueeze(0).to(self.device)
            with torch.no_grad():
                ph, pwh = self.model(x)
            dets = decode(ph[0].float().cpu(), pwh[0].float().cpu(), w0, h0,
                          thr=self.thresh if thresh is None else thresh)
            objs = postprocess(dets, w0, h0)
            for i, o in enumerate(objs):
                o["id"] = i
            return objs
        except Exception as e:                      # noqa: BLE001
            self.err = f"{type(e).__name__}: {e}"
            return []


if __name__ == "__main__":                          # 自测：python3 gui_det.py <image>
    import sys
    from PIL import Image
    det = Detector()
    if len(sys.argv) > 1:
        arr = np.asarray(Image.open(sys.argv[1]).convert("RGB"))
        out = det.detect(arr)
        print(f"err={det.err} n={len(out)}")
        for o in out[:10]:
            print(" ", o["kind"], [round(v) for v in o["bbox"]], round(o["score"], 3))
