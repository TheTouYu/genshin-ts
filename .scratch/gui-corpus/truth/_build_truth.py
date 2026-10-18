#!/usr/bin/env python3
"""_build_truth.py — 生成 .scratch/gui-corpus/truth/f00..f13.json（票 23 真值集，bbox 级）。

为什么用生成器而不是手写 14 个 JSON：坐标是读数（要能复算、能 diff）、单位定义要一处改全改。
标注方法（怎么得到这些 bbox）见同目录 `_rules.md`；本文件只承载数据。

用法：python3 .scratch/gui-corpus/truth/_build_truth.py   （只写 truth/*.json，不碰帧）
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SIZE = [2560, 1440]

# kind ∈ panel|row|tile|card|button|icon|avatar|chip  （AGI-BAR §四；chip=窄条/页签）
# 统一 bbox = [x, y, w, h]，与 tools/ys-screen containers[].bbox 同口径。


def U(kind, bbox, text=None, parent=None, clickable='no', state=None,
      badges=None, clipped=None, note=None):
    o = {'id': None, 'parent': parent, 'bbox': bbox, 'kind': kind,
         'text': text or [], 'clickable': clickable,
         'state': state or {'selected': False, 'focused': False, 'disabled': False},
         'badges': badges or [],
         'clipped': clipped or {'edges': [], 'cut_by': None, 'px': 0}}
    if note:
        o['note'] = note
    return o


def reddot(bbox):
    return {'type': 'red', 'bbox': bbox}


# ---------------------------------------------------------------- 活动一览（f00–f05）
# 左列表面板：实测 x 272..656、y 268..1168（f00/f01/f02 同态；f03–f05 滚一屏后行内容变、面板不变）
PANEL_L = [272, 268, 384, 900]
ROW_Y = [335, 465, 588, 708, 831, 952]   # 6 行 band 的 y（行高 116，行心 393/523/646/766/889/1010）


def activity_rows(selected_idx, texts, top_clip=True):
    """左列表 6 行：返回 row 列表（含选中态）。selected 行是奶白药丸，比面板更宽、更亮。"""
    out = []
    for i, t in enumerate(texts):
        sel = (i == selected_idx)
        bbox = [298, ROW_Y[i], 404, 116] if sel else [PANEL_L[0], ROW_Y[i], PANEL_L[2], 116]
        out.append(U('row', bbox, [t], parent=0, clickable='yes',
                     state={'selected': sel, 'focused': sel, 'disabled': False}))
    out[0]['badges'] = [reddot([440, 305, 40, 40])]
    return out


HELP_BTN = [2000, 285, 270, 100]
CLOSE_BTN = [2425, 165, 90, 90]


def frame_activity(name, texts, selected, help_btn=True, close_btn=True,
                   top_clip=True):
    objs = [U('panel', PANEL_L, ['活动一览列表'], clickable='no',
              clipped={'edges': ['top'], 'cut_by': 'panel', 'px': 60} if top_clip else None,
              note='列表容器；顶部第一项被面板上沿切掉一半（滚动位置证据）')]
    objs += activity_rows(selected, texts)
    if help_btn:
        objs.append(U('button', HELP_BTN, ['活动说明'], clickable='yes'))
    if close_btn:
        objs.append(U('button', CLOSE_BTN, [], clickable='yes', note='右上关闭 X'))
    return objs


TRUTH = {}

# ---- f00 且试身手（19 单元：1 面板 + 6 行 + 5 头像 + 1 说明 + 3 奖励图标 + 2 按钮）
f00 = frame_activity('f00',
                     ['砺行修远', '虹旅藏金·耀星烁熠', '无神怜爱的冻土',
                      '且试身手', '风仙亦是仙，古剑通幽玄！', '溯流的变奏曲'], 3)
AVATARS_00 = [[1600, 390, 120, 125], [1725, 390, 120, 130], [1860, 390, 115, 130],
              [1990, 390, 100, 130], [2115, 390, 105, 130]]
for i, b in enumerate(AVATARS_00):
    f00.append(U('avatar', b, [], parent=0, clickable='yes',
                 badges=[{'type': 'claimed', 'bbox': [b[0] + 70, b[1] + 95, 40, 40]}],
                 note='试用角色头像（带 ✓ 完成标记）'))
f00 += [U('icon', [1560, 871, 140, 139], ['20'], clickable='no', note='奖励槽（原石 20）'),
        U('icon', [1705, 871, 135, 139], ['3'], note='奖励槽（道具 3）'),
        U('icon', [1845, 871, 130, 139], ['3'], note='奖励槽（道具 3）'),
        U('button', [1910, 1030, 370, 100], ['开始试用'], clickable='yes'),
        U('button', [1540, 1030, 290, 100], ['角色预览'], clickable='yes')]
TRUTH['f00'] = f00

# ---- f01 风仙亦是仙（16：1 面板 + 6 行 + 说明 + 6 奖励图标(末个被裁) + 前往任务 + 关闭）
REWARD_01 = [[1560, 880, 140, 130], [1725, 880, 125, 130], [1855, 880, 115, 130],
             [1965, 880, 110, 130], [2110, 880, 115, 130]]
f01 = frame_activity('f01',
                     ['砺行修远', '虹旅藏金·耀星烁熠', '无神怜爱的冻土',
                      '且试身手', '风仙亦是仙，古剑通幽玄！', '溯流的变奏曲'], 4)
for i, b in enumerate(REWARD_01):
    f01.append(U('icon', b, ['奖励%d' % (i + 1)], note='奖励图标行（横向容器，可横滚）'))
f01.append(U('icon', [2260, 885, 35, 110], ['奖励6'], clickable='no',
              clipped={'edges': ['right'], 'cut_by': 'panel', 'px': 80},
              note='同行最窄（32px）⇒ 被面板右沿裁切；「还有更多」的硬证据（README f01）'))
f01 += [U('button', [1910, 1040, 370, 80], ['前往任务'], clickable='yes')]
TRUTH['f01'] = f01

# ---- f02 风仙亦是仙·奖励行横向滚过（16；左端被裁）
REWARD_02 = [[1518, 880, 95, 130], [1620, 880, 105, 130], [1740, 880, 110, 130],
             [1870, 880, 110, 130], [1975, 880, 110, 130], [2110, 880, 130, 130]]
f02 = frame_activity('f02',
                     ['砺行修远', '虹旅藏金·耀星烁熠', '无神怜爱的冻土',
                      '且试身手', '风仙亦是仙，古剑通幽玄！', '溯流的变奏曲'], 4)
f02.append(U('icon', [1518, 880, 95, 130], ['奖励1'], clickable='no',
             clipped={'edges': ['left'], 'cut_by': 'panel', 'px': 40},
             note='奖励行左端被面板切掉（f01→f02 横滚证据）'))
for i, b in enumerate(REWARD_02[1:], start=2):
    f02.append(U('icon', b, ['奖励%d' % i]))
f02.append(U('button', [1910, 1040, 370, 80], ['前往任务'], clickable='yes'))
TRUTH['f02'] = f02

# ---- f03 溯流的变奏曲（15：面板+6 行+说明+5 奖励图标+前往任务+关闭）
REWARD_03 = [[1580, 880, 120, 130], [1705, 880, 110, 130], [1850, 880, 110, 130],
             [1975, 880, 110, 130], [2095, 880, 120, 130]]
f03 = frame_activity('f03',
                     ['虹旅藏金·耀星烁熠', '无神怜爱的冻土', '且试身手',
                      '风仙亦是仙，古剑通幽玄！', '溯流的变奏曲', '绮星盛会'], 4)
for i, b in enumerate(REWARD_03):
    f03.append(U('icon', b, ['奖励%d' % (i + 1)]))
f03.append(U('button', [1924, 1044, 344, 74], ['前往任务'], clickable='yes'))
TRUTH['f03'] = f03

# ---- f04 绮星盛会（14：面板+6 行+说明+5 卡片+关闭）
f04 = frame_activity('f04',
                     ['无神怜爱的冻土', '且试身手', '风仙亦是仙，古剑通幽玄！',
                      '溯流的变奏曲', '绮星盛会', '奇域秘藏'], 4,
                     close_btn=True)
CARDS_04 = [
    ([1281, 560, 950, 140], ['千星商城', '时装复刻'], 'card', 'no',
     '白色大卡（卡贴在彩色插画上：本工具当前检不出）'),
    ([1274, 727, 480, 135], ['参与绮星盛会', '3天11小时后结束'], 'card', 'yes', ''),
    ([1776, 727, 487, 135], ['奇匠赛事'], 'card', 'yes', ''),
    ([1266, 892, 982, 202], ['绮星盛会·奇域佳选', '玩法剩余时间：3天11小时'], 'card', 'yes',
     '紫色横幅卡'),
    ([764, 1079, 352, 105], ['巧趣赠礼', '奇怪丘丘面具', '已领取'], 'button', 'yes',
     '赠礼卡（含「已领取」态）'),
]
for b, t, k, ck, note in CARDS_04:
    o = U(k, b, t, clickable=ck, note=note or None)
    if '已领取' in t:
        o['state'] = {'selected': False, 'focused': False, 'disabled': True}
    f04.append(o)
TRUTH['f04'] = f04

# ---- f05 奇域秘藏（14：面板+6 行+说明+2 时装卡+1 任务卡+2 按钮+关闭）
f05 = frame_activity('f05',
                     ['且试身手', '风仙亦是仙，古剑通幽玄！', '溯流的变奏曲',
                      '绮星盛会', '奇域秘藏', '七圣召唤·热斗模式'], 4)
f05 += [U('card', [690, 955, 215, 115], ['桂影霄练', '★★★★', '颂愿限时获取'], clickable='yes',
          note='时装卡（贴立绘，卡内不平坦）'),
        U('card', [1845, 745, 180, 115], ['佳时萤火', '★★★★', '纪行限时获取'], clickable='yes'),
        U('card', [1536, 951, 780, 105], ['使用穿戴…完成一次人气奇域关卡游玩', '奖励60', '>'],
          clickable='yes', note='任务卡（含奖励 60 + 箭头按钮）'),
        U('button', [1540, 1079, 296, 75], ['前往纪游'], clickable='yes'),
        U('button', [1860, 1079, 285, 75], ['前往颂愿'], clickable='yes')]
TRUTH['f05'] = f05

# ---------------------------------------------------------------- 派蒙菜单（f06–f08）
# 玩家信息卡 + 头像 + 铅笔 + 复制（三帧同位，实测 f06/f08 同坐标）
PC_CARD = [200, 20, 840, 390]
PC_AVATAR = [210, 50, 190, 190]
PC_PENCIL = [935, 55, 75, 75]
PC_COPY = [220, 285, 190, 55]
# 左列纯图标（f06/f08 同位；f08 逐像素实测 boxer.py）
LEFT_ICONS = [[33, 494, 62, 53], [30, 614, 86, 66], [33, 787, 62, 45],
              [30, 919, 68, 41], [33, 1068, 62, 59]]
LEFT_ICON_NAMES = ['相机/截图', '邮件(红点)', '活动/礼物', '指南/罗盘', '设置(齿轮)']
SCROLL_IND = [1018, 1185, 104, 187]  # ▲▼ 滚动指示（f06/f07/f08 同位；实测在面板右下角，不在左侧）

TILE_X = [174, 382, 590, 798]
TILE_W, TILE_H = 174, 156


def tile(b, text, badges=None, clipped=None, note=None):
    return U('tile', b, [text] if text else [], clickable='yes',
             badges=badges or [], clipped=clipped, note=note)


def paimon_chrome():
    objs = [U('panel', PC_CARD, [], clickable='no', note='玩家信息卡（透雨 / UID / 冒险等阶 / 世界等级 / 生日）'),
            U('avatar', PC_AVATAR, [], parent=0, clickable='yes'),
            U('button', PC_PENCIL, [], clickable='yes', note='改名铅笔按钮'),
            U('button', PC_COPY, ['复制'], clickable='yes', note='UID 复制')]
    for b, nm in zip(LEFT_ICONS, LEFT_ICON_NAMES):
        objs.append(U('icon', b, [], clickable='yes', note='左列纯图标：%s（无文字，文本结构里完全不可见）' % nm))
    objs[5]['badges'] = [reddot([96, 610, 36, 36])]
    objs.append(U('icon', SCROLL_IND, [], clickable='unknown',
                  note='▲▼ 滚动指示（不是 W/S 键位提示，是容器可滚通道）'))
    return objs


# ---- f06 派蒙菜单首屏（29：4 玩家卡件 + 5 纯图标 + 19 格子 + 1 滚动指示）
f06 = paimon_chrome()
R1 = ['商城', '队伍配置', '好友', '成就']
R2 = ['图鉴', '角色图鉴', '角色', '提升指南']
R3 = ['背包', '任务', '地图', '活动']
R4 = ['冒险之证', '祈愿', '纪行', '多人游戏']
R5 = ['官方社区', '版本热点', '反馈']
for i, (x, t) in enumerate(zip(TILE_X, R1)):
    f06.append(tile([x, 478, TILE_W, TILE_H], t,
                    badges=[reddot([x + 130, 455, 40, 40])] if i == 0 else None))
for x, t in zip(TILE_X, R2):
    b = [x, 668, TILE_W, TILE_H]
    if t == '角色':
        b = [578, 658, 196, 176]   # 选中/悬停格，比邻格大
    f06.append(tile(b, t))
for x, t in zip(TILE_X, R3):
    f06.append(tile([x, 856, TILE_W, TILE_H], t))
for x, t in zip(TILE_X, R4):
    f06.append(tile([x, 1046, TILE_W, TILE_H], t))
for x, t in zip(TILE_X[1:], R5):
    f06.append(tile([x, 1234, TILE_W, TILE_H], t,
                    badges=[reddot([x + 150, 1210, 36, 36])]))
TRUTH['f06'] = f06

# ---- f07 派蒙菜单滚一屏（28：4 玩家卡件 + 5 纯图标 + 18 格子 + 1 滚动指示）
f07 = paimon_chrome()
CLIP_TOP = [[x, 452, TILE_W, 64] for x in TILE_X]
for b, t in zip(CLIP_TOP, ['冒险之证', '祈愿', '纪行', '多人游戏']):
    f07.append(tile(b, t, clipped={'edges': ['top'], 'cut_by': 'panel', 'px': 92},
                    note='被面板上沿切掉图标、只剩文字（滚动位置证据）'))
for x, t in zip(TILE_X, ['特典活动', '官方社区', '版本热点', '反馈']):
    f07.append(tile([x, 550, TILE_W, TILE_H], t))
for x, t in zip(TILE_X[:3], ['云·原神', '周边商城', '问卷']):
    f07.append(tile([x, 738, TILE_W, TILE_H], t))
# 千星奇域 分区标题（不是单元：纯标签）→ 不进 objects，记进 notes
for x, t in zip(TILE_X, ['千星商城', '人气奇域', '奇域收藏', '我的奇域']):
    b = [578, 1030, 196, 174] if t == '奇域收藏' else [x, 1038, TILE_W, TILE_H]
    f07.append(tile(b, t))
for x, t in zip(TILE_X[1:], ['装扮搭配', '颂愿', '纪游']):
    f07.append(tile([x, 1228, TILE_W, TILE_H], t))
TRUTH['f07'] = f07

# ---- f08 派蒙菜单·千星奇域区（29：4 玩家卡件 + 5 纯图标 + 19 格子 + 1 滚动指示）
f08 = paimon_chrome()
for b, t in zip(CLIP_TOP, ['冒险之证', '祈愿', '纪行', '多人游戏']):
    f08.append(tile(b, t, clipped={'edges': ['top'], 'cut_by': 'panel', 'px': 92},
                    note='上半只剩文字（滚动位置证据）'))
for x, t in zip(TILE_X, ['特典活动', '官方社区', '版本热点', '反馈']):
    f08.append(tile([x, 550, TILE_W, TILE_H], t,
                    badges=[reddot([x + 150, 526, 36, 36])] if t in ('特典活动', '官方社区', '版本热点') else None))
for x, t in zip(TILE_X[:3], ['云·原神', '周边商城', '问卷']):
    f08.append(tile([x, 738, TILE_W, TILE_H], t))
for x, t in zip(TILE_X, ['千星商城', '人气奇域', '奇域收藏', '我的奇域']):
    f08.append(tile([x, 1038, TILE_W, TILE_H], t,
                    badges=[reddot([x + 150, 1014, 36, 36])] if t == '千星商城' else None))
f08.append(tile([174, 1228, TILE_W, 130], None,
                clipped={'edges': ['bottom'], 'cut_by': 'hud', 'px': 26},
                note='底行首格：文字被录制 HUD 波形条遮挡（真值不可判，按"存在格子"记）'))
for x, t in zip(TILE_X[1:], ['装扮搭配', '颂愿', '纪游']):
    f08.append(tile([x, 1228, TILE_W, TILE_H], t,
                    badges=[reddot([x + 150, 1204, 36, 36])] if t in ('装扮搭配', '纪游') else None))
TRUTH['f08'] = f08

# ---------------------------------------------------------------- 设置页（f09–f12）
# 左导航 9 项：实测 x 138..338，行心 222/295/368/440/512/585/660/735/808（pitch≈73）
NAV = ['控制', '按键', '图像', '声音', '消息', '语言', '账户', '资源', '其他']
NAV_CY = [204, 297, 390, 483, 576, 668, 761, 854, 947]   # 2026-10-18 复测订正（原 222/…/808 是 pitch 73 的误读）


def nav_list(selected):
    out = []
    for i, (nm, cy) in enumerate(zip(NAV, NAV_CY)):
        sel = (nm == selected)
        out.append(U('row', [138, cy - 32, 232, 64], [nm], clickable='yes',
                     state={'selected': sel, 'focused': sel, 'disabled': False},
                     note='左导航项' + ('（当前页高亮）' if sel else '')))
    return out


SET_CLOSE = [2425, 25, 90, 90]


def setting_frame(name, rows, selected_nav, extra=None):
    objs = nav_list(selected_nav) + [U('button', SET_CLOSE, [], clickable='yes', note='右上关闭 X')]
    for cy, label, value in rows:
        objs.append(U('row', [646, cy[0], 1756, cy[1]], [label, value], clickable='yes',
                      note='设置行（标签+右值；值区是下拉箭头中心）'))
    objs += (extra or [])
    return objs


# ---- f09 设置·控制（21：9 导航 + 关闭 + 10 设置行）
ROWS_09 = [
    ((255, 66), '控制设备', '键盘鼠标'),
    ((345, 66), '主界面控制设备自动切换', '关闭'),
    ((505, 60), '镜头水平灵敏度', '5'),
    ((595, 60), '镜头垂直灵敏度', '4'),
    ((685, 60), '镜头水平灵敏度（瞄准模式）', '4'),
    ((775, 60), '镜头垂直灵敏度（瞄准模式）', '3'),
    ((865, 60), '镜头高度自动回正', '打开'),
    ((955, 60), '战斗智能镜头', '打开'),
    ((1040, 65), '镜头默认距离', '4.5'),
    ((1130, 65), '驾船时镜头自动回正', '仅在战斗外开启'),
]
TRUTH['f09'] = setting_frame('f09', ROWS_09, '控制',
                             [U('button', [2030, 25, 500, 80], ['第三人称射击设置'], clickable='yes')])

# ---- f10 设置·图像（顶部；22：9 导航 + 关闭 + 12 行）
ROWS_10 = [
    ((255, 60), '图像质量', '自定义'),
    ((345, 60), '显示模式', '2560x1440 无边框'),
    ((435, 60), '亮度', '前往设置'),
    ((595, 60), '帧率', '60'),
    ((685, 60), '垂直同步', '打开'),
    ((775, 60), '渲染精度', '0.9'),
    ((865, 60), '阴影质量', '低'),
    ((955, 60), '全局光照', '关闭'),
    ((1045, 60), '后期效果', '低'),
    ((1140, 60), '特效质量', '低'),
    ((1235, 60), '场景细节', '中'),
    ((1330, 60), '抗锯齿', 'FSR 2'),
]
TRUTH['f10'] = setting_frame('f10', ROWS_10, '图像')

# ---- f11 同页滚一屏（23：9 导航 + 关闭 + 13 行）
ROWS_11 = [
    ((155, 60), '特效质量', '低'),
    ((245, 60), '场景细节', '中'),
    ((335, 60), '抗锯齿', 'FSR 2'),
    ((425, 60), '体积雾', '关闭'),
    ((515, 60), '反射', '关闭'),
    ((605, 60), '动态模糊', '关闭'),
    ((695, 60), 'Bloom', '打开'),
    ((785, 60), '人群密度', '高'),
    ((855, 65), '多人游戏队友特效', '打开'),
    ((945, 60), '次表面散射', '中'),
    ((1035, 60), '各向异性采样', '2x'),
    ((1125, 60), '角色动态高精度', '关闭'),
    ((1305, 65), '兼容模式', '点击开启'),
]
TRUTH['f11'] = setting_frame('f11', ROWS_11, '图像')

# ---- f12 设置·语言（14：9 导航 + 关闭 + 3 行 + 语音包管理）
ROWS_12 = [
    ((250, 70), '游戏语言', '简体中文'),
    ((350, 70), '游戏语音', '汉语'),
    ((445, 70), '千星奇域关卡语言偏好', '前往设置'),
]
TRUTH['f12'] = setting_frame('f12', ROWS_12, '语言',
                             [U('button', [1880, 1300, 500, 100], ['语音包管理'], clickable='yes')])

# ---------------------------------------------------------------- f13 存档选择（24）
CARD_ROW1_Y, CARD_ROW2_Y = 172, 512
CARD_COLS = [[505, 645], [1190, 630], [1857, 630]]
CARD_ROW3 = [505, 812, 650, 300]
f13 = [
    U('chip', [75, 22, 545, 76], ['本地存档'], clickable='yes',
      state={'selected': True, 'focused': True, 'disabled': False}, note='顶部页签（选中）'),
    U('chip', [620, 22, 380, 76], ['已上传'], clickable='yes',
      state={'selected': False, 'focused': False, 'disabled': False}, note='顶部页签'),
    U('chip', [68, 158, 362, 70], ['未分类页签'], clickable='yes',
      state={'selected': True, 'focused': True, 'disabled': False}, note='左侧页签（蓝色实心=选中）'),
    U('chip', [48, 248, 400, 95], ['新建页签'], clickable='yes', note='左侧页签（虚线=新建）'),
]
SAVES = [('fighting', '2026年10月16日 19:21'), ('云阶', '2026年10月17日 15:02'),
         ('输入探针v2', '2026年10月17日 06:13'), ('未分类页签_存档', '2026年10月16日 19:56'),
         ('Lua同步测试', '2026年10月16日 19:47'), ('真实足球v3', '2026年10月13日 19:43')]
for i, (nm, ts) in enumerate(SAVES):
    row = 0 if i < 3 else 1
    cx, cw = CARD_COLS[i % 3]
    cy = CARD_ROW1_Y if row == 0 else CARD_ROW2_Y
    card = U('card', [cx, cy, cw, 298], [nm, ts], clickable='yes',
             badges=[{'type': 'lastopen', 'bbox': [cx + 450, cy - 8, 130, 40]}] if i == 0 else None)
    f13.append(card)
f13.append(U('card', CARD_ROW3[0:4], ['输入探针', '2026年10月13日 19:23'], clickable='yes',
             state={'selected': True, 'focused': True, 'disabled': False},
             note='选中态（白框）'))
# 7 个「编辑」按钮（卡片右下）
for i in range(6):
    row = 0 if i < 3 else 1
    cx, cw = CARD_COLS[i % 3]
    cy = CARD_ROW1_Y if row == 0 else CARD_ROW2_Y
    f13.append(U('button', [cx + 445, cy + 228, 150, 50], ['编辑'], clickable='yes'))
f13.append(U('button', [965, 1005, 150, 55], ['编辑'], clickable='yes'))
f13.append(U('button', [515, 1015, 60, 45], ['...'], clickable='yes', note='卡片内更多操作'))
f13 += [U('button', [2380, 22, 128, 112], [], clickable='yes', note='右上关闭 X'),
        U('button', [2150, 22, 130, 112], ['...'], clickable='yes', note='右上聊天/更多'),
        U('button', [478, 1310, 430, 100], ['按时间顺序', 'v'], clickable='yes', note='排序下拉'),
        U('button', [960, 1310, 100, 100], ['↑↓'], clickable='yes', note='排序方向切换'),
        U('button', [1650, 1310, 400, 100], ['导入存档'], clickable='yes'),
        U('button', [2110, 1310, 400, 100], ['新建存档'], clickable='yes')]
TRUTH['f13'] = f13




# ---------------------------------------------------------------- 来源/独立性记录（_provenance）
# 「谁标的、用不用工具辅助、独立通道复核到什么程度」——真值的可信度必须可审计。
INDEP = {
    'f06': {'truth_tiles': 19, 'measured': 18, 'matched': 18, 'miss': [26], 'extra': 0,
            'mean_iou': 0.814, 'min_iou': 0.766,
            'miss_reason': 'id=26（底部行）亮度<150 阈值失效：该行在滚动渐隐带里'},
    'f07': {'truth_tiles': 18, 'measured': 13, 'matched': 13, 'miss': [10, 11, 12, 13, 25],
            'extra': 0, 'mean_iou': 0.799, 'min_iou': 0.758,
            'miss_reason': 'id=10–13 是被裁切行（只剩 174×64 文字带，长宽比 2.7 超出矩形先验）；id=25 底部渐隐'},
    'f08': {'truth_tiles': 19, 'measured': 13, 'matched': 13, 'miss': [10, 11, 12, 13, 25, 26],
            'extra': 0, 'mean_iou': 0.797, 'min_iou': 0.758,
            'miss_reason': '同 f07：裁切行 4 个 + 底部渐隐 2 个'},
}

PROVENANCE = {
    'method': '人眼（read_image）判对象与身份 → grid.py 网格量边（50px 步长，原帧坐标标签）'
              ' → boxer.py 量小图标像素紧致边界',
    'tool_assist': {
        'tiles(f06/f07/f08)': 'bbox 由 ys-screen 平坦皮肤候选预填、逐格人眼确认身份；'
                              '**已用独立通道 remeasure_grid.py（同色连通域，前提与 ys-screen 无关）复核**',
        'rows/panels(设置页与活动页)': 'grid.py 网格读数（±20px），未用工具候选',
        'icons/avatars': 'boxer.py 像素边界（独立于 ys-screen 的容器层）',
    },
    'independence_note': 'ys-screen 的前提=Lab 边缘能量低（平坦皮肤）；remeasure 的前提=低亮度同色连通域。'
                         '两者互不依赖 ⇒ 同框即可判几何实测通过。',
    'bias_measured': '独立测量把格子外发光/阴影一起框进来，每边约 +9px（192×173 vs 174×156），'
                     '故 IoU≈0.80 而非 1.0；位置一致（无一片错位）。',
}


def frame_provenance(name):
    p = dict(PROVENANCE)
    if name in INDEP:
        p['independent_check'] = dict(INDEP[name], tool='.scratch/gui-corpus/tools/remeasure_grid.py',
                                      verdict=('完整格子几何实测通过（extra=0，无错位）；'
                                               '未匹配均为裁切行/渐隐行，属滤波器边界而非真值错误'))
    return p


# ---------------------------------------------------------------- 落盘
META = {
    'f00': {'layout': '活动一览·左列表+右详情（角色头像行）', 'classes': ['不透明纯色列表', '插画背景', '纯图形头像']},
    'f01': {'layout': '活动一览·左列表+右详情（奖励图标行）', 'classes': ['不透明纯色列表', '插画背景', '横向可滚奖励行']},
    'f02': {'layout': '活动一览·同 f01（奖励行横滚）', 'classes': ['横向裁切']},
    'f03': {'layout': '活动一览·左列表+右详情（奖励行 5 图标）', 'classes': ['不透明纯色列表']},
    'f04': {'layout': '活动一览·卡片群', 'classes': ['白卡贴彩色插画（工具已知未闭合）']},
    'f05': {'layout': '活动一览·立绘+时装卡+任务卡', 'classes': ['半透明卡', '贴插画卡']},
    'f06': {'layout': '派蒙菜单首屏（网格 4×4+3）', 'classes': ['不透明纯色网格', '纯图标列', '头像']},
    'f07': {'layout': '派蒙菜单滚一屏', 'classes': ['不透明纯色网格', '裁切行']},
    'f08': {'layout': '派蒙菜单·千星奇域区', 'classes': ['不透明纯色网格', '纯图标列', '红点角标', '角色头像']},
    'f09': {'layout': '设置·控制', 'classes': ['半透明胶囊行', '左导航']},
    'f10': {'layout': '设置·图像（顶部）', 'classes': ['半透明胶囊行', '退化整屏 panel']},
    'f11': {'layout': '设置·图像（滚后）', 'classes': ['半透明胶囊行']},
    'f12': {'layout': '设置·语言', 'classes': ['半透明胶囊行', '左导航高亮（组内相对态）']},
    'f13': {'layout': '存档选择（卡片网格）', 'classes': ['卡片网格', '页签', '粘连卡']},
}


def main():
    written = 0
    for name, objs in TRUTH.items():
        for i, o in enumerate(objs):
            o['id'] = i
        doc = {
            'frame': name,
            'image': '.scratch/gui-corpus/%s.png' % name,
            'size': SIZE,
            'annotator': 'perception(subagent) · read_image 人眼判对象 + grid.py 网格量边 + boxer.py 量小图标',
            'criteria': 'truth/_rules.md',
            'layout': META[name]['layout'],
            'classes': META[name]['classes'],
            'units': len(objs),
            '_provenance': frame_provenance(name),
            'objects': objs,
        }
        with open(os.path.join(HERE, name + '.json'), 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
            f.write('\n')
        written += 1
        print('%s units=%d kinds=%s' % (name, len(objs),
                                        sorted({o['kind'] for o in objs})))
    print('TOTAL frames=%d units=%d' % (written, sum(len(v) for v in TRUTH.values())))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
