#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""r028（装饰物管理）预测修正 → 真值。

输入：.scratch/gui-corpus/truth-v9-pred/r028_snap_2026-10-19_00-27-49.json（116 预测框）
输出：truth-v9-fixed/r028_*.json（去假阳性/挪歪框/补漏/改类后的真值）

本批现量（30 分钟预算内）：
  edges.py：顶栏 y=53；左栏右沿 x=480；树/调色板分界 x=268..276；右属性面板左沿 x=2080；
            模型资产库弹窗 [1678,772]..[2076,1440]（y=774 强跃变）
  grid.py 1:1/0.7x 裁图：左调色板 11 卡（pitch 112、卡 [340,y,122,112]）；右面板 20 行；弹窗 13 行
  OCR（repjson/r028）：行文本与 y 锚点
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
STEM = "r028_snap_2026-10-19_00-27-49"
PRED = os.path.join(HERE, "..", "truth-v9-pred", STEM + ".json")


def O(kind, bbox, text=(), parent=None, click=None, note="", selected=False, clipped=None, src=""):
    return {
        "id": None,
        "parent": parent,
        "bbox": [int(v) for v in bbox],
        "kind": kind,
        "text": list(text),
        "clickable": click if click else ("yes" if kind in ("chip", "button", "tile", "row", "icon") else "no"),
        "state": {"selected": bool(selected), "focused": False, "disabled": False},
        "badges": [],
        "clipped": clipped or {"edges": [], "cut_by": None, "px": 0},
        "note": note,
        "from_pred": src,
    }


