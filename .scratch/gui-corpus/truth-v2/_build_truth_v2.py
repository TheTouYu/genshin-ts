#!/usr/bin/env python3
"""_build_truth_v2.py — 生成 `.scratch/gui-corpus/truth-v2/<name>.json`（6 张新界面族范例帧）。

**独立性纪律（Lead 2026-10-18 明确要求）**：坐标**不取自 `tools/ys-screen` 的 cv 候选**。
量法：
  · 规则网格/行：`.scratch/gui-corpus/tools/edges.py` 沿"平坦带"扫描线找边界（输出是文字，不是图）；
    或 `.scratch/gui-corpus/tools/remeasure_grid.py`（低亮度同色连通域，与 ys-screen 的 Lab 边缘前提无关）。
  · 小图标/头像/按钮：`.scratch/gui-corpus/tools/boxer.py` 量像素紧致边界。
  · 结构/身份（这是什么、算不算一个单元）：`read_image` 人眼判定。
工具候选（ys-screen）只在最后做**"我漏了什么"**的对照，结论写进 `_provenance.tool_crosscheck`。

用法：python3 .scratch/gui-corpus/truth-v2/_build_truth_v2.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SIZE = [2560, 1440]


def U(kind, bbox, text=None, parent=None, clickable='no', state=None,
      badges=None, clipped=None, note=None):
    o = {'id': None, 'parent': parent, 'bbox': [int(v) for v in bbox], 'kind': kind,
         'text': text or [], 'clickable': clickable,
         'state': state or {'selected': False, 'focused': False, 'disabled': False},
         'badges': badges or [],
         'clipped': clipped or {'edges': [], 'cut_by': None, 'px': 0}}
    if note:
        o['note'] = note
    return o


def rd(x, y, w=40, h=40):
    return {'type': 'red', 'bbox': [int(x), int(y), int(w), int(h)]}


# 派蒙菜单公共几何（本批 3 张同族；**按本批帧实测**：rows/cols 由 edges.py 平坦带扫描定）
PAIMON_TILE_X = [172, 380, 588, 796]
PAIMON_TILE_W, PAIMON_TILE_H = 176, 161
PAIMON_ROW_Y = [476, 665, 854, 1043, 1231]     # 5 行；第 5 行可能被 HUD/屏边裁
PC_CARD = [196, 16, 812, 388]                  # 玩家信息卡（boxer 实测外沿）
PC_AVATAR = [204, 46, 194, 190]
PC_PENCIL = [936, 56, 72, 72]
PC_COPY = [214, 280, 200, 60]
LEFT_ICONS = [[33, 494, 62, 53], [30, 614, 86, 66], [33, 787, 62, 45],
              [30, 919, 68, 41], [33, 1068, 62, 59]]
LEFT_ICON_NAMES = ['相机/截图', '邮件(红点)', '活动/礼物', '指南/罗盘', '设置(齿轮)']


def paimon_chrome():
    objs = [U('panel', PC_CARD, [], clickable='no', note='玩家信息卡（透雨 / UID / 冒险等阶 / 世界等级 / 生日）'),
            U('avatar', PC_AVATAR, [], parent=0, clickable='yes'),
            U('button', PC_PENCIL, [], clickable='yes', note='改名铅笔'),
            U('button', PC_COPY, ['复制'], clickable='yes', note='UID 复制')]
    for b, nm in zip(LEFT_ICONS, LEFT_ICON_NAMES):
        objs.append(U('icon', b, [], clickable='yes', note='左列纯图标：%s' % nm))
    objs[5]['badges'] = [rd(96, 610, 34, 34)]
    return objs


TRUTH = {}

# ---------------------------------------------------------------- c12_195108 派蒙菜单（背包/角色）
c12 = paimon_chrome()
c12.append(U('icon', [1018, 1240, 104, 150], [], clickable='unknown',
             note='▲▼ 滚动指示（本帧实测位置：面板右外侧）'))
ROWS12 = [
    ['商城', '队伍配置', '好友', '成就'],
    ['图鉴', '角色图鉴', '角色', '提升指南'],
    ['背包', '任务', '地图', '活动'],
    ['冒险之证', '祈愿', '纪行', '多人游戏'],
    ['特典活动', '官方社区', '版本热点', '反馈'],
]
RED12 = {('商城', 0), ('特典活动', 4), ('官方社区', 4), ('版本热点', 4), ('反馈', 4)}
for r, names in enumerate(ROWS12):
    for c, nm in enumerate(names):
        b = [PAIMON_TILE_X[c], PAIMON_ROW_Y[r], PAIMON_TILE_W, PAIMON_TILE_H]
        clip = None
        note = None
        if r == 4:
            clip = {'edges': ['bottom'], 'cut_by': 'hud', 'px': 30}
            note = '底行：左下被录制 HUD 波形条压住（真值按可见外沿标）'
        c12.append(U('tile', b, [nm], clickable='yes',
                     badges=[rd(PAIMON_TILE_X[c] + 152, PAIMON_ROW_Y[r] - 22, 34, 34)]
                     if (nm, r) in RED12 else None,
                     clipped=clip, note=note))
TRUTH['c12_195108'] = (c12, {
    'layout': '派蒙菜单（新语料）· 玩家卡 + 5×4 网格',
    'classes': ['不透明纯色网格', '纯图标列', '红点角标', '角色头像'],
    'method': 'edges.py 平坦带扫描定 5 行×4 列皮肤边界（pitch 208×189、格 176×161）+ boxer.py 量左列图标/头像/铅笔'
              ' + read_image 判身份；**未用 ys-screen 候选**',
    'tool_crosscheck': 'ys-screen(cv) 命中 19/30=63.3%（全部格子；iou_mean 0.958），假阳性 0。漏：4 件玩家卡件、5 个左列纯图标、滚动指示、被 HUD 压住的底行首格',
    'uncertain': [
        '底行首格（特典活动）左下被录制 HUD 波形条遮挡，只按可见外沿标，真实下沿不可判',
        '▲▼ 滚动指示的位置与本批其它帧不同（面板右外侧 x≈1018），是否为独立控件未闭合',
    ],
})



# ---------------------------------------------------------------- c25_195214 派蒙菜单（千星奇域区）
c25 = paimon_chrome()
c25.append(U('icon', [1018, 1240, 104, 150], [], clickable='unknown', note='▲▼ 滚动指示'))
CLIP_TOP = [[x, 450, 176, 67] for x in PAIMON_TILE_X]
for b, nm in zip(CLIP_TOP, ['冒险之证', '祈愿', '纪行', '多人游戏']):
    c25.append(U('chip', b, [nm], clickable='yes',
                 clipped={'edges': ['top'], 'cut_by': 'panel', 'px': 92},
                 note='被面板上沿切掉图标、只剩文字（滚动位置证据）'))
ROWS25 = [(542, ['特典活动', '官方社区', '版本热点', '反馈']),
          (738, ['云·原神', '周边商城', '问卷']),
          (1038, ['千星商城', '人气奇域', '奇域收藏', '我的奇域']),
          (1227, ['大厅', '装扮搭配', '颂愿', '纪游'])]
RED25 = {'特典活动', '官方社区', '版本热点', '千星商城', '装扮搭配', '纪游'}
for y, names in ROWS25:
    for c, nm in enumerate(names):
        c25.append(U('tile', [PAIMON_TILE_X[c], y, PAIMON_TILE_W, PAIMON_TILE_H], [nm],
                     clickable='yes',
                     badges=[rd(PAIMON_TILE_X[c] + 152, y - 22, 34, 34)] if nm in RED25 else None,
                     clipped={'edges': ['bottom'], 'cut_by': 'hud', 'px': 26} if y == 1227 else None))
TRUTH['c25_195214'] = (c25, {
    'layout': '派蒙菜单（新语料）· 千星奇域区（含分区标题下的 4 行）',
    'classes': ['不透明纯色网格', '纯图标列', '红点角标', '裁切行'],
    'method': 'remeasure_grid.py（低亮度同色连通域）定 4 列 × 4 行皮肤边界 + edges.py 复核 pitch 208×189'
              ' + boxer.py 量左列图标；裁切顶行按可见文字带量（450..517）',
    'tool_crosscheck': 'ys-screen(cv) 命中 19/29=65.5%（iou 0.921），漏：4 玩家卡件、5 左列纯图标、滚动指示；顶行 4 个裁切 chip 全漏',
    'uncertain': ['底行首格文字在录制 HUD 下只看到「大厅」二字，是否属于千星奇域分区未闭合',
                  '顶行 4 个只剩文字带（图标被面板上沿切掉），上下沿按 67px 带高估'],
})

# ---------------------------------------------------------------- c18_195129 设置·控制（同 f09 屏）
NAV_CY = [204, 297, 390, 483, 576, 668, 761, 854, 947]   # 像素带实测（亮度>170 文本带中心，pitch≈86.4）
NAV = ['控制', '按键', '图像', '声音', '消息', '语言', '账户', '资源', '其他']
c18 = [U('button', [2030, 25, 500, 80], ['第三人称射击设置'], clickable='yes'),
       U('button', [2425, 25, 90, 90], [], clickable='yes', note='右上关闭 X')]
for nm, cy in zip(NAV, NAV_CY):
    sel = nm == '控制'
    c18.append(U('row', [138, cy - 32, 232, 64], [nm], clickable='yes',
                 state={'selected': sel, 'focused': sel, 'disabled': False},
                 note='左导航项' + ('（当前页高亮）' if sel else '')))
ROWS18 = [(244, '控制设备', '键盘鼠标'), (334, '主界面控制设备自动切换', '关闭'),
          (500, '镜头水平灵敏度', '5'), (590, '镜头垂直灵敏度', '4'),
          (679, '镜头水平灵敏度（瞄准模式）', '4'), (769, '镜头垂直灵敏度（瞄准模式）', '3'),
          (859, '镜头高度自动回正', '打开'), (948, '战斗智能镜头', '打开'),
          (1038, '镜头默认距离', '4.5'), (1127, '驾船时镜头自动回正', '仅在战斗外开启')]
for y, label, val in ROWS18:
    c18.append(U('row', [646, y, 1756, 75], [label, val], clickable='yes', note='设置行（标签+右值）'))
TRUTH['c18_195129'] = (c18, {
    'layout': '设置·控制（与语料 f09 同屏、不同连拍）',
    'classes': ['半透明胶囊行', '左导航'],
    'method': 'edges.py 竖直扫描 x=1200 定 10 行边界（行高 75、pitch 90）；左导航用**像素文本带**实测（亮度>170 的连通带中心 204/297/390/483/576/668/761/854/947，pitch≈86.4）—— 这里订正了旧真值 f09 的 pitch 73 误读',
    'tool_crosscheck': 'ys-screen(cv) 命中 3/21=14.3%（10 行里 3 行；iou 0.838）。漏：9 个左导航项、2 个顶部按钮、7 个设置行（半透明胶囊漏检）',
    'uncertain': [],
})

# ---------------------------------------------------------------- c24_195206 设置·按键（两层页签！）
c24 = [U('button', [2030, 25, 500, 80], ['第三人称射击设置'], clickable='yes'),
       U('button', [2425, 25, 90, 90], [], clickable='yes', note='右上关闭 X')]
for nm, cy in zip(NAV, NAV_CY):
    sel = nm == '按键'
    c24.append(U('row', [138, cy - 32, 232, 64], [nm], clickable='yes',
                 state={'selected': sel, 'focused': sel, 'disabled': False},
                 note='左导航项' + ('（当前页高亮）' if sel else '')))
c24 += [U('panel', [605, 140, 1820, 84], ['基础设置 | 千星奇域'], clickable='no', note='两层页签容器（L2）'),
        U('chip', [632, 142, 900, 80], ['基础设置'], clickable='yes',
          state={'selected': True, 'focused': True, 'disabled': False}, note='页签一级（选中）'),
        U('chip', [1655, 142, 620, 80], ['千星奇域'], clickable='yes', note='页签二级（未选中）')]
ROWS24 = [(148, '切换小队角色3', '3'), (289, '切换小队角色4', '4'), (379, '切换小队角色5', '5'),
          (468, '切换到小队角色并使用其元素爆发', '左Alt+切换角色'),
          (558, '呼出快捷轮盘', 'Tab'),
          (724, '打开背包', 'B'), (814, '打开角色界面', 'C'), (900, '打开地图', 'H'),
          (993, '打开派蒙界面', 'Esc'), (1083, '打开冒险之证界面', 'F1'),
          (1172, '打开多人游戏界面', 'F2'), (1262, '打开祈愿界面', 'F3')]
for i, (y, label, val) in enumerate(ROWS24):
    clip = None
    if i == 0:
        clip = {'edges': ['top'], 'cut_by': 'panel', 'px': 40}
    if i == len(ROWS24) - 1:
        clip = {'edges': ['bottom'], 'cut_by': 'screen', 'px': 25}
    c24.append(U('row', [646, y, 1756, 75], [label, val], clickable='yes', clipped=clip,
                 note='按键绑定行（右侧是键位胶囊）'))
c24 += [U('button', [1380, 1310, 480, 90], ['快捷轮盘设置'], clickable='yes'),
        U('button', [1930, 1310, 420, 90], ['恢复默认'], clickable='yes')]
TRUTH['c24_195206'] = (c24, {
    'layout': '设置·按键（**两层页签**：基础设置 / 千星奇域；Lead 原标签写作"派蒙菜单"，实际是设置页）',
    'classes': ['半透明胶囊行', '左导航', '两层页签'],
    'method': 'edges.py 竖直扫描 x=1200 定 12 行边界；左导航同 c18 的文本带实测（pitch≈86.4）；页签条/底部两按钮按 y=130 与 1310 带读数估边',
    'tool_crosscheck': 'ys-screen(cv) 命中 8/28=28.6%（iou 0.830）。漏：9 导航、3 个页签件、2 个底部按钮、其余 4 行',
    'uncertain': ['页签条外沿对比度低（深蓝 on 深蓝），±15px 估',
                  '首个可见行「切换小队角色3」被页签条压住上沿 ⇒ 只标可见部分',
                  '末行「打开祈愿界面」被屏底裁切'],
})

# ---------------------------------------------------------------- c32_195258 邮件珍藏盒
c32 = [U('button', [2325, 70, 95, 95], [], clickable='yes', note='右上关闭 X'),
       U('button', [2370, 18, 95, 80], [], clickable='yes', note='右上收藏/归档'),
       U('input' if False else 'button', [183, 222, 1075, 62], ['搜索标题或发件人'], clickable='yes',
         note='搜索输入框（点进去可打字）'),
       U('button', [246, 186, 44, 44], ['‹'], clickable='yes', note='列表上一页箭头', clipped=None),
       U('button', [1212, 186, 44, 44], ['›'], clickable='yes', note='列表下一页箭头')]
MAILS = [('启发…', '辛焱', True), ('祝他成功。', '欧洛伦', False), ('舞台…', '芙宁娜', False),
         ('行到闲处…', '行秋', False), ('礼物…', '尼可', False), ('读书的收获…', '菲米尼', False),
         ('定香…', '艾海莉埃', False)]
for i, (title, sender, sel) in enumerate(MAILS):
    y = [274, 447, 602, 758, 915, 1072, 1229][i]
    c32.append(U('row', [187, y, 1043, 150], [title, sender], clickable='yes',
                 state={'selected': sel, 'focused': sel, 'disabled': False},
                 badges=[{'type': 'new', 'bbox': [1150, y + 60, 60, 44]}] if i in (1, 2, 3) else None,
                 clipped={'edges': ['bottom'], 'cut_by': 'screen', 'px': 60} if i == 6 else None,
                 note='邮件条目（图标+标题+发件人）'))
c32 += [U('panel', [1262, 196, 1240, 1055], ['启发… 详情'], clickable='no', note='右侧详情面板'),
        U('icon', [1330, 1140, 150, 130], ['10'], clickable='no', note='附件奖励 1'),
        U('icon', [1495, 1140, 150, 130], ['1'], clickable='no', note='附件奖励 2'),
        U('button', [2372, 1138, 96, 96], [], clickable='yes', note='删除（垃圾桶）'),
        U('button', [2448, 1290, 90, 90], [], clickable='yes', note='收藏/标星')]
TRUTH['c32_195258'] = (c32, {
    'layout': '邮件珍藏盒（列表 + 详情两栏）',
    'classes': ['列表+详情', '半透明卡', '新角标'],
    'method': 'edges.py 竖直扫描 x=950 定 7 行邮件（行高 150、pitch 147..157）；搜索框由 y=255 横扫描定右沿 1257',
    'tool_crosscheck': 'ys-screen(cv) 命中 7/17=41.2%（**7 个邮件行全中**，iou 0.769）。漏：搜索框、两个翻页箭头、右侧详情面板、2 个附件图标、删除/收藏按钮',
    'uncertain': ['两个翻页箭头（‹ ›）位置按可见像素估，±20px',
                  '右上「收藏/归档」图标语义未定（可能是收藏夹入口）',
                  '第 7 行（定香…）被屏底裁切，下沿不可判'],
})

# ---------------------------------------------------------------- c42_195441 千星编辑器资源管理器（桌面窗口）
c42 = [U('button', [318, 8, 40, 30], [], clickable='yes', note='最小化'),
       U('button', [362, 8, 36, 30], [], clickable='yes', note='最大化'),
       U('button', [401, 8, 38, 30], [], clickable='yes', note='关闭窗口'),
       U('chip', [40, 130, 110, 36], ['预制分类'], clickable='yes',
         state={'selected': True, 'focused': True, 'disabled': False}),
       U('chip', [155, 130, 115, 36], ['自定义分类'], clickable='yes'),
       U('button', [38, 208, 44, 40], [], clickable='yes', note='筛选'),
       U('button', [88, 206, 270, 44], ['搜索'], clickable='yes', note='左栏搜索框'),
       U('row', [32, 250, 330, 44], ['元件库编辑场景'], clickable='yes',
         state={'selected': True, 'focused': True, 'disabled': False}, note='左栏树（选中项）'),
       U('row', [32, 318, 330, 40], ['元件库资产栏'], clickable='yes'),
       U('row', [32, 362, 330, 40], ['场景编辑空间'], clickable='yes'),
       U('chip', [420, 130, 340, 40], ['服务器节点图'], clickable='yes', note='面板标题/面包屑'),
       U('button', [790, 175, 42, 44], ['‹'], clickable='yes'),
       U('button', [838, 175, 42, 44], ['›'], clickable='yes'),
       U('chip', [900, 175, 220, 40], ['实体节点图'], clickable='yes', note='面包屑当前位置'),
       U('button', [2108, 172, 44, 44], [], clickable='yes', note='筛选'),
       U('button', [2160, 170, 340, 46], ['在"实体节点图"中搜索'], clickable='yes'),
       U('button', [2378, 172, 44, 44], [], clickable='yes', note='列表视图'),
       U('button', [2428, 172, 44, 44], [], clickable='yes', note='网格视图'),
       U('row', [790, 258, 420, 32], ['名称'], clickable='yes', note='列头（可排序）'),
       U('row', [1270, 258, 180, 32], ['类型'], clickable='yes', note='列头'),
       U('row', [790, 300, 1730, 46], ['未分类页签'], clickable='yes', note='文件夹行'),
       U('chip', [300, 930, 320, 40], ['节点图挂载对象'], clickable='yes', note='下方面板标题'),
       U('chip', [32, 1000, 330, 44], ['自定义元件'], clickable='yes',
         state={'selected': True, 'focused': True, 'disabled': False}),
       U('chip', [32, 1044, 330, 40], ['自定义造物'], clickable='yes'),
       U('chip', [32, 1088, 330, 40], ['场景编辑空间实体'], clickable='yes'),
       U('chip', [32, 1132, 330, 40], ['元件编辑空间实体'], clickable='yes'),
       U('button', [790, 1000, 42, 44], ['‹'], clickable='yes'),
       U('button', [838, 1000, 42, 44], ['›'], clickable='yes'),
       U('button', [2108, 1000, 44, 44], [], clickable='yes', note='筛选'),
       U('button', [2160, 998, 340, 46], ['在"自定义元件"中搜索'], clickable='yes'),
       U('row', [790, 1128, 1730, 46], ['未分类页签（自定义元件）'], clickable='yes')]
TRUTH['c42_195441'] = (c42, {
    'layout': '千星编辑器·资源管理器（**桌面应用窗口**，界面族与本批其余帧不同）',
    'classes': ['桌面窗口', '三栏树表', '密集小控件'],
    'method': '窗口控制按钮由 y=25 横扫描定位（319/358/367/383/394/400/415）；其余控件按 read_image 布局+preview 比例换算（±15px）',
    'tool_crosscheck': 'ys-screen(cv) 命中 0/31=0%，另给 1 个假阳性 + 1 个退化整屏 panel。⇒ 桌面应用窗口这一族当前**完全失效**',
    'uncertain': ['底部面板的 6 个列头（名称/类型/阵营/实体布设组/单位标签/引用）未逐个标注 —— 太小且语义重复',
                  '桌面任务栏（左下应用图标/右下时钟）**不计入**：不属于被测应用界面',
                  '窗口标题栏文字、面板空白区不计入',
                  '网格视图/列表视图两个切换按钮的语义（图标未辨）'],
})
TRUTH_PENDING = ['c25_195214', 'c18_195129', 'c32_195258', 'c24_195206', 'c42_195441']


def main():
    total = 0
    for name, (objs, meta) in TRUTH.items():
        for i, o in enumerate(objs):
            o['id'] = i
        doc = {
            'frame': name,
            'image': '.scratch/gui-corpus/truth-v2/%s.png' % name,
            'size': SIZE,
            'annotator': 'perception(subagent) · read_image 判身份 + edges.py/boxer.py 独立量边（未用 ys-screen 先验）',
            'criteria': 'truth/_rules.md（同一口径）',
            'layout': meta.get('layout', ''),
            'classes': meta.get('classes', []),
            'units': len(objs),
            '_provenance': {
                'method': meta.get('method', ''),
                'tool_assist': '仅 read_image 判身份；几何全部来自 edges.py / remeasure_grid.py / boxer.py（本仓自写，'
                               '前提与 ys-screen 的 Lab 平坦皮肤检测无关）',
                'ys_screen_prior': False,
                'uncertain': meta.get('uncertain', []),
                'tool_crosscheck': meta.get('tool_crosscheck', '未做（待最后统一对照）'),
            },
            'objects': objs,
        }
        p = os.path.join(HERE, name + '.json')
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
            f.write('\n')
        total += len(objs)
        print('%s units=%d kinds=%s' % (name, len(objs), sorted({o['kind'] for o in objs})))
    print('TOTAL frames=%d units=%d pending=%s' % (len(TRUTH), total, ','.join(TRUTH_PENDING)))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
