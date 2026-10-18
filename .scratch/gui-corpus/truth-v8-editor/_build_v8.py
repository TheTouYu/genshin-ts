#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""构建 truth-v8-editor 六帧真值（千星编辑器密集界面）。

数据来源（全部本批现量，不照抄 truth-v5）：
  - OCR：.scratch/gui-corpus/inbox/repjson/<stem>.json（text[].bbox 为 xyxy）
  - 扫描线：tools/edges.py（面板/行边），tools/grid.py 切块图现读（标签=原帧坐标）
  - 片段填充：自写颜色 run 扫描（见 _provenance.tool_assist）
"""
import json
import os
import sys

OUT = os.path.dirname(os.path.abspath(__file__))
REPS = ".scratch/gui-corpus/inbox/reps"


def O(kind, bbox, text=(), parent=None, click=None, note="", selected=False, clipped=None):
    o = {
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
    return o


def rows(x, w, pairs, h=40, parent=None, kind="row", note="", dx=0, dy=-2):
    """pairs: (y0,h,text) 来自 rows_from_ocr（y0 已含 8px pad）。"""
    out = []
    for y0, _, t in pairs:
        out.append(O(kind, [x + dx, y0 + dy, w, h], [t], parent=parent, note=note))
    return out


# ---------------------------------------------------------------- 通用块

def bottom_ops(with_save=False):
    """底中浮动对象操作条：3 个数值框（3.00 / 30 / 0.10）+ 第二行轴向/删除（r040 还有保存）。
    实测（grid 放大 2x）：框 1128..1232 / 1240..1332 / 1338..1444，第二行 1216..1400。"""
    u = [O("panel", [1122, 1306, 326, 122], ["底部对象操作条"], note="⑤底中浮动操作条（R4 贴底扫；非 HUD）")]
    bid = len(u) - 1
    for bx, w, t in [(1128, 106, "3.00"), (1240, 92, "30"), (1338, 106, "0.10")]:
        u.append(O("chip", [bx, 1312, w, 50], [t], parent=bid, note="数值框（图标+数值）"))
    u.append(O("icon", [1216, 1372, 60, 52], ["轴向操作"], parent=bid, note="三轴手柄图标"))
    u.append(O("icon", [1288, 1372, 56, 52], ["删除"], parent=bid, note="蓝色垃圾桶图标"))
    if with_save:
        u.append(O("button", [1332, 1370, 76, 50], ["保存"], parent=bid,
                   note="保存按钮（图标 + 文字，R4 贴底）"))
    return u


def topbar(tabs, sel_idx=0, doc=True, extra_right=None, note=""):
    """顶栏：panel + 每个页签单独 chip（R7/R2）。tabs=[[x,w,text],...]"""
    u = [O("panel", [0, 0, 2560, 53], ["编辑器顶栏"], note="①顶栏（R7 区域级）")]
    if doc:
        u.append(O("icon", [96, 16, 44, 36], ["关卡文件"], note="顶栏文档图标（OCR 未识别，切块图现读）"))
        u.append(O("icon", [182, 12, 44, 38], ["指针工具"], note="顶栏工具图标"))
    for i, (x, w, t) in enumerate(tabs):
        u.append(O("chip", [x, 0, w, 52], [t], selected=(i == sel_idx),
                   note="标签页（R2 每页签单独成框；宽按可见皮肤 R5）"))
    for b in (extra_right or []):
        u.append(b)
    u.append(O("button", [2320, 10, 42, 36], ["撤销"], note="右上窗口控件（R1 按右沿定位；图标实测 x2328..2358）"))
    u.append(O("button", [2362, 10, 42, 36], ["重做"]))
    u.append(O("button", [2428, 8, 48, 40], ["设置"]))
    u.append(O("button", [2494, 8, 48, 40], ["面板"]))
    return u


def left_tree(rows_list, panel_w=480, tree_w=460, title="摆放", collapse=(410, 62, 52, 48),
              search=(24, 133, 432, 42), tree_panel=None, extra=()):
    u = [O("panel", [0, 53, panel_w, 1387], ["左侧资源栏"], note="②左资源栏整块（R6）")]
    u.append(O("chip", [8, 62, 190, 48], [title], note="左栏标题"))
    u.append(O("button", list(collapse), ["⌃"], note="折叠按钮"))
    u.append(O("button", list(search), ["搜索"], note="搜索框（edges 量 x24..456 / y133..174）"))
    if tree_panel:
        u.append(O("panel", list(tree_panel), ["资源树"], note="资源树容器（R6 整栏）"))
    u.append(O("panel", [0, 175, tree_w, 1265], ["资源树滚动区"],
               note="树滚动区整块（行在其上逐行，R2）"))
    for r in rows_list:
        u.append(r)
    u.extend(extra)
    return u


def tab_chips(spec, sel=None, note=""):
    return [O("chip", [x, 0, w, 52], [t], selected=(t == sel), note=note) for x, w, t in spec]


# ---------------------------------------------------------------- r026
def r026():
    tree = [
        (195, 44, "自定义"), (236, 49, "物件"), (281, 43, "自定义页签_1"), (323, 43, "未分类页签"),
        (366, 43, "+添加页签"), (400, 59, "造物"), (447, 49, "未分类页签"), (494, 43, "+添加页签"),
        (534, 48, "掉落物"), (580, 45, "预制"), (618, 50, "动态单位"), (660, 51, "静态单位"),
        (705, 48, "造物"), (748, 48, "掉落物"), (801, 44, "元件组"), (834, 45, "自定义元件组"),
        (877, 43, "资产库"), (920, 44, "物件"), (962, 45, "造物"), (1006, 42, "场景生成模板"),
        (1047, 43, "预设模板"), (1090, 43, "未分类页签"),
    ]
    u = topbar([[250, 196, "关卡设置 ×"]], sel_idx=0)
    tree_rows = rows(8, 460, tree, h=40)
    for r in tree_rows:
        if r["text"][0] == "造物" and abs(r["bbox"][1] - 398) < 3:
            r["bbox"][3] = 54
            r["note"] = "当前文件夹（可见描边 x52..258 / y395..445）"
        if r["text"][0] == "元件组":
            r["text"] = ["元件组", "暂无"]
            r["note"] = "组标题行；右侧内联占位文字「暂无」"
    u += left_tree(tree_rows, panel_w=480, tree_w=460, tree_panel=[0, 175, 480, 1265])
    u.append(O("panel", [480, 53, 2080, 1387], ["3D 视口"], note="③视口整块（R7）"))
    u.append(O("panel", [1083, 70, 394, 70], ["顶部浮动工具条"], note="视口顶部四键浮动条（R7）"))
    u.append(O("button", [1104, 78, 52, 54], ["工具1"], note="浮动条第 1 键"))
    u.append(O("button", [1183, 71, 94, 61], ["工具2"], selected=True,
               note="选中态（橙色填充实测 x1183..1276 / y71..131）"))
    u.append(O("button", [1292, 78, 52, 54], ["工具3"]))
    u.append(O("button", [1384, 78, 52, 54], ["工具4"]))
    u.append(O("icon", [1229, 653, 78, 108], ["关卡六边形图标"], note="视口中央关卡图标（切块图读，±8）"))
    u.append(O("icon", [2384, 88, 58, 68], ["浮动控件"], note="右上浮动小控件（绿箭头+X，切块图读）"))
    return u


# ---------------------------------------------------------------- r032
def r032():
    tree = [
        (203, 40, "自定义"), (243, 44, "物件"), (289, 35, "自定义页签_1"), (331, 35, "未分类页签"),
        (374, 35, "+添加页签"), (415, 40, "造物"), (460, 35, "未分类页签"), (502, 35, "+添加页签"),
        (542, 40, "掉落物"), (587, 35, "未分类页签"), (630, 35, "+添加页签"), (672, 38, "预制"),
        (713, 41, "动态单位"), (756, 38, "流程物件"), (801, 38, "玩法机关"), (842, 36, "其他"),
        (884, 39, "静态单位"), (928, 38, "树木"), (970, 39, "植被"), (1013, 39, "地貌"),
        (1055, 38, "岩石"), (1098, 39, "建筑"), (1140, 39, "建筑结构"), (1184, 37, "人造装饰"),
        (1226, 37, "灯具"), (1269, 37, "饮食"), (1316, 36, "武器"), (1356, 37, "工具"),
        (1392, 44, "造物"),
    ]
    u = topbar([[250, 196, "关卡设置 ×"]], sel_idx=0)
    u += left_tree(rows(8, 258, tree, h=40), panel_w=480, tree_w=258,
                   collapse=(332, 55, 52, 48), tree_panel=[0, 175, 268, 1265])
    u.append(O("panel", [276, 175, 194, 1100], ["资产调色板"], note="左栏右半：资产调色板列（R6）"))
    cards = [(185, "石质功能平台"), (300, "石质功能平台"), (415, "石质功能平台"),
             (530, "箭头指示牌"), (645, "箭头指示牌"), (760, "木质指路牌")]
    for y, t in cards:
        u.append(O("tile", [315, y, 135, 115], [t],
                   note="调色板卡片（含缩略图+标签；pitch 115 实测，标签在卡顶+88）"))
    u.append(O("panel", [480, 53, 2080, 1387], ["3D 视口"], note="③视口整块（R7）"))
    u.append(O("panel", [1083, 70, 394, 70], ["顶部浮动工具条"]))
    u.append(O("button", [1104, 78, 52, 54], ["工具1"]))
    u.append(O("button", [1183, 71, 94, 61], ["工具2"], selected=True))
    u.append(O("button", [1292, 78, 52, 54], ["工具3"]))
    u.append(O("button", [1384, 78, 52, 54], ["工具4"]))
    # ---- 关卡设置弹窗
    dl = O("panel", [561, 334, 1430, 772], ["关卡设置弹窗"], note="④弹窗整块（R3/R9）")
    u.append(dl)
    did = len(u) - 1
    u.append(O("row", [590, 336, 160, 44], ["关卡设置"], parent=did, note="弹窗标题栏"))
    u.append(O("button", [1902, 340, 32, 34], ["?"], parent=did))
    u.append(O("button", [1950, 340, 32, 34], ["—"], parent=did))
    u.append(O("panel", [561, 387, 438, 719], ["弹窗左菜单"], parent=did, note="菜单列（选中带宽实测 x561..999）"))
    menu = [(403, "基础"), (449, "阵营"), (505, "出生点"), (556, "复苏点"), (606, "人数设置"),
            (658, "加载界面"), (707, "结算"), (759, "地形导航"), (810, "优化选项"), (860, "协作模式")]
    for y, t in menu:
        u.append(O("row", [561, y - 4, 438, 46], [t], parent=did, selected=(t == "阵营"),
                   note="选中带橙色填充（y449..495）" if t == "阵营" else ""))
    u.append(O("panel", [999, 387, 992, 719], ["弹窗内容区"], parent=did, note="内容区整块（R3）"))
    cid = len(u) - 1

    def faction(avatar_y, title_y, title, n, unit_y, dd1_y, dd1, dd2_y, dd2,
                ent_y, cnt, btn_txt, rel_y, trash_y, num_y=None):
        """阵营块：左列标签 + 右列字段（两列在图上同一行，R9 先归块再量 y）。"""
        u.append(O("icon", [1040, avatar_y, 72, 72], ["阵营头像"], parent=did))
        u.append(O("row", [1140, title_y, 190, 44], [title], parent=did, note="阵营块标题"))
        if num_y:
            u.append(O("chip", [1140, num_y, 96, 38], ["序号 %s" % n], parent=did))
            u.append(O("button", [1236, num_y + 2, 32, 32], ["复制"], parent=did))
        u.append(O("button", [1770, title_y - 10, 182, 34], [btn_txt], parent=did,
                   note="橙色状态按钮（玩家/物件/造物默认阵营；实测 x1770..1950）"))
        u.append(O("button", [1663, rel_y, 287, 48], ["阵营关系"], parent=did,
                   note="下拉字段（实测 x1663..1950）"))
        u.append(O("button", [1892, trash_y, 40, 36], ["删除"], parent=did, note="垃圾桶图标"))
        u.append(O("row", [1018, unit_y, 196, 36], ["默认阵营单位"], parent=did, note="带 ② 图标"))
        u.append(O("button", [1663, dd1_y, 287, 47], [dd1], parent=did,
                   note="下拉字段（与左列「默认阵营单位」同一行）"))
        u.append(O("row", [1045, dd2_y - 2, 120, 34], ["包含的玩家"], parent=did))
        u.append(O("button", [1663, dd2_y, 287, 47], [dd2], parent=did,
                   note="下拉字段（与左列「包含的玩家」同一行）"))
        u.append(O("row", [1045, ent_y + 4, 120, 34], ["包含的实体"], parent=did))
        for bx, val in cnt:
            u.append(O("chip", [bx, ent_y, 74, 42], [val], parent=did,
                       note="实体计数（图标+数值）"))
    faction(402, 410, "初始玩家阵营", "1", 518, 508, "玩家", 558, "所有人", 608,
            [(1796, "0"), (1866, "0")], "玩家默认阵营", 436, 446, num_y=466)
    faction(678, 687, "初始物件阵营", "2", 784, 783, "物件", 833, "无", 870,
            [(1796, "18"), (1866, "0")], "物件默认阵营", 699, 712, num_y=730)
    u.append(O("icon", [1040, 940, 72, 72], ["阵营头像"], parent=did))
    u.append(O("row", [1140, 946, 190, 44], ["初始造物阵营"], parent=did))
    u.append(O("button", [1770, 926, 182, 34], ["造物默认阵营"], parent=did,
               note="橙色状态按钮"))
    u.append(O("button", [1663, 963, 287, 48], ["阵营关系"], parent=did))
    u.append(O("button", [1892, 970, 40, 36], ["删除"], parent=did))
    u.append(O("button", [1770, 1015, 182, 52], ["添加阵营"], parent=did,
               note="弹窗底部主按钮（橙色描边）"))
    u.append(O("icon", [1950, 387, 36, 719], ["弹窗滚动条"], parent=did,
               note="弹窗右缘竖条（edges 1950..1990 处三段亮差）"))
    # ---- 右上属性面板（短，公开变量列表为空）
    u.append(O("panel", [2080, 53, 480, 377], ["属性面板"], note="⑤右属性面板（R3；公开变量数=0 ⇒ 面板只有 y53..430）"))
    pid = len(u) - 1
    u.append(O("row", [2200, 60, 240, 44], ["石质功能平台"], parent=pid, note="面板标题"))
    u.append(O("row", [2205, 98, 220, 36], ["GUID 1077936203"], parent=pid))
    u.append(O("row", [2210, 128, 130, 34], ["动态单位"], parent=pid))
    u.append(O("button", [2112, 196, 40, 40], ["信息"], parent=pid,
               note="图标行（ASCII 像素图实测 (i) x2118..2145）"))
    u.append(O("button", [2242, 196, 40, 40], ["删除"], parent=pid, note="✗ 图标 x2248..2278"))
    u.append(O("button", [2314, 198, 44, 40], ["资产"], parent=pid, note="立方图标 x2320..2350"))
    u.append(O("button", [2415, 192, 112, 50], ["橙色操作"], parent=pid, selected=True,
               note="橙色药丸实测 x2420..2525 / y195..240"))
    u.append(O("row", [2130, 252, 300, 44], ["_GSTS_game"], parent=pid, note="变量列表标题行 + ☰"))
    u.append(O("button", [2500, 252, 44, 40], ["☰"], parent=pid))
    u.append(O("row", [2105, 294, 210, 36], ["1073741825"], parent=pid))
    u.append(O("row", [2105, 330, 220, 40], ["公开变量数"], parent=pid))
    u.append(O("chip", [2490, 334, 44, 34], ["0"], parent=pid))
    u.append(O("button", [2148, 380, 152, 42], ["编辑节点图变量"], parent=pid))
    u.append(O("button", [2370, 380, 160, 42], ["修改节点图"], parent=pid))
    # ---- 底部
    u += bottom_ops()
    u.append(O("button", [2248, 1358, 142, 44], ["添加节点图"], note="右下浮动按钮（R4）"))
    return u


# ---------------------------------------------------------------- r034
def r034():
    tree = [
        (203, 40, "自定义"), (243, 44, "物件"), (289, 35, "自定义页签_1"), (331, 35, "未分类页签"),
        (374, 35, "+添加页签"), (415, 40, "造物"), (460, 35, "未分类页签"), (502, 35, "+添加页签"),
        (542, 40, "掉落物"), (587, 35, "未分类页签"), (630, 35, "+添加页签"), (672, 38, "预制"),
        (713, 41, "动态单位"), (756, 38, "流程物件"), (798, 39, "玩法机关"), (842, 36, "其他"),
        (884, 39, "静态单位"), (928, 38, "树木"), (970, 39, "植被"), (1013, 39, "地貌"),
        (1055, 38, "岩石"), (1098, 39, "建筑"), (1140, 39, "建筑结构"), (1184, 37, "人造装饰"),
        (1226, 37, "灯具"), (1269, 37, "饮食"), (1315, 37, "武器"), (1393, 36, "造物"),
    ]
    u = topbar([[252, 172, "关卡设置 ×"], [430, 198, "关卡变量管理 ×"], [622, 196, "背景音乐管理 ×"]],
               sel_idx=2)
    u += left_tree(rows(8, 258, tree, h=40), panel_w=480, tree_w=258,
                   collapse=(332, 55, 52, 48), tree_panel=[0, 175, 268, 1265])
    u.append(O("panel", [276, 175, 194, 1100], ["资产调色板"], note="调色板列（R6）"))
    for y, t in [(185, "石质功能平台"), (300, "石质功能平台"), (415, "石质功能平台"),
                 (530, "箭头指示牌"), (645, "箭头指示牌"), (760, "木质指路牌")]:
        u.append(O("tile", [315, y, 135, 115], [t], note="调色板卡片（pitch 115）"))
    u.append(O("panel", [480, 53, 2080, 1387], ["3D 视口"], note="③视口整块（R7）"))
    u.append(O("panel", [1083, 70, 394, 70], ["顶部浮动工具条"]))
    u.append(O("button", [1104, 78, 52, 54], ["工具1"]))
    u.append(O("button", [1183, 71, 94, 61], ["工具2"], selected=True))
    u.append(O("button", [1292, 78, 52, 54], ["工具3"]))
    u.append(O("button", [1384, 78, 52, 54], ["工具4"]))
    # ---- 背景音乐管理窗口
    u.append(O("panel", [801, 387, 958, 665], ["背景音乐管理窗口"], note="④弹窗整块（R3/R9；edges x801/1759 y387/1052）"))
    wid = len(u) - 1
    u.append(O("row", [820, 390, 230, 48], ["背景音乐管理"], parent=wid, note="窗口标题栏"))
    u.append(O("button", [1656, 396, 34, 32], ["?"], parent=wid, note="白色问号图标（ASCII 像素图定位 x1663..1684）"))
    u.append(O("button", [1696, 396, 40, 34], ["—"], parent=wid))
    u.append(O("button", [1728, 394, 34, 34], ["×"], parent=wid))
    u.append(O("row", [812, 458, 930, 48], ["基础设置"], parent=wid, selected=True,
               note="分区标题行（橙色字 + 整行浅色带）"))
    u.append(O("button", [1592, 462, 56, 40], ["⋯"], parent=wid))
    u.append(O("button", [835, 523, 890, 74], ["点击选择背景音乐资产"], parent=wid,
               note="资产选择行（edges x835..1725 / y523..597）"))
    u.append(O("row", [818, 600, 180, 38], ["生效时间范围"], parent=wid))
    u.append(O("button", [820, 631, 210, 69], ["00", ":", "00.00"], parent=wid, note="开始时间字段（3 子框）"))
    u.append(O("button", [1522, 631, 210, 69], ["00", ":", "00.00"], parent=wid, note="结束时间字段（3 子框）"))
    u.append(O("row", [818, 732, 84, 40], ["音量"], parent=wid))
    u.append(O("chip", [866, 742, 754, 22], ["音量滑轨"], parent=wid, note="橙色填充段 866..1619（edges y=755）"))
    u.append(O("icon", [1610, 734, 40, 38], ["音量滑块"], parent=wid, note="拖拽圆点"))
    u.append(O("chip", [1648, 730, 92, 44], ["100"], parent=wid, note="数值框"))
    u.append(O("row", [818, 778, 110, 40], ["播放速度"], parent=wid))
    u.append(O("chip", [866, 790, 560, 20], ["播放速度滑轨"], parent=wid))
    u.append(O("icon", [1080, 782, 40, 38], ["速度滑块"], parent=wid))
    u.append(O("chip", [1648, 776, 92, 44], ["1.00"], parent=wid))
    u.append(O("row", [818, 822, 220, 42], ["是否淡入淡出"], parent=wid))
    u.append(O("button", [1658, 816, 72, 46], ["开关-关"], parent=wid,
               note="开关（灰=关；edges x1666..1725）"))
    u.append(O("row", [818, 880, 220, 42], ["是否循环播放"], parent=wid))
    u.append(O("button", [1658, 874, 72, 46], ["开关-关"], parent=wid))
    u.append(O("row", [818, 926, 180, 40], ["间隔时间(s)"], parent=wid))
    u.append(O("button", [1455, 926, 112, 44], ["0.00"], parent=wid, note="数值框"))
    # ---- 背景音乐库
    u.append(O("panel", [1759, 387, 390, 665], ["背景音乐库"], note="④库面板（浮在属性面板左侧之上；edges x1759..2149）"))
    lid = len(u) - 1
    u.append(O("row", [1770, 390, 170, 44], ["背景音乐库"], parent=lid, note="库标题"))
    u.append(O("button", [2102, 386, 44, 38], ["关闭"], parent=lid))
    u.append(O("button", [1765, 446, 350, 46], ["搜索"], parent=lid))
    u.append(O("row", [1762, 510, 372, 44], ["▼探索音乐"], parent=lid, selected=True,
               note="分组标题行（浅色带 y≈510..550）"))
    items = [(565, "鲜衣游侠", "索引：10002/03:43"), (622, "激流逐浪", "索引：10003/03:55"),
             (677, "深壑的煅火", "索引：10004/01:36"), (734, "沉重的恶意", "索引：10005/04:09"),
             (789, "畅舒的行歌", "索引：10006/01:26"), (846, "失色的灾厄", "索引：10008/04:14"),
             (901, "希望的航程", "索引：10010/02:50"), (957, "壶中洞天", "索引：10012/03:14"),
             (1011, "海风细语", "")]
    for y, name, idx in items:
        cl = {"edges": ["bottom"], "cut_by": "库面板底 y1052", "px": 30} if y > 1000 else None
        u.append(O("row", [1765, y - 6, 372, 46], [name] + ([idx] if idx else []), parent=lid,
                   clipped=cl, note="库条目（名称行+索引行；R2 逐条）" if idx else "库条目（列表底被面板裁切）"))
        u.append(O("button", [2104, y - 2, 40, 40], ["展开"], parent=lid, note="条目右侧 ▶"))
    u.append(O("icon", [2137, 512, 16, 320], ["滚动条"], parent=lid, note="滚动条轨道（thumb 已在顶部）"))
    # ---- 右属性面板
    u.append(O("panel", [2080, 53, 480, 377], ["属性面板"], note="⑤右属性面板（R3；edges x=2080 实测，库面板盖住其左缘）"))
    pid = len(u) - 1
    u.append(O("row", [2200, 60, 240, 44], ["石质功能平台"], parent=pid))
    u.append(O("row", [2205, 98, 220, 36], ["GUID 1077936203"], parent=pid))
    u.append(O("row", [2210, 128, 130, 34], ["动态单位"], parent=pid))
    u.append(O("button", [2112, 196, 40, 40], ["信息"], parent=pid,
               note="图标行（ASCII 像素图实测 (i) x2118..2145）"))
    u.append(O("button", [2242, 196, 40, 40], ["删除"], parent=pid, note="✗ 图标 x2248..2278"))
    u.append(O("button", [2314, 198, 44, 40], ["资产"], parent=pid, note="立方图标 x2320..2350"))
    u.append(O("button", [2415, 192, 112, 50], ["橙色操作"], parent=pid, selected=True,
               note="橙色药丸实测 x2420..2525 / y195..240"))
    u.append(O("row", [2130, 252, 300, 44], ["_GSTS_game"], parent=pid))
    u.append(O("button", [2500, 252, 44, 40], ["☰"], parent=pid))
    u.append(O("row", [2105, 294, 210, 36], ["1073741825"], parent=pid))
    u.append(O("row", [2105, 330, 220, 40], ["公开变量数"], parent=pid))
    u.append(O("chip", [2490, 334, 44, 34], ["0"], parent=pid))
    u.append(O("button", [2148, 380, 152, 42], ["编辑节点图变量"], parent=pid))
    u.append(O("button", [2370, 380, 160, 42], ["修改节点图"], parent=pid))
    # ---- 底部
    u += bottom_ops()
    u.append(O("button", [2248, 1358, 142, 44], ["添加节点图"], note="右下浮动按钮（R4）"))
    return u


# ---------------------------------------------------------------- r040
def r040():
    tree = [
        (203, 40, "自定义"), (243, 44, "物件"), (286, 35, "自定义页签_1"), (331, 35, "未分类页签"),
        (374, 35, "+添加页签"), (417, 38, "基础模块"), (457, 39, "动态单位"), (502, 38, "流程物件"),
        (541, 39, "玩法机关"), (587, 36, "其他"), (628, 39, "静态单位"), (672, 38, "树木"),
        (714, 38, "植被"), (757, 38, "地貌"), (801, 38, "岩石"), (843, 38, "建筑"),
        (882, 39, "建筑结构"), (928, 35, "人造装饰"), (970, 38, "灯具"), (1013, 37, "饮食"),
        (1056, 38, "武器"), (1099, 37, "工具"), (1143, 38, "资产库"), (1182, 38, "预设物件"),
        (1227, 38, "默认分类"),
    ]
    tabs = [[250, 190, "关卡设置 ×"], [425, 215, "关卡变量管理 ×"], [625, 205, "背景音乐管理 ×"],
            [818, 255, "资产导入导出管理 ×"], [1080, 215, "界面控件组管理 ×"], [1290, 200, "主镜头管理 ×"]]
    u = topbar(tabs, sel_idx=-1)
    u += left_tree(rows(88, 240, tree, h=40), panel_w=560, tree_w=242,
                   title="物件元件", collapse=(438, 62, 52, 48), search=(90, 128, 390, 44),
                   tree_panel=[88, 175, 242, 1195])
    u.append(O("panel", [0, 53, 88, 1387], ["左竖图标栏"], note="②左栏最左竖图标栏（R6；r040 特有，树整体右移）"))
    for y in (105, 185, 250, 322):
        u.append(O("icon", [26, y, 44, 46], ["工具图标"], note="竖栏图标（切块图读，±6）"))
    u.append(O("panel", [300, 175, 260, 700], ["资产调色板"], note="调色板列（R6）"))
    for y, t in [(186, "石质功能平台"), (300, "石质功能平台"), (414, "石质功能平台"),
                 (528, "箭头指示牌"), (642, "箭头指示牌"), (756, "木质指路牌")]:
        u.append(O("tile", [345, y, 165, 110], [t], note="调色板卡片（pitch 114；卡顶 186..756）"))
    u.append(O("panel", [560, 53, 2000, 1387], ["3D 视口"], note="③视口整块（R7）"))
    u.append(O("panel", [1083, 70, 394, 70], ["顶部浮动工具条"]))
    u.append(O("button", [1104, 78, 52, 54], ["工具1"]))
    u.append(O("button", [1183, 71, 94, 61], ["工具2"], selected=True))
    u.append(O("button", [1292, 78, 52, 54], ["工具3"]))
    u.append(O("button", [1384, 78, 52, 54], ["工具4"]))
    # ---- 右属性面板（长，逐行）
    u.append(O("panel", [2085, 53, 475, 690], ["属性面板"], note="④右属性面板（R3；edges x=2080 / 底 y=682）"))
    pid = len(u) - 1
    u.append(O("icon", [2122, 62, 74, 74], ["缩略图"], parent=pid))
    u.append(O("row", [2200, 60, 240, 44], ["箭头指示牌"], parent=pid, note="物件标题"))
    u.append(O("button", [2432, 58, 40, 36], ["⋯"], parent=pid))
    u.append(O("button", [2496, 58, 48, 40], ["⌃"], parent=pid))
    u.append(O("row", [2205, 100, 230, 34], ["元件ID 20001454"], parent=pid))
    u.append(O("button", [2356, 100, 34, 32], ["复制"], parent=pid))
    u.append(O("button", [2090, 176, 455, 48], ["动态单位元件"], parent=pid,
               note="类型下拉（▼ 在 x2500；edges y176..224）"))
    u.append(O("button", [2132, 244, 44, 44], ["信息"], parent=pid))
    u.append(O("button", [2200, 244, 44, 44], ["删除"], parent=pid))
    u.append(O("button", [2280, 242, 88, 46], ["橙色操作"], parent=pid, selected=True))
    u.append(O("button", [2392, 244, 44, 44], ["资产"], parent=pid))
    u.append(O("panel", [2088, 296, 460, 136], ["自定义变量分区"], parent=pid,
               note="分区整块（选中描边；R3）；逐行另标"))
    sec = len(u) - 1
    u.append(O("row", [2128, 300, 220, 40], ["自定义变量"], parent=sec, note="分区标题（▼）"))
    u.append(O("button", [2500, 300, 44, 38], ["☰"], parent=sec))
    u.append(O("row", [2105, 340, 190, 40], ["自定义变量数量"], parent=sec))
    u.append(O("chip", [2492, 344, 44, 36], ["0"], parent=sec))
    u.append(O("button", [2106, 382, 440, 46], ["详细编辑"], parent=sec, note="R3：详细编辑按钮单独成框"))
    u.append(O("panel", [2088, 444, 460, 144], ["特效播放分区"], parent=pid, note="分区整块"))
    sec2 = len(u) - 1
    u.append(O("row", [2108, 450, 180, 38], ["特效播放"], parent=sec2, note="分区标题（▼）"))
    u.append(O("button", [2500, 450, 44, 36], ["☰"], parent=sec2))
    u.append(O("row", [2100, 492, 150, 42], ["特效列表"], parent=sec2))
    u.append(O("button", [2106, 536, 440, 46], ["详细编辑"], parent=sec2))
    u.append(O("panel", [2088, 592, 460, 144], ["单位状态分区"], parent=pid, note="分区整块"))
    sec3 = len(u) - 1
    u.append(O("row", [2128, 606, 170, 40], ["单位状态"], parent=sec3, note="分区标题（▼）"))
    u.append(O("button", [2500, 606, 44, 36], ["☰"], parent=sec3))
    u.append(O("button", [2106, 646, 440, 46], ["详细编辑"], parent=sec3))
    # ---- 底部
    u += bottom_ops(with_save=True)
    u.append(O("button", [2245, 1358, 152, 44], ["添加通用组件"], note="右下浮动按钮（R4）"))
    return u


# ---------------------------------------------------------------- 时间轴共用（r044/r045）
def timeline(ox=0):
    """ox: 右侧面板在 r045 占位时时间轴仍整宽，仅用于注释。"""
    u = [O("panel", [0, 1043, 2560, 397], ["时间轴窗口"], note="④时间轴整块（R7；y1043..1440）")]
    tid = len(u) - 1
    u.append(O("chip", [36, 1043, 196, 34], ["连段技能动画"], parent=tid, selected=True,
               note="动画页签（R2 单独成框；选中=浅底）"))
    u.append(O("chip", [236, 1045, 196, 34], ["蓄力分支动画"], parent=tid))
    u.append(O("button", [2396, 1046, 40, 36], ["设置"], parent=tid))
    u.append(O("row", [2440, 1048, 70, 32], ["收起"], parent=tid))
    u.append(O("button", [2508, 1046, 42, 34], ["收起箭头"], parent=tid))
    u.append(O("button", [16, 1090, 44, 42], ["播放"], parent=tid, note="▶ 播放按钮"))
    u.append(O("chip", [58, 1092, 130, 40], ["00:00:00"], parent=tid))
    u.append(O("chip", [196, 1092, 122, 36], ["#1 公共前摇"], parent=tid))
    segs = [(425, 240, ["2", "弓箭普通攻击_01", "2.16s"]), (678, 252, ["3", "弓箭普通攻击_02", "2.36s"]),
            (930, 252, ["4", "弓箭普通攻击_03", "2.66s"]), (1180, 40, ["5"])]
    for x, w, tx in segs:
        u.append(O("chip", [x, 1090, w, 40], tx, parent=tid, note="片段条（文字+时长）"))
    u.append(O("button", [1272, 1090, 52, 40], ["+"], parent=tid))
    u.append(O("button", [8, 1146, 38, 38], ["☰"], parent=tid))
    u.append(O("button", [52, 1146, 142, 38], ["+ 新建轨道"], parent=tid))
    u.append(O("panel", [190, 1146, 2370, 40], ["时间标尺"], parent=tid,
               note="标尺带（x(t)=196+320·t 实测 1.00s@516 … 7.00s@2437）"))
    rid = len(u) - 1
    for i, lab in enumerate(["1.00s", "2.00s", "3.00s", "4.00s", "5.00s", "6.00s", "7.00s"]):
        u.append(O("chip", [506 + 320 * i, 1156, 74, 34], [lab], parent=rid, note="刻度标签（320px/s）"))
    u.append(O("chip", [896, 1146, 26, 26], ["3"], parent=rid, note="片段序号标（无文字边界，视觉定位）"))
    u.append(O("chip", [1662, 1146, 26, 26], ["4"], parent=rid))
    u.append(O("icon", [196, 1152, 26, 34], ["播放头"], parent=rid, note="播放头把手（橙色）"))
    lanes = [(1195, "开始事件轨道"), (1240, "结束事件轨道"), (1285, "建段轨道"),
             (1335, "节点图事件"), (1380, "武器模型特效01")]
    for y, name in lanes:
        u.append(O("row", [0, y, 150, 45], [name], parent=tid,
                   note="轨道标签列（R2 每轨单独成框；标签可双击重命名）"))
        u.append(O("row", [150, y, 2410, 45], [name], parent=tid, note="轨道泳道（R2 每轨单独成框）"))
    # 建段轨道片段（填充色 run 扫描 y=1324/1326 实测）
    seg_clips = [(205, 250, ["3 弓箭普通攻击_02"]), (455, 186, ["2_弓箭普通攻击_01"]),
                 (940, 70, ["预输"]), (1005, 190, ["4_弓箭普通攻击_03"]),
                 (1195, 200, ["2_弓箭普通攻击_01"]), (1840, 700, ["2_弓箭普通攻击_01"])]
    for x, w, tx in seg_clips:
        u.append(O("chip", [x, 1288, w, 42], tx, parent=tid,
                   note="建段片段（蓝色填充；边界按填充 run ±25px）"))
    # 节点图事件片段
    for x, w, tx in [(218, 140, ["角色转向_弓箭"]), (908, 150, ["角色转向_弓箭"]),
                     (1668, 140, ["角色转向_弓箭"]), (1806, 116, ["弓箭连.."])]:
        u.append(O("chip", [x, 1340, w, 36], tx, parent=tid, note="节点图事件片段（紫色药丸）"))
    # 武器模型特效片段
    for x, w in [(208, 254), (900, 236), (1656, 314)]:
        u.append(O("chip", [x, 1384, w, 38], ["特效播放"], parent=tid, note="特效片段（绿色药丸）"))
    # 轨道内 + 按钮（无文字锚点，按可见圆形按钮量）
    for x, y in [(247, 1213), (939, 1213), (1694, 1213), (869, 1259), (1625, 1259), (2477, 1259),
                 (2052, 1300)]:
        u.append(O("button", [x, y, 30, 30], ["+"], parent=tid, note="轨道内 + 插入按钮（切块图读 ±6）"))
    for x, y in [(218, 1207), (903, 1253), (1640, 1295)]:
        u.append(O("icon", [x, y, 28, 28], ["轨道标记"], parent=tid, note="轨道起点/关键帧圆点（±6）"))
    return u


# ---------------------------------------------------------------- r044
def r044():
    u = [O("panel", [0, 53, 2560, 990], ["时间轴编辑工作区（橙色背景）"], note="③编辑工作区整块（R7）")]
    u.append(O("icon", [2456, 98, 58, 50], ["Z 图标"], note="右上角 Z 标（OCR 'z' 2464,100）"))
    u.append(O("button", [2448, 10, 46, 38], ["最大化"]))
    u.append(O("button", [2502, 8, 48, 40], ["关闭"]))
    u.append(O("panel", [1090, 383, 388, 647], ["添加技能节点图弹窗"], note="④弹窗整块（R3/R9）"))
    did = len(u) - 1
    u.append(O("row", [1100, 390, 170, 42], ["添加技能节点图"], parent=did, note="弹窗标题"))
    u.append(O("button", [1424, 388, 48, 44], ["×"], parent=did))
    u.append(O("button", [1100, 450, 366, 44], ["搜索"], parent=did))
    u.append(O("button", [1090, 520, 388, 42], ["▼未分类页签"], parent=did,
               note="分组下拉（▼ 在 x1092）"))
    for y, t in [(564, "角色转向_弓箭"), (612, "弓箭连段攻击03"), (656, "弓箭连段攻击02"),
                 (701, "弓箭连段攻击01")]:
        u.append(O("row", [1100, y, 368, 44], [t], parent=did, note="节点图条目（R2 逐条）"))
    u.append(O("button", [1182, 970, 196, 58], ["打开千星沙箱"], parent=did,
               note="弹窗底部按钮（描边药丸）"))
    u += timeline()
    # 顶部条带：时间轴是全屏模式，最大化/关闭这类窗口控件不在任何面板内 —— 单列一个区域面板让它们有 parent
    # （lead 2026-10-19 裁决：真实存在的区域就该建，别为了指标硬留 null）。放在末尾以保持既有 id 不变。
    u.append(O("panel", [0, 0, 2560, 53], ["窗口控制条"],
               note="①顶部条带（全屏时间轴模式下的窗口控件区；edges y=53）"))
    return u


# ---------------------------------------------------------------- r045
def r045():
    u = [O("panel", [0, 53, 1962, 990], ["时间轴编辑工作区（橙色背景）"], note="③编辑工作区整块（R7）")]
    u.append(O("icon", [1842, 98, 58, 52], ["Z 图标"], note="工作区右上 Z 标（OCR 'z' 1849,100）"))
    u.append(O("button", [2398, 10, 44, 36], ["返回"]))
    u.append(O("button", [2448, 10, 46, 38], ["最大化"]))
    u.append(O("button", [2502, 8, 48, 40], ["关闭"]))
    u.append(O("panel", [1947, 53, 613, 519], ["特效播放面板"], note="④右属性面板整块（R3；edges x=1947 / 底 y=572）"))
    pid = len(u) - 1
    u.append(O("row", [1975, 60, 190, 40], ["特效播放"], parent=pid, note="面板标题"))
    u.append(O("button", [2486, 58, 44, 38], ["×"], parent=pid))
    u.append(O("row", [1965, 124, 585, 44], ["▼特效播放"], parent=pid,
               note="分区标题带（R3 分区整块；▼ 在 x2010）"))
    u.append(O("button", [1965, 176, 580, 62], ["箭矢01"], parent=pid,
               note="特效条目下拉（左侧缩略图 + ▼ 在 x2500）"))
    u.append(O("row", [1965, 250, 580, 42], ["是否播放特效资产音效"], parent=pid))
    u.append(O("button", [2492, 250, 60, 40], ["开关-关"], parent=pid, note="开关（灰=关）"))
    u.append(O("row", [1965, 296, 580, 42], ["单位挂接点"], parent=pid))
    u.append(O("button", [2255, 296, 290, 42], ["GI_WeaponR"], parent=pid, note="下拉字段"))
    for y, lab, vals in [(342, "位置", ["X 0.00", "Y 0.00", "Z 0.00"]),
                         (388, "旋转", ["X 0.00", "Y 0.00", "Z 0.00"])]:
        u.append(O("row", [1965, y, 580, 42], [lab], parent=pid))
        for i, v in enumerate(vals):
            u.append(O("chip", [2100 + 140 * i, y, 134, 42], [v], parent=pid, note="数值框（XYZ）"))
    u.append(O("row", [1965, 434, 580, 42], ["缩放"], parent=pid))
    u.append(O("chip", [2255, 434, 290, 42], ["1.00"], parent=pid))
    u.append(O("row", [1965, 480, 580, 38], ["是否跟随位置"], parent=pid))
    u.append(O("button", [2500, 476, 56, 42], ["开关-开"], parent=pid, selected=True))
    u.append(O("row", [1965, 524, 580, 38], ["是否跟随旋转"], parent=pid))
    u.append(O("button", [2500, 520, 56, 42], ["开关-开"], parent=pid, selected=True))
    u += timeline()
    return u


FRAMES = {
    "r026_snap_2026-10-19_00-27-05": (r026, "编辑器·关卡设置（视口+左资源树；无属性面板）",
                                      ["①顶栏", "②左资源栏", "③3D 视口/浮动工具条", "④四角小件"]),
    "r032_snap_2026-10-19_00-30-42": (r032, "编辑器·关卡设置弹窗（阵营页）+左树调色板+右属性面板",
                                      ["①顶栏", "②左树+调色板", "③视口", "④关卡设置弹窗", "⑤右属性面板/底部"]),
    "r034_snap_2026-10-19_00-31-33": (r034, "编辑器·背景音乐管理弹窗+背景音乐库+右属性面板（最密）",
                                      ["①顶栏", "②左树+调色板", "③视口", "④背景音乐窗口+库", "⑤右属性面板/底部"]),
    "r040_snap_2026-10-19_00-36-18": (r040, "编辑器·物件元件（六页签+竖图标栏+右属性面板三段）",
                                      ["①顶栏", "②竖图标栏+左树+调色板", "③视口", "④右属性面板", "⑤底部"]),
    "r044_snap_2026-10-19_00-37-57": (r044, "编辑器·时间轴（添加技能节点图弹窗+五轨时间轴）",
                                      ["①顶栏窗口控件", "②橙色工作区", "③添加技能节点图弹窗", "④时间轴"]),
    "r045_snap_2026-10-19_00-38-06": (r045, "编辑器·时间轴/轨道+特效播放属性面板",
                                      ["①顶栏窗口控件", "②橙色工作区", "③特效播放面板", "④时间轴"]),
}


ANCHORS = {
    "r026_snap_2026-10-19_00-27-05": {
        "measured_anchors": {
            "topbar_h": 53, "left_panel": [0, 53, 480, 1387], "tab_chip": [250, 0, 196, 52],
            "search_box": [24, 133, 432, 42], "tree_row_pitch": 41, "first_row_y": 195,
            "toolbar_pill": [1083, 70, 394, 70], "selected_tool_orange": [1183, 71, 94, 61],
            "hex_icon": [1229, 653, 78, 108],
        },
        "uncertain": [
            "页签『关卡设置 ×』chip 左右沿按可见浅色带读（250..446）；非激活页签无描边可量，±10px",
            "视口中央六边形关卡图标与上方白锥重叠，按黄色六边形读，±8px",
            "树行宽取满栏 460（树自身无可见行皮肤；高亮行只见 pill 55..255），按 R8 惯例取栏宽",
            "右上浮动控件（绿箭头+X）无文字，按可见灰色底块量，±6px",
            "左栏内容止于 y≈1125，下方 1125..1440 为空白 + 宿主 HUD（min:/max:/UID 不计单元）",
        ],
    },
    "r032_snap_2026-10-19_00-30-42": {
        "measured_anchors": {
            "left_panel": [0, 53, 480, 1387], "tree_col_edge": 268, "palette_col": [276, 175, 194, 1100],
            "palette_card_pitch": 115, "palette_card": [315, 185, 135, 115],
            "dialog": [561, 334, 1430, 772], "dialog_menu_band": [561, 449, 438, 46],
            "dialog_content_x": 999, "faction_left_col_x": 1018, "faction_right_col": [1663, 0, 287, 0],
            "prop_panel": [2080, 53, 480, 377], "prop_icon_row_y": 196,
        },
        "uncertain": [
            "弹窗右缘竖条（滚动条）1950..1986 由三段亮差读，宽 ±10px",
            "阵营块右列字段 x1663..1950 由 1.4x 放大切块图读，±8px",
            "『包含的实体』计数（立方图标/单位图标 + 数值）合并成 74px 框，图标本身无文字",
            "调色板卡片把缩略图与下方标签合成一整卡（R3 视觉整块），卡高按 pitch 115 取",
            "顶部浮动条 4 键按等分位量（图标无文字），±8px",
            "弹窗标题栏『?』『—』按 3x 放大图读（1903..1928 / 1958..1985），±4px",
        ],
    },
    "r034_snap_2026-10-19_00-31-33": {
        "measured_anchors": {
            "music_window": [801, 387, 958, 665], "music_header_bottom": 440,
            "asset_select_row": [835, 523, 890, 74], "time_fields": [[820, 631, 210, 69], [1522, 631, 210, 69]],
            "volume_rail": [866, 742, 754, 22], "val_box": [1648, 730, 92, 44],
            "toggle_off": [1658, 816, 72, 46], "interval_box": [1455, 926, 112, 44],
            "library_panel": [1759, 387, 390, 665], "lib_item_pitch": 46,
            "prop_panel": [2080, 53, 480, 377],
        },
        "uncertain": [
            "背景音乐库每条＝名称行+索引行合并成 46px 行；最后一条『海风细语』被库面板底 y1052 裁切（clipped.bottom）",
            "音量/播放速度滑轨右端按橙色填充段量（音量 866..1619），滑块圆点 ±5px",
            "两个开关（是否淡入淡出/是否循环播放）灰=关，框由 edges x1666..1725 左右各扩 8px",
            "时间字段拆成『00 / : / 00.00』三子框，框体按 edges y631..700 与 x833..1024 量",
            "窗口标题栏三个图标由 ASCII 像素图定位（? 1663..1684 / — 1705..1730 / × 1735..1755），±4px",
            "背景音乐库浮在右属性面板左侧之上，两块在 x2080..2149 重叠（真实层级，非重复框）",
        ],
    },
    "r040_snap_2026-10-19_00-36-18": {
        "measured_anchors": {
            "left_panel": [0, 53, 560, 1387], "rail": [0, 53, 88, 1387], "tree_text_x": 95,
            "palette_card": [345, 186, 165, 110], "palette_pitch": 114,
            "prop_panel": [2085, 53, 475, 690], "prop_bottom": 682,
            "section_boxes": [[2088, 296, 460, 136], [2088, 444, 460, 144], [2088, 592, 460, 144]],
            "desc_buttons": [[2106, 382, 440, 46], [2106, 536, 440, 46], [2106, 646, 440, 46]],
            "tabs": [[250, 190], [425, 215], [625, 205], [818, 255], [1080, 215], [1290, 200]],
        },
        "uncertain": [
            "左竖图标栏 4 个图标本身无文字，按可见底块量，±6px",
            "调色板卡 x345..510（标签 409..513 略偏右于卡心 427），卡高按 pitch 114 取",
            "属性面板底沿取 edges 首个跃变 y=682（另见 698/708/730，均为分区内框）",
            "『自定义变量』分区选中描边 2088..2548 / 296..432，±6px",
            "底部对象操作条第二行（轴向/删除/保存）按可见深色底块量，±6px",
        ],
    },
    "r044_snap_2026-10-19_00-37-57": {
        "measured_anchors": {
            "workspace": [0, 53, 2560, 990], "dialog": [1090, 383, 388, 647],
            "timeline_window": [0, 1043, 2560, 397], "track_rows_y": [1195, 1240, 1285, 1335, 1380],
            "track_label_w": 150, "ruler_formula": "x(t)=196+320*t", "ruler_ticks_x": [516, 833, 1153, 1474, 1795, 2116, 2437],
            "seg_lane_clips": [[205, 455], [455, 641], [940, 1010], [1005, 1195], [1195, 1395], [1840, 2540]],
        },
        "uncertain": [
            "建段轨道片段边界按扫描线 y=1324/1326 的蓝色填充 run 折中（428..927 / 996..1683 / 1855..2535），左端 205 由 y=1310 扫描补，±25px",
            "时间标尺线性 x(t)=196+320·t 由 7 个刻度标签实测反推（1.00s@516 … 7.00s@2437）",
            "轨道内『+』插入按钮与关键帧圆点无文字，按可见圆形按钮量，±6px",
            "片段序号标『3』『4』贴在标尺带上，无独立皮肤，按文字框 ±文字中线量",
            "弹窗『打开千星沙箱』按可见描边药丸量（1182..1378），±8px",
        ],
    },
    "r045_snap_2026-10-19_00-38-06": {
        "measured_anchors": {
            "workspace": [0, 53, 1962, 990], "prop_panel": [1947, 53, 613, 519],
            "prop_bottom": 572, "xyz_fields_x": [2100, 2240, 2380],
            "timeline_window": [0, 1043, 2560, 397], "ruler_formula": "x(t)=196+320*t",
        },
        "uncertain": [
            "特效播放面板底沿 y=572（edges x=2200 单次跃变）",
            "位置/旋转的 XYZ 三个数值框起 x=2100/2240/2380、宽 134，按可见深色框量，±6px",
            "两个开关为『开』（橙色）2510..2556，框宽按可见药丸量",
            "时间轴部分与 r044 同一套锚点（标尺 x(t)=196+320·t、五轨 y=1195/1240/1285/1335/1380）",
            "建段轨道片段同 r044，按填充 run 折中，±25px",
        ],
    },
}

RULES = {
    "R1": "右上窗口控件按右沿定位：关闭 2502..2550、设置 2426..2478（edges x=30 扫线）",
    "R2": "逐项：左树 22~29 行逐行、库 9 条曲目逐条、弹窗菜单 10 项/节点图 4 条逐条、轨道 5 条逐条、时间轴片段逐条",
    "R3": "区域级整块：顶栏/左栏/视口/弹窗/属性面板/时间轴；面板内可见行仍逐行（r040 三段各带一个「详细编辑」单独成框）",
    "R4": "四角贴边扫：底中相机参数 3.00/30/0.10、右下「添加节点图/添加通用组件」、r040 底中「保存」、右上浮动控件",
    "R5": "页签宽按可见皮肤：实测 190/215/205/255/215/200（v5 旧值 330~420 宽出 130~230px，本轮全部重量）",
    "R6": "整栏：r026/r032/r034 左栏 [0,53,480,1387]（树列 0..268 + 调色板 276..470）；r040 左栏 [0,53,560,1387] + 竖图标栏 [0,53,88,1387]",
    "R7": "区域级：视口 [480,53,2080,1387]、属性面板、弹窗、时间轴窗口均整块成框",
    "R8": "行按可见皮肤量：树行 x=8 w=460/258/242（随栏宽）；库条目 1765..2137；属性面板行 2105..2540",
    "R9": "先判分区再量 y：弹窗/时间轴内元素先归块（parent 指向容器 id），再量块内 y；跨块不合并",
    "R10": "四角：左上 HUD/文档图标、右上撤销重做齿轮面板、左下 HUD perf（不计单元）、右下 UID/浮动按钮",
}


def build(stem):
    fn, family, blocks = FRAMES[stem]
    units = fn()
    objs = []
    for i, o in enumerate(units):
        o["id"] = i
        objs.append(o)
    return {
        "frame": stem,
        "image": os.path.join(REPS, stem + ".jpg"),
        "size": [2560, 1440],
        "annotator": "perception(subagent) · 切块标注法（block-wise，6 块并行量边后汇总）",
        "criteria": ".agents/skills/gui-annotation/SKILL.md（R1–R10）",
        "layout": " / ".join(blocks),
        "classes": ["切块标注法"],
        "units": len(objs),
        "_provenance": {
            "family": family,
            "blocks": blocks,
            "rules_applied": RULES,
            "tool_assist": "grid.py 分块裁剪（标签=原帧坐标）+ edges.py 扫描线 + rows_from_ocr.py 行枚举 + "
                           "自写颜色 run 扫描（时间轴片段填充）+ ASCII 像素图（窗口小图标）；无 ys-screen 先验",
            "ys_screen_prior": False,
            "measured_anchors": ANCHORS[stem]["measured_anchors"],
            "uncertain": ANCHORS[stem]["uncertain"],
            "changed_from_prev": "本轮为重新量测的新版（truth-v8-editor），未复用 truth-v5 坐标",
        },
        "objects": objs,
    }


def main():
    """生成 6 帧真值。

    ⚠️ 覆盖守卫：本脚本是**数据源**，重跑会用内嵌表整份覆盖目标 JSON —— 而 parent/groups 是
    `_add_hierarchy.py` 之后补的（不在内嵌表里）。凡目标文件已含 `_provenance.hierarchy`，
    默认 SKIP；确需重生成请加 `--force`（代价：先备份或重跑 `_add_hierarchy.py`）。
    同款教训见 D404（生成器把人手修复整批抹掉）。
    """
    force = "--force" in sys.argv
    for stem in FRAMES:
        path = os.path.join(OUT, stem + ".json")
        if os.path.exists(path) and not force:
            try:
                old = json.load(open(path, encoding="utf-8"))
            except Exception:
                old = {}
            if (old.get("_provenance") or {}).get("hierarchy"):
                print("SKIP %s（已含 hierarchy；--force 才覆盖）" % stem)
                continue
        d = build(stem)
        path = os.path.join(OUT, stem + ".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
        print(f"wrote {path} units={d['units']}")


if __name__ == "__main__":
    main()
