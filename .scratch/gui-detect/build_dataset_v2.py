#!/usr/bin/env python3
"""build_dataset_v2.py — 从 truth-merged（MANIFEST 权威族/等级）建训练集 + **按界面组切分**。

与旧 `build_dataset.py` 的差别（都是为了避免已知事故）：
  1. **族读 MANIFEST 的 `family`**（perception 交付口径），读到缺失/NONE 就跳过该帧并报数，**不猜**；
  2. **界面组**：同一界面的多张连拍（GT 互相重合 ≥0.8）先聚成一组，**整组同侧**——
     禁止"同界面帧一帧在训练一帧在验证"（CALIBER-v2 要求；实测 m01–m08、w01–w08 各是 1 个界面）；
  3. **质量等级过滤**：`--grades A,B`（默认 A,B，C 级已定案不修）；
  4. **快照**：把用到的 truth JSON + MANIFEST 拷进 `dataset-v2/truth-used/` 并记 sha256，
     训练/评测只认这份快照（truth-merged 还在增长，不锁就会中途变数据）；
  5. 类别含 `glyph_icon`；`unknown` 默认不计分也不进训练（可用 `--infer-unknown` 按旧口径猜）。

用法：
  python3 .scratch/gui-detect/build_dataset_v2.py                 # 默认 val：菜单界面组 + editor 全族 + w07/w08
  python3 .scratch/gui-detect/build_dataset_v2.py --val-groups m,w-last --val-families editor
  python3 .scratch/gui-detect/build_dataset_v2.py --list-groups    # 只列界面组与建议切分
"""
import argparse
import glob
import hashlib
import json
import os
import re
import shutil
import sys
from collections import Counter, defaultdict

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
CORPUS = os.path.join(ROOT, ".scratch", "gui-corpus")
OUT = os.path.join(ROOT, ".scratch", "gui-detect", "dataset-v2")
KINDS = ["panel", "button", "tile", "chip", "icon", "card", "avatar", "glyph_icon"]  # row 走条带，不进热斑
IMG_DIRS = [CORPUS, CORPUS + "/truth-v9-fixed", CORPUS + "/truth-v8-game", CORPUS + "/truth-v8-editor",
            CORPUS + "/truth-v8-fix", CORPUS + "/truth-v5", CORPUS + "/truth-v6", CORPUS + "/truth-v7",
            CORPUS + "/capture-2026-10-18/reps", CORPUS + "/video-20261018/reps",
            os.path.join(ROOT, ".scratch", "gui-collect", "menu", "frames"),
            os.path.join(ROOT, ".scratch", "gui-collect", "world", "frames")]


