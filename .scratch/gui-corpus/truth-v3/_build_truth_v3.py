#!/usr/bin/env python3
"""_build_truth_v3.py — 批量真值（12 帧，覆盖采集里**实际存在**的界面族）。

独立性纪律同 truth-v2：几何只用本仓自写的 `edges.py`（扫描线亮度跃变）/`remeasure_grid.py`
（低亮度同色连通域）/`boxer.py`（像素紧致边界）；`ys-screen` 只在最后做交叉对照。
行的 y 位置若来自 OCR 文本行 y（`label-capture/_screen/*.json`），在 `_provenance.method` 里注明，
并在 `uncertain` 里记"±1 行高/2"的取整风险。

用法：python3 .scratch/gui-corpus/truth-v3/_build_truth_v3.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SIZE = [2560, 1440]
REPS = '.scratch/gui-corpus/capture-2026-10-18/reps'


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


def rd(x, y, w=34, h=34):
    return {'type': 'red', 'bbox': [int(x), int(y), int(w), int(h)]}


# ---------- 复用几何（均来自本仓自写工具实测，见 truth-v2/_build_truth_v2.py 与 truth/_rules.md）
PC_CARD, PC_AVATAR, PC_PENCIL, PC_COPY = [196, 16, 812, 388], [204, 46, 194, 190], [936, 56, 72, 72], [214, 280, 200, 60]
LEFT_ICONS = [[33, 494, 62, 53], [30, 614, 86, 66], [33, 787, 62, 45], [30, 919, 68, 41], [33, 1068, 62, 59]]
NAV_CY = [204, 297, 390, 483, 576, 668, 761, 854, 947]
NAV = ['控制', '按键', '图像', '声音', '消息', '语言', '账户', '资源', '其他']


def paimon_chrome():
    objs = [U('panel', PC_CARD, [], note='玩家信息卡'),
            U('avatar', PC_AVATAR, [], parent=0, clickable='yes'),
            U('button', PC_PENCIL, [], clickable='yes', note='改名铅笔'),
            U('button', PC_COPY, ['复制'], clickable='yes')]
    for b in LEFT_ICONS:
        objs.append(U('icon', b, [], clickable='yes', note='左列纯图标'))
    objs[5]['badges'] = [rd(96, 610)]
    return objs


def settings_nav(selected):
    out = []
    for nm, cy in zip(NAV, NAV_CY):
        sel = nm == selected
        out.append(U('row', [138, cy - 32, 232, 64], [nm], clickable='yes',
                     state={'selected': sel, 'focused': sel, 'disabled': False}))
    return out


TRUTH = {}

# ---------------------------------------------------------------- 1) 194915 好友／我的好友（新族）
fr = [U('chip', [1108, 18, 92, 84], [], clickable='yes', state={'selected': True, 'focused': True, 'disabled': False}, note='好友列表页签（选中）'),
      U('chip', [1240, 18, 92, 84], [], clickable='yes', note='添加好友页签'),
      U('chip', [1370, 18, 92, 84], [], clickable='yes', note='最近联机页签'),
      U('button', [2412, 18, 108, 108], [], clickable='yes', note='关闭 X'),
      U('button', [66, 682, 64, 64], ['‹'], clickable='yes', note='上一页'),
      U('button', [2436, 682, 64, 64], ['›'], clickable='yes', note='下一页'),
      U('button', [228, 1326, 380, 84], ['黑名单管理'], clickable='yes', clipped={'edges': ['bottom'], 'cut_by': 'hud', 'px': 30})]
NAMES = ['无所事事真君', '追忆', '哥伦比娅', '右右', '临渊羡鱼', '索见猪心', '四月']
ACT = ['前往其大厅', '前往其大厅', '申请加入', '前往其大厅', '前往其大厅', '申请加入', '前往其大厅']
for i, (nm, act) in enumerate(zip(NAMES, ACT)):
    cy = 182 + 166 * i
    fr.append(U('row', [150, cy - 75, 2250, 150], [nm, 'Lv.60'], clickable='yes',
                clipped={'edges': ['bottom'], 'cut_by': 'screen', 'px': 60} if i == 6 else None,
                note='好友行（头像+名字+等级+状态+留言）'))
    fr.append(U('button', [1876, cy - 40, 300, 80], [act], clickable='yes'))
    fr.append(U('button', [2206, cy - 40, 84, 84], [], clickable='yes', note='私聊气泡'))
TRUTH['c03_194915'] = (fr, {
    'family': '好友／我的好友',
    'layout': '好友列表（7 行 + 每行动作按钮 + 私聊气泡）',
    'classes': ['半透明行', '插画底', '页签'],
    'method': '行 y = OCR 文本行 y（182/344/511/676/843… pitch≈166）+ edges.py x=1200 竖直扫描复核；'
              '页签/关闭/箭头按可见像素估（±15px）',
    'uncertain': ['页签只有图标没有文字（语义按位置推断：列表/加好友/最近联机）',
                  '左右翻页箭头位置 ±20px', '黑名单管理按钮下半被录制 HUD 遮挡'],
    'tool_crosscheck': None,
})

# ---------------------------------------------------------------- 2) 195311 派蒙菜单（已知族，本帧网格上移）
pm = paimon_chrome()
pm.append(U('icon', [1018, 1240, 104, 150], [], clickable='unknown', note='▲▼ 滚动指示'))
ROWS_PM = [(456, ['云·原神', '周边商城', '问卷']),
           (748, ['千星商城', '人气奇域', '奇域收藏', '我的奇域']),
           (939, ['大厅', '装扮搭配', '颂愿', '纪游'])]
RED_PM = {'周边商城', '千星商城', '装扮搭配', '纪游'}
for y, names in ROWS_PM:
    for c, nm in enumerate(names):
        x = 172 + 208 * c
        pm.append(U('tile', [x, y, 176, 161], [nm], clickable='yes',
                    badges=[rd(x + 152, y - 22)] if nm in RED_PM else None,
                    clipped={'edges': ['top'], 'cut_by': 'panel', 'px': 92} if y == 456 else None,
                    note='被面板上沿切掉图标、只剩文字' if y == 456 else None))
pm.append(U('chip', [150, 690, 300, 50], ['千星奇域'], clickable='no', note='分区标题（不是单元？此处按"分区标签"记 chip，便于组结构）'))
TRUTH['c34_195311'] = (pm, {
    'family': '派蒙菜单',
    'layout': '派蒙菜单·千星奇域区（已滚到分区；上排 3 格被面板上沿裁切）',
    'classes': ['不透明纯色网格', '纯图标列', '角色头像'],
    'method': 'remeasure_grid.py 实测三行皮肤 y=456/748/939（pitch 292/191 不等，因上排被裁）；chrome 沿用 v2 实测',
    'uncertain': ['上排 3 格只剩文字带（图标被面板上沿切掉），上沿按 456 估 ±10px',
                  '本帧 4 列里第 4 槽（x≈796）在千星奇域分区主行之外为空，未计单元'],
    'tool_crosscheck': None,
})

# ---------------------------------------------------------------- 3) 195158 设置·按键（两层页签）
sk = [U('button', [2030, 25, 500, 80], ['第三人称射击设置'], clickable='yes'),
      U('button', [2425, 25, 90, 90], [], clickable='yes', note='关闭 X')]
sk += settings_nav('按键')
sk += [U('panel', [605, 140, 1820, 84], ['基础设置 | 千星奇域'], note='两层页签容器'),
       U('chip', [632, 142, 900, 80], ['基础设置'], clickable='yes', state={'selected': True, 'focused': True, 'disabled': False}),
       U('chip', [1655, 142, 620, 80], ['千星奇域'], clickable='yes')]
ROWS_SK = [(340, 415, '向前移动', 'W'), (430, 505, '向后移动', 'S'), (519, 594, '向左移动', 'A'),
           (609, 684, '向右移动', 'D'), (699, 773, '切换走/跑；特定操作模式下向下移动', '左Ctrl'),
           (788, 863, '普通攻击', '鼠标左键'), (878, 953, '元素战技', 'E'),
           (967, 1042, '元素爆发', 'Q'), (1057, 1132, '切换小队角色1', '1'),
           (1147, 1221, '切换小队角色2', '2')]
for y0, y1, label, val in ROWS_SK:
    sk.append(U('row', [646, y0, 1756, y1 - y0], [label, val], clickable='yes'))
TRUTH['c22_195158'] = (sk, {
    'family': '设置·按键',
    'layout': '设置·按键（页签 基础设置/千星奇域 + 按键绑定行）',
    'classes': ['半透明胶囊行', '左导航', '两层页签'],
    'method': 'edges.py x=1200 定行带（340/430/519/609/699/788/878/967/1057/1147）；左导航用像素文本带实测 pitch≈86.4',
    'uncertain': ['页签条外沿 ±15px（深蓝 on 深蓝）', '被页签条压住的首行（按键行0）未计入'],
    'tool_crosscheck': None,
})

# ---------------------------------------------------------------- 4) 195135 设置·声音
sv = [U('button', [2030, 25, 500, 80], ['第三人称射击设置'], clickable='yes'),
      U('button', [2425, 25, 90, 90], [], clickable='yes', note='关闭 X')]
sv += settings_nav('声音')
ROWS_SV = [(172, '主音量', '10'), (254, '音量', '10'), (339, '音量平衡', ''),
           (424, '音乐音量', '10'), (513, '语音音量', '10'), (600, '音效音量', '10'),
           (693, '语音聊天音量', '50'), (780, '麦克风音量', '50'), (946, '动态范围', '完全')]
for cy, label, val in ROWS_SV:
    sv.append(U('row', [646, cy - 38, 1756, 76], [label, val], clickable='yes',
                note='设置行（右值是滑条/下拉）'))
TRUTH['c19_195135'] = (sv, {
    'family': '设置·声音',
    'layout': '设置·声音（9 个音频设置行）',
    'classes': ['半透明胶囊行', '左导航'],
    'method': '行带由 OCR 文本行 y（172/254/…/780/946）±38 取带；行 x 与左导航沿用同屏实测几何',
    'uncertain': ['行 y 取自文本行中心，未逐行用扫描线复核（可能 ±10px）'],
    'tool_crosscheck': None,
})

# ---------------------------------------------------------------- 5) 195235 邮箱（邮件珍藏盒·列表）
ml = [U('button', [2325, 70, 95, 95], [], clickable='yes', note='关闭 X'),
      U('button', [2370, 18, 95, 80], [], clickable='yes', note='收藏/归档'),
      U('button', [183, 196, 1075, 62], ['搜索标题或发件人'], clickable='yes'),
      U('panel', [1262, 170, 1240, 1080], ['邮件详情'], note='右侧详情面板')]
MAIL_T = [('【网页活动上线】周年拾光册', 'P·A·I·M·O·N'), ('空月祝福即将到期提醒', 'P·A·I·M·O·N'),
          ('「周年拾光册」网页活动即将结束', 'P·A·I·M·O·N'), ('邮件4', 'P·A·I·M·O·N'),
          ('邮件5', 'P·A·I·M·O·N'), ('邮件6', 'P·A·I·M·O·N'), ('邮件7', 'P·A·I·M·O·N')]
for i, (t, s) in enumerate(MAIL_T):
    y = 218 + 157 * i
    ml.append(U('row', [187, y - 75, 1043, 150], [t, s], clickable='yes',
                clipped={'edges': ['bottom'], 'cut_by': 'screen', 'px': 60} if i == 6 else None,
                note='邮件条目'))
ml += [U('icon', [1330, 1140, 150, 130], ['10'], note='附件奖励 1'),
       U('icon', [1495, 1140, 150, 130], ['1'], note='附件奖励 2'),
       U('button', [2372, 1138, 96, 96], [], clickable='yes', note='删除'),
       U('button', [2448, 1290, 90, 90], [], clickable='yes', note='收藏/标星')]
TRUTH['c28_195235'] = (ml, {
    'family': '邮箱（邮件珍藏盒）',
    'layout': '邮件珍藏盒·列表（左侧 7 条邮件 + 右侧详情 + 附件）',
    'classes': ['列表+详情', '半透明卡'],
    'method': '行带 pitch≈157 由 edges.py x=950 扫描 + OCR 标题行 y 复核；附件/按钮沿用同族实测（truth-v2 c32）',
    'uncertain': ['第 4–7 条邮件标题 OCR 未取到（只标序号占位，不代表真实标题）',
                  '右侧详情面板外沿 ±15px'],
    'tool_crosscheck': None,
})

# ---------------------------------------------------------------- 6) 195316 本地存档（同 f13 族）
sv2 = [U('chip', [75, 22, 545, 76], ['本地存档'], clickable='yes', state={'selected': True, 'focused': True, 'disabled': False}),
       U('chip', [620, 22, 380, 76], ['已上传'], clickable='yes'),
       U('chip', [75, 172, 290, 60], ['未分类页签'], clickable='yes', state={'selected': True, 'focused': True, 'disabled': False}),
       U('chip', [75, 265, 365, 60], ['新建页签'], clickable='yes'),
       U('button', [2380, 22, 128, 112], [], clickable='yes', note='关闭'),
       U('button', [2150, 22, 130, 112], ['...'], clickable='yes', note='聊天/更多'),
       U('button', [478, 1310, 430, 100], ['按时间顺序'], clickable='yes', note='排序下拉'),
       U('button', [960, 1310, 100, 100], ['↑↓'], clickable='yes', note='排序方向'),
       U('button', [1650, 1310, 400, 100], ['导入存档'], clickable='yes'),
       U('button', [2110, 1310, 400, 100], ['新建存档'], clickable='yes')]
SAVES = [('fighting', '2026年10月16日 19:21'), ('云阶', '2026年10月17日 15:02'), ('输入探针v2', '2026年10月17日 06:13'),
         ('未分类页签_存档', '2026年10月16日 19:56'), ('Lua同步测试', '2026年10月16日 19:47'),
         ('真实足球v3', '2026年10月13日 19:43')]
for i, (nm, ts) in enumerate(SAVES):
    r, c = divmod(i, 3)
    cx = [505, 1190, 1857][c]
    cy = 172 if r == 0 else 512
    sv2.append(U('card', [cx, cy, 640, 298], [nm, ts], clickable='yes',
                 badges=[{'type': 'lastopen', 'bbox': [cx + 450, cy - 8, 130, 40]}] if i == 0 else None))
    sv2.append(U('button', [cx + 445, cy + 228, 150, 50], ['编辑'], clickable='yes'))
sv2.append(U('card', [505, 812, 650, 300], ['输入探针', '2026年10月13日 19:23'], clickable='yes',
              state={'selected': True, 'focused': True, 'disabled': False}))
sv2.append(U('button', [965, 1005, 150, 55], ['编辑'], clickable='yes'))
sv2.append(U('button', [515, 1015, 60, 45], ['...'], clickable='yes'))
TRUTH['c36_195316'] = (sv2, {
    'family': '存档选择（本地存档）',
    'layout': '存档选择·卡片网格（7 卡 + 7 编辑 + 页签 + 底部按钮）',
    'classes': ['卡片网格', '页签', '粘连卡'],
    'method': '几何沿用同屏实测（truth-v2/c12 同 UI 的 f13 量法：卡列 505/1190/1857、行 172/512/812）；'
              '本帧 OCR 复核标题与时间一致',
    'uncertain': ['卡外沿延续旧量法（同 UI、同分辨率），未逐卡重测'],
    'tool_crosscheck': None,
})

# ---------------------------------------------------------------- 7) 195439 千星编辑器·物件摆放（新族）
ed = [U('chip', [180, 22, 300, 44], ['背景音乐管理'], clickable='yes', state={'selected': True, 'focused': True, 'disabled': False}),
      U('button', [330, 22, 30, 40], ['×'], clickable='yes', note='关标签页'),
      U('button', [1440, 10, 44, 40], [], clickable='yes', note='撤销'),
      U('button', [1492, 10, 44, 40], [], clickable='yes', note='重做'),
      U('button', [1560, 10, 44, 40], [], clickable='yes', note='设置'),
      U('button', [1616, 10, 44, 40], [], clickable='yes', note='菜单'),
      U('chip', [10, 60, 470, 44], ['摆放'], clickable='yes', note='左栏标题（可折叠）'),
      U('button', [360, 52, 44, 44], ['⌃'], clickable='yes', note='折叠'),
      U('button', [28, 96, 420, 44], ['搜索'], clickable='yes'),
      U('button', [1730, 60, 44, 44], [], clickable='yes', note='视口旋转 gizmo'),
      U('button', [1734, 96, 44, 44], ['X'], clickable='yes', note='gizmo 轴向'),
      U('panel', [0, 0, 486, 1440], [], note='左侧资源树面板')]
TOOLS = [(1140, 40, 90, 80, '地形笔刷'), (1230, 40, 90, 80, '摆放工具（选中）'),
         (1320, 40, 90, 80, '物件库'), (1410, 40, 90, 80, '设置')]
for x, y, w, h, nm in TOOLS:
    ed.append(U('button', [x, y, w, h], [], clickable='yes', note='视口工具：' + nm,
                state={'selected': nm.startswith('摆放'), 'focused': False, 'disabled': False}))
TREE = [(196, '物件', 'row'), (232, '未分类页签', 'chip'), (266, '添加页签', 'chip'),
        (300, '造物', 'row'), (336, '未分类页签', 'chip'), (370, '添加页签', 'chip'),
        (404, '掉落物', 'row'), (440, '未分类页签', 'chip'), (474, '添加页签', 'chip'),
        (520, '动态单位', 'row'), (556, '流程物件', 'chip'), (590, '玩法机关', 'chip'), (622, '其他', 'chip'),
        (656, '静态单位', 'row'), (690, '造物', 'row'), (722, '掉落物', 'row'),
        (756, '自定义元件组', 'row'), (798, '物件', 'chip'), (830, '造物', 'chip'),
        (872, '预设模板', 'chip'), (904, '未分类页签', 'chip')]
for y, nm, kind in TREE:
    ed.append(U(kind, [30, y - 26, 430, 44], [nm], clickable='yes',
                state={'selected': nm in ('未分类页签', '流程物件'), 'focused': False, 'disabled': False},
                note='资源树条目'))
TRUTH['c41_195439'] = (ed, {
    'family': '千星编辑器·物件摆放（桌面编辑器视口）',
    'layout': '编辑器窗口：标签栏 + 左资源树 + 视口工具条 + 3D 视口',
    'classes': ['桌面窗口', '资源树', '视口工具条'],
    'method': 'edges.py x=200 竖直扫描定树条目带（196/232/266/… pitch≈34）；顶部标签/工具条按钮按可见像素估（±15px）',
    'uncertain': ['资源树条目 y 为扫描线定位后的等距推算（pitch 34），个别条目可能错半行',
                  '视口内那个蓝色六边形标记是场景物体（**不是界面单元**，未计入）',
                  '顶部右侧 4 个图标语义未辨（撤销/重做/设置/菜单 为推断）'],
    'tool_crosscheck': None,
})

# ---------------------------------------------------------------- 8) 195441 资源管理器（补 6 个列头）
rm = [U('button', [318, 8, 40, 30], [], clickable='yes', note='最小化'),
      U('button', [362, 8, 36, 30], [], clickable='yes', note='最大化'),
      U('button', [401, 8, 38, 30], [], clickable='yes', note='关闭窗口'),
      U('chip', [40, 130, 110, 36], ['预制分类'], clickable='yes', state={'selected': True, 'focused': True, 'disabled': False}),
      U('chip', [155, 130, 115, 36], ['自定义分类'], clickable='yes'),
      U('button', [38, 208, 44, 40], [], clickable='yes', note='筛选'),
      U('button', [88, 206, 270, 44], ['搜索'], clickable='yes'),
      U('row', [32, 250, 330, 44], ['元件库编辑场景'], clickable='yes', state={'selected': True, 'focused': True, 'disabled': False}),
      U('row', [32, 318, 330, 40], ['元件库资产栏'], clickable='yes'),
      U('row', [32, 362, 330, 40], ['场景编辑空间'], clickable='yes'),
      U('chip', [420, 130, 340, 40], ['服务器节点图'], clickable='yes'),
      U('button', [790, 175, 42, 44], ['‹'], clickable='yes'),
      U('button', [838, 175, 42, 44], ['›'], clickable='yes'),
      U('chip', [900, 175, 220, 40], ['实体节点图'], clickable='yes'),
      U('button', [2108, 172, 44, 44], [], clickable='yes', note='筛选'),
      U('button', [2160, 170, 340, 46], ['在"实体节点图"中搜索'], clickable='yes'),
      U('button', [2378, 172, 44, 44], [], clickable='yes', note='列表视图'),
      U('button', [2428, 172, 44, 44], [], clickable='yes', note='网格视图'),
      U('row', [790, 258, 420, 32], ['名称'], clickable='yes', note='列头'),
      U('row', [1270, 258, 180, 32], ['类型'], clickable='yes', note='列头'),
      U('row', [790, 300, 1730, 46], ['未分类页签'], clickable='yes', note='文件夹行'),
      U('chip', [300, 930, 320, 40], ['节点图挂载对象'], clickable='yes'),
      U('chip', [32, 1000, 330, 44], ['自定义元件'], clickable='yes', state={'selected': True, 'focused': True, 'disabled': False}),
      U('chip', [32, 1044, 330, 40], ['自定义造物'], clickable='yes'),
      U('chip', [32, 1088, 330, 40], ['场景编辑空间实体'], clickable='yes'),
      U('chip', [32, 1132, 330, 40], ['元件编辑空间实体'], clickable='yes'),
      U('button', [790, 1000, 42, 44], ['‹'], clickable='yes'),
      U('button', [838, 1000, 42, 44], ['›'], clickable='yes'),
      U('button', [2108, 1000, 44, 44], [], clickable='yes', note='筛选'),
      U('button', [2160, 998, 340, 46], ['在"自定义元件"中搜索'], clickable='yes'),
      U('row', [790, 1080, 300, 32], ['名称'], clickable='yes', note='底部面板列头 1/6'),
      U('row', [1120, 1080, 180, 32], ['类型'], clickable='yes', note='底部面板列头 2/6'),
      U('row', [1420, 1080, 170, 32], ['阵营'], clickable='yes', note='底部面板列头 3/6'),
      U('row', [1600, 1080, 220, 32], ['实体布设组'], clickable='yes', note='底部面板列头 4/6'),
      U('row', [1980, 1080, 170, 32], ['单位标签'], clickable='yes', note='底部面板列头 5/6'),
      U('row', [2220, 1080, 130, 32], ['引用'], clickable='yes', note='底部面板列头 6/6'),
      U('row', [790, 1128, 1730, 46], ['未分类页签（自定义元件）'], clickable='yes')]
TRUTH['c42_195441'] = (rm, {
    'family': '千星编辑器·资源管理器（桌面窗口）',
    'layout': '资源管理器：左分类树 + 中资源树 + 右列表（上：实体节点图；下：自定义元件）',
    'classes': ['桌面窗口', '三栏树表', '密集小控件'],
    'method': '窗口控制按钮由 y=25 横扫描定位；**底部面板 6 个列头本次已逐个标**（名称/类型/阵营/实体布设组/单位标签/引用）',
    'uncertain': ['桌面任务栏不计入（不属被测应用界面）',
                  '6 个列头的 x 边界按可见文字带估（±20px）'],
    'tool_crosscheck': None,
})

# ---------------------------------------------------------------- 9-10) 世界场景负样本
for name, note in (('c37_195331', '世界场景（无 UI，只有 FPS/ms/UID 宿主 HUD）'),
                   ('c40_195339', '世界场景（同上；本帧 GPU 占用 0%、帧时间异常高，但画面仍是无 UI 实景）')):
    TRUTH[name] = ([], {
        'family': '提瓦特世界场景（负样本）',
        'layout': '负样本：整屏世界实景，0 个界面单元',
        'classes': ['负样本·世界帧'],
        'method': 'read_image 人眼确认无任何界面控件；宿主 HUD（FPS/ms/UID/DXVK）按口径不计入',
        'uncertain': [],
        'tool_crosscheck': None,
    })

# ---------------------------------------------------------------- 11) 195243 邮箱变体（活动提醒弹窗）
TRUTH['c29_195243'] = ([U('button', [2325, 70, 95, 95], [], clickable='yes', note='关闭 X'),
                        U('button', [183, 196, 1075, 62], ['搜索标题或发件人'], clickable='yes'),
                        U('panel', [1262, 170, 1240, 1080], ['邮件详情'], note='右侧详情面板')], {
    'family': '邮箱（邮件珍藏盒·含活动提醒）',
    'layout': '邮件珍藏盒（本帧右侧出现「判测胜券本征」活动提醒浮层）',
    'classes': ['列表+详情', '浮层'],
    'method': '与 c28_195235 同族；本帧标了浏览器/浮层关键控件（未逐条标邮件行）',
    'uncertain': ['本帧只标了浮层与顶部控件，邮件行未逐条标注（不完整：units 偏少）',
                  '活动提醒浮层内部控件未标（浮层文字 OCR 未取全）'],
    'tool_crosscheck': None,
})

# ---------------------------------------------------------------- 12) 195747 编辑器变体（摆放/物件 + GUID）
TRUTH['c47_195747'] = ([U('chip', [180, 22, 300, 44], ['背景音乐管理'], clickable='yes'),
                        U('button', [330, 22, 30, 40], ['×'], clickable='yes'),
                        U('chip', [10, 60, 470, 44], ['摆放'], clickable='yes'),
                        U('button', [28, 96, 420, 44], ['搜索'], clickable='yes'),
                        U('panel', [0, 0, 486, 1440], [], note='左侧资源树面板'),
                        U('panel', [1400, 900, 1140, 500], ['物件属性（GUID 1077936130 / 箭头指示牌）'],
                          note='右下属性面板（可见 GUID/动态单位等文字）')], {
    'family': '千星编辑器·物件摆放（属性面板变体）',
    'layout': '编辑器窗口 + 右下属性面板（GUID/动态单位）',
    'classes': ['桌面窗口', '属性面板'],
    'method': '与 c41_195439 同族；本帧只标窗口级控件与属性面板（树条目未逐条标）',
    'uncertain': ['本帧只标了窗口级控件，资源树条目与属性面板内部控件**未逐个标**（units 偏少，不代表该帧只有 6 个单元）'],
    'tool_crosscheck': None,
})


def _image_for(name):
    p1 = '%s/%s.png' % (REPS, name)
    if os.path.exists(os.path.join(ROOT, p1)):
        return p1
    return '.scratch/gui-corpus/capture-2026-10-18/%s.png' % name.split('_')[1]


XC3 = {
    "c03_194915": "ys-screen(cv) 命中 0/28 = 0.0%（iou 0.000，fp=6，degen=0）",
    "c19_195135": "ys-screen(cv) 命中 0/20 = 0.0%（iou 0.000，fp=3，degen=1）",
    "c22_195158": "ys-screen(cv) 命中 3/24 = 12.5%（iou 0.862，fp=4，degen=0）",
    "c28_195235": "ys-screen(cv) 命中 7/15 = 46.7%（iou 0.795，fp=1，degen=0）",
    "c29_195243": "ys-screen(cv) 命中 0/3 = 0.0%（iou 0.000，fp=8，degen=0）",
    "c34_195311": "ys-screen(cv) 命中 11/22 = 50.0%（iou 0.849，fp=0，degen=0）",
    "c36_195316": "ys-screen(cv) 命中 2/25 = 8.0%（iou 0.773，fp=4，degen=0）",
    "c37_195331": "ys-screen(cv) 命中 0/0 = 100.0%（iou 0.000，fp=0，degen=0）",
    "c40_195339": "ys-screen(cv) 命中 0/0 = 100.0%（iou 0.000，fp=0，degen=0）",
    "c41_195439": "ys-screen(cv) 命中 0/37 = 0.0%（iou 0.000，fp=0，degen=0）",
    "c42_195441": "ys-screen(cv) 命中 0/37 = 0.0%（iou 0.000，fp=1，degen=1）",
    "c47_195747": "ys-screen(cv) 命中 0/6 = 0.0%（iou 0.000，fp=0，degen=0）"
}


def main():
    total = 0
    for name, (objs, meta) in TRUTH.items():
        for i, o in enumerate(objs):
            o['id'] = i
        doc = {
            'frame': name,
            'image': _image_for(name),
            'size': SIZE,
            'annotator': 'perception(subagent) · read_image 判身份 + edges.py/remeasure_grid.py/boxer.py 独立量边（未用 ys-screen 先验）',
            'criteria': 'truth/_rules.md（同一口径）',
            'layout': meta['layout'],
            'classes': meta['classes'],
            'units': len(objs),
            '_provenance': {
                'family': meta.get('family', ''),
                'method': meta.get('method', ''),
                'tool_assist': '几何=edges.py / remeasure_grid.py / boxer.py（本仓自写，前提与 ys-screen 的 Lab 平坦皮肤检测无关）；'
                               '行标签用 OCR 文本（`label-capture/_screen/*.json`）核对，不用其 bbox',
                'ys_screen_prior': False,
                'uncertain': meta.get('uncertain', []),
                'tool_crosscheck': XC3.get(name, '未跑（pred 缺失）'),
            },
            'objects': objs,
        }
        with open(os.path.join(HERE, name + '.json'), 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
            f.write('\n')
        total += len(objs)
        print('%-14s units=%-3d family=%s' % (name, len(objs), meta.get('family', '')))
    print('TOTAL frames=%d units=%d' % (len(TRUTH), total))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
