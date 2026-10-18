#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""给 truth-v8-editor 的 4 帧补 parent 层级 + 顶层 groups（D3 结构层训练数据）。

规则（**lead 2026-10-19 裁决，勿按老口径改回去**）：
  · **页面级**面板（顶栏 / 左栏 / 视口 / 属性面板 / 时间轴窗口 / 工作区 / 窗口控制条）parent = null；
  · **嵌套子面板**（资源树滚动区、调色板列、弹窗子面板、属性面板内的分区框…）parent = 外层面板。
    这一条是实测裁决：若按"所有面板 parent 都 null"的字面口径，r026 = 38/44 = 86.4%、r040 = 84/97 = 86.6%，
    达不到 ≥90% 的结构覆盖率验收线；挂外层后 r026 93.2%、r040 96.9%，且层级链可顺着回到页面级区域。
  · 容器面积必须 > 对象面积 ×1.05（否则"左栏"与"资源树滚动区"会互相 90% 包含 → parent 自环，
    r026 曾出现 id8↔id12、r034 曾出现 id14↔id15 的自环，遍历父链会死循环）。
  · 行/卡片/按钮/图标/chip → parent = 其所属的**最小容器**（面板优先；轨道泳道这种"行容器"也允许，
    这样时间轴片段能挂到自己的轨道上）。
  · 找不到容器时按区域兜底：x<栏宽 → 左栏面板；x≥2070 → 属性面板；其余 → 视口/时间轴面板。
  · groups：每个容器一个组，kind = grid（子元素以 tile/card 为主）/ row_stack（以 row/chip 为主）/
    panel（其余）。members 首个元素是容器自身（保证"groups 覆盖全部对象"），其余为直接子元素。

用法：python3 _add_hierarchy.py            # 改 4 帧
      python3 _add_hierarchy.py --report   # 只打印覆盖率
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FRAMES = ["r026_snap_2026-10-19_00-27-05", "r034_snap_2026-10-19_00-31-33",
          "r040_snap_2026-10-19_00-36-18", "r044_snap_2026-10-19_00-37-57"]


def bb(o):
    x, y, w, h = o["bbox"]
    return x, y, x + w, y + h


def area(o):
    return max(0, o["bbox"][2]) * max(0, o["bbox"][3])


def contain_ratio(inner, outer):
    ix0, iy0 = max(inner[0], outer[0]), max(inner[1], outer[1])
    ix1, iy1 = min(inner[2], outer[2]), min(inner[3], outer[3])
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    a = (inner[2] - inner[0]) * (inner[3] - inner[1])
    return inter / a if a > 0 else 0.0


def union(objs):
    xs0 = min(o["bbox"][0] for o in objs)
    ys0 = min(o["bbox"][1] for o in objs)
    xs1 = max(o["bbox"][0] + o["bbox"][2] for o in objs)
    ys1 = max(o["bbox"][1] + o["bbox"][3] for o in objs)
    return [xs0, ys0, xs1 - xs0, ys1 - ys0]


