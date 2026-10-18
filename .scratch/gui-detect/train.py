#!/usr/bin/env python3
"""train.py — GUI 对象检测第一版（CenterNet-lite，640×360 输入，fp16）。

数据：.scratch/gui-detect/dataset/annotations.json（COCO 风格，bbox=xywh，kind=8 类）
切分：**按界面族**（layout）留出验证集，避免同族泄漏。
产物：.scratch/gui-detect/train/{model.pt, metrics.json, log.txt}

用法：
  python3 .scratch/gui-detect/train.py --epochs 300 --batch 4 --val-frac 0.25
"""
import argparse
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

W, H = 640, 360
STRIDE = 4
OW, OH = W // STRIDE, H // STRIDE
KINDS = ["panel", "row", "button", "tile", "chip", "icon", "card", "avatar"]
KIDX = {k: i for i, k in enumerate(KINDS)}
DEV = torch.device("cuda" if torch.cuda.is_available() else "cpu")


class Data:
    def __init__(self, root, val_frac=0.25, seed=0):
        d = json.load(open(os.path.join(root, "annotations.json"), encoding="utf-8"))
        by_img = defaultdict(list)
        for a in d["annotations"]:
            by_img[a["image_id"]].append(a)
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

    def __len__(self):
        return len(self.train)


def load_tensor(item, augment=False):
    im = Image.open(item["path"]).convert("RGB")
    im = im.crop((0, 0, min(item["w"], im.width), min(item["h"], im.height)))
    if augment and random.random() < 0.5:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
        flip = True
    else:
        flip = False
    sx, sy = W / im.width, H / im.height
    im = im.resize((W, H), Image.BILINEAR)
    arr = np.asarray(im, dtype=np.float32) / 255.0
    arr = (arr - 0.5) / 0.5
    x = torch.from_numpy(arr.transpose(2, 0, 1))
    hm = torch.zeros(len(KINDS), OH, OW)
    wh = torch.zeros(2, OH, OW)
    mask = torch.zeros(OH, OW)
    for (bbox, kind) in item["boxes"]:
        bx, by, bw, bh = bbox
        if flip:
            bx = item["w"] - bx - bw
        cx = (bx + bw / 2) * sx / STRIDE
        cy = (by + bh / 2) * sy / STRIDE
        w2, h2 = bw * sx / STRIDE, bh * sy / STRIDE
        ix, iy = int(cx), int(cy)
        if not (0 <= ix < OW and 0 <= iy < OH):
            continue
        ci = KIDX.get(kind, 1)
        if hm[ci, iy, ix] > 0:
            continue
        # 高斯热斑
        r = 2
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                x2, y2 = ix + dx, iy + dy
                if 0 <= x2 < OW and 0 <= y2 < OH:
                    hm[ci, y2, x2] = max(hm[ci, y2, x2], math.exp(-(dx * dx + dy * dy) / 2.0))
        wh[0, iy, ix] = w2 / OW      # 归一化：避免 L1 尺度压过热斑损失
        wh[1, iy, ix] = h2 / OH
        mask[iy, ix] = 1
    return x, hm, wh, mask


