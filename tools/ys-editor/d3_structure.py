#!/usr/bin/env python3
"""d3_structure.py — D3 结构层 v1（纯几何，不学习）。

v0 → v1 的三处改动（依据 2026-10-19 标注员关系真值）：
  1. **pitch 按组估**，不是全帧一个常数：组内 pitch 标准差实测 7/9 组 ≤1px，
     组间 166~416px。全帧中位数会把组间差异当噪声（r028 59 vs 48）。
     做法：先找"节奏链"（同轴、同尺寸、首沿对齐、等距），再逐链估 pitch。
  2. **槽位补全**：链内等距缺位（gap = m*pitch）补空槽，宽高由相邻成员推断。
  3. **容器推断**：容器 = 组并集 + 内边距；不再每行一个容器（v0 40 个偏多）。
     类别修正用「同链尺寸 + 面积比 + 同行高度」。

输入：D2 输出同构 JSON `{objects:[{id,bbox,kind,score?}]}`（bbox=[x,y,w,h]）。
输出：
  { rows:[...], chains:[{id,kind,axis,members,bbox,pitch,pitch_spread,gap,missing}],
    groups:[{id,kind,bbox,members}], group_of:{obj_id:gid}, container_of:{obj_id:cid},
    kind_fixes:[...], missing_slots:[...], pitch:..., pitch_method:... }

用法（CLI 与 v0 兼容）：
  python3 .scratch/gui-detect/d3_structure.py --truth-dir <dir> [--json-out f]
  python3 .scratch/gui-detect/d3_structure.py --truth-dir <dir> --eval   # 自带 parent P/R
"""
import argparse
import glob
import json
import os
import statistics as st

AXIS_Y, AXIS_X = "y", "x"
USE_ROWS = True   # 行对象当父（真值里元素常挂在 row 上，见 D3.md §2.1）