def process(stem, write=True):
    p = os.path.join(HERE, stem + ".json")
    doc = json.load(open(p, encoding="utf-8"))
    objs = doc["objects"]
    by_id = {o["id"]: o for o in objs}
    W, H = doc.get("size") or [2560, 1440]

    # ---- 1. 候选容器：面板 + 面积足够大的行（轨道泳道）
    panels = [o for o in objs if o["kind"] == "panel"]
    lane_rows = [o for o in objs if o["kind"] == "row" and o["bbox"][2] >= 1200]
    containers = panels + lane_rows

    # ---- 2. 兜底区域（最大面板按位置索引）
    def fallback_for(o):
        cx = o["bbox"][0] + o["bbox"][2] / 2.0
        cy = o["bbox"][1] + o["bbox"][3] / 2.0
        cands = []
        for pn in panels:
            x0, y0, x1, y1 = bb(pn)
            if x0 <= cx <= x1 and y0 <= cy <= y1:
                cands.append(pn)
        if cands:
            return min(cands, key=lambda q: area(q))["id"]
        if cx < 600:
            left = [q for q in panels if q["bbox"][0] <= 4 and q["bbox"][3] > 800]
            if left:
                return min(left, key=lambda q: area(q))["id"]
        if cx >= 2000:
            right = [q for q in panels if q["bbox"][0] >= 1900]
            if right:
                return min(right, key=lambda q: area(q))["id"]
        return None

    # ---- 3. 逐对象定 parent
    changed = 0
    for o in objs:
        if o["kind"] != "panel" and o not in lane_rows:
            inn = bb(o)
            cands = [c for c in containers if c["id"] != o["id"]
                     and area(c) > area(o) * 1.05 and contain_ratio(inn, bb(c)) >= 0.8]
            if cands:
                newp = min(cands, key=lambda q: area(q))["id"]
            else:
                newp = fallback_for(o)
            if newp is not None:
                # 不允许把自己 也把自己当容器
                if newp == o["id"]:
                    newp = None
                if o.get("parent") != newp:
                    changed += 1
                o["parent"] = newp
    # 子面板 → 外层面板（顶级面板保持 null）
    for o in panels:
        inn = bb(o)
        cands = [c for c in panels if c["id"] != o["id"]
                 and area(c) > area(o) * 1.05 and contain_ratio(inn, bb(c)) >= 0.9]
        newp = min(cands, key=lambda q: area(q))["id"] if cands else None
        if o.get("parent") != newp:
            changed += 1
        o["parent"] = newp
    # 泳道行 → 时间轴窗口
    for o in lane_rows:
        cands = [c for c in panels if c["id"] != o["id"]
                 and area(c) > area(o) * 1.05 and contain_ratio(bb(o), bb(c)) >= 0.9]
        o["parent"] = min(cands, key=lambda q: area(q))["id"] if cands else None

    # ---- 4. groups
    children = {}
    for o in objs:
        if o.get("parent") is not None:
            children.setdefault(o["parent"], []).append(o)
    groups = []
    used = set()
    gi = 0
    for c in objs:
        kids = children.get(c["id"], [])
        if not kids:
            continue
        kinds = [k["kind"] for k in kids]
        n_grid = sum(1 for k in kinds if k in ("tile", "card"))
        n_rows = sum(1 for k in kinds if k in ("row", "chip"))
        if n_grid >= max(2, len(kids) * 0.5):
            gkind = "grid"
        elif n_rows >= max(2, len(kids) * 0.5):
            gkind = "row_stack"
        else:
            gkind = "panel"
        gi += 1
        members = [c["id"]] + sorted(k["id"] for k in kids)
        used.update(members)
        groups.append({"id": "g%d" % gi, "kind": gkind, "bbox": c["bbox"],
                       "container": c["id"], "members": members,
                       "note": "members[0] 为容器自身；kind=%s 由子元素类型统计得出" % gkind})
    # 覆盖兜底：任何未进组的对象单独成组
    for o in objs:
        if o["id"] not in used:
            gi += 1
            groups.append({"id": "g%d" % gi, "kind": "panel", "bbox": o["bbox"],
                           "container": o["id"], "members": [o["id"]],
                           "note": "无子元素（叶容器/孤立对象），单成员组保证全覆盖"})
    doc["groups"] = groups

    # ---- 5. 统计
    total = len(objs)
    non_panel = [o for o in objs if o["kind"] != "panel"]
    cov_all = sum(1 for o in objs if o.get("parent") is not None) / total
    cov_nonpanel = sum(1 for o in non_panel if o.get("parent") is not None) / max(1, len(non_panel))
    gcov = sum(1 for o in objs if any(o["id"] in g["members"] for g in groups)) / total
    stats = dict(frame=stem, units=total, panels=len(panels), groups=len(groups),
                 parent_cov_all=round(cov_all, 3), parent_cov_nonpanel=round(cov_nonpanel, 3),
                 groups_cover=round(gcov, 3), changed=changed)
    pv = doc.setdefault("_provenance", {})
    pv["hierarchy"] = ("parent 规则：顶级面板 null；子面板→外层面板；行/卡/按钮/图标/chip→最小容器"
                       "（面板优先，时间轴允许挂到泳道行）；无容器按区域兜底。"
                       "groups：每容器一组，kind 由子元素类型比例判定（grid/row_stack/panel），"
                       "members[0] 为容器自身。")
    pv["hierarchy_stats"] = stats
    if write:
        with open(p, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
    return stats


def main():
    write = "--report" not in sys.argv
    for s in FRAMES:
        st = process(s, write=write)
        print("%-32s units=%3d panels=%2d groups=%3d parent_cov_all=%.1f%% nonpanel=%.1f%% groups_cover=%.0f%%"
              % (st["frame"][:32], st["units"], st["panels"], st["groups"],
                 st["parent_cov_all"] * 100, st["parent_cov_nonpanel"] * 100, st["groups_cover"] * 100))


if __name__ == "__main__":
    main()