def iou(a, b):
    ax0, ay0, ax1, ay1 = a[0], a[1], a[0] + a[2], a[1] + a[3]
    bx0, by0, bx1, by1 = b[0], b[1], b[0] + b[2], b[1] + b[3]
    iw = max(0.0, min(ax1, bx1) - max(ax0, bx0))
    ih = max(0.0, min(ay1, by1) - max(ay0, by0))
    inter = iw * ih
    ua = (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - inter
    return inter / ua if ua > 0 else 0.0


def overlap_ratio(a, b, thr=0.8):
    """a 的框有多少比例能在 b 里找到同 kind IoU≥thr 的对应（帧级同界面判据）。"""
    if not a["objects"]:
        return 0.0
    hit = 0
    for o in a["objects"]:
        if any(g["kind"] == o["kind"] and iou(o["bbox"], g["bbox"]) >= thr
               for g in b["objects"]):
            hit += 1
    return hit / len(a["objects"])


def find_image(stem):
    for d in IMG_DIRS:
        for ext in (".png", ".jpg"):
            p = os.path.join(d, stem + ext)
            if os.path.exists(p):
                return p
    return None


def load(truth_dir, grades, infer_unknown):
    man_p = os.path.join(truth_dir, "MANIFEST.json")
    if not os.path.exists(man_p):
        raise SystemExit(f"缺 MANIFEST.json：{man_p}（族/等级必须来自 MANIFEST，不猜）")
    man = json.load(open(man_p, encoding="utf-8"))
    sha = hashlib.sha256(open(man_p, "rb").read()).hexdigest()[:16]
    frames, skipped = [], Counter()
    for stem, ent in sorted(man.items()):
        fam = ent.get("family")
        grade = ent.get("quality_grade")
        if not fam or str(fam).upper() in ("NONE", "UNKNOWN", ""):
            skipped["no_family"] += 1
            continue
        if grades and (grade or "").upper() not in grades:
            skipped[f"grade_{grade}"] += 1
            continue
        jf = os.path.join(truth_dir, stem + ".json")
        if not os.path.exists(jf):
            skipped["no_json"] += 1
            continue
        doc = json.load(open(jf, encoding="utf-8"))
        img = find_image(stem)
        if not img:
            skipped["no_image"] += 1
            continue
        W, H = (doc.get("size") or [2560, 1440])[:2]
        objs = []
        for o in doc.get("objects") or []:
            b = o.get("bbox")
            if not (isinstance(b, list) and len(b) == 4):
                continue
            kind = o.get("kind") or "unknown"
            if kind == "unknown":
                if not infer_unknown:
                    skipped["unknown"] += 1
                    continue
                x, y, w, h = [float(v) for v in b]
                area = w * h / (W * H)
                kind = ("panel" if area > 0.15 else "row" if (h < 130 and w > 3 * h)
                        else "icon" if (w < 70 and h < 70) else "tile")
            objs.append({"bbox": [float(v) for v in b], "kind": kind,
                         "text": o.get("text") or [], "note": o.get("note") or ""})
        frames.append({"stem": stem, "image": img, "W": W, "H": H, "objects": objs,
                       "family": fam, "grade": grade, "layout": doc.get("layout") or "",
                       "truth": jf, "area_max": ent.get("area_max_frac"),
                       "audit_uncovered": ent.get("audit_uncovered")})
    return frames, skipped, man_p, sha


def group_interfaces(frames, thr=0.8):
    """同界面连拍聚组：帧对重合率 ≥thr 连边 → 连通分量 = 界面组。"""
    parent = list(range(len(frames)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    pairs = []
    for i in range(len(frames)):
        for j in range(i + 1, len(frames)):
            ra, rb = find(i), find(j)
            if ra == rb:
                continue
            r = max(overlap_ratio(frames[i], frames[j], thr), overlap_ratio(frames[j], frames[i], thr))
            if r >= thr:
                union(i, j)
                pairs.append((frames[i]["stem"], frames[j]["stem"], round(r, 2)))
    groups = defaultdict(list)
    for i in range(len(frames)):
        groups[find(i)].append(frames[i]["stem"])
    out = sorted(groups.values(), key=lambda g: (-len(g), g[0]))
    return out, pairs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--truth", default=os.path.join(CORPUS, "truth-merged"))
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--grades", default="A,B", help="只收这些质量等级；空串=全部")
    ap.add_argument("--infer-unknown", action="store_true")
    ap.add_argument("--val-families", default="",
                    help="整族留出的族（逗号分隔；--val-mode family 时用）")
    ap.add_argument("--val-groups", default="m*,w-last,c37*,c40*",
                    help="留出的界面组（逗号）：`m*`=stem 前缀匹配的整组；`r044*`=同；"
                         "`w-last`=该组最后 2 帧（同界面帧级切分，只为让 glyph_icon 有训练样本）")
    ap.add_argument("--val-mode", choices=["group", "family"], default="group",
                    help="group=每族留一个没见过的界面组（推荐，v2/v3 公平可比）；"
                         "family=整族留出（严格，但 v2 见过该族帧，比较不公平）")
    ap.add_argument("--list-groups", action="store_true")
    args = ap.parse_args()

    grades = {g.strip().upper() for g in args.grades.split(",") if g.strip()}
    frames, skipped, man_p, sha = load(args.truth, grades, args.infer_unknown)
    if not frames:
        raise SystemExit("没有可用帧")
    groups, pairs = group_interfaces(frames)
    fam_of = {f["stem"]: f["family"] for f in frames}

    if args.list_groups:
        print(f"帧={len(frames)} 界面组={len(groups)}  MANIFEST sha={sha}")
        for g in groups:
            fams = Counter(fam_of[s] for s in g)
            print(f"  [{len(g):2d} 帧] {','.join(f'{k}×{v}' for k, v in fams.items())}  {g[:6]}")
        return 0

    val_groups = [g.strip() for g in args.val_groups.split(",") if g.strip()]
    val_fams = {f.strip() for f in args.val_families.split(",") if f.strip()}
    train, val, why = [], [], {}
    for g in groups:
        fams = {fam_of[s] for s in g}
        mode = "all" if (fams & val_fams) else None
        tag = "family:" + ",".join(sorted(fams & val_fams)) if mode else ""
        for pat in val_groups:
            if pat.endswith("-last") and all(s.startswith(pat[:-5]) for s in g):
                mode, tag = "last", f"group:{pat}(同界面帧级切分)"
                break
            if pat.endswith("*") and any(s.startswith(pat[:-1]) for s in g):
                mode, tag = "all", f"group:{pat}"
                break
            if pat in g:
                mode, tag = "all", f"group:{pat}"
                break
        if mode == "last":
            for k, s in enumerate(g):
                (val if k >= len(g) - 2 else train).append(s)
                why[s] = tag if k >= len(g) - 2 else "train(同界面组内)"
            continue
        for s in g:
            (val if mode == "all" else train).append(s)
            why[s] = tag or "train"
    train, val = sorted(set(train)), sorted(set(val))
    assert not (set(train) & set(val)), "同一帧被分到两侧"

    # ---- 快照：只用到的 JSON + MANIFEST（训练/评测只认快照）
    snap = os.path.join(args.out, "truth-used")
    os.makedirs(snap, exist_ok=True)
    for s in train + val:
        fr = next(f for f in frames if f["stem"] == s)
        shutil.copyfile(fr["truth"], os.path.join(snap, s + ".json"))
    shutil.copyfile(man_p, os.path.join(snap, "MANIFEST.json"))

    by_stem = {f["stem"]: f for f in frames}
    images, anns = [], []
    cats = {k: i + 1 for i, k in enumerate(KINDS)}
    for iid, stem in enumerate(train + val):
        fr = by_stem[stem]
        images.append({"id": iid, "file_name": fr["image"], "width": fr["W"], "height": fr["H"],
                       "family": fr["family"], "grade": fr["grade"], "split": "train" if stem in train else "val",
                       "truth": os.path.relpath(fr["truth"], ROOT), "layout": fr["layout"],
                       "area_max": fr["area_max"], "audit_uncovered": fr["audit_uncovered"]})
        for o in fr["objects"]:
            anns.append({"id": len(anns) + 1, "image_id": iid, "kind": o["kind"],
                         "bbox": o["bbox"], "area": o["bbox"][2] * o["bbox"][3],
                         "text": o["text"], "note": o["note"]})
    os.makedirs(args.out, exist_ok=True)
    json.dump({"images": images, "annotations": anns,
               "categories": [{"id": v, "name": k} for k, v in cats.items()],
               "meta": {"kinds": KINDS, "row_strip": True, "source": args.truth,
                        "manifest_sha": sha, "grades": sorted(grades),
                        "infer_unknown": args.infer_unknown,
                        "built_at": __import__("time").strftime("%Y-%m-%d %H:%M:%S")}},
              open(os.path.join(args.out, "annotations.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    split = {"train": train, "val": val, "why": why,
             "groups": [{"frames": g, "family": sorted({fam_of[s] for s in g})} for g in groups],
             "val_families": sorted(val_fams), "val_groups": sorted(val_groups),
             "manifest_sha": sha, "skipped": dict(skipped)}
    json.dump(split, open(os.path.join(args.out, "split.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    old_ds = os.path.join(ROOT, ".scratch", "gui-detect", "dataset", "annotations.json")
    seen = set()
    if os.path.exists(old_ds):
        od = json.load(open(old_ds, encoding="utf-8"))
        seen = {os.path.splitext(os.path.basename(im["file_name"]))[0] for im in od["images"]}

    def stats(ss):
        fs = [by_stem[s] for s in ss]
        k = Counter(o["kind"] for f in fs for o in f["objects"])
        return len(fs), sum(len(f["objects"]) for f in fs), dict(sorted(k.items()))
    tn, tu, tk = stats(train)
    vn, vu, vk = stats(val)
    lines = [f"# dataset-v2 切分（MANIFEST sha={sha}）", "",
             f"- 输入 `{os.path.relpath(args.truth, ROOT)}`｜等级 {sorted(grades)}｜"
             f"跳过 {dict(skipped)}",
             f"- 界面组 {len(groups)} 个（同组整组同侧；`w-last` 例外=同界面帧级切分）",
             f"- **train** {tn} 帧 / {tu} 单元：{tk}",
             f"- **val** {vn} 帧 / {vu} 单元：{vk}",
             f"- v2 训练集见过的帧：train {sum(1 for x in train if x in seen)}/{tn}，"
             f"**val {sum(1 for x in val if x in seen)}/{vn}**（val 必须=0 才是公平对照）",
             "", "## 留出理由", ""]
    for s in val:
        lines.append(f"- val `{s}`（{by_stem[s]['family']}）← {why[s]}")
    lines.append("")
    unseen = [x for x in val if x not in seen]
    lines.append(f"## 公平性：val 里 v2 未见过的帧 {len(unseen)}/{len(val)}")
    if len(unseen) != len(val):
        lines.append(f"⚠️ 这些 val 帧 v2 训练时见过，读数不代表泛化：{[x for x in val if x in seen]}")
    lines.append("")
    lines.append("## 训练集各族")
    for fam in sorted({by_stem[s]["family"] for s in train}):
        ss = [s for s in train if by_stem[s]["family"] == fam]
        lines.append(f"- {fam}: {len(ss)} 帧")
    lines.append("")
    lines.append("## 同界面组（≥2 帧）")
    for g in groups:
        if len(g) > 1:
            lines.append(f"- {g}")
    open(os.path.join(args.out, "SPLIT.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print(f"[dataset] train={tn} 帧/{tu} 单元  val={vn} 帧/{vu} 单元  组={len(groups)}  sha={sha}")
    print(f"[dataset] val = {val}")
    print(f"[dataset] 落盘 {os.path.relpath(args.out, ROOT)}/{{annotations.json,split.json,SPLIT.md,truth-used/}}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