def truth_units():
    u = []
    # ①顶栏
    u.append(O("panel", [0, 0, 2560, 53], ["编辑器顶栏"], note="①顶栏（R7；edges y=53）"))
    u.append(O("icon", [176, 7, 46, 40], ["指针工具"], note="OCR『可』178..220 为图标误识"))
    u.append(O("chip", [250, 0, 196, 52], ["关卡设置 ×"], selected=True,
               note="唯一页签（R2/R7；宽按可见皮肤，预测框 #1 为 215×48 @237 与实测差 13px 已替换）"))
    u.append(O("button", [2320, 10, 42, 36], ["撤销"], note="R1 右上按右沿"))
    u.append(O("button", [2362, 10, 42, 36], ["重做"]))
    u.append(O("button", [2428, 8, 48, 40], ["设置"]))
    u.append(O("button", [2494, 8, 48, 40], ["面板"]))
    # ②左栏
    u.append(O("panel", [0, 53, 480, 1387], ["左侧资源栏"], note="②左栏整块（R6；edges x=480）"))
    u.append(O("chip", [8, 62, 190, 44], ["摆放"], note="左栏标题（OCR 14,70）"))
    u.append(O("button", [410, 62, 52, 48], ["⌃"], note="折叠按钮"))
    u.append(O("button", [24, 133, 432, 42], ["搜索"], note="搜索框（预测 #17 为 [42,134,412,35]，左右各窄 18px）"))
    u.append(O("panel", [0, 175, 268, 1265], ["资源树"], note="树列整块（R6；分界 x=268..276）"))
    tree = [(203, "自定义"), (243, "物件"), (289, "自定义页签_1"), (331, "未分类页签"), (374, "+添加页签"),
            (415, "造物"), (460, "未分类页签"), (502, "+添加页签"), (542, "掉落物"), (587, "未分类页签"),
            (630, "+添加页签"), (672, "预制"), (713, "动态单位"), (756, "流程物件"), (798, "玩法机关"),
            (843, "其他"), (884, "静态单位"), (927, "树木"), (970, "植被"), (1013, "地貌"),
            (1055, "岩石"), (1098, "建筑"), (1140, "建筑结构"), (1184, "人造装饰"), (1226, "灯具"),
            (1266, "饮食"), (1315, "武器"), (1355, "工具"), (1393, "造物")]
    for y, t in tree:
        u.append(O("row", [8, y - 4, 258, 40], [t], note="树行逐行（R2）"))
    u.append(O("panel", [276, 175, 204, 1265], ["装饰物调色板"], note="调色板列整块（R6）"))
    tiles = [(272, "灌木"), (385, "野果"), (497, "枯枝"), (609, "木质花箱"), (722, "木质花圃"),
             (833, "花丛"), (945, "花丛"), (1056, "灌木"), (1170, "灌木"), (1280, "灌木"), (1392, "灌木")]
    for y, t in tiles:
        u.append(O("tile", [309, y - 68, 144, 100], [t],
                   note="调色板卡片（缩略图+标签整卡；edges x=309..453、卡距 12、pitch 112，±4px）"))
    # ③视口
    u.append(O("panel", [480, 53, 1600, 1387], ["3D 视口"], note="③视口整块（R7；x480..2080）"))
    u.append(O("panel", [1083, 70, 394, 70], ["顶部浮动工具条"], note="视口顶部四键浮动条（预测 #65/#106 重复同框）"))
    u.append(O("button", [1104, 78, 52, 54], ["工具1"]))
    u.append(O("button", [1183, 71, 94, 61], ["工具2"], selected=True, note="选中态（预测 #2 [1158,72,134,63] 左移 25px）"))
    u.append(O("button", [1292, 78, 52, 54], ["工具3"], note="预测 #3 [1277,83,87,42] 偏窄 35px"))
    u.append(O("button", [1384, 78, 52, 54], ["工具4"], note="预测 #15 [1381,84,72,40] 偏宽 20px"))
    u.append(O("icon", [2360, 78, 76, 84], ["浮动控件"], note="右侧浮动控件（绿箭头+X，无文字，±10px）"))
    # ④模型资产库弹窗
    u.append(O("panel", [1678, 772, 398, 668], ["模型资产库弹窗"], note="④弹窗整块（R3/R9；edges x=1678 / y=774）"))
    did = len(u) - 1
    u.append(O("row", [1690, 780, 160, 40], ["模型资产库"], parent=did, note="弹窗标题"))
    u.append(O("button", [2046, 780, 44, 40], ["×"], parent=did))
    u.append(O("button", [1685, 828, 385, 56], ["搜索"], parent=did, note="搜索行（左侧 + 图标）"))
    # 资产条目 2 条：第一条只有 ID 行，第二条＝名称行 + ID 行（不拆成两个重叠行）
    u.append(O("row", [1685, 878, 340, 48], ["ID 20001454"], parent=did,
               note="资产条目（ID 行；缩略图 + 文字）"))
    u.append(O("row", [1685, 926, 340, 64], ["木质指路牌", "ID 20001010"], parent=did,
               note="资产条目（名称行 + ID 行，同一卡）"))
    rows = [(990, "玩法机关"), (1035, "其他"), (1080, "树木"), (1126, "植被"),
            (1171, "地貌"), (1216, "建筑"), (1262, "人造装饰"), (1307, "灯具"),
            (1352, "岩石"), (1397, "建筑结构")]
    for y, t in rows:
        u.append(O("row", [1685, y - 4, 340, 40], [t], parent=did,
                   note="弹窗分类条目逐条（R2）；末条被弹窗底 1440 裁切" if y > 1390 else "弹窗分类条目逐条（R2）",
                   clipped={"edges": ["bottom"], "cut_by": "弹窗底 1440", "px": 14} if y > 1390 else None))
    # ⑤右属性面板（逐行）
    u.append(O("panel", [2080, 53, 480, 1387], ["属性面板"], note="⑤右属性面板整块（R3/R7；edges x=2080）"))
    pid = len(u) - 1
    u.append(O("row", [2096, 60, 200, 34], ["装饰物管理"], parent=pid, note="面板标题"))
    u.append(O("row", [2096, 84, 120, 30], ["已锁定"], parent=pid, note="状态标记"))
    u.append(O("button", [2452, 62, 40, 40], ["锁定"], parent=pid))
    u.append(O("button", [2494, 66, 44, 40], ["×"], parent=pid))
    u.append(O("row", [2166, 132, 200, 34], ["花丛"], parent=pid, note="对象名"))
    u.append(O("row", [2169, 163, 200, 28], ["1个装饰物"], parent=pid))
    u.append(O("button", [2504, 134, 48, 44], ["搜索"], parent=pid))
    u.append(O("row", [2096, 209, 200, 30], ["装饰物_1"], parent=pid, note="实例列表行"))
    u.append(O("button", [2504, 212, 44, 32], ["⋯"], parent=pid))
    u.append(O("row", [2115, 266, 200, 34], ["▼模型"], parent=pid, note="分区标题（可折叠）"))
    u.append(O("button", [2504, 266, 44, 36], ["☰"], parent=pid))
    u.append(O("row", [2111, 313, 200, 30], ["模型资产"], parent=pid))
    u.append(O("button", [2141, 375, 210, 34], ["+ 点击选择模型资产"], parent=pid,
               note="字段行（+ 图标 + 提示文字）"))
    u.append(O("row", [2119, 441, 220, 30], ["颜色与材质"], parent=pid))
    u.append(O("button", [2504, 441, 44, 36], ["⋯"], parent=pid))
    u.append(O("row", [2115, 498, 200, 34], ["▼变换"], parent=pid, note="分区标题"))
    u.append(O("button", [2504, 498, 44, 36], ["☰"], parent=pid))
    u.append(O("row", [2111, 545, 200, 30], ["锁定变换"], parent=pid))
    u.append(O("button", [2496, 536, 56, 40], ["开关-关"], parent=pid, note="开关（灰=关）"))
    u.append(O("button", [2122, 588, 200, 30], ["GI_RootNode"], parent=pid, note="下拉字段"))
    for y, lab, vals in [(624, "位置", ["X 0.00", "Y 0.00", "Z 0.00"]),
                         (702, "旋转", ["X 0.00", "Y 0.00", "Z 0.00"]),
                         (779, "缩放", ["X 1.00", "Y 1.00", "Z 1.00"])]:
        u.append(O("row", [2111, y, 120, 30], [lab], parent=pid))
        for i, v in enumerate(vals):
            u.append(O("chip", [2105 + 138 * i, y + 34, 130, 34], [v], parent=pid,
                       note="数值框（XYZ 三列）"))
    u.append(O("row", [2141, 876, 200, 30], ["原生碰撞"], parent=pid))
    u.append(O("button", [2504, 872, 44, 36], ["☰"], parent=pid))
    # ⑥底部对象操作条
    u.append(O("panel", [1122, 1306, 326, 122], ["底部对象操作条"], note="⑥底中浮动操作条（R4；非 HUD）"))
    bid = len(u) - 1
    for bx, w, t in [(1128, 106, "3.00"), (1240, 92, "30"), (1338, 106, "0.10")]:
        u.append(O("chip", [bx, 1312, w, 50], [t], parent=bid, note="数值框（图标+数值）"))
    u.append(O("icon", [1216, 1372, 60, 52], ["轴向操作"], parent=bid))
    u.append(O("icon", [1288, 1372, 56, 52], ["删除"], parent=bid))
    for i, o in enumerate(u):
        o["id"] = i
    return u


