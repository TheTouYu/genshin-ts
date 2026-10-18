#!/usr/bin/env python3
"""把分散的真值集（truth/truth-v2/truth-v3/truth-v4）汇成一份可直接训练的标注文件。

用法:
  python3 .scratch/gui-detect/build_dataset.py [--out .scratch/gui-detect/dataset]

产出:
  dataset/annotations.json   COCO 风格（images / annotations / categories）
  dataset/summary.md         逐族/逐 kind 统计 + 训练/验证切分建议
只读真值，不改原始文件。
"""
import argparse
import glob
import json
import os
import sys
from collections import Counter, defaultdict

KINDS = None


def find_image(stem, dirs):
    for d in dirs:
        for ext in (".png", ".jpg"):
            p = os.path.join(d, stem + ext)
            if os.path.exists(p):
                return p
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=".scratch/gui-detect/dataset")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    truth_dirs = [".scratch/gui-corpus/truth", ".scratch/gui-corpus/truth-v2",
                  ".scratch/gui-corpus/truth-v3", ".scratch/gui-corpus/truth-v4",
                  ".scratch/gui-corpus/truth-v5",
                  ".scratch/gui-corpus/truth-v6", ".scratch/gui-corpus/truth-v7"]
    img_dirs = [".scratch/gui-corpus", ".scratch/gui-corpus/truth-v2",
                ".scratch/gui-corpus/truth-v3", ".scratch/gui-corpus/truth-v4",
                ".scratch/gui-corpus/capture-2026-10-18/reps",
                ".scratch/gui-corpus/video-20261018/reps",
                ".scratch/gui-corpus/inbox/norm",
                ".scratch/gui-corpus/truth-v6", ".scratch/gui-corpus/truth-v7",
                ".scratch/gui-corpus/truth-v5", ".scratch/gui-corpus/truth-v4"]

    images, anns, cats = [], [], {}
    seen = {}
    kind_count = Counter()
    fam_count = defaultdict(int)
    missing, partial = [], []

    for td in truth_dirs:
        for jf in sorted(glob.glob(os.path.join(td, "*.json"))):
            stem = os.path.splitext(os.path.basename(jf))[0]
            if stem.startswith("_"):
                continue
            d = json.load(open(jf, encoding="utf-8"))
            objs = d.get("objects") or []
            if not objs:
                continue
            img = find_image(stem, img_dirs)
            if not img:
                missing.append(stem)
                continue
            if (d.get("_provenance") or {}).get("partial") or "部分标" in str(d.get("annotator", "")):
                partial.append(stem)
            if stem in seen:          # 同一帧多版本 → 只保留最后一次（v7 覆盖 v6 等）
                old = seen[stem]
                images[:] = [im for im in images if im["id"] != old]
                anns[:] = [a for a in anns if a["image_id"] != old]
                for im in images:
                    if im["id"] > old:
                        im["id"] -= 1
                for a in anns:
                    if a["image_id"] > old:
                        a["image_id"] -= 1
                for k in list(seen):
                    if seen[k] > old:
                        seen[k] -= 1
            iid = len(images) + 1
            seen[stem] = iid
            images.append({"id": iid, "file_name": img, "width": 2560, "height": 1440,
                           "truth": os.path.relpath(jf, "."), "layout": d.get("layout")})
            fam = (d.get("layout") or "unknown").split("（")[0].split("·")[0].strip()
            fam_count[fam] += 1
            for o in objs:
                k = o.get("kind") or "unknown"
                kind_count[k] += 1
                if k not in cats:
                    cats[k] = len(cats) + 1
                x, y, w, h = o["bbox"]
                anns.append({"id": len(anns) + 1, "image_id": iid, "category_id": cats[k],
                             "bbox": [x, y, w, h], "area": w * h, "iscrowd": 0,
                             "kind": k, "text": o.get("text")})

    coco = {"images": images, "annotations": anns,
            "categories": [{"id": v, "name": k} for k, v in cats.items()]}
    json.dump(coco, open(os.path.join(args.out, "annotations.json"), "w"),
              ensure_ascii=False, indent=1)

    lines = ["# 训练数据集摘要", "",
             f"- 图像: **{len(images)}**｜标注实例: **{len(anns)}**｜类别: {len(cats)}",
             f"- 缺图（真值存在但找不到原图）: {len(missing)} {missing[:8]}",
             f"- 部分标（不建议进主训练集）: {len(partial)} {partial[:8]}", "",
             "## 按 kind", ""]
    for k, v in kind_count.most_common():
        lines.append(f"- {k}: {v}")
    lines += ["", "## 按界面族（图像数）", ""]
    for k, v in sorted(fam_count.items(), key=lambda kv: -kv[1]):
        lines.append(f"- {k}: {v}")
    lines += ["", "## 切分建议", "",
              "- **按界面族切**（同族不同滚动位会泄漏，见 D384）：留 2–3 族做验证，其余训练；",
              "- 部分标帧（上面列出的）单列，不进主集；",
              "- 每族样本 < 30 个实例的先只进训练、不做验证（统计不稳定）。"]
    open(os.path.join(args.out, "summary.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print(f"images={len(images)} annotations={len(anns)} kinds={len(cats)} missing={len(missing)} partial={len(partial)}")
    print("->", os.path.join(args.out, "annotations.json"))


if __name__ == "__main__":
    sys.exit(main())
