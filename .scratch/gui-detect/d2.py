#!/usr/bin/env python3
"""d2.py — D2 检测器实验内核（缓存式数据管线 + 可变架构 + 统一评测）。

与 train.py 的差别只有两处「不改变评测口径」的加速：
  1. 图像一次性解码/缩放成 uint8 常驻内存（train.py 每 epoch 重新 PIL 读盘+缩放）；
  2. 目标图一次性预生成（只有水平翻转一种增强，翻转副本也预生成）。
评测口径与 train.py 逐字一致：留族验证、per-kind IoU≥0.5、命中即算（贪心无关）。

用法：见 d2_train.py
"""
import json
import math
import os
import random
import time
from collections import Counter, defaultdict

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image

ALL_KINDS = ["panel", "row", "button", "tile", "chip", "icon", "card", "avatar"]
COARSE = {"panel": "container", "row": "container", "card": "container",
          "button": "element", "tile": "element", "chip": "element",
          "icon": "element", "avatar": "element"}
DEV = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ---------------------------------------------------------------- 数据 / 切分
class Data:
    """与 train.py 完全相同的留族切分（同 seed、同 fam 归一化）。"""

    def __init__(self, root, val_frac=0.25, seed=0):
        d = json.load(open(os.path.join(root, "annotations.json"), encoding="utf-8"))
        # 若有 split.json（build_dataset_v2 产出）→ 用**显式切分**，不再按 layout 族随机切
        sp_path = os.path.join(root, "split.json")
        by_img = defaultdict(list)
        for a in d["annotations"]:
            by_img[a["image_id"]].append(a)
        if os.path.exists(sp_path):
            sp = json.load(open(sp_path, encoding="utf-8"))
            tr, va = set(sp["train"]), set(sp["val"])
            self.train, self.val, self.val_fams = [], [], set(sp.get("val_families", []))
            by_img = defaultdict(list)
            for a in d["annotations"]:
                by_img[a["image_id"]].append(a)
            for im in d["images"]:
                stem = os.path.splitext(os.path.basename(im["file_name"]))[0]
                if stem not in tr and stem not in va:
                    continue
                item = {"path": im["file_name"], "w": im["width"], "h": im["height"],
                        "boxes": [(a["bbox"], a["kind"]) for a in by_img[im["id"]]],
                        "fam": im.get("family") or "unknown", "stem": stem}
                (self.val if stem in va else self.train).append(item)
            self.all_kinds = Counter(a["kind"] for a in d["annotations"])
            return
        fam = {}
        for im in d["images"]:
            fam[im["id"]] = (im.get("layout") or "unknown").split("（")[0].split("·")[0].strip()
        fams = sorted(set(fam.values()))
        random.Random(seed).shuffle(fams)
        n_val = max(2, int(len(fams) * val_frac))
        val_fams = set(fams[:n_val])
        self.train, self.val = [], []
        for im in d["images"]:
            item = {"path": im["file_name"], "w": im["width"], "h": im["height"],
                    "boxes": [(a["bbox"], a["kind"]) for a in by_img[im["id"]]],
                    "fam": fam[im["id"]]}
            (self.val if fam[im["id"]] in val_fams else self.train).append(item)
        self.val_fams = val_fams
        self.all_kinds = Counter(a["kind"] for a in d["annotations"])


