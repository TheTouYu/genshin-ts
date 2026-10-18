#!/usr/bin/env python3
"""标注漏检体检：用 OCR 文本框当探针，找"有文字但没有任何真值框覆盖"的成片区域。

原理：界面上的列表行/树节点/按钮几乎都带文字。若某块区域内 OCR 文本密集但
没有任何 truth 框与之重叠，极可能漏标（人眼"一眼扫过去"最容易漏的就是这种成片列表）。

用法:
  python3 .scratch/gui-corpus/tools/audit_truth.py \
      --truth-dir .scratch/gui-corpus/truth-v3 \
      --ocr-dir .scratch/gui-corpus/capture-2026-10-18/repjson
"""
import argparse
import glob
import json
import os
import sys
import re


def box_of(t):
    """把 OCR 框归一成 (x0,y0,x1,y1)。

    ⚠️ 第三个 bbox 口径陷阱（2026-10-19 实测）：本仓 OCR 的 `text[].bbox` 是 **xyxy**
    （同一对象另给 `w`/`h` 字段）。上一版按 `[x,y,w,h]` 解释 ⇒ 框被放大成 x..x+w，
    把"已标好"的行判成漏标（v6 首跑 r044 报 5 处未覆盖，全是这种假阳性）。
    这里用自带的 `w`/`h` 字段判定口径，缺字段时按 xyxy 兜底（与本仓 OCR 实测一致）。
    """
    b = t.get("bbox") or t.get("box")
    if not b or len(b) != 4:
        return None
    x, y, a, c = b
    ew, eh = t.get("w"), t.get("h")
    if isinstance(ew, (int, float)) and isinstance(eh, (int, float)):
        if abs((a - x) - ew) <= 2 and abs((c - y) - eh) <= 2:
            return [x, y, a, c]                 # xyxy
        if abs(a - ew) <= 2 and abs(c - eh) <= 2:
            return [x, y, x + a, y + c]         # xywh
    if a > x and c > y:
        return [x, y, a, c]                     # 兜底：xyxy
    return [x, y, x + a, y + c]


def union_cover(tb, tboxes, step=4):
    """文本框被**真值框并集**覆盖的比例（按 step 像素采样）。

    为什么要并集：OCR 会把相邻多行**粘成一个高框**（实测 `自定义` 高 231px，跨 5 个树行），
    单框最大化覆盖率永远 <0.6，会把"已逐行标注"误判成漏标。并集才对应"这块文字有没有被框住"。
    """
    x0, y0, x1, y1 = tb
    if x1 <= x0 or y1 <= y0:
        return 0.0
    tot = cov = 0
    for yy in range(int(y0), int(y1), step):
        for xx in range(int(x0), int(x1), step):
            tot += 1
            for b in tboxes:
                if b[0] <= xx <= b[2] and b[1] <= yy <= b[3]:
                    cov += 1
                    break
    return (cov / tot) if tot else 0.0


def overlap(a, b):
    ix0, iy0 = max(a[0], b[0]), max(a[1], b[1])
    ix1, iy1 = min(a[2], b[2]), min(a[3], b[3])
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    area = max(1.0, (b[2] - b[0]) * (b[3] - b[1]))
    return inter / area


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--truth-dir", required=True)
    ap.add_argument("--ocr-dir", required=True)
    ap.add_argument("--min-cover", type=float, default=0.6,
                    help="文本被真值框覆盖的比例低于该值即算疑似漏标")
    ap.add_argument("--json-out", default="")
    args = ap.parse_args()

    rows = []
    for tf in sorted(glob.glob(os.path.join(args.truth_dir, "*.json"))):
        stem = os.path.splitext(os.path.basename(tf))[0]
        if stem.startswith("_"):
            continue
        try:
            td = json.load(open(tf, encoding="utf-8"))
        except Exception:
            continue
        objs = td.get("objects") or []
        tboxes = []
        for o in objs:
            b = o.get("bbox")
            if b and len(b) == 4:
                x, y, w, h = b
                tboxes.append([x, y, x + w, y + h])
        ocr_f = os.path.join(args.ocr_dir, stem + ".json")
        if not os.path.exists(ocr_f):
            rows.append({"frame": stem, "ocr": None, "units": len(objs)})
            continue
        od = json.load(open(ocr_f, encoding="utf-8"))
        texts = od.get("text") or []
        # 帧尺寸：OCR 里存在**越界框**（实测 x1 可到 4572 > 2560），那是 OCR 自身的坏框，
        # 不该算进"漏标"；只统计落在帧内的文本框。
        W, H = (td.get("size") or [2560, 1440])[:2]
        HUD = re.compile(r'^(DXVK|FPS|GPU|min:|max:|UID|ms|fps|i9|\d+(\.\d+)?(\s*(ms|fps|%))?$|'
                         r'[|<>=×✓·:%0-9. \-–—]{1,6}$)')
        uncovered = []
        for t in texts:
            txt = (t.get("text") or "").strip()
            if not txt or HUD.match(txt):
                continue  # 宿主 HUD / 纯符号不计单元（truth/_rules.md 口径）
            tb = box_of(t)
            if not tb:
                continue
            if tb[2] > W + 2 or tb[3] > H + 2 or tb[0] < -2 or tb[1] < -2:
                continue  # 越界坏框（OCR 自身问题），不计漏标
            cover = union_cover(tb, tboxes)
            if cover < args.min_cover:
                uncovered.append({"text": t.get("text", "")[:24], "bbox": [round(v) for v in tb],
                                  "cover": round(cover, 2)})
        rows.append({"frame": stem, "ocr": len(texts), "units": len(objs),
                     "uncovered": len(uncovered), "samples": uncovered[:6]})

    tot_f, bad_f, tot_u = 0, 0, 0
    for r in rows:
        if r.get("ocr") is None:
            continue
        tot_f += 1
        tot_u += r.get("uncovered", 0)
        if r.get("uncovered", 0) >= 3:
            bad_f += 1
    print(f"帧={len(rows)}（有 OCR 的 {tot_f}）｜疑似漏标帧（>=3 处未覆盖文本）={bad_f}｜未覆盖文本合计={tot_u}")
    for r in sorted([x for x in rows if x.get("uncovered", 0)], key=lambda x: -x["uncovered"])[:12]:
        print(f"  {r['frame']:<18} units={r['units']:<3} ocr={r['ocr']:<3} 未覆盖={r['uncovered']:<3} 例："
              + " | ".join(f"{s['text']}({s['cover']})" for s in (r.get('samples') or [])[:3]))
    if args.json_out:
        json.dump(rows, open(args.json_out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