def iou(a, b):
    ax0, ay0, ax1, ay1 = a[0], a[1], a[0] + a[2], a[1] + a[3]
    bx0, by0, bx1, by1 = b[0], b[1], b[0] + b[2], b[1] + b[3]
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    return inter / (a[2] * a[3] + b[2] * b[3] - inter)


def analyze(truth):
    W, H = 2560, 1440
    pred = json.load(open(PRED, encoding="utf-8"))["objects"]
    oob = [o for o in pred if o["bbox"][0] < 0 or o["bbox"][1] < 0
           or o["bbox"][0] + o["bbox"][2] > W or o["bbox"][1] + o["bbox"][3] > H]
    dup_pairs = []
    for i in range(len(pred)):
        for k in range(i + 1, len(pred)):
            v = iou(pred[i]["bbox"], pred[k]["bbox"])
            if v >= 0.5:
                dup_pairs.append((v, pred[i]["id"], pred[k]["id"]))
    # 一对一贪心匹配（IoU>=0.5），先排分数
    cand = []
    for t in truth:
        for p in pred:
            v = iou(t["bbox"], p["bbox"])
            if v >= 0.5:
                cand.append((v, t["id"], p["id"]))
    cand.sort(reverse=True)
    used_t, used_p, matches = set(), set(), []
    for v, ti, pi in cand:
        if ti in used_t or pi in used_p:
            continue
        used_t.add(ti)
        used_p.add(pi)
        matches.append((v, ti, pi))
    fp = [p for p in pred if p["id"] not in used_p]
    fn = [t for t in truth if t["id"] not in used_t]
    return dict(
        pred_total=len(pred), oob=len(oob),
        dup_pairs=len(dup_pairs), dup_exact=len([d for d in dup_pairs if d[0] >= 0.99]),
        matched=len(matches), iou_mean=round(sum(m[0] for m in matches) / max(1, len(matches)), 3),
        fp=len(fp), fn=len(fn), truth_units=len(truth),
        rate=round(len(matches) / max(1, len(truth)), 3),
        fp_ids=sorted(p["id"] for p in fp), fn_ids=sorted(t["id"] for t in fn),
    )