def conv(cin, cout, k=3, s=1):
    return nn.Sequential(nn.Conv2d(cin, cout, k, s, k // 2, bias=False), nn.BatchNorm2d(cout), nn.ReLU(True))


class Net(nn.Module):
    def __init__(self, nc=len(KINDS)):
        super().__init__()
        self.e1 = nn.Sequential(conv(3, 32), conv(32, 32))
        self.e2 = nn.Sequential(conv(32, 64, s=2), conv(64, 64))
        self.e3 = nn.Sequential(conv(64, 128, s=2), conv(128, 128))
        self.e4 = nn.Sequential(conv(128, 256, s=2), conv(256, 256))
        self.up3 = conv(256 + 128, 128)
        self.head = nn.Sequential(conv(128, 64), nn.Conv2d(64, nc + 2, 1))

    def forward(self, x):
        e1 = self.e1(x)
        e2 = self.e2(e1)
        e3 = self.e3(e2)
        e4 = self.e4(e3)
        u3 = self.up3(torch.cat([F.interpolate(e4, scale_factor=2, mode="nearest"), e3], 1))
        out = self.head(u3)
        return out[:, :len(KINDS)].sigmoid(), out[:, len(KINDS):]


def focal(pred, gt):
    p = pred.clamp(1e-4, 1 - 1e-4)
    pos = (gt > 0.99).float()
    neg = 1 - pos
    pos_loss = -((1 - p) ** 2) * torch.log(p) * pos
    neg_loss = -((1 - gt) ** 4) * (p ** 2) * torch.log(1 - p) * neg
    n = pos.sum().clamp(min=1)
    return (pos_loss.sum() + neg_loss.sum()) / n


def decode(hm, wh, thr=0.35, topk=120):
    """峰值 → 框（xywh 原图坐标）"""
    pool = F.max_pool2d(hm.unsqueeze(0), 3, 1, 1)[0]
    peaks = (hm >= pool - 1e-6) & (hm > thr)
    scores, idxs = [], []
    for c in range(hm.shape[0]):
        ys, xs = torch.nonzero(peaks[c], as_tuple=True)
        for y, x in zip(ys.tolist(), xs.tolist()):
            scores.append(float(hm[c, y, x]))
            idxs.append((c, y, x))
    order = np.argsort(scores)[::-1][:topk]
    out = []
    for i in order:
        c, y, x = idxs[i]
        w = float(wh[0, y, x]) * OW * STRIDE * (2560 / W)
        h = float(wh[1, y, x]) * OH * STRIDE * (1440 / H)
        cx = (x + 0.5) * STRIDE * (2560 / W)
        cy = (y + 0.5) * STRIDE * (1440 / H)
        if w < 4 or h < 4:
            continue
        out.append({"bbox": [cx - w / 2, cy - h / 2, w, h], "kind": KINDS[c], "score": scores[i]})
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


@torch.no_grad()
def evaluate(model, items):
    model.eval()
    hit = Counter()
    tot = Counter()
    for it in items:
        x, hm, wh, mask = load_tensor(it)
        ph, pwh = model(x.unsqueeze(0).to(DEV))
        dets = decode(ph[0].float().cpu(), pwh[0].float().cpu())
        for bbox, kind in it["boxes"]:
            tot[kind] += 1
            if any(d["kind"] == kind and iou(d["bbox"], bbox) >= 0.5 for d in dets):
                hit[kind] += 1
    model.train()
    return hit, tot


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".scratch/gui-detect/dataset")
    ap.add_argument("--out", default=".scratch/gui-detect/train")
    ap.add_argument("--epochs", type=int, default=300)
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--val-frac", type=float, default=0.25)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    log = open(os.path.join(args.out, "log.txt"), "a", buffering=1)

    data = Data(args.root, args.val_frac)
    print(f"train={len(data.train)} val={len(data.val)} val_fams={sorted(data.val_fams)} kinds={dict(data.all_kinds)}", flush=True)
    model = Net().to(DEV)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)
    scaler = torch.amp.GradScaler("cuda")
    t0 = time.time()
    best = 0.0
    for ep in range(1, args.epochs + 1):
        random.shuffle(data.train)
        tot_loss = 0.0
        for i in range(0, len(data.train), args.batch):
            chunk = data.train[i:i + args.batch]
            xs, hms, whs, ms = zip(*[load_tensor(it, augment=True) for it in chunk])
            x = torch.stack(xs).to(DEV)
            hm = torch.stack(hms).to(DEV)
            wh = torch.stack(whs).to(DEV)
            mask = torch.stack(ms).to(DEV)
            with torch.amp.autocast("cuda"):
                ph, pwh = model(x)
                l_hm = focal(ph.float(), hm.float())
                l_wh = (torch.abs(pwh - wh).sum(1) * mask).sum() / mask.sum().clamp(min=1)
                loss = l_hm + 1.0 * l_wh
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            tot_loss += float(loss)
        sched.step()
        if ep % 25 == 0:
            torch.save({"model": model.state_dict(), "kinds": KINDS}, os.path.join(args.out, "latest.pt"))
        if ep % 10 == 0 or ep == 1:
            hit, tot = evaluate(model, data.val)
            rates = {k: round(hit[k] / tot[k], 3) for k in tot}
            micro = round(sum(hit.values()) / max(1, sum(tot.values())), 3)
            msg = f"ep{ep:>4} loss={tot_loss/max(1,len(data.train)/args.batch):.4f} val_micro={micro} {rates} {time.time()-t0:.0f}s"
            print(msg, flush=True)
            log.write(msg + "\n")
            if micro > best:
                best = micro
                torch.save({"model": model.state_dict(), "kinds": KINDS}, os.path.join(args.out, "model.pt"))
    hit, tot = evaluate(model, data.val)
    res = {"val_fams": sorted(data.val_fams), "best_micro": best,
           "per_kind": {k: {"hit": hit[k], "total": tot[k], "rate": round(hit[k] / max(1, tot[k]), 3)} for k in tot},
           "train_imgs": len(data.train), "val_imgs": len(data.val)}
    json.dump(res, open(os.path.join(args.out, "metrics.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps(res, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
