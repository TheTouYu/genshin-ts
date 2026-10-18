#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把追加的老帧修到 A 级（去重 / 补整栏整面板 / 属性面板逐行 / 四角小件）。

本脚本只重建 r047（其余四帧结论见 README：r026/r040 由 truth-v8-editor 新版取代，
r019/r021 复核后无重复框、已有整块与四角，A 级判据全绿）。

r047 数据全部本批现量：edges.py 扫线（x=300/900 得 80/560/1947 三条栏界）+ grid.py 切块
（左侧栏 1:1、右侧属性面板 1:1、底部命令条 1.2x）+ OCR 文本框（xyxy）。
"""
import json
import os

OUT = os.path.dirname(os.path.abspath(__file__))
STEM = "r047_snap_2026-10-19_00-39-53"


def O(kind, bbox, text=(), parent=None, click=None, note="", selected=False, clipped=None):
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
    }


def build():
    u = []
    # ①顶栏
    u.append(O("panel", [0, 0, 2560, 53], ["编辑器顶栏"], note="①顶栏（R7 区域级；edges x=700 得 y=53）"))
    u.append(O("icon", [96, 16, 44, 36], ["关卡文件"], note="顶栏文档图标"))
    u.append(O("icon", [182, 12, 44, 38], ["指针工具"]))
    tabs = [(250, 190, "关卡设置 ×"), (425, 215, "关卡变量管理 ×"), (625, 205, "背景音乐管理 ×"),
            (818, 255, "资产导入导出管理 ×"), (1080, 215, "界面控件组管理 ×"), (1290, 200, "主镜头管理 ×")]
    for i, (x, w, t) in enumerate(tabs):
        u.append(O("chip", [x, 0, w, 52], [t], selected=False,
                   note="标签页（R2 每页签单独成框；宽按可见皮肤 R5）"))
    u.append(O("button", [2320, 10, 42, 36], ["撤销"], note="R1 右上按右沿定位"))
    u.append(O("button", [2362, 10, 42, 36], ["重做"]))
    u.append(O("button", [2428, 8, 48, 40], ["设置"]))
    u.append(O("button", [2494, 8, 48, 40], ["面板"]))
    # ②左栏
    u.append(O("panel", [0, 53, 560, 1387], ["左侧资源栏"], note="②左栏整块（R6；edges x=80/560 实测）"))
    u.append(O("panel", [0, 53, 80, 1387], ["左竖图标栏"], note="②左栏最左竖图标栏（R6）"))
    for y in (60, 102, 188, 268, 330, 400):
        u.append(O("icon", [16, y, 48, 44], ["工具图标"], note="竖栏图标（切块图 1:1 现读，±6px）"))
    u.append(O("chip", [88, 62, 180, 44], ["单位状态"], note="左栏标题"))
    u.append(O("button", [492, 62, 48, 44], ["⌃"], note="折叠按钮"))
    u.append(O("button", [90, 124, 435, 48], ["搜索"], note="搜索框（切块图读 y≈124..172）"))
    u.append(O("panel", [80, 53, 300, 1387], ["单位状态树"], note="树列整块（R6）"))
    tree = [(203, "自定义"), (244, "未分类页签"), (289, "+添加页签"), (333, "预制状态"),
            (374, "状态分类1"), (416, "资产库"), (459, "默认分类")]
    for y, t in tree:
        u.append(O("row", [88, y - 4, 282, 40], [t],
                   note="树行逐行（R2）" + ("（当前选中：橙底 pill）" if t == "未分类页签" else "")))
    u.append(O("panel", [370, 53, 190, 1387], ["资产调色板"], note="调色板列整块（R6；edges x=385/560）"))
    u.append(O("button", [385, 204, 180, 50], ["+ 新建状态"], note="调色板新建按钮（R2 单独成框）"))
    u.append(O("tile", [385, 290, 180, 114], ["新建状态"], note="调色板卡片（缩略图 + 标签，R3 视觉整块）"))
    # ③视口
    u.append(O("panel", [560, 53, 1387, 1387], ["3D 视口"], note="③视口整块（R7；edges x=560..1947）"))
    u.append(O("panel", [1083, 70, 394, 70], ["顶部浮动工具条"], note="视口顶部四键浮动条（R7）"))
    u.append(O("button", [1104, 78, 52, 54], ["工具1"]))
    u.append(O("button", [1183, 71, 94, 61], ["工具2"]))
    u.append(O("button", [1292, 78, 52, 54], ["工具3"]))
    u.append(O("button", [1384, 78, 52, 54], ["工具4"], selected=True,
               note="选中键（橙色药丸；切块图读）"))
    u.append(O("icon", [1842, 96, 60, 56], ["Z 图标"], note="右上 Z 标（OCR 'z' 1854,100）"))
    # ④右属性面板（逐行）
    u.append(O("panel", [1947, 53, 613, 1387], ["属性面板"], note="④右属性面板整块（R3/R7；edges x=1947）"))
    pid = len(u) - 1
    u.append(O("row", [2085, 62, 180, 36], ["新建状态"], parent=pid, note="面板标题"))
    u.append(O("row", [2085, 102, 210, 28], ["配置ID 1077936129"], parent=pid))
    u.append(O("button", [2150, 100, 40, 34], ["复制"], parent=pid))
    u.append(O("button", [2326, 72, 40, 36], ["锁定"], parent=pid))
    u.append(O("button", [2380, 72, 40, 36], ["⋯"], parent=pid))
    u.append(O("button", [2434, 70, 46, 40], ["⌃"], parent=pid))
    u.append(O("row", [2055, 196, 110, 40], ["通用信息"], parent=pid, note="分段控件左段（未选中）"))
    u.append(O("button", [2168, 192, 378, 46], ["效果详细信息"], parent=pid, selected=True,
               note="分段控件右段（橙色药丸选中；实测 x2168..2545）"))
    u.append(O("row", [2190, 740, 140, 40], ["缺少效果"], parent=pid, note="空状态提示（y747..777）"))
    u.append(O("button", [2190, 1350, 124, 44], ["添加效果"], parent=pid,
               note="面板底部主按钮（R4 贴底扫）"))
    # ⑤底部命令条
    u.append(O("panel", [1092, 1364, 370, 62], ["底部命令条"], note="⑤底中命令条（R4；切块图 1.2x）"))
    bid = len(u) - 1
    u.append(O("button", [1100, 1370, 158, 50], ["切换性别"], parent=bid))
    u.append(O("button", [1252, 1370, 96, 50], ["保存"], parent=bid))
    u.append(O("button", [1352, 1370, 102, 50], ["另存为"], parent=bid))

    for i, o in enumerate(u):
        o["id"] = i
    return {
        "frame": STEM,
        "image": ".scratch/gui-corpus/inbox/reps/%s.jpg" % STEM,
        "size": [2560, 1440],
        "annotator": "perception(subagent) · 切块标注法（左栏/右面板/底部三块各自现量后汇总）",
        "criteria": ".agents/skills/gui-annotation/SKILL.md（R1–R10）",
        "layout": "①顶栏 / ②左竖图标栏+单位状态树+调色板 / ③视口+浮动工具条 / ④右属性面板（逐行） / ⑤底部命令条+四角",
        "classes": ["切块标注法"],
        "units": len(u),
        "_provenance": {
            "family": "编辑器·单位状态（状态编辑器 + 效果详细信息面板）",
            "blocks": ["①顶栏", "②左栏", "③视口", "④右属性面板", "⑤底部/四角"],
            "rules_applied": {
                "R1": "右上窗口控件按右沿定位：撤销 2320..2362 / 重做 2362..2404 / 设置 2428..2476 / 面板 2494..2542",
                "R2": "逐项：6 个标签页各成一框、树 7 行逐行、调色板「+新建状态」与卡片分开成框",
                "R3": "视口/右属性面板/左栏/命令条各自整块；面板内 9 个可见行全部单独成框（旧版只有一个面板框）",
                "R4": "四角：右上窗口控件、右下 UID（HUD 不计）、面板底「添加效果」、底部命令条三按钮",
                "R5": "标签页宽按可见皮肤（190/215/205/255/215/200），旧值 320~420 宽出 130~230px",
                "R6": "整栏：左栏 [0,53,560,1387] + 竖图标栏 [0,53,80,1387] + 树列 [80,53,300,1387] + 调色板 [370,53,190,1387]",
                "R7": "视口 [560,53,1387,1387] 与右属性面板 [1947,53,613,1387] 整块成框（旧版视口/面板边界 320/2080 均错）",
                "R8": "行按可见皮肤量：树行 x=88 w=282；面板行 x=2085 w=180",
                "R9": "面板内元素 parent 指向属性面板 id，先归块再量块内 y",
                "R10": "四角扫完：左上文档/指针图标、右上四控件、右下 UID、底部命令条",
            },
            "tool_assist": "edges.py 扫描线（y=300/900 得 80/560/1947 栏界）+ grid.py 切块（左栏 1:1 / 右面板 1:1 / 底部 1.2x）+ OCR xyxy 文本框",
            "ys_screen_prior": False,
            "measured_anchors": {
                "topbar_h": 53, "left_rail": 80, "left_panel_right": 560, "viewport": [560, 53, 1387, 1387],
                "prop_panel": [1947, 53, 613, 1387], "prop_tabs_y": [196, 238],
                "bottom_bar": [1092, 1364, 370, 62],
            },
            "uncertain": [
                "树行与调色板行的可见皮肤为半透明底，左右沿按栏界 88..370 / 385..565 取（R8 惯例），±6px",
                "‘新建状态’卡片是缩略图+标签的整卡，卡顶 290 由标签行 y358..385 反推并核对 1:1 切块图，±10px",
                "分段控件右段橙色药丸 x2168..2545 由 1:1 面板裁图读，±8px",
                "底部命令条左右沿 1092..1462 由 1.2x 裁图读，±8px",
                "左上 HUD（DXVK/FPS/GPU/min:/max:/UID）不计单元",
            ],
            "changed_from_prev": [
                "旧版 units=20：属性面板只有一个 [2080,40,480,700] 整块框 —— 本轮补 9 个面板行/按钮（标题、配置ID+复制、锁定/⋯/⌃、通用信息、效果详细信息、缺少效果、添加效果）",
                "旧版视口 [320,130,2200,1250]、属性面板 [2080,40,480,700] 边界与实测不符 —— 按 edges 改为 [560,53,1387,1387] / [1947,53,613,1387]",
                "旧版标签页宽 330/420/400/400/360/320（越出栈）—— 按可见皮肤改为 190/215/205/255/215/200，且补 6 页签与右上窗口控件",
                "旧版无左竖图标栏、无调色板、无底部命令条 —— 本轮补 [0,53,80,1387] 竖栏 6 图标 + 调色板「+新建状态」/卡片 + 底部「切换性别/保存/另存为」",
                "去重：本帧无 IoU≥0.99 重复框（旧版亦无；同类重复框告警在 r026(v6)/r019/r021 已于早前一轮移除，见 README 对照表）",
            ],
        },
        "objects": u,
    }


if __name__ == "__main__":
    d = build()
    p = os.path.join(OUT, STEM + ".json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    print("wrote", p, "units=", d["units"])