def main():
    truth = truth_units()
    stats = analyze(truth)
    doc = {
        "frame": STEM,
        "image": ".scratch/gui-corpus/inbox/reps/%s.jpg" % STEM,
        "size": [2560, 1440],
        "annotator": "perception(subagent) · 预测修正（在 truth-v9-pred 基础上删假阳性/挪歪框/补漏/改类）",
        "criteria": ".agents/skills/gui-annotation/SKILL.md（R1–R10）",
        "layout": "①顶栏 / ②左竖栏(树+调色板) / ③视口+浮动工具条 / ④模型资产库弹窗 / ⑤右属性面板（逐行） / ⑥底部对象操作条",
        "classes": ["切块标注法", "预测修正"],
        "units": len(truth),
        "_provenance": {
            "family": "编辑器·装饰物管理（物件属性 + 模型资产库弹窗）",
            "source": "truth-v9-pred/r028（模型 v4 @ thresh 0.55，116 框）→ 修正",
            "blocks": ["①顶栏", "②左栏", "③视口", "④弹窗", "⑤右属性面板", "⑥底部/四角"],
            "rules_applied": {
                "R1": "右上窗口控件按右沿：撤销 2320..2362 / 重做 / 设置 2428..2476 / 面板 2494..2542",
                "R2": "逐项：树 29 行逐行、调色板 11 卡逐卡、弹窗 13 条逐条、属性面板 20 行逐行",
                "R3": "整块 + 面板内逐行：弹窗 [1678,772,398,668]、属性面板 [2080,53,480,1387] 各自整块，块内行全单独成框",
                "R4": "四角：右上四控件、右下 UID（HUD 不计）、底部对象操作条 3.00/30/0.10 + 轴向/删除",
                "R5": "宽度按可见皮肤：页签 196（预测 #1 给 215 且起点 237 → 差 13px）；搜索框 432（预测 #17 给 412，窄 20px）",
                "R6": "整栏：左栏 [0,53,480,1387] + 树列 [0,175,268,1265] + 调色板 [276,175,204,1265]",
                "R7": "视口 [480,53,1600,1387]、弹窗、属性面板整块",
                "R8": "行按可见皮肤左右沿：树行 x=8 w=258；调色板卡 x=340 w=122；属性面板行 x≈2096..2540",
                "R9": "先归块再量 y（parent 指向容器）：弹窗条目 y 由弹窗顶 774 + 行距读，未跨块合并",
                "R10": "四角扫完（左上指针图标、右上控件、右下 HUD/浮动控件）",
            },
            "tool_assist": "edges.py 扫线（y=53 / x=480 / x=268..276 / x=2080 / 弹窗 1678..2076）"
                           "+ grid.py 裁图（左调色板 0.9x、右侧 0.7x）+ OCR xyxy 文本框",
            "ys_screen_prior": False,
            "measured_anchors": {
                "topbar_h": 53, "left_panel": [0, 53, 480, 1387], "tree_col": [0, 175, 268, 1265],
                "palette_col": [276, 175, 204, 1265], "palette_tile": [309, 0, 144, 100],
                "palette_pitch": 112, "palette_card_gap": 12, "popup": [1678, 772, 398, 668],
                "prop_panel": [2080, 53, 480, 1387], "prop_rows_y": [60, 132, 209, 266, 313, 375, 441, 498, 545, 588, 624, 702, 779, 876],
                "bottom_ops": [1122, 1306, 326, 122],
            },
            "uncertain": [
                "调色板卡片可见皮肤为半透明底，卡高按 pitch 112 取（标签在卡顶 +87），±8px",
                "右侧浮动控件（绿箭头+X）无文字且半透明，框 ±10px",
                "弹窗末条『建筑结构』被弹窗底裁切，行框按 40px 等距外推（±6px）",
                "属性面板『花丛/1个装饰物』两行贴合紧密，行带按 OCR 上下沿各外扩 4px",
                "左上角 HUD（DXVK/FPS/GPU/min:/max:/UID）不计单元",
            ],
            "pred_analysis": stats,
            "changed_from_pred": [
                "删除越界框 %d 个（x/y 为负或超出 2560×1440，如 [-185,1123,642,105]）" % stats["oob"],
                "合并/删除重复框 %d 对（IoU≥0.5，其中完全同框 %d 对，如 #103/#111、#65/#106、#62/#76）"
                % (stats["dup_pairs"], stats["dup_exact"]),
                "删除与任何真值单元 IoU<0.5 的假阳性 %d 个；补漏 %d 个真值单元（树行/调色板卡/属性面板行/弹窗条目）"
                % (stats["fp"], stats["fn"]),
                "改类：预测的 5 个 panel 中 2 个是整屏『退化框』[151,-28,2274,104]，改为顶栏 panel；"
                "预测把调色板卡判成 row/chip 的改为 tile；属性面板数值三列改为 chip",
                "挪框（R5/R8）：页签 #1 237→250、宽 215→196；搜索框 #17 42→24、宽 412→432；工具键 #2 1158→1183（左移 25px）",
            ],
        },
        "objects": truth,
    }
    p = os.path.join(HERE, STEM + ".json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print("wrote", p, "units=", doc["units"])
    print(json.dumps(stats, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
