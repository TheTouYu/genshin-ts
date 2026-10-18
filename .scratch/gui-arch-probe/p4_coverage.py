#!/usr/bin/env python3
"""p4_coverage — 人类可交互单元 vs 现有工具（ys-screen）输出 的覆盖率对比（交付 A）。

人类单元 bbox 全部来自实际看图手测（±12px），结构：
  row   = 左列表面板里的一行（可点）
  tile  = 网格格子（可点）
  card  = 白色/深色卡片（可点）
  btn   = 药丸按钮（可点）
  icon  = 头像/奖励图标（可点）
  chrome= 关闭 X / 活动说明
判据（三档）：
  object = 工具有 bbox 与单元 IoU≥0.40 的对象（controls / structure panel）
  row    = 工具没有对象，但 structure 有一行文本落在单元内
  none   = 都没有
"""
import json
import numpy as np

F = "/tmp/ysb/%s.json"

LEFT = (264, 657)          # 左列表面板 x 范围（全分辨率）
LIST6 = [402, 523, 646, 767, 888, 1010]   # f00..f04 列表行 y（f05 多一行 1010→另有）


def units():
    U = {}
    # ---- 左列表：每帧可见行（我按图逐行数）----
    U["f00"] = [(("row", "第%d行" % (i + 1)), [LEFT[0], y - 60, LEFT[1], y + 60]) for i, y in enumerate(LIST6)]
    U["f01"] = [(("row", "第%d行" % (i + 1)), [LEFT[0], y - 60, LEFT[1], y + 60]) for i, y in enumerate(LIST6)]
    U["f02"] = [(("row", "第%d行" % (i + 1)), [LEFT[0], y - 60, LEFT[1], y + 60]) for i, y in enumerate(LIST6)]
    U["f03"] = [(("row", "第%d行" % (i + 1)), [LEFT[0], y - 60, LEFT[1], y + 60]) for i, y in enumerate(LIST6)]
    U["f04"] = [(("row", "第%d行" % (i + 1)), [LEFT[0], y - 60, LEFT[1], y + 60]) for i, y in enumerate(LIST6)]
    U["f05"] = [(("row", "第%d行" % (i + 1)), [LEFT[0], y - 60, LEFT[1], y + 60]) for i, y in enumerate(LIST6 + [1131])]
    # 杂项（各帧共有/特有）
    common = [(("chrome", "关闭X"), [2384, 136, 2460, 212]), (("chrome", "活动说明"), [1890, 120, 2140, 180])]
    for k in U:
        U[k] = U[k] + common
    # f00：5 头像 + 3 奖励格 + 1 已达成格 + 角色预览 + 开始试用
    U["f00"] += [(("icon", "头像%d" % (i + 1)), [1724 + i * 112, 406, 1820 + i * 112, 510]) for i in range(5)]
    U["f00"] += [(("icon", "奖励%d" % (i + 1)), [1600 + i * 136, 870, 1720 + i * 136, 990]) for i in range(3)]
    U["f00"] += [(("icon", "已达成格"), [2068, 850, 2270, 1006]),
                 (("btn", "角色预览"), [1540, 1040, 1760, 1110]),
                 (("btn", "开始试用"), [1930, 1015, 2270, 1135])]
    # f01/f02/f03：奖励图标行（4 全 + 1 被裁）+ 前往任务
    for k in ("f01", "f02", "f03"):
        U[k] += [(("icon", "奖励%d" % (i + 1)), [1530 + i * 128, 830, 1650 + i * 128, 950]) for i in range(4)]
        U[k] += [(("icon", "奖励5(被裁)"), [2042, 830, 2130, 950]),
                 (("btn", "前往任务"), [1900, 1090, 2240, 1210])]
    # f04：5 张卡片
    U["f04"] += [(("card", "千星商城"), [1277, 552, 2260, 682]),
                 (("card", "参与绮星盛会"), [1280, 690, 1690, 830]),
                 (("card", "奇匠赛事"), [1700, 690, 2110, 830]),
                 (("card", "绮星盛会·佳选"), [1280, 900, 2260, 1075]),
                 (("card", "巧趣赠礼"), [745, 945, 1110, 1105])]
    # f05：任务卡 + 2 按钮
    U["f05"] += [(("card", "任务卡"), [1520, 900, 2270, 1030]),
                 (("btn", "前往纪游"), [1541, 1049, 1859, 1127]),
                 (("btn", "前往颂愿"), [2020, 1049, 2300, 1127])]
    # f06/f07：格子（由实测 leaf 检测给，下面脚本会替换为实测 bbox）
    return U


def iou(a, b):
    x0, y0 = max(a[0], b[0]), max(a[1], b[1])
    x1, y1 = min(a[2], b[2]), min(a[3], b[3])
    if x1 <= x0 or y1 <= y0:
        return 0.0
    inter = (x1 - x0) * (y1 - y0)
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / float(ua)


def cover(unit_bbox, tool):
    objs = [c["bbox"] for c in tool["controls"]]
    for p in tool["structure"]:
        objs.append(p["bbox"])
    best = max([iou(unit_bbox, b) for b in objs] or [0.0])
    if best >= 0.40:
        return "object", best
    # 文本行
    cx, cy = (unit_bbox[0] + unit_bbox[2]) / 2, (unit_bbox[1] + unit_bbox[3]) / 2
    for p in tool["structure"]:
        for r in p.get("rows", []):
            if unit_bbox[1] - 20 <= r["y"] <= unit_bbox[3] + 20:
                return "row", best
    return "none", best


def main():
    U = units()
    # f06/f07 用实测格子 bbox
    for fr in ("f06", "f07"):
        leaves = json.load(open("/tmp/ysb/boxes_%s.json" % fr))
        U[fr] = [(("tile", "格子%d" % (i + 1)), b["bbox"]) for i, b in enumerate(leaves)]
    tot = {"object": 0, "row": 0, "none": 0}
    print("%-5s %-14s %-6s %-8s %s" % ("fr", "unit", "cover", "IoU", "tool_counts"))
    for fr in ["f00", "f01", "f02", "f03", "f04", "f05", "f06", "f07"]:
        tool = json.load(open(F % fr))
        cnt = {"object": 0, "row": 0, "none": 0}
        for (kind, name), bb in U[fr]:
            c, best = cover(bb, tool)
            cnt[c] += 1
            tot[c] += 1
            print("%-5s %-14s %-6s %5.2f   kind=%s text=%d ctrl=%d regions=%d panels=%d rows=%d" %
                  (fr, name, c, best, kind, len(tool["text"]), len(tool["controls"]),
                   len(tool["regions"]), len(tool["structure"]),
                   sum(len(p.get("rows", [])) for p in tool["structure"])))
        n = sum(cnt.values())
        print("   >> %s  单元=%d  object=%d(%.0f%%)  row-only=%d  none=%d" %
              (fr, n, cnt["object"], 100.0 * cnt["object"] / n, cnt["row"], cnt["none"]))
    n = sum(tot.values())
    print("\nTOTAL 单元=%d  object=%d(%.0f%%)  row-only=%d  none=%d" %
          (n, tot["object"], 100.0 * tot["object"] / n, tot["row"], tot["none"]))


if __name__ == "__main__":
    main()
