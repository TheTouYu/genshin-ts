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
# v2 = 7 类热斑 + 1D 行条带（row 召回 0.084→0.266）；回退用 gui-det-v1.pt
DEFAULT_MODEL = os.path.join(HERE, "models", "gui-det-v2.pt")


def _conv(cin, cout, k=3, s=1):
    return nn.Sequential(nn.Conv2d(cin, cout, k, s, k // 2, bias=False), nn.BatchNorm2d(cout), nn.ReLU(True))


class Net(nn.Module):
    """CenterNet-lite。nc=类别数；row_strip=True 时多一条 1D 行条带分支（v2 起）。

    v1 权重（无 meta）→ nc=8、无 rhead，行为与历史完全一致。
    """

    def __init__(self, nc=len(KINDS), row_strip=False):
        super().__init__()
        self.nc, self.row_strip = nc, row_strip
        self.e1 = nn.Sequential(_conv(3, 32), _conv(32, 32))
        self.e2 = nn.Sequential(_conv(32, 64, s=2), _conv(64, 64))
        self.e3 = nn.Sequential(_conv(64, 128, s=2), _conv(128, 128))
        self.e4 = nn.Sequential(_conv(128, 256, s=2), _conv(256, 256))
        self.up3 = _conv(256 + 128, 128)
        self.head = nn.Sequential(_conv(128, 64), nn.Conv2d(64, nc + 2, 1))
        if row_strip:                       # ctr(1) + mask(1) + log h(1)，与 head 同网格
            self.rhead = nn.Sequential(_conv(128, 64), nn.Conv2d(64, 3, 1))

    def forward(self, x):
        e1 = self.e1(x)
        e2 = self.e2(e1)
        e3 = self.e3(e2)
        e4 = self.e4(e3)
        u3 = self.up3(torch.cat([F.interpolate(e4, scale_factor=2, mode="nearest"), e3], 1))
        out = self.head(u3)
        if self.row_strip:
            return out[:, :self.nc], out[:, self.nc:], self.rhead(u3)
        return out[:, :self.nc], out[:, self.nc:]


def _iou(a, b):
    ax0, ay0, ax1, ay1 = a[0], a[1], a[0] + a[2], a[1] + a[3]
    bx0, by0, bx1, by1 = b[0], b[1], b[0] + b[2], b[1] + b[3]
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    iw, ih = max(0, ix1 - ix0), max(0, iy1 - iy0)
    inter = iw * ih
    ua = (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - inter
    return inter / ua if ua > 0 else 0


def decode(logits, wh, src_w, src_h, thr=0.35, topk=120, kinds=None, res=None):
    W_, H_ = res or (W, H)
    ow, oh = W_ // STRIDE, H_ // STRIDE
    ks = kinds or KINDS
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
        w = float(wh[0, y, x]) * ow * STRIDE * (src_w / W_)
        h = float(wh[1, y, x]) * oh * STRIDE * (src_h / H_)
        cx = (x + 0.5) * STRIDE * (src_w / W_)
        cy = (y + 0.5) * STRIDE * (src_h / H_)
        if w < 8 or h < 8:
            continue
        out.append({"bbox": [cx - w / 2, cy - h / 2, w, h],
                    "kind": ks[c] if c < len(ks) else f"class{c}", "score": sc})
    return out


def decode_rows(rout, src_w, src_h, res=None, thr_ctr=0.30, thr_mask=0.30,
                gap=4, max_rows=200, pitch_gap=0.3):
    """1D 行条带解码（D2 ①）：逐 y 判「这一带是行」→ 行高 → x 跨度读像素支撑面。

    行高优先用「相邻峰间距（行距）」：列表/树的行是等距平铺的，比 logh 回归稳得多
    （实测 row recall 0.192→0.261，见 `.scratch/gui-detect/D2-improve.md` §3）；
    只有一个峰时回退 logh 回归。

    输出与原 decode() 同构的 dict（kind="row"），交给 postprocess 统一 NMS。
    """
    W_, H_ = res or (W, H)
    oh = H_ // STRIDE
    rb = rout[0] if rout.dim() == 4 else rout
    ctr, msk, lg = torch.sigmoid(rb[0]), torch.sigmoid(rb[1]), torch.clamp(rb[2], -3.0, 3.0)
    yprof = ctr.max(dim=1).values.tolist()
    kx, ky = src_w / W_, src_h / H_
    out = []
    pk = [y for y in range(1, len(yprof) - 1)          # 逐 y 峰值（±1 邻域内最大且过阈）
          if yprof[y] >= thr_ctr and yprof[y] >= yprof[y - 1] and yprof[y] >= yprof[y + 1]]
    for pi, y in enumerate(pk):
        v = yprof[y]
        gaps = []
        if pi > 0:
            gaps.append(y - pk[pi - 1])                 # 上方相邻行的间距
        if pi + 1 < len(pk):
            gaps.append(pk[pi + 1] - y)                 # 下方相邻行的间距
        h_reg = float(np.exp(np.median(lg[y].cpu().numpy())))
        hcells = (min(gaps) - pitch_gap) if gaps else h_reg
        if hcells <= 0.5:
            hcells = h_reg
        y0, y1 = max(0, y - 1), min(oh, y + 2)
        act = (msk[y0:y1].max(0).values > thr_mask).tolist()
        runs, i, n = [], 0, len(act)
        while i < n:                            # mask 列支撑 → 连续段
            if act[i]:
                j = i
                while j < n and act[j]:
                    j += 1
                if runs and i - runs[-1][1] <= gap:
                    runs[-1][1] = j             # 行内被图标打断的空洞合并
                else:
                    runs.append([i, j])
                i = j
            else:
                i += 1
        for x0, x1 in runs:
            w = (x1 - x0) * STRIDE * kx
            h = hcells * STRIDE * ky
            if w < 8 or h < 8:
                continue
            out.append({"bbox": [x0 * STRIDE * kx, (y + 0.5) * STRIDE * ky - h / 2, w, h],
                        "kind": "row", "score": v})
        if len(out) > max_rows:
            break
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
        self.kinds = KINDS                     # 权重自带类别表（元信息缺省 = v1 八类）
        self.row_strip = False                 # 权重自带行条带分支开关
        self.in_size = (W, H)                  # 权重自带输入尺寸

    def _ensure(self):
        if self.model is not None or self.err:
            return
        try:
            ck = torch.load(self.model_path, map_location="cpu", weights_only=False)
            meta = ck.get("meta") or {}
            kinds = list(ck.get("kinds") or KINDS)
            row_strip = bool(meta.get("row_strip", False))
            res = tuple(meta.get("res") or (W, H))
            m = Net(nc=len(kinds), row_strip=row_strip).to(self.device)
            m.load_state_dict(ck["model"])
            m.eval()
            self.model, self.kinds, self.row_strip, self.in_size = m, kinds, row_strip, res
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
            im = Image.fromarray(rgb).resize(self.in_size, Image.BILINEAR)
            arr = np.asarray(im, dtype=np.float32) / 255.0
            arr = (arr - 0.5) / 0.5
            x = torch.from_numpy(arr.transpose(2, 0, 1)).unsqueeze(0).to(self.device)
            t = self.thresh if thresh is None else thresh
            with torch.no_grad():
                out = self.model(x)
            dets = decode(out[0][0].float().cpu(), out[1][0].float().cpu(), w0, h0,
                          thr=t, kinds=self.kinds, res=self.in_size)
            if self.row_strip:                  # ①行条带：行由 1D 分支出，不进分类热斑
                dets += decode_rows(out[2], w0, h0, res=self.in_size,
                                    thr_ctr=max(0.2, t - 0.05))
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
