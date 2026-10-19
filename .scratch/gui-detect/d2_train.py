#!/usr/bin/env python3
"""d2_train.py — D2 实验驱动（同一套留族验证口径）。

示例：
  python3 .scratch/gui-detect/d2_train.py --tag d2-base8 --classes 8 --epochs 400
  python3 .scratch/gui-detect/d2_train.py --tag d2-strip --classes 7 --row-strip --epochs 400
  python3 .scratch/gui-detect/d2_train.py --tag d2-coarse --classes coarse --epochs 400
  python3 .scratch/gui-detect/d2_train.py --tag d2-res1024 --classes 7 --row-strip --res 1024x576 --epochs 400
  python3 .scratch/gui-detect/d2_train.py --tag d2-logw --classes 7 --loss logw --epochs 400
  python3 .scratch/gui-detect/d2_train.py --eval-only --ckpt .scratch/gui-detect/train-v5/model.pt --classes 8
"""
import argparse
import json
import os
import random
import sys
import time
from collections import Counter

import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import d2  # noqa: E402
from d2 import ALL_KINDS, COARSE, DEV, Data, Net, Targets  # noqa: E402


def parse_res(s):
    w, h = s.lower().split("x")
    return int(w), int(h)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".scratch/gui-detect/dataset")
    ap.add_argument("--outdir", default=".scratch/gui-detect")
    ap.add_argument("--tag", default="d2-run")
    ap.add_argument("--classes", default="7", help="8 | 7 | coarse")
    ap.add_argument("--kinds", default="", help="显式类别表（逗号），覆盖 --classes，例如含 glyph_icon")
    ap.add_argument("--overfit", type=int, default=0,
                    help="过拟合自检：只用前 N 个训练帧，并在同一批上评（指标不动先做这一步）")
    ap.add_argument("--row-strip", action="store_true")
    ap.add_argument("--res", default="640x360")
    ap.add_argument("--loss", default="base", help="base | logw")
    ap.add_argument("--wide-w", type=float, default=0.0, help="宽框 IoU-aware 权重倍数")
    ap.add_argument("--aspect-w", type=float, default=0.0,
                    help="热斑 BCE 的宽框正样本加权（>0 开启）")
    ap.add_argument("--epochs", type=int, default=400)
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--val-frac", type=float, default=0.25)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--pos-w", type=float, default=200.0)
    ap.add_argument("--init", default="", help="从已有权重热启动（同 arch）")
    ap.add_argument("--eval-only", action="store_true")
    ap.add_argument("--ckpt", default="")
    ap.add_argument("--thr", type=float, default=0.35)
    args = ap.parse_args()

    res = parse_res(args.res)
    logw = args.loss == "logw"
    coarse = args.classes == "coarse"
    if args.kinds:
        kinds = [k.strip() for k in args.kinds.split(",") if k.strip()]
    elif coarse:
        kinds = ["container", "element"]
    elif args.classes == "8":
        kinds = list(ALL_KINDS)
    else:
        kinds = [k for k in ALL_KINDS if k != "row"]

    data = Data(args.root, args.val_frac)
    if args.overfit:
        data.train = data.train[:args.overfit]
        data.val = list(data.train)
        print(f"[{args.tag}] overfit 自检：train=val={len(data.train)} 帧（同一批，看能不能背下来）",
              flush=True)
    if coarse:
        for it in data.train + data.val:
            it["boxes"] = [(b, COARSE.get(k, k)) for b, k in it["boxes"]]
    tg_tr = Targets(data.train, kinds, res, args.row_strip, aspect_w=args.aspect_w)
    tg_va = Targets(data.val, kinds, res, args.row_strip)
    print(f"[{args.tag}] train={len(data.train)} val={len(data.val)} kinds={kinds} "
          f"row_strip={args.row_strip} res={res} loss={args.loss} aspect_w={args.aspect_w} "
          f"cache={tg_tr.build_secs:.1f}s", flush=True)

    net = Net(nc=len(kinds), row_strip=args.row_strip).to(DEV)
    if args.init:
        ck0 = torch.load(args.init, map_location="cpu", weights_only=False)
        src, dst = ck0["model"], net.state_dict()
        new, copied, shaped = {}, 0, 0
        for k, v in dst.items():
            if k in src and src[k].shape == v.shape:
                new[k] = src[k]
                copied += 1
            elif k in src and src[k].dim() == v.dim() and src[k].shape[1:] == v.shape[1:]:
                t = torch.zeros_like(v)                     # 只保留前 N 个通道（新增类重新初始化）
                t[:src[k].shape[0]] = src[k]
                new[k] = t
                shaped += 1
            else:
                new[k] = v
        net.load_state_dict(new)
        print(f"[{args.tag}] init from {args.init}: 原样 {copied} 个张量，扩类 {shaped} 个，"
              f"其余随机初始化（新增类={[k for k in kinds if k not in ck0.get('kinds', [])]}）", flush=True)
    torch.manual_seed(args.seed)
    random.seed(args.seed)

    if args.eval_only:
        ck = torch.load(args.ckpt, map_location="cpu", weights_only=False)
        net.load_state_dict(ck["model"])
        net.eval()
        hit, tot, chit, ctot, nhit, ndet = d2.evaluate(net, tg_va, data.val, res, logw, args.thr, coarse)
        s = d2.summary(hit, tot, chit, ctot, nhit, ndet)
        from PIL import Image
        rgb = np.asarray(Image.open(data.val[0]["path"]).convert("RGB"))
        s["bench"] = d2.bench(net, rgb, res)
        s["ckpt"] = args.ckpt
        if DEV.type == "cuda":
            s["peak_mem_MB"] = round(torch.cuda.max_memory_allocated() / 2**20, 1)
        print(json.dumps(s, ensure_ascii=False), flush=True)
        return

    out = os.path.join(args.outdir, "train-" + args.tag)
    os.makedirs(out, exist_ok=True)
    log = open(os.path.join(out, "log.txt"), "a", buffering=1)
    opt = torch.optim.AdamW(net.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)
    scaler = torch.amp.GradScaler("cuda", enabled=DEV.type == "cuda")
    meta = {"arch": "d2", "kinds": kinds, "row_strip": args.row_strip, "res": list(res),
            "logw": logw, "classes": args.classes, "epochs": args.epochs, "tag": args.tag}
    n = len(data.train)
    order = list(range(n))
    best = -1.0
    t0 = time.time()
    hist = []
    for ep in range(1, args.epochs + 1):
        random.shuffle(order)
        tot_loss = 0.0
        for i in range(0, n, args.batch):
            bi = order[i:i + args.batch]
            xs, ts = [], []
            for k in bi:
                flip = random.random() < 0.5
                a = tg_tr.buf[k][1] if flip else tg_tr.buf[k][0]
                xs.append(torch.from_numpy(a).permute(2, 0, 1))
                ts.append(tg_tr.tgt[k][1 if flip else 0])
            x = torch.stack(xs).to(DEV).float()
            x = ((x / 255.0) - 0.5) / 0.5
            hm = torch.from_numpy(np.stack([t["hm"] for t in ts])).to(DEV)
            wh = torch.from_numpy(np.stack([t["wh"] for t in ts])).to(DEV)
            msk = torch.from_numpy(np.stack([t["mask"] for t in ts])).to(DEV)
            aspect = wide = None
            if args.wide_w:
                wide = torch.clamp(wh[:, 0] * res[0] / (wh[:, 1] * res[1] + 1e-3) - 6.0, 0.0, 30.0)
            with torch.amp.autocast("cuda", enabled=DEV.type == "cuda"):
                if args.row_strip:
                    ph, pwh, r = net(x)
                else:
                    ph, pwh = net(x)
                    r = None
                wgt = None
                if args.aspect_w:
                    wgt = torch.from_numpy(np.stack([t["hwt"] for t in ts])).to(DEV)
                loss = d2.heat_loss(ph.float(), hm, args.pos_w, wgt)
                loss = loss + d2.wh_loss(pwh.float(), wh, msk, logw, args.wide_w, wide)
                if r is not None:
                    rctr = torch.from_numpy(np.stack([t["rctr"] for t in ts])).to(DEV)
                    rmask = torch.from_numpy(np.stack([t["rmask"] for t in ts])).to(DEV)
                    rh = torch.from_numpy(np.stack([t["rh"] for t in ts])).to(DEV)
                    l_ctr = d2.heat_loss(r[:, :1].float(), rctr, 20.0)
                    l_mask = d2.heat_loss(r[:, 1:2].float(), rmask, 6.0)
                    l_h = (torch.abs(r[:, 2:3].float() - rh) * rmask).sum() / rmask.sum().clamp(min=1)
                    loss = loss + l_ctr + l_mask + l_h
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            tot_loss += float(loss)
        sched.step()
        if ep % 20 == 0 or ep == args.epochs:
            hit, tot, chit, ctot, nhit, ndet = d2.evaluate(net, tg_va, data.val, res, logw, args.thr, coarse)
            s = d2.summary(hit, tot, chit, ctot, nhit, ndet)
            key = s["micro"] if not coarse else s["coarse_micro"]
            msg = (f"ep{ep:>4} loss={tot_loss/max(1,(n+args.batch-1)//args.batch):.4f} "
                   f"micro={s['micro']} coarse={s['coarse_micro']} {s['per_kind']} "
                   f"{time.time()-t0:.0f}s")
            print(msg, flush=True)
            log.write(msg + "\n")
            hist.append({"ep": ep, "loss": round(tot_loss / max(1, (n + args.batch - 1) // args.batch), 4), **s})
            if key > best:
                best = key
                torch.save({"model": net.state_dict(), "kinds": kinds, "meta": meta},
                           os.path.join(out, "model.pt"))
            torch.save({"model": net.state_dict(), "kinds": kinds, "meta": meta},
                       os.path.join(out, "latest.pt"))
    # 终评（用 best）
    ck = torch.load(os.path.join(out, "model.pt"), map_location="cpu", weights_only=False)
    net.load_state_dict(ck["model"])
    net.eval()
    hit, tot, chit, ctot, nhit, ndet = d2.evaluate(net, tg_va, data.val, res, logw, args.thr, coarse)
    s = d2.summary(hit, tot, chit, ctot, nhit, ndet)
    from PIL import Image
    rgb = np.asarray(Image.open(data.val[0]["path"]).convert("RGB"))
    s["bench"] = d2.bench(net, rgb, res)
    s.update(val_fams=sorted(data.val_fams), train_imgs=len(data.train), val_imgs=len(data.val),
             meta=meta, best=best, secs=round(time.time() - t0, 1), hist=hist)
    json.dump(s, open(os.path.join(out, "metrics.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in s.items() if k != "hist"}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