def _conv(cin, cout, k=3, s=1):
    return nn.Sequential(nn.Conv2d(cin, cout, k, s, k // 2, bias=False),
                         nn.BatchNorm2d(cout), nn.ReLU(True))


class Net(nn.Module):
    """CenterNet-lite。nc=类别数；row_strip=True 时多一个 1D 条带分支（不入分类热斑）。"""

    def __init__(self, nc=7, row_strip=False):
        super().__init__()
        self.nc, self.row_strip = nc, row_strip
        self.e1 = nn.Sequential(_conv(3, 32), _conv(32, 32))
        self.e2 = nn.Sequential(_conv(32, 64, s=2), _conv(64, 64))
        self.e3 = nn.Sequential(_conv(64, 128, s=2), _conv(128, 128))
        self.e4 = nn.Sequential(_conv(128, 256, s=2), _conv(256, 256))
        self.up3 = _conv(256 + 128, 128)
        self.head = nn.Sequential(_conv(128, 64), nn.Conv2d(64, nc + 2, 1))
        if row_strip:                       # ctr(1) + mask(1) + logh(1)
            self.rhead = nn.Sequential(_conv(128, 64), nn.Conv2d(64, 3, 1))

    def forward(self, x):
        e1 = self.e1(x)
        e3 = self.e3(self.e2(e1))
        e4 = self.e4(e3)
        u3 = self.up3(torch.cat([F.interpolate(e4, scale_factor=2, mode="nearest"), e3], 1))
        out = self.head(u3)
        if self.row_strip:
            r = self.rhead(u3)
            return out[:, :self.nc], out[:, self.nc:], r
        return out[:, :self.nc], out[:, self.nc:]


# ---------------------------------------------------------------- 目标图
class Targets:
    """按 (图, 是否翻转) 预生成目标；res=(W,H) 决定网格大小。"""

    def __init__(self, items, kinds, res=(640, 360), row_strip=False,
                 ctr_sigma=2.0, row_sy=0.7, aspect_w=0.0):
        self.W, self.H = res
        self.OW, self.OH = self.W // 4, self.H // 4
        self.kinds = kinds
        self.kidx = {k: i for i, k in enumerate(kinds)}
        self.row_strip = row_strip
        self.ctr_sigma = ctr_sigma
        self.row_sy = row_sy
        self.aspect_w = aspect_w      # >0：按长宽比放大「宽框」正样本的热斑 BCE 权重
        self.buf = []           # 缓存 uint8 图（原 + 翻转）
        self.tgt = []           # 每条样本两支：(原, 翻转)
        t0 = time.time()
        for it in items:
            im = Image.open(it["path"]).convert("RGB")
            im = im.crop((0, 0, min(it["w"], im.width), min(it["h"], im.height)))
            sx, sy = self.W / im.width, self.H / im.height
            im = im.resize((self.W, self.H), Image.BILINEAR)
            a = np.ascontiguousarray(np.asarray(im, dtype=np.uint8))
            self.buf.append((a, np.ascontiguousarray(a[:, ::-1]), sx, sy))
            self.tgt.append((self._one(it, False, sx, sy), self._one(it, True, sx, sy)))
        self.build_secs = time.time() - t0

    def __len__(self):
        return len(self.buf)

    def _one(self, it, flip, sx, sy):
        nc, OH, OW = len(self.kinds), self.OH, self.OW
        hm = np.zeros((nc, OH, OW), np.float32)
        wh = np.zeros((2, OH, OW), np.float32)
        mask = np.zeros((OH, OW), np.float32)
        rctr = np.zeros((1, OH, OW), np.float32) if self.row_strip else None
        rmask = np.zeros((1, OH, OW), np.float32) if self.row_strip else None
        rh = np.zeros((1, OH, OW), np.float32) if self.row_strip else None
        hwt = np.ones((OH, OW), np.float32) if self.aspect_w else None
        for (bbox, kind) in it["boxes"]:
            bx, by, bw, bh = bbox
            if flip:
                bx = it["w"] - bx - bw
            bx, by, bw, bh = bx * sx, by * sy, bw * sx, bh * sy
            if kind == "row" and self.row_strip:
                self._row_strip(rctr[0], rmask[0], rh[0], bx, by, bw, bh)
                continue
            ci = self.kidx.get(kind)
            if ci is None:
                continue
            cx, cy = (bx + bw / 2) / 4, (by + bh / 2) / 4
            ix, iy = int(cx), int(cy)
            if not (0 <= ix < OW and 0 <= iy < OH):
                continue
            if hm[ci, iy, ix] > 0:
                continue
            r = 2
            boost = 1.0
            if hwt is not None:                    # 宽框加权：aspect>6 才开始加，封顶 6x
                ar = bw / max(1.0, bh)
                if ar > 6.0:
                    boost = min(1.0 + ar / 6.0, 6.0)
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    x2, y2 = ix + dx, iy + dy
                    if 0 <= x2 < OW and 0 <= y2 < OH:
                        hm[ci, y2, x2] = max(hm[ci, y2, x2], math.exp(-(dx * dx + dy * dy) / 2.0))
                        if hwt is not None and boost > 1.0:
                            hwt[y2, x2] = max(hwt[y2, x2], boost)
            wh[0, iy, ix] = bw / 4 / OW
            wh[1, iy, ix] = bh / 4 / OH
            mask[iy, ix] = 1
        out = {"hm": hm, "wh": wh, "mask": mask}
        if hwt is not None:
            out["hwt"] = hwt
        if self.row_strip:
            out.update(rctr=rctr, rmask=rmask, rh=rh)
        return out

    def _row_strip(self, rctr, rmask, rh, bx, by, bw, bh):
        OH, OW = self.OH, self.OW
        x0, x1 = bx / 4, (bx + bw) / 4
        y0, y1 = by / 4, (by + bh) / 4
        ix0, ix1 = max(0, int(math.floor(x0))), min(OW, int(math.ceil(x1)))
        iy0, iy1 = max(0, int(math.floor(y0))), min(OH, int(math.ceil(y1)))
        if ix1 <= ix0 or iy1 <= iy0:
            return
        cy = (y0 + y1) / 2
        hh = max(0.5, y1 - y0)
        # 中心线：x 方向平铺、y 方向窄高斯（条带表示的关键）
        for iy in range(max(0, iy0 - 1), min(OH, iy1 + 1)):
            v = math.exp(-((iy + 0.5 - cy) ** 2) / (2 * self.row_sy ** 2))
            np.maximum(rctr[iy, ix0:ix1], v, out=rctr[iy, ix0:ix1])
        rmask[iy0:iy1, ix0:ix1] = 1.0
        for iy in range(iy0, iy1):
            np.maximum(rh[iy, ix0:ix1], math.log(hh), out=rh[iy, ix0:ix1])


# ---------------------------------------------------------------- 损失
def heat_loss(logits, gt, pos_weight=200.0, weight=None):
    return F.binary_cross_entropy_with_logits(
        logits, gt, weight=weight, pos_weight=torch.tensor(pos_weight, device=logits.device))


def wh_loss(pred, tgt, mask, logw=False, wide_w=0.0, aspect=None):
    if logw:                     # 相对误差：log 空间 L1（宽框不再被绝对像素主导）
        tgt = torch.log(tgt.clamp(min=1e-4) + 1.0)
    l = torch.abs(pred - tgt).sum(1)
    if wide_w and aspect is not None:
        l = l * (1.0 + wide_w * torch.clamp(aspect - 6.0, min=0.0))
    return (l * mask).sum() / mask.sum().clamp(min=1)


# ---------------------------------------------------------------- 解码
def _peak(yprof, thr, min_sep=2):
    out = []
    n = len(yprof)
    for i in range(n):
        if yprof[i] <= thr:
            continue
        lo, hi = max(0, i - 1), min(n, i + 2)
        if yprof[i] < max(yprof[lo:hi]) - 1e-6:
            continue
        out.append((float(yprof[i]), i))
    out.sort(reverse=True)
    keep = []
    for s, i in out:
        if all(abs(i - j) >= min_sep for _, j in keep):
            keep.append((s, i))
    return keep


def decode(hm_logits, wh, src_w, src_h, thr=0.35, topk=120, res=(640, 360),
           logw=False, kinds=None):
    """CenterNet 峰值 → 框（原图坐标）。res 见 Net 输入网格。"""
    W, H = res
    OW, OH = W // 4, H // 4
    hm = torch.sigmoid(hm_logits)
    pool = F.max_pool2d(hm.unsqueeze(0), 3, 1, 1)[0]
    peaks = (hm >= pool - 1e-6) & (hm > thr)
    cand = []
    for c in range(hm.shape[0]):
        ys, xs = torch.nonzero(peaks[c], as_tuple=True)
        for y, x in zip(ys.tolist(), xs.tolist()):
            cand.append((float(hm[c, y, x]), c, y, x))
    cand.sort(reverse=True)
    out = []
    ks = kinds or ALL_KINDS
    kx, ky = src_w / W, src_h / H
    for sc, c, y, x in cand[:topk]:
        if logw:
            w = float(torch.exp(torch.clamp(wh[0, y, x], -8.0, 4.0)) - 1.0)
            h = float(torch.exp(torch.clamp(wh[1, y, x], -8.0, 4.0)) - 1.0)
        else:
            w = float(wh[0, y, x])
            h = float(wh[1, y, x])
        w *= OW * 4 * kx
        h *= OH * 4 * ky
        cx = (x + 0.5) * 4 * kx
        cy = (y + 0.5) * 4 * ky
        if w < 4 or h < 4:
            continue
        out.append({"bbox": [cx - w / 2, cy - h / 2, w, h], "kind": ks[c], "score": sc})
    return out


def decode_rows(rout, src_w, src_h, res=(640, 360), thr_ctr=0.30, thr_mask=0.30,
                gap=4, max_rows=200, pitch_gap=0.3):
    """1D 条带解码：逐 y 判「这一带是行」→ 行高从回归头 → x 支撑面从 mask 读。"""
    W, H = res
    OW, OH = W // 4, H // 4
    rb = rout[0] if rout.dim() == 4 else rout
    ctr = torch.sigmoid(rb[0])
    msk = torch.sigmoid(rb[1])
    lg = torch.clamp(rb[2], -3.0, 3.0)
    yprof = ctr.max(dim=1).values
    kx, ky = src_w / W, src_h / H
    pk = sorted(i for _s, i in _peak(yprof.tolist(), thr_ctr))   # 按 y 位置排序
    prof = yprof.tolist()
    out = []
    for pi, y in enumerate(pk):
        sc = prof[y]
        # 行高：优先用「相邻峰间距（行距）」——列表/树的行是等距平铺的，
        # 比 logh 回归稳得多（实测 row 0.192→0.261）；单峰时回退 logh。
        gaps = []
        if pi > 0:
            gaps.append(y - pk[pi - 1])
        if pi + 1 < len(pk):
            gaps.append(pk[pi + 1] - y)
        h_reg = float(np.exp(np.median(lg[y].cpu().numpy())))
        hcells = (min(gaps) - pitch_gap) if gaps else h_reg
        if hcells <= 0.5:
            hcells = h_reg
        y0, y1 = max(0, y - 1), min(OH, y + 2)
        colprof = msk[y0:y1].max(0).values
        act = (colprof > thr_mask).tolist()
        n = len(act)
        raw, i = [], 0
        while i < n:
            if act[i]:
                j = i
                while j < n and act[j]:
                    j += 1
                raw.append([i, j])
                i = j
            else:
                i += 1
        runs = []
        for r in raw:                       # 合并 <=gap 格的空洞（行内被图标打断）
            if runs and r[0] - runs[-1][1] <= gap:
                runs[-1][1] = r[1]
            else:
                runs.append(r)
        for (x0, x1) in runs:
            w = (x1 - x0) * 4 * kx
            h = hcells * 4 * ky
            if w < 4 or h < 4:
                continue
            out.append({"bbox": [x0 * 4 * kx, (y + 0.5) * 4 * ky - h / 2, w, h],
                        "kind": "row", "score": sc})
        if len(out) > max_rows:
            break
    return out


def iou(a, b):
    ax0, ay0, ax1, ay1 = a[0], a[1], a[0] + a[2], a[1] + a[3]
    bx0, by0, bx1, by1 = b[0], b[1], b[0] + b[2], b[1] + b[3]
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    iw, ih = max(0, ix1 - ix0), max(0, iy1 - iy0)
    inter = iw * ih
    ua = (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - inter
    return inter / ua if ua > 0 else 0


# ---------------------------------------------------------------- 评测
@torch.no_grad()
def evaluate(net, tg, items, res=(640, 360), logw=False, thr=0.35, coarse=False):
    net.eval()
    hit, tot = Counter(), Counter()
    chit, ctot = Counter(), Counter()
    nhit, ndet = Counter(), Counter()
    W, H = res
    for k, it in enumerate(items):
        a = tg.buf[k][0]
        x = torch.from_numpy(a).permute(2, 0, 1).float().to(DEV)
        x = ((x / 255.0) - 0.5) / 0.5
        o = net(x.unsqueeze(0))
        if net.row_strip:
            hm, wh, r = o
            dets = decode(hm[0].float().cpu(), wh[0].float().cpu(), it["w"], it["h"],
                          thr=thr, res=res, logw=logw, kinds=tg.kinds)
            dets += decode_rows(r, it["w"], it["h"], res=res)
        else:
            hm, wh = o
            dets = decode(hm[0].float().cpu(), wh[0].float().cpu(), it["w"], it["h"],
                          thr=thr, res=res, logw=logw, kinds=tg.kinds)
        for d in dets:
            ndet[d["kind"]] += 1
            if any(d["kind"] == g[1] and iou(d["bbox"], g[0]) >= 0.5 for g in it["boxes"]):
                nhit[d["kind"]] += 1
        for bbox, kind in it["boxes"]:
            tot[kind] += 1
            if any(d["kind"] == kind and iou(d["bbox"], bbox) >= 0.5 for d in dets):
                hit[kind] += 1
            ck = COARSE.get(kind, kind)
            ctot[ck] += 1
            if any(COARSE.get(d["kind"], d["kind"]) == ck and iou(d["bbox"], bbox) >= 0.5
                   for d in dets):
                chit[ck] += 1
    net.train()
    return hit, tot, chit, ctot, nhit, ndet


def summary(hit, tot, chit, ctot, nhit=None, ndet=None):
    rates = {k: round(hit[k] / max(1, tot[k]), 3) for k in tot}
    micro = round(sum(hit.values()) / max(1, sum(tot.values())), 3)
    crates = {k: round(chit[k] / max(1, ctot[k]), 3) for k in ctot}
    cmicro = round(sum(chit.values()) / max(1, sum(ctot.values())), 3)
    out = {"micro": micro, "per_kind": rates, "coarse_micro": cmicro,
           "coarse": crates, "n": sum(tot.values()), "ndet": sum(ndet.values()) if ndet else 0}
    if ndet:
        out["precision"] = {k: round(nhit[k] / max(1, ndet[k]), 3) for k in ndet}
    return out


@torch.no_grad()
def bench(net, rgb, res=(640, 360), n=40):
    """端到端单帧耗时（含 PIL 缩放 + 解码），热态中位数。"""
    from PIL import Image as _I
    net.eval()
    h0, w0 = rgb.shape[:2]
    ts = []
    for _ in range(n):
        t0 = time.perf_counter()
        im = _I.fromarray(rgb).resize(res, _I.BILINEAR)
        arr = np.asarray(im, dtype=np.float32) / 255.0
        x = torch.from_numpy(((arr - 0.5) / 0.5).transpose(2, 0, 1)).unsqueeze(0).to(DEV)
        o = net(x)
        if net.row_strip:
            hm, wh, r = o
            dets = decode(hm[0].float().cpu(), wh[0].float().cpu(), w0, h0, res=res)
            dets += decode_rows(r, w0, h0, res=res)
        else:
            hm, wh = o
            dets = decode(hm[0].float().cpu(), wh[0].float().cpu(), w0, h0, res=res)
        ts.append((time.perf_counter() - t0) * 1000)
    ts = sorted(ts)
    return {"p50_ms": round(ts[len(ts) // 2], 2), "p90_ms": round(ts[int(len(ts) * 0.9)], 2)}
