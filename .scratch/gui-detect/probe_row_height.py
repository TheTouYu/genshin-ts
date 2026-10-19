#!/usr/bin/env python3
"""probe_row_height.py — row 行高取法的单变量探针（只改解码，不动权重/训练）。

背景（2026-10-19）：`d2.decode_rows` 现在优先用「相邻峰间距 − pitch_gap」当行高 —— 在**等距列表**上这是
对的（D2 实测 row 0.192→0.266），但世界 HUD 的行**不等距**，峰间距被拉大 → 行框高≈真值 1.9×，
IoU 卡在 0.3–0.5 之间，全被判漏。

本探针对同一权重、同一帧、同一阈值，只比较行高取法：
  pitch  = 现状：min(gaps) − pitch_gap（单峰时回退回归头 logh）
  logh   = 只用回归头 exp(median(logh))
  cap12  = **min(pitch, 1.2 × logh)**   ← 推荐（世界 HUD 0.061→0.273，密集列表 0.500→0.510）
  thr15  = pitch > 1.5×logh 时改用 logh
输出每套规则在给定帧集上的 row recall@IoU0.5。

用法：
  python3 .scratch/gui-detect/probe_row_height.py --w .scratch/gui-detect/train-v4/model.pt --nc 8 \
      --frames m01,m02,m08,w07,w08,c37_195331,c40_195339
  python3 .scratch/gui-detect/probe_row_height.py --w tools/ys-editor/models/gui-det-v2.pt --nc 7 --set old
"""
import argparse
import json
import os
import sys

import numpy as np
import torch
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "tools", "ys-editor"))
import d2  # noqa: E402

TRUTH = os.path.join(ROOT, ".scratch", "gui-corpus", "truth-merged")
SETS = {
    "new": ["m01", "m02", "m08", "w07", "w08", "c37_195331", "c40_195339"],
    "old": ["r003_snap_2026-10-19_00-17-26", "r016_snap_2026-10-19_00-24-17",
            "r026_snap_2026-10-19_00-27-05", "r028_snap_2026-10-19_00-27-49",
            "r034_snap_2026-10-19_00-31-33", "r041_snap_2026-10-19_00-36-21",
            "r045_snap_2026-10-19_00-38-06"],
}


def iou(a, b):
    ax0, ay0, ax1, ay1 = a[0], a[1], a[0] + a[2], a[1] + a[3]
    bx0, by0, bx1, by1 = b[0], b[1], b[0] + b[2], b[1] + b[3]
    iw = max(0.0, min(ax1, bx1) - max(ax0, bx0))
    ih = max(0.0, min(ay1, by1) - max(ay0, by0))
    inter = iw * ih
    ua = (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - inter
    return inter / ua if ua > 0 else 0.0


def decode_var(rout, src_w, src_h, mode, res=(640, 360), thr_ctr=0.30, thr_mask=0.30,
               gap=4, pitch_gap=0.3):
    """与 d2.decode_rows 逐行一致，唯一差别是行高取法（mode）。"""
    W, H = res
    OW, OH = W // 4, H // 4
    rb = rout[0] if rout.dim() == 4 else rout
    ctr = torch.sigmoid(rb[0])
    msk = torch.sigmoid(rb[1])
    lg = torch.clamp(rb[2], -3.0, 3.0)
    yprof = ctr.max(dim=1).values
    kx, ky = src_w / W, src_h / H
    pk = sorted(i for _s, i in d2._peak(yprof.tolist(), thr_ctr))
    prof = yprof.tolist()
    out = []
    for pi, y in enumerate(pk):
        sc = prof[y]
        gaps = []
        if pi > 0:
            gaps.append(y - pk[pi - 1])
        if pi + 1 < len(pk):
            gaps.append(pk[pi + 1] - y)
        reg = float(np.exp(np.median(lg[y].cpu().numpy())))
        pit = (min(gaps) - pitch_gap) if gaps else reg
        if pit <= 0.5:
            pit = reg
        if mode == "pitch":
            hc = pit
        elif mode == "logh":
            hc = reg
        elif mode == "cap12":
            hc = min(pit, 1.2 * reg)
        elif mode == "thr15":
            hc = reg if pit > 1.5 * reg else pit
        else:
            raise SystemExit(f"unknown mode {mode}")
        y0, y1 = max(0, y - 1), min(OH, y + 2)
        cp = msk[y0:y1].max(0).values
        act = (cp > thr_mask).tolist()
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
        for r in raw:
            if runs and r[0] - runs[-1][1] <= gap:
                runs[-1][1] = r[1]
            else:
                runs.append(r)
        for (x0, x1) in runs:
            w = (x1 - x0) * 4 * kx
            h = hc * 4 * ky
            if w < 4 or h < 4:
                continue
            out.append({"bbox": [x0 * 4 * kx, (y + 0.5) * 4 * ky - h / 2, w, h],
                        "kind": "row", "score": sc})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--w", required=True)
    ap.add_argument("--nc", type=int, required=True, help="权重类别数（v1/v4=8，v2=7）")
    ap.add_argument("--frames", default="", help="逗号分隔的 stem；缺省用 --set")
    ap.add_argument("--set", default="new", choices=sorted(SETS))
    args = ap.parse_args()

    frames = [s.strip() for s in args.frames.split(",") if s.strip()] or SETS[args.set]
    net = d2.Net(nc=args.nc, row_strip=True).to(d2.DEV)
    net.load_state_dict(torch.load(args.w, map_location="cpu", weights_only=False)["model"])
    net.eval()
    acc = {m: [0, 0] for m in ("pitch", "logh", "cap12", "thr15")}
    for stem in frames:
        p = os.path.join(TRUTH, stem + ".json")
        if not os.path.exists(p):
            continue
        d = json.load(open(p, encoding="utf-8"))
        gts = [o for o in d.get("objects", []) if o.get("kind") == "row"]
        if not gts:
            continue
        im = Image.open(d["image"]).convert("RGB")
        w0, h0 = im.size
        x = torch.from_numpy(((np.asarray(im.resize((640, 360), Image.BILINEAR), np.float32)
                               / 255.0 - 0.5) / 0.5).transpose(2, 0, 1)).unsqueeze(0).to(d2.DEV)
        with torch.no_grad():
            _hm, _wh, r = net(x)
        for m in acc:
            dets = decode_var(r.float().cpu(), w0, h0, m)
            acc[m][0] += sum(1 for g in gts
                             if any(iou(o["bbox"], g["bbox"]) >= 0.5 for o in dets))
            acc[m][1] += len(gts)
    print(f"weights={os.path.relpath(args.w, ROOT)}  frames={len(frames)}")
    for m, (h, g) in acc.items():
        print(f"  {m:<6} row recall@{0.5} = {h}/{g} = {h / max(1, g):.3f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
