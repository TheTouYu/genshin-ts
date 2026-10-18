#!/usr/bin/env python3
"""d3_structure.py — D3 结构层 v0（纯几何，先不学习）。

治三件事（全部来自反馈轮的实测失败）：
  1. **整栏/面板漏检** → 由成员并集推断容器（panel），补回检测器漏掉的区域对象；
  2. **不拆行** → 行聚类 + 等距节距（pitch）推断，把漏掉的行补成"槽位"；
  3. **icon/tile/chip 互串** → 用"父容器 + 面积比 + 同行高度"修正类别。

输入：truth 同构 JSON（objects: [{id,bbox,kind,parent}]）
输出：
  {groups:[{id,kind,bbox,members:[id]}], rows:[{bbox,pitch,n,members}], fixed:[{id,kind_before,kind_after,reason}]}

用法：
  python3 .scratch/gui-detect/d3_structure.py --truth-dir .scratch/gui-corpus/truth-v9-fixed --eval
"""
import argparse
import glob
import json
import os
import statistics as st


def iou(a, b):
    ax0, ay0, ax1, ay1 = a[0], a[1], a[0] + a[2], a[1] + a[3]
    bx0, by0, bx1, by1 = b[0], b[1], b[0] + b[2], b[1] + b[3]
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    iw, ih = max(0, ix1 - ix0), max(0, iy1 - iy0)
    inter = iw * ih
    ua = (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - inter
    return inter / ua if ua > 0 else 0


def contains(outer, inner, tol=2):
    ox, oy, ow, oh = outer
    ix, iy, iw, ih = inner
    return (ix >= ox - tol and iy >= oy - tol and ix + iw <= ox + ow + tol and iy + ih <= oy + oh + tol)


def union(boxes):
    xs = [b[0] for b in boxes]
    ys = [b[1] for b in boxes]
    xe = [b[0] + b[2] for b in boxes]
    ye = [b[1] + b[3] for b in boxes]
    return [min(xs), min(ys), max(xe) - min(xs), max(ye) - min(ys)]


def cluster_rows(objs, y_tol=12, h_tol=0.35):
    """按 y 中心与高度聚类成行。返回 [[obj,...], ...]（每行按 x 排序）。"""
    items = sorted(objs, key=lambda o: o["bbox"][1] + o["bbox"][3] / 2)
    rows = []
    for o in items:
        cy = o["bbox"][1] + o["bbox"][3] / 2
        h = o["bbox"][3]
        placed = False
        for r in rows:
            ry = st.median([x["bbox"][1] + x["bbox"][3] / 2 for x in r])
            rh = st.median([x["bbox"][3] for x in r])
            if abs(cy - ry) <= max(y_tol, h_tol * max(h, rh)):
                r.append(o)
                placed = True
                break
        if not placed:
            rows.append([o])
    for r in rows:
        r.sort(key=lambda o: o["bbox"][0])
    return [r for r in rows if len(r) >= 2]


def row_pitch(rows):
    """行与行之间的垂直节距（中位数 + 离散度）。"""
    if len(rows) < 3:
        return None, None
    tops = sorted(st.median([o["bbox"][1] for o in r]) for r in rows)
    gaps = [b - a for a, b in zip(tops, tops[1:]) if b - a > 4]
    if len(gaps) < 2:
        return None, None
    return st.median(gaps), (st.pstdev(gaps) if len(gaps) > 1 else 0.0)


def infer_containers(objs, min_members=3, pad=10):
    """把"被多个同族对象占据的矩形"推断成容器：候选 = 每行/每列并集。"""
    out = []
    rows = cluster_rows(objs)
    for r in rows:
        if len(r) < min_members:
            continue
        b = union([o["bbox"] for o in r])
        out.append({"kind": "row_group", "bbox": [b[0] - pad, b[1] - pad, b[2] + 2 * pad, b[3] + 2 * pad],
                    "members": [o["id"] for o in r]})
    # 垂直堆叠 ≥3 行 → 面板
    rows2 = sorted(out, key=lambda g: g["bbox"][1])
    if len(rows2) >= 3:
        xs = [g["bbox"][0] for g in rows2]
        if st.pstdev(xs) < 40:
            b = union([g["bbox"] for g in rows2])
            out.append({"kind": "panel_group", "bbox": [b[0] - pad, b[1] - pad, b[2] + 2 * pad, b[3] + 2 * pad],
                        "members": [m for g in rows2 for m in g["members"]]})
    return out


def fix_kind(o, container, row_heights):
    """icon/tile/chip 互串修正：小且方形 → icon；同行高度接近容器高度 → row；否则保持。"""
    x, y, w, h = o["bbox"]
    k = o.get("kind")
    if k not in ("icon", "tile", "chip"):
        return None
    ratio = w / max(1, h)
    area = w * h
    if w <= 64 and h <= 64 and 0.6 <= ratio <= 1.6:
        return ("icon", "小且近方形")
    if container and h >= 0.6 * container["bbox"][3] and w < 0.9 * container["bbox"][2]:
        return ("row", "高度接近容器且明显窄于容器")
    if row_heights and h > 1.6 * st.median(row_heights):
        return ("tile", "明显高于同行中位")
    return None


def analyze(frame):
    objs = frame["objects"]
    rows = cluster_rows(objs)
    pitch, spread = row_pitch(rows)
    containers = infer_containers(objs)
    fixed = []
    for o in objs:
        host = None
        for c in containers:
            if contains(c["bbox"], o["bbox"]) and c["kind"] == "panel_group":
                host = c
                break
        rh = [x["bbox"][3] for r in rows if o in r for x in r]
        r = fix_kind(o, host, rh)
        if r:
            fixed.append({"id": o["id"], "kind_before": o.get("kind"), "kind_after": r[0], "reason": r[1]})
    # 槽位补全：若 pitch 稳定，统计每行相对首行的偏移，缺位则给出建议槽位
    slots = []
    if pitch and spread is not None and spread < max(6, pitch * 0.15) and len(rows) >= 3:
        tops = sorted(st.median([o["bbox"][1] for o in r]) for r in rows)
        y0 = tops[0]
        present = {round((t - y0) / pitch) for t in tops}
        for k in range(0, max(present) + 1):
            if k not in present:
                slots.append({"y": round(y0 + k * pitch), "reason": "等距缺行"})
    return {"rows": [{"bbox": union([o["bbox"] for o in r]), "n": len(r),
                      "members": [o["id"] for o in r]} for r in rows],
            "groups": containers, "pitch": pitch, "pitch_spread": spread,
            "kind_fixes": fixed, "missing_slots": slots}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--truth-dir", required=True)
    ap.add_argument("--eval", action="store_true", help="对 truth 里的 parent 字段评估分组一致性")
    ap.add_argument("--json-out", default="")
    a = ap.parse_args()
    frames = {}
    for f in sorted(glob.glob(os.path.join(a.truth_dir, "*.json"))):
        if os.path.basename(f).startswith("_"):
            continue
        d = json.load(open(f, encoding="utf-8"))
        if not d.get("objects"):
            continue
        stem = os.path.splitext(os.path.basename(f))[0]
        frames[stem] = analyze(d)

    # 汇总
    tot_rows = sum(len(v["rows"]) for v in frames.values())
    tot_groups = sum(len(v["groups"]) for v in frames.values())
    tot_fix = sum(len(v["kind_fixes"]) for v in frames.values())
    tot_slots = sum(len(v["missing_slots"]) for v in frames.values())
    print(f"帧={len(frames)}  行组={tot_rows}  容器={tot_groups}  类别修正={tot_fix}  缺行槽={tot_slots}")
    for k, v in list(frames.items())[:8]:
        print(f"  {k[:34]:<36} rows={len(v['rows']):<3} pitch={v['pitch'] and round(v['pitch'],1)} "
              f"spread={v['pitch_spread'] and round(v['pitch_spread'],1)} fix={len(v['kind_fixes'])} slots={len(v['missing_slots'])}")
    if a.json_out:
        json.dump(frames, open(a.json_out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("->", a.json_out)


if __name__ == "__main__":
    main()
