#!/usr/bin/env python3
"""_build_truth_v5.py — 严格逐行真值（inbox 10 帧）。

纪律（用户 2026-10-19 点名收紧）：
  · 列表/树/弹窗列表**逐行标**（资源树每行、属性面板每行、音乐库每条、邮件每封）；
  · 面板不"标个外框交差"——面板内可见的行必须单独成单元；
  · 自查：`tools/audit_truth.py --truth-dir truth-v5 --ocr-dir inbox/repjson`，
    未覆盖文本 ≥3 处的帧要退回重标（把"有文字却没有任何框覆盖"的地方补上）。

与 `truth/_rules.md` 的口径差异（本批按用户收紧执行）：**分区标题/字段标题也单独成 chip 单元**
（审计用 OCR 文本做探针，标题没框就会被判漏标；视觉上它们确实是树/面板里的一行）。

用法：python3 .scratch/gui-corpus/truth-v5/_build_truth_v5.py [帧名 ...]
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
NORM = '.scratch/gui-corpus/inbox/norm'
SIZE = [2560, 1440]


def U(kind, bbox, text=None, parent=None, clickable='no', state=None, badges=None,
      clipped=None, note=None):
    o = {'id': None, 'parent': parent, 'bbox': [int(v) for v in bbox], 'kind': kind,
         'text': text or [], 'clickable': clickable,
         'state': state or {'selected': False, 'focused': False, 'disabled': False},
         'badges': badges or [], 'clipped': clipped or {'edges': [], 'cut_by': None, 'px': 0}}
    if note:
        o['note'] = note
    return o


def rows(x, pairs, w, kind='row', clickable='yes', pad=0):
    """pairs = [(y0, h, text), …] → 一组行单元（逐行，不再并块）。"""
    out = []
    for y0, h, txt in pairs:
        out.append(U(kind, [x, y0, w, h], [txt] if isinstance(txt, str) else txt,
                     clickable=clickable))
    return out


FRAMES = {}

# ================================================================ r034 编辑器·背景音乐管理 + 属性面板
f = 'r034_snap_2026-10-19_00-31-33'
o = []
# --- 左：摆放 + 搜索 + 资源树（28 行逐行）
o.append(U('chip', [10, 60, 272, 110], ['摆放'], clickable='yes', note='左栏标题（可折叠）'))
o.append(U('panel', [285, 2, 1200, 52], ['关卡设置 | 关卡变量管理 | 背景音乐管理'], note='编辑器标签栏'))
o.append(U('chip', [285, 2, 400, 52], ['关卡设置 ×'], clickable='yes'))
o.append(U('chip', [620, 2, 440, 52], ['关卡变量管理 ×'], clickable='yes'))
o.append(U('chip', [1060, 2, 420, 52], ['背景音乐管理 ×'], clickable='yes'))
o.append(U('button', [332, 55, 40, 44], ['⌃'], clickable='yes', note='折叠左栏'))
o.append(U('button', [20, 95, 250, 44], ['搜索'], clickable='yes'))
TREE = [(197, 40, '自定义'), (237, 48, '物件'), (283, 39, '自定义页签_1'), (325, 39, '未分类页签'),
        (368, 39, '+添加页签'), (409, 44, '造物'), (454, 38, '未分类页签'), (496, 39, '+添加页签'),
        (536, 44, '掉落物'), (581, 39, '未分类页签'), (624, 39, '+添加页签'), (666, 42, '预制'),
        (707, 43, '动态单位'), (750, 42, '流程物件'), (792, 43, '玩法机关'), (836, 41, '其他'),
        (878, 43, '静态单位'), (922, 40, '树木'), (964, 41, '植被'), (1007, 41, '地貌'),
        (1049, 42, '岩石'), (1092, 41, '建筑'), (1134, 43, '建筑结构'), (1178, 39, '人造装饰'),
        (1220, 40, '灯具'), (1263, 41, '饮食'), (1309, 36, '武器'), (1387, 48, '造物')]
o += rows(8, TREE, 264)
o[-14]['state'] = {'selected': True, 'focused': True, 'disabled': False}   # 流程物件
o.append(U('panel', [0, 140, 272, 1300], ['资源树'], note='左侧资源树面板'))
# --- 场景资产调色板（面板：OCR 把多格粘成一个大框，这里给调色板本体一个框）
o.append(U('panel', [318, 205, 520, 382], ['资产调色板'], note='场景资产格子区（2 列 × 3 行）'))
# --- 场景资产格子（2 列）
TILES = [([337, 225, 98, 100], '石质功能平台'), ([487, 225, 98, 100], '石质功能平台'),
         ([337, 345, 98, 100], '石质功能平台'), ([487, 345, 98, 100], '箭头指示牌'),
         ([337, 465, 98, 100], '箭头指示牌'), ([487, 465, 98, 100], '木质指路牌')]
for b, t in TILES:
    o.append(U('tile', b, [t], clickable='yes', note='场景资产格子'))
# --- 顶部工具条（4 个）
for i, x in enumerate((1070, 1150, 1230, 1330)):
    o.append(U('button', [x, 50, 80, 80], [], clickable='yes', note='视口工具 %d/4' % (i + 1)))
# --- 中央弹窗：背景音乐管理
o.append(U('panel', [320, 130, 2200, 1250], ['3D 视口'], note='编辑器视口（画布区）'))
o.append(U('panel', [801, 387, 958, 665], ['背景音乐管理'], note='弹窗（面板）'))
o.append(U('chip', [820, 395, 420, 46], ['背景音乐管理'], clickable='yes', parent=o[-1]['id'] if False else None))
o.append(U('button', [1655, 395, 44, 44], ['?'], clickable='yes'))
o.append(U('button', [1700, 395, 44, 44], ['⌃'], clickable='yes'))
o.append(U('chip', [820, 452, 300, 44], ['基础设置'], clickable='yes'))
o.append(U('button', [1688, 452, 56, 40], ['...'], clickable='yes'))
o.append(U('button', [830, 512, 900, 62], ['点击选择背景音乐资产'], clickable='yes'))
o.append(U('row', [820, 598, 900, 44], ['生效时间范围'], clickable='no'))
o.append(U('button', [845, 632, 180, 44], ['00'], clickable='yes', note='起始时间输入'))
o.append(U('button', [1290, 632, 180, 44], ['00.00'], clickable='yes', note='结束时间输入'))
DIALOG_ROWS = [(715, 44, ['音量', '100']), (765, 44, ['播放速度', '1.00']),
               (815, 44, ['是否淡入淡出', '']), (880, 44, ['是否循环播放', '']),
               (915, 44, ['间隔时间(s)', '0.00'])]
for y0, h, txt in DIALOG_ROWS:
    o.append(U('row', [820, y0, 900, h], txt, clickable='yes'))
o.append(U('button', [1105, 715, 260, 36], [], clickable='yes', note='音量滑条'))
o.append(U('button', [1105, 765, 260, 36], [], clickable='yes', note='播放速度滑条'))
o.append(U('button', [1120, 815, 60, 36], [], clickable='yes', note='淡入淡出开关'))
o.append(U('button', [1120, 880, 60, 36], [], clickable='yes', note='循环播放开关'))
# --- 背景音乐库（逐条：标题+索引 合成一条）
o.append(U('panel', [1759, 387, 342, 665], ['背景音乐库'], note='音乐库面板'))
o.append(U('button', [1770, 415, 320, 50], ['搜索'], clickable='yes'))
o.append(U('chip', [1770, 508, 220, 44], ['▼探索音乐'], clickable='yes'))
MUSIC = [(552, 60, ['鲜衣游侠', '索引：10002/03:43']), (602, 60, ['激流逐浪', '索引：10003/03:55']),
         (664, 60, ['深壑的煅火', '索引：10004/01:36']), (723, 60, ['沉重的恶意', '索引：10005/04:09']),
         (773, 60, ['畅舒的行歌', '索引：10006/01:26']), (833, 60, ['失色的灾厄', '索引：10008/04:14']),
         (882, 60, ['希望的航程', '索引：10010/02:50']), (944, 60, ['壶中洞天', '索引：10012/03:14']),
         (998, 60, ['海风细语', ''])]
for y0, h, txt in MUSIC:
    o.append(U('row', [1770, y0, 320, h], txt, clickable='yes'))
o.append(U('button', [2078, 390, 40, 40], ['X'], clickable='yes', note='关闭音乐库'))
# --- 右上：属性面板（逐行）
o.append(U('panel', [2080, 40, 480, 380], ['石质功能平台'], note='属性面板'))
o.append(U('chip', [2090, 52, 400, 50], ['石质功能平台'], clickable='yes'))
o.append(U('chip', [2090, 90, 400, 44], ['GUID 1077936203'], clickable='yes'))
o.append(U('chip', [2090, 120, 220, 40], ['动态单位'], clickable='yes'))
o.append(U('button', [2130, 183, 44, 44], ['?'], clickable='yes'))
o.append(U('button', [2180, 183, 44, 44], ['X'], clickable='yes'))
o.append(U('button', [2230, 183, 44, 44], ['⚙'], clickable='yes'))
o.append(U('button', [2290, 180, 90, 50], [], clickable='yes', note='变量开关'))
o.append(U('row', [2090, 245, 460, 44], ['_GSTS_game'], clickable='yes'))
o.append(U('row', [2090, 285, 460, 44], ['1073741825'], clickable='yes'))
o.append(U('row', [2090, 325, 380, 44], ['公开变量数', '0'], clickable='no'))
o.append(U('button', [2100, 372, 200, 44], ['编辑节点图变量'], clickable='yes'))
o.append(U('button', [2320, 372, 200, 44], ['修改节点图'], clickable='yes'))
# --- 底部：视图参数 + 添加节点图 + 相机/删除
for i, x in enumerate((1130, 1230, 1330)):
    o.append(U('row', [x, 1310, 90, 44], [[3.00, 30, 0.10][i]], clickable='yes'))
o.append(U('button', [2080, 1300, 460, 80], ['添加节点图'], clickable='yes'))
o.append(U('button', [1230, 1372, 60, 52], [], clickable='yes', note='相机工具'))
o.append(U('button', [1330, 1372, 60, 52], [], clickable='yes', note='删除'))
FRAMES[f] = (o, {
    'family': '编辑器·背景音乐管理 + 属性面板',
    'layout': '编辑器：左资源树（28 行）+ 中部资产格 6 + 背景音乐管理弹窗（9 行）+ 音乐库（9 条）+ 右上属性面板（逐行）+ 底部工具',
    'classes': ['桌面编辑器', '树列表', '弹窗列表'],
    'method': '左树/弹窗/音乐库/属性面板的行 y 由 tools/rows_from_ocr.py 聚类 OCR 行得到（逐行枚举），'
              '面板与行带左右边界由 edges.py 扫描线定（左树 272、弹窗 801..1759、音乐库 1759..2101、属性面板 2080..2560）',
    'uncertain': ['弹窗内滑条/开关的热区宽度按可见像素',
                  '底部相机/删除图标未用 OCR 文本（无字），位置 ±10px'],
})



# ================================================================ 公共：编辑器左树（28 行，r034/r032 同构）
TREE_A = [(197, 40, '自定义'), (237, 48, '物件'), (283, 39, '自定义页签_1'), (325, 39, '未分类页签'),
          (368, 39, '+添加页签'), (409, 44, '造物'), (454, 38, '未分类页签'), (496, 39, '+添加页签'),
          (536, 44, '掉落物'), (581, 39, '未分类页签'), (624, 39, '+添加页签'), (666, 42, '预制'),
          (707, 43, '动态单位'), (750, 42, '流程物件'), (792, 43, '玩法机关'), (836, 41, '其他'),
          (878, 43, '静态单位'), (922, 40, '树木'), (964, 41, '植被'), (1007, 41, '地貌'),
          (1049, 42, '岩石'), (1092, 41, '建筑'), (1134, 43, '建筑结构'), (1178, 39, '人造装饰'),
          (1220, 40, '灯具'), (1263, 41, '饮食'), (1309, 36, '武器'), (1387, 48, '造物')]
TAB_BAR = [U('panel', [285, 2, 1600, 52], ['编辑器标签栏'], note='编辑器标签栏'),
           U('chip', [285, 2, 330, 52], ['关卡设置 ×'], clickable='yes'),
           U('chip', [620, 2, 420, 52], ['关卡变量管理 ×'], clickable='yes'),
           U('chip', [1050, 2, 400, 52], ['背景音乐管理 ×'], clickable='yes'),
           U('chip', [1460, 2, 400, 52], ['资产导入导出管理 ×'], clickable='yes'),
           U('chip', [1870, 2, 360, 52], ['界面控件组管理 ×'], clickable='yes'),
           U('chip', [2240, 2, 320, 52], ['主镜头管理 ×'], clickable='yes')]


def editor_base(tree, selected_name, palette_tiles, viewport=(320, 130, 2200, 1250)):
    o = list(TAB_BAR)
    o.append(U('chip', [10, 60, 272, 110], ['摆放'], clickable='yes'))
    o.append(U('button', [332, 55, 40, 44], ['⌃'], clickable='yes'))
    o.append(U('button', [20, 95, 250, 44], ['搜索'], clickable='yes'))
    rr = rows(8, tree, 264)
    for u in rr:
        if u['text'] and u['text'][0] == selected_name:
            u['state'] = {'selected': True, 'focused': True, 'disabled': False}
            break
    o += rr
    o.append(U('panel', [0, 140, 272, 1300], ['资源树'], note='左侧资源树面板'))
    o.append(U('panel', list(viewport), ['3D 视口'], note='编辑器视口（画布区）'))
    o.append(U('panel', [318, 205, 520, 382], ['资产调色板'], note='资产格子区'))
    for b, t in palette_tiles:
        o.append(U('tile', b, [t], clickable='yes', note='资产格子'))
    for i, x in enumerate((1070, 1150, 1230, 1330)):
        o.append(U('button', [x, 50, 80, 80], [], clickable='yes', note='视口工具 %d/4' % (i + 1)))
    for i, x in enumerate((1130, 1230, 1330)):
        o.append(U('row', [x, 1310, 90, 44], [[3.00, 30, 0.10][i]], clickable='yes'))
    o.append(U('button', [1230, 1372, 60, 52], [], clickable='yes', note='相机工具'))
    o.append(U('button', [1330, 1372, 60, 52], [], clickable='yes', note='删除'))
    o.append(U('button', [2080, 1300, 460, 80], ['添加通用组件'], clickable='yes'))
    return o


PALETTE = [([337, 225, 98, 100], '石质功能平台'), ([487, 225, 98, 100], '石质功能平台'),
           ([337, 345, 98, 100], '石质功能平台'), ([487, 345, 98, 100], '箭头指示牌'),
           ([337, 465, 98, 100], '箭头指示牌'), ([487, 465, 98, 100], '木质指路牌')]

# ---------------------------------------------------------------- r032 编辑器·节点图/属性
f = 'r032_snap_2026-10-19_00-30-42'
o = editor_base(TREE_A, '流程物件', PALETTE)
o += [U('panel', [2080, 40, 480, 400], ['石质功能平台'], note='属性面板'),
      U('chip', [2090, 52, 400, 50], ['石质功能平台'], clickable='yes'),
      U('chip', [2090, 90, 400, 44], ['GUID 1077936203'], clickable='yes'),
      U('chip', [2090, 120, 220, 40], ['动态单位'], clickable='yes'),
      U('button', [2130, 183, 44, 44], ['?'], clickable='yes'),
      U('button', [2180, 183, 44, 44], ['X'], clickable='yes'),
      U('button', [2230, 183, 44, 44], ['⚙'], clickable='yes'),
      U('row', [2090, 245, 460, 44], ['_GSTS_game'], clickable='yes'),
      U('row', [2090, 285, 460, 44], ['1073741825'], clickable='yes'),
      U('row', [2090, 322, 380, 44], ['公开变量数', '0'], clickable='no'),
      U('button', [2100, 374, 200, 44], ['编辑节点图变量'], clickable='yes'),
      U('button', [2320, 374, 200, 44], ['修改节点图'], clickable='yes')]
FRAMES[f] = (o, {'family': '编辑器·节点图/属性', 'layout': '编辑器：左资源树 28 行 + 调色板 6 格 + 视口 + 右上属性面板逐行',
                 'classes': ['桌面编辑器', '树列表'],
                 'method': '左树/属性面板行由 rows_from_ocr 聚类；面板边界 edges.py',
                 'uncertain': ['属性面板右边界 2560（贴屏）']})

# ---------------------------------------------------------------- r040 编辑器·物件元件
f = 'r040_snap_2026-10-19_00-36-18'
TREE_B = [(197, 40, '自定义'), (237, 48, '物件'), (280, 42, '自定义页签_1'), (325, 39, '未分类页签'),
          (368, 39, '+添加页签'), (411, 39, '基础模块'), (451, 43, '动态单位'), (496, 39, '流程物件'),
          (535, 45, '玩法机关'), (581, 40, '其他'), (622, 43, '静态单位'), (666, 40, '树木'),
          (708, 41, '植被'), (751, 41, '地貌'), (795, 40, '岩石'), (837, 40, '建筑'),
          (876, 45, '建筑结构'), (922, 39, '人造装饰'), (964, 41, '灯具'), (1007, 40, '饮食'),
          (1050, 41, '武器'), (1093, 40, '工具'), (1137, 39, '资产库'), (1176, 43, '预设物件'),
          (1221, 38, '默认分类')]
o = editor_base(TREE_B, '流程物件', PALETTE)
o += [U('panel', [2080, 40, 480, 700], ['箭头指示牌'], note='属性面板'),
      U('chip', [2090, 52, 400, 50], ['箭头指示牌'], clickable='yes'),
      U('chip', [2090, 92, 400, 40], ['元件ID 20001454'], clickable='yes'),
      U('chip', [2090, 172, 460, 46], ['动态单位元件'], clickable='yes'),
      U('button', [2130, 230, 44, 44], ['?'], clickable='yes'),
      U('button', [2180, 230, 44, 44], ['X'], clickable='yes'),
      U('button', [2230, 230, 44, 44], ['⚙'], clickable='yes'),
      U('button', [2290, 228, 90, 46], [], clickable='yes', note='开关'),
      U('chip', [2090, 288, 460, 44], ['自定义变量'], clickable='yes'),
      U('row', [2090, 332, 380, 44], ['自定义变量数量', '0'], clickable='no'),
      U('button', [2200, 380, 320, 46], ['详细编辑'], clickable='yes'),
      U('chip', [2090, 442, 460, 44], ['特效播放'], clickable='yes'),
      U('row', [2090, 486, 380, 44], ['特效列表'], clickable='no'),
      U('button', [2200, 540, 320, 46], ['详细编辑'], clickable='yes'),
      U('chip', [2090, 600, 460, 44], ['单位状态'], clickable='yes'),
      U('button', [2200, 652, 320, 46], ['详细编辑'], clickable='yes'),
      U('button', [1330, 1372, 60, 52], ['⤓'], clickable='yes', note='保存')]
FRAMES[f] = (o, {'family': '编辑器·物件元件', 'layout': '编辑器：左树 25 行 + 调色板 + 视口 + 右属性面板（3 个分区，各带详细编辑）',
                 'classes': ['桌面编辑器', '树列表', '属性面板'],
                 'method': '左树/属性面板行由 rows_from_ocr 聚类（逐行）；面板边界 edges.py',
                 'uncertain': ['属性面板各分区容器外沿按可见像素']})

# ---------------------------------------------------------------- r045 编辑器·时间轴/轨道
f = 'r045_snap_2026-10-19_00-38-06'
o = list(TAB_BAR)
o.append(U('chip', [10, 60, 272, 110], ['摆放'], clickable='yes'))
o.append(U('button', [20, 95, 250, 44], ['搜索'], clickable='yes'))
o.append(U('panel', [0, 1000, 400, 440], ['时间轴轨道面板'], note='左下半：时间轴轨道'))
TRACKS = [(1036, 44, ['蓄力分支动画', '连段技能动画']), (1088, 42, ['#1 公共前摇', '00:00:00']),
          (1142, 44, ['+ 新建轨道']), (1196, 44, ['开始事件轨道', '+']),
          (1244, 44, ['结束事件轨道']), (1284, 44, ['建段轨道']), (1332, 44, ['花燕图事件']),
          (1380, 44, ['武器模型特效01', '特效播放'])]
for y0, h, txt in TRACKS:
    o.append(U('row', [8, y0, 372, h], txt, clickable='yes'))
o.append(U('panel', [320, 130, 2200, 850], ['3D 视口'], note='编辑器视口'))
o.append(U('panel', [1800, 60, 740, 560], ['特效播放'], note='右侧属性面板（特效播放）'))
PROP = [(63, 44, ['特效播放', 'X']), (104, 60, ['特效播放']), (188, 44, ['箭矢01']),
        (251, 44, ['是否播放特效资产音效']), (297, 43, ['单位挂接点', 'GI_WeaponR']),
        (343, 43, ['位置', 'X 0.00', '0.00', '0.00']), (388, 43, ['Y 0.00', '旋转', '0.00']),
        (432, 45, ['缩放', '1.00']), (481, 38, ['是否跟随位置']), (526, 39, ['是否跟随旋转'])]
for y0, h, txt in PROP:
    o.append(U('row', [1978, y0, 560, h], txt, clickable='yes'))
o.append(U('button', [2440, 1040, 100, 50], ['收起'], clickable='yes'))
FRAMES[f] = (o, {'family': '编辑器·时间轴/轨道', 'layout': '编辑器：左下时间轴轨道 8 行 + 视口 + 右特效属性面板逐行',
                 'classes': ['桌面编辑器', '轨道列表', '属性面板'],
                 'method': '轨道行/属性行由 rows_from_ocr 聚类（逐行）；面板边界按可见像素 + edges.py',
                 'uncertain': ['轨道行 x 宽度按左侧面板可见范围', '时间轴标尺未逐刻度标（无文字）']})

# ---------------------------------------------------------------- r006 邮箱（邮件珍藏盒）
f = 'r006_snap_2026-10-19_00-22-19'
o = [U('panel', [1100, 20, 1000, 80], ['邮箱｜邮件珍藏盒｜邮件数 18/1000'], note='顶栏'),
     U('chip', [1105, 22, 380, 76], ['邮件珍藏盒'], clickable='yes'),
     U('row', [1500, 30, 240, 60], ['邮件数 18/1000'], clickable='no'),
     U('button', [1770, 22, 60, 76], ['?'], clickable='yes'),
     U('button', [2400, 22, 110, 110], [], clickable='yes', note='关闭 X'),
     U('chip', [150, 20, 300, 70], ['邮箱'], clickable='yes'),
     U('panel', [110, 140, 1130, 1260], ['邮件列表'], note='左邮件列表面板'),
     U('panel', [1244, 140, 1316, 1100], ['邮件详情'], note='右侧详情面板')]
MAILS = [(158, 148, ['出门准备…', '早柚', '364天后过期']),
         (323, 138, ['10月1日参与《原神》千星奇域「绮星盛会」网页活动，可获得原石等奖励！', 'P·A·I·M·O·N', '12天后过期']),
         (474, 144, ['【网页活动上线】周年拾光册——回顾旅途精彩瞬间还有原石奖励哦！', 'P·A·I·M·O·N', '1天后过期']),
         (628, 148, ['空月祝福即将到期提醒', 'P·A·I·M·O·N', '6天后过期']),
         (787, 144, ['「周年拾光册」网页活动即将结束', 'P·A·I·M·O·N', '13小时后过期']),
         (944, 144, ['「判测胜券本征」活动提醒', 'P·A·I·M·O·N', '2小时后过期']),
         (1101, 144, ['「周年拾光册」网页活动奖励发放', 'P·A·I·M·O·N', '20天后过期']),
         (1258, 136, ['(第 8 封：被屏底裁切)'])]
for i, (y0, h, txt) in enumerate(MAILS):
    o.append(U('row', [112, y0 - 8, 1120, h + 16], txt, clickable='yes',
               state={'selected': i == 0, 'focused': False, 'disabled': False},
               clipped={'edges': ['bottom'], 'cut_by': 'screen', 'px': 60} if i == 7 else None))
o += [U('chip', [1250, 150, 600, 60], ['出门准备…'], clickable='yes'),
      U('row', [1250, 240, 900, 44], ['发件人：早柚'], clickable='no'),
      U('row', [1250, 290, 900, 44], ['时间：2026-10-19 00:00'], clickable='no'),
      U('icon', [1290, 1140, 150, 130], ['1'], note='附件 1'),
      U('icon', [1450, 1140, 150, 130], ['10'], note='附件 2'),
      U('button', [2160, 1330, 300, 90], ['领取'], clickable='yes'),
      U('button', [1990, 1330, 100, 90], ['☆'], clickable='yes', note='收藏'),
      U('button', [200, 1330, 300, 90], ['全部领取'], clickable='yes',
        clipped={'edges': ['bottom'], 'cut_by': 'hud', 'px': 20}),
      U('button', [540, 1330, 300, 90], ['删除已读'], clickable='yes')]
FRAMES[f] = (o, {'family': '邮箱（邮件珍藏盒）', 'layout': '邮箱：左 8 封邮件逐行 + 右详情（标题/发件人/时间/附件）+ 底部两按钮',
                 'classes': ['列表+详情', '半透明行'],
                 'method': '邮件行 y 由 edges.py x=300 扫描线定（158/323/474/628/787/944/1101/1258）；列表/详情面板边界 edges.py',
                 'uncertain': ['第 8 封被屏底裁切，只标可见部分', '正文段落不逐个成单元（按口径属内容文本）']})


def main(argv):
    names = argv or sorted(FRAMES)
    total = 0
    for name in names:
        objs, meta = FRAMES[name]
        for i, x in enumerate(objs):
            x['id'] = i
        doc = {'frame': name, 'image': '%s/%s.png' % (NORM, name), 'size': SIZE,
               'annotator': 'perception(subagent) · 逐行标注（OCR 行聚类枚举 + edges.py 量边，未用 ys-screen 先验）',
               'criteria': 'truth/_rules.md + 本批收紧（标题/字段行也成单元）',
               'layout': meta['layout'], 'classes': meta['classes'], 'units': len(objs),
               '_provenance': {'family': meta['family'], 'method': meta['method'],
                               'tool_assist': '行枚举=rows_from_ocr.py；边界=edges.py；ys-screen 仅事后对照',
                               'ys_screen_prior': False,
                               'uncertain': meta.get('uncertain', [])},
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
