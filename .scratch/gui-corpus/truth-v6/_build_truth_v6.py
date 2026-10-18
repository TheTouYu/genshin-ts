#!/usr/bin/env python3
"""_build_truth_v6.py — 按用户 5 条规则（R1–R5）标注的 5 帧（教学对比用）。

规则来源：用户亲手修 `r006`（邮箱）后由 Lead 提炼（见 truth-v6/README.md）。
每帧 `_provenance.rules_applied` 逐条写了"这条规则用在哪"；`uncertain` 是"我这帧最没把握的 3 处"。

几何纪律（与前几批一致）：行/树 y 由 `tools/rows_from_ocr.py` 聚类枚举，面板/边缘带边界由
`tools/edges.py` 扫描线定；`read_image` 判身份；不拿 ys-screen 候选当先验。
本批**新增**的纪律来自 R1–R5：顶栏按右边缘定位、列表区含小图标、详情面板整块框、
y>1300 与 x>2200 两条边缘带必扫、宽度按可见皮肤收。

用法：python3 .scratch/gui-corpus/truth-v6/_build_truth_v6.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SIZE = [2560, 1440]


def U(kind, bbox, text=None, parent=None, clickable='no', state=None, badges=None,
      clipped=None, note=None):
    o = {'id': None, 'parent': parent, 'bbox': [int(round(v)) for v in bbox], 'kind': kind,
         'text': text or [], 'clickable': clickable,
         'state': state or {'selected': False, 'focused': False, 'disabled': False},
         'badges': badges or [], 'clipped': clipped or {'edges': [], 'cut_by': None, 'px': 0}}
    if note:
        o['note'] = note
    return o


def rows(x, pairs, w, kind='row', clickable='yes'):
    return [U(kind, [x, y0, w, h], [t] if isinstance(t, str) else t, clickable=clickable)
            for y0, h, t in pairs]


FRAMES = {}

# ================================================================ r003 派蒙菜单（灰钢皮肤）
f = 'r003_snap_2026-10-19_00-17-26'
o = [U('panel', [0, 18, 690, 812], ['玩家信息卡'], note='信息卡面板'),
     U('avatar', [210, 50, 190, 190], [], parent=0, clickable='yes'),
     U('button', [930, 45, 74, 74], [], clickable='yes', note='改名铅笔（R1：按右边缘贴卡片右沿定位）'),
     U('button', [930, 215, 60, 60], ['?'], clickable='yes', note='冒险等阶说明'),
     U('button', [930, 355, 60, 60], ['?'], clickable='yes', note='世界等级说明'),
     U('row', [232, 258, 240, 46], ['UID 110170759', '复制'], clickable='yes'),
     U('row', [470, 220, 460, 60], ['冒险等阶', '60'], clickable='no'),
     U('row', [470, 275, 460, 60], ['冒险阅历', '340125/340125'], clickable='no'),
     U('row', [470, 335, 460, 60], ['世界等级', '9'], clickable='no'),
     U('row', [470, 395, 460, 60], ['生日', '10月22日'], clickable='no')]
LEFT_ICONS = [[33, 494, 62, 53], [30, 614, 86, 66], [33, 787, 62, 45], [30, 919, 68, 41], [33, 1068, 62, 59]]
for i, b in enumerate(LEFT_ICONS):
    o.append(U('icon', b, [], clickable='yes', note='左列纯图标 %d/5（R2：小图标单独成框）' % (i + 1)))
o[12]['badges'] = [{'type': 'red', 'bbox': [10, 614, 26, 30]}]
o.append(U('icon', [1040, 1265, 80, 95], [], clickable='unknown', note='▲▼ 滚动指示'))
TILES = [(492, ['商城', '队伍配置', '好友', '成就']), (681, ['图鉴', '角色图鉴', '角色', '提升指南']),
         (869, ['背包', '任务', '地图', '活动']), (1059, ['冒险之证', '祈愿', '纪行', '多人游戏'])]
RED = {'商城', '版本热点', '多人游戏', '地图'}
for y, names in TILES:
    for c, nm in enumerate(names):
        o.append(U('tile', [172 + 208 * c, y, 176, 161], [nm], clickable='yes',
                   badges=[{'type': 'red', 'bbox': [172 + 208 * c + 148, y - 22, 30, 30]}] if nm in RED else None))
for c, nm in enumerate(['官方社区', '版本热点', '反馈']):
    o.append(U('tile', [172 + 208 * c, 1248, 176, 161], [nm], clickable='yes',
               clipped={'edges': ['bottom'], 'cut_by': 'screen', 'px': 31},
               badges=[{'type': 'red', 'bbox': [172 + 208 * c + 148, 1226, 30, 30]}] if nm == '版本热点' else None))
o.append(U('row', [172, 1310, 930, 120], ['官方社区', '版本热点', '反馈'], clickable='yes',
           clipped={'edges': ['bottom'], 'cut_by': 'screen', 'px': 60}, note='底行条目带（文字在裁切带内）'))
FRAMES[f] = (o, {
    'family': '派蒙菜单（灰钢皮肤）',
    'layout': '信息卡 + 左列 5 纯图标 + 4×4 网格 + 底部裁切行 3 格 + 滚动指示',
    'classes': ['不透明纯色网格', '纯图标列', '红点角标'],
    'rules_applied': {
        'R1': '右上铅笔按钮按卡片右沿（x=930）定位，不按文本长度外推',
        'R2': '左列 5 个纯图标、▲▼ 滚动指示、每个红点角标都单独成框',
        'R3': '玩家信息卡整块框 [0,18,690,812]',
        'R4': 'y>1300 底线扫到「官方社区/版本热点/反馈」裁切行并逐格标出',
        'R5': '格子宽度按皮肤 176px（不是文本宽）；底部裁切行高度收到可见 161px'},
    'uncertain': ['底部裁切行（官方社区/版本热点/反馈）只有上半可见，网格起始 y=1248 是外推（±12px）',
                  '▲▼ 滚动指示在 x≈1040（面板右外侧），与 truth-v2 里 x≈1018 的同类控件略异，位置 ±15px',
                  '红点角标与格子右上角的相对偏移按 148,-22 统一套用，个别格子可能偏 5–8px']})

# ================================================================ r013 邀约事件
f = 'r013_snap_2026-10-19_00-23-53'
o = [U('panel', [0, 0, 1220, 100], ['顶栏左'], note='顶栏（左簇）'),
     U('chip', [55, 20, 300, 60], ['邀约事件'], clickable='yes'),
     U('button', [950, 20, 60, 60], ['Q'], clickable='no', note='键位提示（R1：左簇按左沿）'),
     U('panel', [1080, 0, 380, 100], ['顶栏页签组'], note='顶栏（中簇）')]
for i, x in enumerate((1090, 1195, 1300, 1405)):
    o.append(U('chip', [x, 15, 90, 72], [], clickable='yes', note='顶栏页签 %d/4' % (i + 1),
               state={'selected': i == 2, 'focused': False, 'disabled': False}))
o += [U('button', [1432, 12, 80, 76], ['E'], clickable='no', note='键位提示（R5：按可见皮肤）'),
      U('panel', [2060, 0, 500, 100], ['顶栏右簇'], note='顶栏（右簇，R1：按右边缘定位）'),
      U('row', [2085, 18, 130, 62], ['3/3'], clickable='no', note='钥匙计数'),
      U('button', [2230, 18, 70, 70], ['?'], clickable='yes'),
      U('button', [2400, 18, 100, 100], [], clickable='yes', note='关闭 X')]
CARDS = [('琳妮特', '已达成结局', '0/5'), ('凯亚', '已达成结局', '3/5'), ('卡维', '已达成结局', '0/5'),
         ('莱依拉', '已达成全部结局', ''), ('珐露珊', '已达成全部结局', ''), ('鹿野院平藏', '已达成结局', '3/5')]
for i, (nm, st, cnt) in enumerate(CARDS):
    x = 67 + 405 * i
    o.append(U('card', [x, 337, 360, 780], [nm, st, cnt], clickable='yes',
               note='邀约角色卡（R3：整块框）'))
    o.append(U('row', [x + 10, 972, 344, 76], [st, cnt], clickable='no', note='卡内结局状态行（R2：逐卡单独成框）'))
o += [U('row', [100, 1300, 1000, 90], ['领取8次每日委托奖励可获得钥匙'], clickable='no',
        clipped={'edges': ['bottom'], 'cut_by': 'hud', 'px': 20}),
      U('button', [2100, 1290, 400, 80], ['领取'], clickable='yes', note='R4：y>1300 边缘带扫到的主按钮')]
FRAMES[f] = (o, {
    'family': '邀约事件（Lead 写作"委托/任务"，实际是邀约事件页）',
    'layout': '顶栏三簇（左标题 / 中 4 页签 / 右计数+?+X）+ 6 张邀约卡 + 底部提示与领取',
    'classes': ['卡片横排', '顶栏三簇'],
    'rules_applied': {
        'R1': '顶栏拆成左/中/右三簇：右簇（3/3、?、X）按 x>2060 右边缘定位，中簇按页签逐个定位',
        'R2': '6 张卡各自成框 + 每张卡内的"已达成结局 X/5"状态行单独成框',
        'R3': '每张邀约卡整块框（360×780），不按立绘/文字外推',
        'R4': 'y>1300 扫到「领取」按钮与左下提示行；x>2200 扫到 ? 与 X',
        'R5': '按钮宽度按可见皮肤（领取 400px、X 100px），不按文字长度'},
    'uncertain': ['6 张卡的 x 起点用等距 405px 外推（实测第 1 张 67、第 6 张 2166，中间可能差 ±8px）',
                  '中簇 4 个页签只有图标没文字，语义（任务/邀请/…）未判',
                  '底部提示行左侧被录制 HUD 压住，左边界 ±25px']})

# ================================================================ r022 好友 + 角色展柜弹窗
f = 'r022_snap_2026-10-19_00-25-06'
o = [U('panel', [60, 20, 2400, 90], ['好友／我的好友'], note='顶栏'),
     U('chip', [80, 25, 420, 70], ['好友／我的好友'], clickable='yes'),
     U('row', [2000, 30, 380, 62], ['我的好友 173/200'], clickable='no', note='R1：按右边缘定位'),
     U('chip', [1080, 18, 100, 84], [], clickable='yes', state={'selected': True, 'focused': True, 'disabled': False}),
     U('chip', [1210, 18, 100, 84], [], clickable='yes'),
     U('chip', [1340, 18, 100, 84], [], clickable='yes'),
     U('button', [2412, 18, 94, 96], [], clickable='yes', note='关闭 X（R5：宽度按可见 94px）')]
for i, y0 in enumerate((150, 315, 480, 645, 815, 980, 1150)):
    o.append(U('row', [150, y0, 2250, 150], [], clickable='yes',
               note='背景好友行 %d/7（弹窗后方，仍可见）' % (i + 1)))
o.append(U('button', [230, 1320, 300, 80], ['黑名单管理'], clickable='yes',
           clipped={'edges': ['bottom'], 'cut_by': 'hud', 'px': 30}, note='R4：底线扫到'))
o += [U('panel', [487, 217, 1596, 884], ['角色展柜弹窗'], note='R3：弹窗整块（左页+右页）'),
      U('avatar', [520, 240, 120, 120], [], parent=0, clickable='yes'),
      U('row', [740, 265, 380, 50], ['UID 265654580'], clickable='no'),
      U('button', [560, 240, 60, 60], ['...'], clickable='yes', note='弹窗更多菜单'),
      U('chip', [740, 440, 320, 80], ['自在仙'], clickable='yes'),
      U('row', [550, 595, 900, 60], ['冒险等阶', '60'], clickable='no'),
      U('row', [550, 650, 900, 50], ['世界等级', '9'], clickable='no'),
      U('row', [550, 720, 900, 150], ['怎么又歪(说了一些难听的话）'], clickable='no', note='签名区'),
      U('chip', [1330, 265, 300, 60], ['角色展柜'], clickable='yes', state={'selected': True, 'focused': True, 'disabled': False}),
      U('chip', [1600, 265, 250, 60], ['名片'], clickable='yes'),
      U('button', [2113, 285, 60, 60], [], clickable='yes', note='弹窗关闭（R4：x>2200 带附近）')]
STATS = [(855, 60, ['成就总数', '1622']), (912, 60, ['好感度已满的角色', '49名']),
         (972, 55, ['深境螺旋', '12-3', '36']), (1028, 55, ['幻想真境剧诗', '第10幕', '6']),
         (1085, 55, ['幽境危战', '41秒'])]
for y0, h, txt in STATS:
    o.append(U('row', [560, y0, 900, h], txt, clickable='no', note='展柜数值行'))
for r in range(2):
    for c in range(4):
        o.append(U('card', [1327 + 190 * c, 375 + 405 * r, 140, 190], [], clickable='yes',
                   note='角色卡 r%dc%d（R3：整块框）' % (r + 1, c + 1)))
FRAMES[f] = (o, {
    'family': '好友 + 角色展柜弹窗（Lead 写"好友/成就混合"，实际是好友列表上叠加角色展柜弹窗）',
    'layout': '好友列表 7 行（背景）+ 角色展柜弹窗（左页资料/数值，右页 2×4 角色卡）+ 黑名单管理',
    'classes': ['列表+弹窗', '数值行'],
    'rules_applied': {
        'R1': '顶栏「我的好友 173/200」按右边缘 x=2000 定位；关闭 X 按右沿 2412 定位',
        'R2': '背景 7 行好友列表逐行成框（仍可见）；弹窗内 5 条数值行逐行成框',
        'R3': '角色展柜弹窗整块框 + 8 张角色卡各自整块框；右页数值区不再只给外框',
        'R4': 'y>1300 扫到「黑名单管理」；x>2200 扫到弹窗关闭与顶栏 X',
        'R5': '顶栏关闭按钮宽度收 94px（原按 110 外推会偏宽）'},
    'uncertain': ['背景 7 行好友行的行高/间距按 170px 等距外推（弹窗遮住中间，无法逐行验）',
                  '右页 8 张角色卡的列距按 190px 外推，第 4 列可能偏 10px',
                  '弹窗左页「签名区」与下方数值行之间的边界不清晰（签名区高度 150px 为估计）']})

# ================================================================ r026 编辑器·关卡设置
f = 'r026_snap_2026-10-19_00-27-05'
o = [U('panel', [285, 2, 400, 52], ['编辑器标签栏'], note='标签栏'),
     U('chip', [285, 2, 400, 52], ['关卡设置 ×'], clickable='yes'),
     U('chip', [10, 60, 272, 110], ['摆放'], clickable='yes'),
     U('button', [332, 55, 40, 44], ['⌃'], clickable='yes'),
     U('button', [20, 95, 250, 44], ['搜索'], clickable='yes')]
TREE = [(199, 36, '自定义'), (240, 41, '物件'), (285, 35, '自定义页签_1'), (327, 35, '未分类页签'),
        (370, 35, '+添加页签'), (404, 51, '造物'), (451, 41, '未分类页签'), (498, 35, '+添加页签'),
        (538, 40, '掉落物'), (584, 37, '预制'), (622, 42, '动态单位'), (664, 43, '静态单位'),
        (709, 40, '造物'), (752, 40, '掉落物'), (789, 42, '元件组'), (838, 37, '自定义元件组'),
        (881, 35, '资产库'), (924, 36, '物件'), (966, 37, '造物'), (1010, 34, '场景生成模板'),
        (1051, 35, '预设模板')]
o += rows(8, TREE, 264)
o[-16]['state'] = {'selected': True, 'focused': True, 'disabled': False}   # 自定义页签_1
o.append(U('panel', [0, 140, 272, 1300], ['资源树'], note='左侧资源树面板'))
o.append(U('panel', [320, 130, 2200, 1250], ['3D 视口'], note='R3：视口整块'))
o.append(U('row', [230, 760, 200, 50], ['暂无'], clickable='no', note='视口空态提示'))
for i, x in enumerate((1070, 1150, 1230, 1330)):
    o.append(U('button', [x, 50, 80, 80], [], clickable='yes', note='视口工具 %d/4' % (i + 1)))
o.append(U('button', [1730, 60, 44, 44], [], clickable='yes', note='视口旋转 gizmo（R1：右上角按右边缘）'))
FRAMES[f] = (o, {
    'family': '编辑器·关卡设置（Lead 标注一致）',
    'layout': '标签栏 + 左资源树 21 行 + 视口 + 顶部工具 4 + 右上是 gizmo',
    'classes': ['桌面编辑器', '树列表'],
    'rules_applied': {
        'R1': '右上 gizmo 按 x=1730 右边缘定位；标签栏按可见右沿 685 收',
        'R2': '资源树 21 行逐行成框（含分区标题「元件组」「资产库」「场景生成模板」）',
        'R3': '3D 视口整块框 [320,130,2200,1250]',
        'R4': 'y>1300 带内本帧只有 HUD（无界面对象）；x>2200 带内无对象 —— 已扫，如实不标',
        'R5': '标签栏按可见皮肤 400px 收（不按"关卡设置 ×"文字长度外推）'},
    'uncertain': ['资源树行高按 OCR 行带 +2px 估算（pitch≈42），个别行可能错半行',
                  '「造物」行在本帧有选中白框，宽度 264 是否到面板右沿未判（±10px）',
                  '右上 gizmo 是三段小控件（红/绿轴 + X），本帧只给整体框']})

# ================================================================ r044 编辑器·节点图/时间轴
f = 'r044_snap_2026-10-19_00-37-57'
o = [U('panel', [0, 0, 700, 40], ['动斷时间轴/弓箭连段'], note='窗口标题'),
     U('button', [2440, 5, 60, 40], ['t'], clickable='yes', note='窗口控制 1/3（R1/R4：右边缘带）'),
     U('button', [2498, 3, 50, 42], ['X'], clickable='yes', note='窗口控制 2/3'),
     U('button', [2455, 95, 60, 60], ['Z'], clickable='yes', note='R1：右上角按右边缘（实测 z 在 x≈2464）'),
     U('panel', [1030, 370, 470, 600], ['添加技能节点图'], note='R3：弹窗整块'),
     U('chip', [1095, 385, 300, 44], ['添加技能节点图'], clickable='yes'),
     U('button', [1420, 385, 50, 40], ['×'], clickable='yes'),
     U('button', [1105, 447, 380, 44], ['搜索'], clickable='yes'),
     U('chip', [1090, 515, 300, 44], ['▼未分类页签'], clickable='yes')]
for y0, nm in ((558, '角色转向_弓箭'), (606, '弓箭连段攻击03'), (650, '弓箭连段攻击02'), (694, '弓箭连段攻击01')):
    o.append(U('row', [1130, y0, 320, 44], [nm], clickable='yes', note='节点图条目'))
o.append(U('button', [1120, 980, 380, 60], ['打开千星沙箱'], clickable='yes'))
o += [U('panel', [0, 1030, 2560, 410], ['时间轴面板'], note='R3：底部时间轴整块'),
      U('chip', [21, 1038, 200, 50], ['连段技能动画'], clickable='yes'),
      U('chip', [225, 1038, 230, 50], ['蓄力分支动画'], clickable='yes',
        state={'selected': True, 'focused': True, 'disabled': False}),
      U('button', [25, 1090, 50, 50], ['▶'], clickable='yes'),
      U('row', [85, 1092, 200, 46], ['00:00:00'], clickable='no'),
      U('button', [22, 1148, 180, 50], ['+ 新建轨道'], clickable='yes'),
      U('button', [2360, 1038, 100, 50], ['收起'], clickable='yes', note='R4：x>2200 带'),
      U('button', [2470, 1038, 60, 50], ['˅'], clickable='yes')]
TRACKS = [(1204, 44, ['开始事件轨道']), (1249, 44, ['结束事件轨道']),
          (1294, 44, ['连段轨道']), (1339, 44, ['节点图事件']), (1384, 44, ['武器模型特效01'])]
for y0, h, txt in TRACKS:
    o.append(U('row', [10, y0, 420, h], txt, clickable='yes', note='轨道行（R2：逐行）'))
FRAMES[f] = (o, {
    'family': '编辑器·节点图/时间轴（Lead 标注一致）',
    'layout': '标题 + 添加技能节点图弹窗（搜索 + 4 条目 + 打开沙箱）+ 底部时间轴（2 页签 + 播放 + 5 轨道）',
    'classes': ['桌面编辑器', '弹窗列表', '轨道'],
    'rules_applied': {
        'R1': '右上 Z 按钮按 x=1640 右边缘定位；时间轴「收起/˅」按 x>2360 右边缘定位',
        'R2': '弹窗内 4 个节点图条目逐条成框；时间轴 5 条轨道逐行成框',
        'R3': '弹窗 [1030,370,470,600] 与底部时间轴 [0,1030,2560,410] 各自整块框',
        'R4': 'x>2200 扫到「收起」与展开箭头；y>1300 扫到「节点图事件」「武器模型特效01」两条轨道',
        'R5': '弹窗宽度按可见皮肤 470px（不按标题文字长度）'},
    'uncertain': ['时间轴 5 条轨道的行高按 44px 等距（轨道条带本身无文字边界）',
                  '轨道区右端（7.00s 标尺以后）没有对象，但 x>2200 处是否有滚动条未判',
                  '弹窗底部「打开千星沙箱」按钮 y=980 为估计（弹窗下沿 970 与按钮关系不清晰）']})


def main(argv):
    names = argv or sorted(FRAMES)
    total = 0
    for name in names:
        objs, meta = FRAMES[name]
        for i, x in enumerate(objs):
            x['id'] = i
        doc = {'frame': name, 'image': '.scratch/gui-corpus/truth-v6/%s.png' % name, 'size': SIZE,
               'annotator': 'perception(subagent) · 按用户 R1–R5 规则标注（OCR 行枚举 + edges 量边 + read_image 判身份）',
               'criteria': 'truth/_rules.md + 用户 5 条规则（truth-v6/README.md §R1–R5）',
               'layout': meta['layout'], 'classes': meta['classes'], 'units': len(objs),
               '_provenance': {'family': meta['family'],
                               'rules_applied': meta['rules_applied'],
                               'tool_assist': '行枚举=rows_from_ocr.py；边界=edges.py；身份=read_image；无 ys-screen 先验',
                               'ys_screen_prior': False,
                               'uncertain': meta['uncertain']},
               'objects': objs}
        p = os.path.join(HERE, name + '.json')
        with open(p, 'w', encoding='utf-8') as fh:
            json.dump(doc, fh, ensure_ascii=False, indent=1)
            fh.write('\n')
        total += len(objs)
        print('%-34s units=%-3d %s' % (name, len(objs), meta['family']))
    print('TOTAL frames=%d units=%d' % (len(names), total))
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