# ---------------------------------------------------------------- 基础几何
def iou(a, b):
    ax0, ay0, ax1, ay1 = a[0], a[1], a[0] + a[2], a[1] + a[3]
    bx0, by0, bx1, by1 = b[0], b[1], b[0] + b[2], b[1] + b[3]
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    iw, ih = max(0, ix1 - ix0), max(0, iy1 - iy0)
    inter = iw * ih
    ua = (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - inter
    return inter / ua if ua > 0 else 0.0


def contains(outer, inner, tol=2):
    ox, oy, ow, oh = outer
    ix, iy, iw, ih = inner
    return (ix >= ox - tol and iy >= oy - tol and
            ix + iw <= ox + ow + tol and iy + ih <= oy + oh + tol)


def union(boxes):
    xs = [b[0] for b in boxes]
    ys = [b[1] for b in boxes]
    xe = [b[0] + b[2] for b in boxes]
    ye = [b[1] + b[3] for b in boxes]
    return [min(xs), min(ys), max(xe) - min(xs), max(ye) - min(ys)]


def pad_box(b, pad):
    return [b[0] - pad, b[1] - pad, b[2] + 2 * pad, b[3] + 2 * pad]


def _cy(o):
    return o["bbox"][1] + o["bbox"][3] / 2.0


def _cx(o):
    return o["bbox"][0] + o["bbox"][2] / 2.0


def _area(o):
    return max(1.0, o["bbox"][2] * o["bbox"][3])


def _med(v):
    return st.median(v) if v else 0.0


# ---------------------------------------------------------------- 行聚类
def cluster_rows(objs, y_tol=10, h_tol=0.30, min_members=2):
    """按 y 中心聚类成行。返回 [[obj,...], ...]（每行按 x 排序）。"""
    items = sorted(objs, key=_cy)
    rows = []
    for o in items:
        cy, h = _cy(o), o["bbox"][3]
        placed = False
        for r in rows:
            ry = _med([_cy(x) for x in r])
            rh = _med([x["bbox"][3] for x in r])
            if abs(cy - ry) <= max(y_tol, h_tol * max(h, rh)):
                r.append(o)
                placed = True
                break
        if not placed:
            rows.append([o])
    for r in rows:
        r.sort(key=lambda o: o["bbox"][0])
    return [r for r in rows if len(r) >= min_members]


def row_pitch(rows):
    """v0 口径：行中心相邻间距的中位数（保留用于对照）。"""
    if len(rows) < 3:
        return None, None
    tops = sorted(_med([_cy(o) for o in r]) for r in rows)
    gaps = [b - a for a, b in zip(tops, tops[1:]) if b - a > 4]
    if len(gaps) < 2:
        return None, None
    return st.median(gaps), st.pstdev(gaps)


# ---------------------------------------------------------------- 节奏链
def _axis_vals(o, axis):
    x, y, w, h = o["bbox"]
    return (y, y + h) if axis == AXIS_Y else (x, x + w)


def _cross(o, axis):
    """交叉轴：首沿 / 尺寸 / 长度。"""
    x, y, w, h = o["bbox"]
    if axis == AXIS_Y:
        return x, w, w, h  # 首沿 x0, 交叉尺寸 w, 主轴长度 w, 交叉长度 h
    return y, h, h, w


def _axis_center(o, axis):
    return _cy(o) if axis == AXIS_Y else _cx(o)


def _axis_span(o, axis):
    return o["bbox"][3] if axis == AXIS_Y else o["bbox"][2]


def _cross_center(o, axis):
    return _cx(o) if axis == AXIS_Y else _cy(o)


def _size_ok(a, b, cross_sizes, rel=0.08):
    """同尺寸：交叉轴长度差 ≤ rel（truth 实测 ≤5%，给 D2 噪声留 3%）。"""
    la, lb = cross_sizes[a], cross_sizes[b]
    return abs(la - lb) <= rel * max(la, lb)


def _align_ok(a, b, align, rel_px=6.0, rel=0.05):
    return abs(align[a] - align[b]) <= max(rel_px, rel * max(1.0, align[a], align[b]))


def find_chains(objs, axis=AXIS_Y, min_len=3, size_rel=0.08, align_px=6.0,
                pitch_rel=0.03, max_missing_step=3):
    """在给定轴上找"同尺寸 + 首沿对齐 + 等距"的链（允许中间缺位）。

    返回 [{members:[obj], steps:[(k, gap, pitch)], pitch, gaps, missing:[k]}]
    """
    cand = [o for o in objs if o["bbox"][2] > 4 and o["bbox"][3] > 4]
    cross = {o["id"]: _cross(o, axis)[1] for o in cand}
    align = {o["id"]: _cross(o, axis)[0] for o in cand}
    centers = {o["id"]: _axis_center(o, axis) for o in cand}
    order = sorted(cand, key=lambda o: centers[o["id"]])
    chains = []
    used_seed = set()
    n = len(order)
    for i in range(n):
        for j in range(i + 1, n):
            a, b = order[i], order[j]
            if not _size_ok(a["id"], b["id"], cross, size_rel):
                continue
            if not _align_ok(a["id"], b["id"], align, align_px):
                continue
            p0 = centers[b["id"]] - centers[a["id"]]
            if p0 < 6:
                continue
            seed = (a["id"], b["id"], round(p0, 1))
            if seed in used_seed:
                continue
            used_seed.add(seed)
            mem = [a, b]
            gaps = [p0]
            missing = []
            cur = b
            while True:
                above = [o for o in order
                         if centers[o["id"]] - centers[cur["id"]] > 0.4 * p0 and
                         _size_ok(cur["id"], o["id"], cross, size_rel) and
                         _align_ok(cur["id"], o["id"], align, align_px)]
                if not above:
                    break
                nxt = above[0]
                d = centers[nxt["id"]] - centers[cur["id"]]
                m = max(1, int(round(d / p0)))
                if m > max_missing_step:
                    break
                if abs(d - m * p0) > max(2.0, pitch_rel * m * p0):
                    break
                if m > 1:
                    missing.extend(range(len(mem) - 1 + 1, len(mem) - 1 + m))
                mem.append(nxt)
                gaps.append(d / m)
                cur = nxt
            if len(mem) >= min_len:
                chains.append({"axis": axis, "members": mem, "gaps": gaps,
                               "missing": missing, "pitch": _med(gaps)})
    return chains


def _chain_quality(ch):
    """truth 判据：组内 pitch 标准差 ≤2%。D2 噪声下放宽到 5%。"""
    p = ch["pitch"]
    sd = st.pstdev(ch["gaps"]) if len(ch["gaps"]) > 1 else 0.0
    ch["pitch_spread"] = sd
    ch["regular"] = p > 0 and sd <= max(2.0, 0.05 * p)
    return ch["regular"]


def _dedupe_chains(chains):
    """保留极大链：成员集合互为子集时留长的；同源链去重。"""
    chains = [c for c in chains if _chain_quality(c)]
    chains.sort(key=lambda c: (len(c["members"]), -c["pitch_spread"]), reverse=True)
    out = []
    for c in chains:
        ids = {o["id"] for o in c["members"]}
        if any(ids <= {o["id"] for o in k["members"]} for k in out):
            continue
        out.append(c)
    return out


def _merge_perpendicular(chains):
    """交叠的垂直链 + 水平链 → 同一个 grid 组（r003 4×5 格阵就是这种）。"""
    parent = list(range(len(chains)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def uni(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    memsets = [{o["id"] for o in c["members"]} for c in chains]
    for i in range(len(chains)):
        for j in range(i + 1, len(chains)):
            if chains[i]["axis"] == chains[j]["axis"]:
                continue
            if memsets[i] & memsets[j]:
                uni(i, j)
    buckets = {}
    for i in range(len(chains)):
        buckets.setdefault(find(i), []).append(i)
    groups = []
    for root, idxs in buckets.items():
        if len(idxs) == 1:
            groups.append(chains[idxs[0]])
            continue
        mem = {}
        for i in idxs:
            for o in chains[i]["members"]:
                mem[o["id"]] = o
        axes = {chains[i]["axis"]: chains[i] for i in idxs}
        vertical = axes.get(AXIS_Y)
        horizontal = axes.get(AXIS_X)
        g = {"axis": "grid", "members": list(mem.values()),
             "pitch": vertical["pitch"] if vertical else (horizontal["pitch"] if horizontal else None),
             "col_pitch": horizontal["pitch"] if horizontal else None,
             "gaps": (vertical or horizontal)["gaps"],
             "pitch_spread": min(c["pitch_spread"] for c in (chains[i] for i in idxs)),
             "missing": []}
        groups.append(g)
    return groups


# ---------------------------------------------------------------- 组/容器
def build_groups(objs):
    """节奏组：垂直链 + 水平链 + 垂直/水平交叉合并成 grid。"""
    v = _dedupe_chains(find_chains(objs, AXIS_Y))
    h = _dedupe_chains(find_chains(objs, AXIS_X))
    groups = _merge_perpendicular(v + h)
    for g in groups:
        if "bbox" not in g:
            g["bbox"] = union([o["bbox"] for o in g["members"]])
    groups.sort(key=lambda g: (g["bbox"][1], g["bbox"][0]))
    for i, g in enumerate(groups):
        g["id"] = f"G{i}"
        g["kind"] = "grid" if g["axis"] == "grid" else (
            "row_stack" if g["axis"] == AXIS_Y else "col_stack")
    return groups


def infer_containers(objs, groups, frame_size, rows=None, pad_frac=0.03):
    """容器 = 检测器给的 panel 框 + 组的竖排并集（+内边距）+ 行带（父层级的一档）。

    rows 给定时，每个行带（≥2 成员）也成为一个容器：真值里元素常直接挂在 **row 对象**上
    （r021 的 11..17 各带 3 个子件），只有 panel 能当父时这层配对会整段丢掉 → 编辑器 R 卡 0.54。
    行容器的面积小于 panel，`assign_containers` 取"包含它的最小容器"时自然优先命中行。
    """
    W, H = frame_size
    out = []
    for o in objs:
        b = o["bbox"]
        if o.get("kind") == "panel" and b[2] * b[3] > 0.004 * W * H:
            out.append({"kind": "panel", "bbox": b, "members": [str(o["id"])], "src": "detected"})
    # 组并集：横向重叠 ≥50% 且竖向间距 ≤1.2*组 pitch 的相邻组并成容器
    gs = sorted(groups, key=lambda g: g["bbox"][1])
    cur = None
    for g in gs:
        b = g["bbox"]
        if cur is None:
            cur = {"boxes": [b], "members": [str(o["id"]) for o in g["members"]]}
            continue
        cb = union(cur["boxes"])
        ov = max(0, min(cb[0] + cb[2], b[0] + b[2]) - max(cb[0], b[0]))
        ovr = ov / max(1.0, min(cb[2], b[2]))
        vgap = b[1] - (cb[1] + cb[3])
        p = g.get("pitch") or 0
        if ovr >= 0.5 and vgap <= max(1.2 * p, 1.2 * cb[3] / max(1, len(cur["boxes"]))):
            cur["boxes"].append(b)
            cur["members"].extend(str(o["id"]) for o in g["members"])
            cur["members"] = list(dict.fromkeys(cur["members"]))
        else:
            out.append({"kind": "group_union", "bbox": union(cur["boxes"]),
                        "members": cur["members"], "src": "inferred"})
            cur = {"boxes": [b], "members": [str(o["id"]) for o in g["members"]]}
    if cur:
        out.append({"kind": "group_union", "bbox": union(cur["boxes"]),
                    "members": cur["members"], "src": "inferred"})
    if rows:   # 只认"检测到的 row 对象"；合成行带会把 panel 的子件按行切碎（实测 F1 0.64→0.34）
        for c in rows:
            b = c["bbox"]
            if b[2] * b[3] > 0.25 * W * H:
                continue
            kids = [str(o["id"]) for o in objs
                    if contains(b, o["bbox"], tol=3) and o is not c]
            if len(kids) < 2:
                continue
            out.append({"kind": "row", "bbox": b, "members": kids, "src": "row", "self": str(c["id"])})
    # 加内边距 + 去重（同框只留一个，优先 detected）
    for c in out:
        if c["src"] == "row":
            c["bbox_unpadded"] = c["bbox"]
            continue
        pad = max(8.0, pad_frac * max(c["bbox"][2], c["bbox"][3]))
        c["bbox_unpadded"] = c["bbox"]
        c["bbox"] = [round(v, 1) for v in pad_box(c["bbox"], pad)]
    dedup = []
    for c in sorted(out, key=lambda c: 0 if c["src"] == "detected" else 1):
        if any(iou(c["bbox"], d["bbox"]) > 0.85 for d in dedup):
            continue
        dedup.append(c)
    # 丢弃整屏底板（面积 ≥75% 画面）：它是背景不是"分组"，留着会吞掉所有配对
    frame_area = W * H
    dedup = [c for c in dedup if c["bbox"][2] * c["bbox"][3] < 0.75 * frame_area]
    for i, c in enumerate(dedup):
        c["id"] = f"C{i}"
    return dedup


def assign_containers(objs, containers, row_priority=True):
    """每个对象归到父容器。优先级：**非行容器（panel/并集）> 行容器**，同级取面积最小。

    依据实测（18 帧逐帧对照，见 D3.md §2.1）：
      - 只有在"没有 panel 容器"的地方，行对象才是真父（r021 好友列表 0.49→0.59、r044 0.39→0.50）；
      - 一旦有 panel 容器，再切到行会把跨行同父配对打断（r022 0.87→0.56、r045 0.52→0.26）。
    """
    out = {}
    # 优先级：检测到的 panel（真值里大多数父就是它）> 推断的组并集 > 行对象；同级取面积最小
    def rank(c, rp=row_priority):
        tier = 0 if c["src"] == "detected" else (2 if c["kind"] == "row" else 1)
        return (tier, _area(c))
    for o in objs:
        best = None
        for c in containers:
            if contains(c["bbox"], o["bbox"], tol=4):
                if best is None or rank(c) < rank(best):
                    best = c
        if best is not None and best["members"] != [str(o["id"])]:
            out[str(o["id"])] = best["id"]
    return out


# ---------------------------------------------------------------- 类别修正
def fix_kind(o, row_hts, group, container):
    """icon/tile/chip 互串修正（只在这三类之间改，button/row/panel/card/avatar 不动）。

    依据（D2 预测 vs truth 的实测混淆，77 个匹配框）：
      - chip→tile n=4：chip 框 143×93（ar 1.55），比同行其它件高一倍 → 其实是格子；
      - icon→tile / tile→icon：近方形但尺寸差一个档（≤72 vs ≥96）→ 按尺寸分档；
      - 反例：button 在工具栏里也是 40×40 小方块，**不能**用"小方件"判 icon（v0 误改 153 次）。
    """
    x, y, w, h = o["bbox"]
    k = o.get("kind")
    if k not in ("icon", "tile", "chip"):
        return None
    ar = w / max(1.0, h)
    rh = _med(row_hts) if row_hts else None
    # tile→chip：明显矮于同行、细长
    if k == "tile" and rh and h < 0.9 * rh and ar >= 2.2:
        return ("chip", f"tile 但 h={h:.0f}<0.9*row({rh:.0f}) ar={ar:.2f}")
    # chip→tile：明显高于同行且近方形（实测 143×93）
    if k == "chip" and rh and h >= 1.15 * rh and 0.8 <= ar <= 1.7 and w >= 96:
        return ("tile", f"chip 但 h={h:.0f}>=1.15*row({rh:.0f}) ar={ar:.2f}")
    # icon→tile：比 icon 档大得多，且近方形
    if k == "icon" and w >= 120 and h >= 90 and 0.85 <= ar <= 1.25:
        return ("tile", f"icon 但 {w:.0f}x{h:.0f} 超出 icon 档")
    # tile→icon：真的只有小方件尺寸
    if k == "tile" and w <= 72 and h <= 72 and 0.6 <= ar <= 1.7:
        return ("icon", f"tile 但仅 {w:.0f}x{h:.0f}")
    return None


# ---------------------------------------------------------------- 主分析


def _row_bbox(r, containers):
    """行是横向条带：x 方向应延伸到所在容器的左右沿（成员并集只是"检出的那几件"）。

    实测动机（2026-10-19 端到端）：服务输出的行与真值按整框 IoU 只有 0.07，
    但按 y 带匹配是 0.52 —— 差异全在 x 宽度（只检出部分成员 ⇒ 行框偏窄）。
    """
    b = union([o["bbox"] for o in r])
    cy = b[1] + b[3] / 2
    best = None
    for c in containers:
        cb = c["bbox"]
        if cb[1] - 2 <= cy <= cb[1] + cb[3] + 2 and cb[0] <= b[0] + 2 and cb[0] + cb[2] >= b[0] + b[2] - 2:
            if best is None or cb[2] * cb[3] < best[2] * best[3]:
                best = cb
    if best:
        return [int(best[0]), int(b[1]), int(best[2]), int(b[3])]
    return b

def analyze(frame, synth_drop_rows=0):
    objs = list(frame["objects"])
    if synth_drop_rows:
        objs = drop_rows(objs, synth_drop_rows)
    W, H = frame.get("size") or [2560, 1440]
    rows = cluster_rows(objs)
    pitch_med, spread_med = row_pitch(rows)

    groups = build_groups(objs)
    # 行内高度上下文
    row_of = {}
    for r in rows:
        for o in r:
            row_of[str(o["id"])] = r
    row_objs = [o for o in objs if o.get("kind") == "row"] if USE_ROWS else None
    containers = infer_containers(objs, groups, (W, H), row_objs)
    cont_of = assign_containers(objs, containers)
    gid_of_member = {}
    for g in groups:
        for o in g["members"]:
            gid_of_member[str(o["id"])] = g["id"]

    fixed = []
    for o in objs:
        rh = [x["bbox"][3] for x in row_of.get(str(o["id"]), []) if x is not o]
        g = next((g for g in groups if str(o["id"]) in {str(m["id"]) for m in g["members"]}), None)
        c = next((c for c in containers if c["id"] == cont_of.get(str(o["id"]))), None)
        r = fix_kind(o, rh, g, c)
        if r:
            fixed.append({"id": o["id"], "kind_before": o.get("kind"),
                          "kind_after": r[0], "reason": r[1]})

    # 槽位：每条节奏链内的等距缺位
    slots = []
    for g in groups:
        p = g.get("pitch")
        if not p or p < 8:
            continue
        sd = g.get("pitch_spread") or 0.0
        if sd > max(2.0, 0.15 * p):
            continue
        axis = g["axis"] if g["axis"] in (AXIS_Y, AXIS_X) else AXIS_Y
        cs = sorted(_axis_center(o, axis) for o in g["members"])
        presents = [0] + [int(round((c - cs[0]) / p)) for c in cs[1:]]
        order = dict(zip(presents, range(len(cs))))
        ks = sorted(set(presents))
        for a, b in zip(ks, ks[1:]):
            if b - a < 2:
                continue
            for k in range(a + 1, b):
                y = cs[0] + k * p
                ia, ib = order[a], order[b]
                ma, mb = g["members"][ia], g["members"][ib]
                hh = _med([ma["bbox"][3], mb["bbox"][3]])
                ww = _med([ma["bbox"][2], mb["bbox"][2]])
                if axis == AXIS_Y:
                    x0 = _med([ma["bbox"][0], mb["bbox"][0]])
                    bbox = [round(x0), round(y - hh / 2), round(ww), round(hh)]
                else:
                    y0 = _med([ma["bbox"][1], mb["bbox"][1]])
                    bbox = [round(y - ww / 2), round(y0), round(ww), round(hh)]
                slots.append({"y": round(y), "bbox": bbox, "group": g["id"],
                              "k": k, "pitch": round(p, 1), "reason": "链内等距缺位"})

    # 全帧 pitch（对外兼容）：取成员最多的链（同 pitch 的链合并计数）
    pitch_global = None
    pitch_method = "none"
    if groups:
        by_p = {}
        for g in groups:
            p = g.get("pitch")
            if not p:
                continue
            key = round(p / 4) * 4
            by_p.setdefault(key, []).append(g)
        if by_p:
            best = max(by_p.values(), key=lambda gs: sum(len(g["members"]) for g in gs))
            pitch_global = round(_med([g["pitch"] for g in best]), 2)
            pitch_method = "chain_mode"
    if pitch_global is None:
        pitch_global, pitch_method = pitch_med, "row_median"

    return {"rows": [{"bbox": _row_bbox(r, containers), "n": len(r),
                      "cy": round(_med([_cy(o) for o in r]), 1),
                      "members": [o["id"] for o in r]} for r in rows],
            "chains": [{"id": g["id"], "kind": g["kind"], "axis": g["axis"],
                        "bbox": g["bbox"], "members": [o["id"] for o in g["members"]],
                        "pitch": round(g["pitch"], 2) if g.get("pitch") else None,
                        "pitch_spread": round(g.get("pitch_spread", 0.0), 2),
                        "n": len(g["members"])} for g in groups],
            "groups": [{"id": c["id"], "kind": c["kind"], "bbox": c["bbox"],
                        "members": c["members"], "src": c["src"]} for c in containers],
            "container_of": cont_of, "group_of": gid_of_member,
            "pitch": pitch_global, "pitch_method": pitch_method,
            "pitch_median": pitch_med, "pitch_median_spread": spread_med,
            "kind_fixes": fixed, "missing_slots": slots}


def drop_rows(objs, n):
    """合成测试：按 y 中心删掉中间 n 个"行带"（每带 ≥2 对象）。"""
    rows = cluster_rows(objs)
    if len(rows) < n + 2:
        return objs
    mid = len(rows) // 2
    drop = set()
    for r in rows[mid - n // 2: mid - n // 2 + n]:
        drop |= {id(o) for o in r}
    return [o for o in objs if id(o) not in drop]


def eval_parent_pairs(frame, res):
    """自评：同父对象是否同组（配对 P/R/F1）。"""
    objs = {str(o["id"]): o for o in frame["objects"]}
    groups = {}
    for oid, o in objs.items():
        if o.get("parent") is not None:
            groups.setdefault(str(o["parent"]), set()).add(oid)
    pred = {}
    for oid in objs:
        gid = res["container_of"].get(oid) or res["group_of"].get(oid) or "solo:" + oid
        pred[oid] = gid
    tp = fp = fn = 0
    ids = [i for g in groups.values() for i in g]
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            same_truth = any(ids[i] in g and ids[j] in g for g in groups.values())
            same_pred = pred[ids[i]] == pred[ids[j]]
            if same_truth and same_pred:
                tp += 1
            elif same_pred:
                fp += 1
            elif same_truth:
                fn += 1
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f = 2 * p * r / (p + r) if p + r else 0.0
    return {"tp": tp, "fp": fp, "fn": fn, "p": round(p, 3), "r": round(r, 3), "f1": round(f, 3)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--truth-dir", required=True)
    ap.add_argument("--eval", action="store_true", help="对 parent 字段做配对 P/R/F1（干净输入自评）")
    ap.add_argument("--json-out", default="")
    ap.add_argument("--no-rows", action="store_true", help="关掉行对象当父（对照用）")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args()
    if a.no_rows:
        USE_ROWS = False
        globals()["USE_ROWS"] = False
    frames = {}
    for f in sorted(glob.glob(os.path.join(a.truth_dir, "*.json"))):
        if os.path.basename(f).startswith("_"):
            continue
        d = json.load(open(f, encoding="utf-8"))
        if not d.get("objects"):
            continue
        frames[os.path.splitext(os.path.basename(f))[0]] = (d, analyze(d))
    tot_chains = sum(len(v["chains"]) for _, v in frames.values())
    tot_groups = sum(len(v["groups"]) for _, v in frames.values())
    tot_fix = sum(len(v["kind_fixes"]) for _, v in frames.values())
    tot_slots = sum(len(v["missing_slots"]) for _, v in frames.values())
    print(f"帧={len(frames)}  节奏链={tot_chains}  容器={tot_groups}  "
          f"类别修正={tot_fix}  缺行槽={tot_slots}")
    for k, (d, v) in frames.items():
        extra = ""
        if a.eval:
            e = eval_parent_pairs(d, v)
            extra = f" parentP={e['p']} R={e['r']} F1={e['f1']}"
        if not a.quiet:
            print(f"  {k[:34]:<36} rows={len(v['rows']):<3} "
                  f"pitch={v['pitch']} chains={len(v['chains'])} "
                  f"containers={len(v['groups'])} fix={len(v['kind_fixes'])} "
                  f"slots={len(v['missing_slots'])}{extra}")
    if a.json_out:
        json.dump({k: v for k, (_, v) in frames.items()},
                  open(a.json_out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("->", a.json_out)


if __name__ == "__main__":
    main()
