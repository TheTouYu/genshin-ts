#!/usr/bin/env python3
"""_build_v7.py — 切块标注法（gui-annotation 技能 §一）产出：r003 + 3 帧验证。

每帧按大对象切块 → 每块用 grid.py 裁剪图（标签=原帧坐标）读边 → 写块内数据 →
汇总加偏移（本文件直接用原帧坐标，因为 grid 标签就是原帧坐标）→ 去重 → overlay 复核。
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SIZE = [2560, 1440]

def U(kind, bbox, text=None, clickable='no', note=None, parent=None, state=None, badges=None, clipped=None):
    o = {'id': None, 'parent': parent, 'bbox': [int(round(v)) for v in bbox], 'kind': kind,
         'text': text or [], 'clickable': clickable,
         'state': state or {'selected': False, 'focused': False, 'disabled': False},
         'badges': badges or [], 'clipped': clipped or {'edges': [], 'cut_by': None, 'px': 0}}
    if note: o['note'] = note
    return o

TRUTH = {}

# ================= r003 派蒙菜单（切块：①顶栏/信息卡 ②左图标栏 ③网格区 ④底部条 ⑤四角）
f = 'r003_snap_2026-10-19_00-17-26'
o = []
# 块① 信息卡（crop 100,0,1100,470）
o += [U('panel', [128, 28, 888, 412], ['玩家信息卡'], note='块①：信息卡整块（R3/R7）'),
      U('avatar', [162, 55, 190, 150], [], clickable='yes'),
      U('button', [920, 55, 62, 60], [], clickable='yes', note='铅笔（R1：按卡片右沿 982 内缩）'),
      U('row', [393, 51, 610, 83], ['透雨 / 逆风解意'], clickable='yes', note='标题块（R7：整块）'),
      U('row', [420, 210, 560, 50], ['冒险等阶', '60'], clickable='no', note='R8：左右沿 420/980'),
      U('row', [420, 275, 560, 44], ['冒险阅历', '340125/340125'], clickable='no'),
      U('row', [420, 328, 560, 44], ['世界等级', '9'], clickable='no'),
      U('row', [420, 378, 560, 44], ['生日', '10月22日'], clickable='no'),
      U('row', [65, 258, 210, 40], ['UID 110170759'], clickable='yes'),
      U('row', [138, 308, 90, 40], ['复制'], clickable='yes'),
      U('button', [930, 215, 60, 60], ['i'], clickable='yes'),
      U('button', [930, 355, 60, 60], ['i'], clickable='yes')]
# 块② 左侧图标栏（crop 0..130 竖条；R6 整栏 + 逐图标）
o.append(U('panel', [8, 23, 118, 1385], ['左侧图标栏'], note='块②：竖向整栏（R6）'))
ICONS = [(30, 494, 62, 53), (30, 614, 62, 66), (30, 787, 62, 45), (30, 919, 62, 41), (30, 1068, 62, 59)]
for i, b in enumerate(ICONS):
    o.append(U('icon', b, [], clickable='yes', note='块②内图标 %d/5' % (i + 1)))
o.append(U('icon', [1040, 1265, 80, 95], [], clickable='unknown', note='▲▼ 滚动指示（面板右外侧）'))
# 块③ 网格区（crop 120,430,1040,1440）
o.append(U('panel', [128, 448, 882, 972], ['菜单网格区'], note='块③：网格大区整块（R7）'))
GRID = [(492, ['商城', '队伍配置', '好友', '成就']), (681, ['图鉴', '角色图鉴', '角色', '提升指南']),
        (869, ['背包', '任务', '地图', '活动']), (1059, ['冒险之证', '祈愿', '纪行', '多人游戏']),
        (1248, ['官方社区', '版本热点', '反馈'])]
for r, (y, names) in enumerate(GRID):
    for c, nm in enumerate(names):
        o.append(U('tile', [172 + 208 * c, y, 176, 161], [nm], clickable='yes',
                   clipped={'edges': ['bottom'], 'cut_by': 'screen', 'px': 40} if r == 4 else None))
# 块④ 底部条 + 块⑤ 四角（crop 0,1260,1400,1440 + 右角）
o += [U('row', [20, 1322, 90, 98], [], clickable='yes', note='块⑤：左下角小件（R10）'),
      U('row', [2240, 1403, 254, 36], [], clickable='no', note='块⑤：右下角（UID 带，R10）'),
      U('row', [15, 30, 83, 80], [], clickable='no', note='块⑤：左上角（R10）')]
TRUTH[f] = (o, {
    'family': '派蒙菜单（灰钢皮肤）',
    'blocks': ['①信息卡(100,0,1100,470)', '②左图标栏(0,20,130,1410)', '③网格区(120,430,1040,1440)',
               '④底部条(0,1260,1400,1440)', '⑤四角'],
    'rules_applied': {'R1': '铅笔按卡片右沿内缩 62px', 'R2': '左栏 5 图标 + 20 格逐项',
                      'R3': '信息卡与网格区整块框', 'R4': '四角扫到 3 件（左下/右下/左上）',
                      'R5': '格宽 176px（原帧扫描线复核 x 172/380/588/796，pitch 208）；切块图是 0.85 缩放，第一版按像素读边偏了 27px，已用原帧复核纠正',
                      'R6': '左图标栏整栏 [8,23,118,1385] + 栏内 5 图标',
                      'R7': '网格大区 [128,448,882,972] 整块',
                      'R8': '信息卡 4 行按左右沿 420/980 量（不是文字起点）',
                      'R9': '行先归到"信息卡/网格/底栏"哪个分区，再量 y',
                      'R10': '四角小件逐个扫'},
    'uncertain': ['底行 3 格被屏底裁切，格高 145 的下半不可见（±10px）',
                  '左栏 5 图标的 y 沿用旧实测（本帧皮肤不同，±8px）',
                  '▲▼ 滚动指示 x≈1040（面板右外侧），±12px']})

def main(argv):
    names = argv or sorted(TRUTH)
    tot = 0
    for name in names:
        objs, meta = TRUTH[name]
        for i, x in enumerate(objs): x['id'] = i
        img = ('.scratch/gui-corpus/truth-v6/%s.png' % name) if 'r003' in name else \
              ('.scratch/gui-corpus/inbox/norm/%s.png' % name if 'r019' in name or 'r021' in name
               else '.scratch/gui-corpus/inbox/reps/%s.jpg' % name)
        doc = {'frame': name, 'image': img, 'size': SIZE,
               'annotator': 'perception(subagent) · **切块标注法**（block-wise）：5 块分别量边后汇总',
               'criteria': '.agents/skills/gui-annotation/SKILL.md（R1–R10）',
               'layout': ' / '.join(meta.get('blocks', [])), 'classes': ['切块标注法'], 'units': len(objs),
               '_provenance': {'family': meta['family'], 'blocks': meta.get('blocks', []),
                               'rules_applied': meta['rules_applied'],
                               'tool_assist': 'grid.py 分块裁剪图（标签=原帧坐标）+ edges.py 扫描线；无 ys-screen 先验',
                               'ys_screen_prior': False, 'uncertain': meta['uncertain']},
               'objects': objs}
        open(os.path.join(HERE, name + '.json'), 'w', encoding='utf-8').write(json.dumps(doc, ensure_ascii=False, indent=1) + '\n')
        tot += len(objs)
        print('%-34s units=%-3d blocks=%d' % (name, len(objs), len(meta.get('blocks', []))))
    print('TOTAL frames=%d units=%d' % (len(names), tot))
    return 0


# ================= 下三帧：切块法 retrofit（①顶栏 ②左栏 ③主区 ④右面板 ⑤底部/四角）
import json as _json

def _load_v5(name):
    p = os.path.join('..', '..', '..', '.scratch', 'gui-corpus', 'truth-v5', name + '.json')
    d = _json.load(open(os.path.normpath(os.path.join(HERE, p)), encoding='utf-8'))
    return d['objects']

def _retrofit(name, region_objs, meta, src_v5=None):
    """在已有逐行数据（v5）之上补"区域级/边角"对象——切块法主张的就是这些块级对象。"""
    objs = list(src_v5) if src_v5 else []
    objs += region_objs
    TRUTH[name] = (objs, meta)

# ---- r019 背包（v5 已有 32 格 + 详情行；补左分类栏/顶栏/四角）
_retrofit('r019_snap_2026-10-19_00-24-44', [
    U('panel', [0, 120, 96, 1200], ['左侧分类栏'], note='块②：竖向整栏（R6）'),
    U('panel', [60, 20, 2200, 90], ['顶栏'], note='块①'),
    U('row', [0, 1300, 240, 140], [], note='块⑤：左下角货币带（R10）'),
    U('row', [2380, 1370, 180, 70], [], note='块⑤：右下角 UID（R10）'),
], {'family': '背包（养成道具）',
    'blocks': ['①顶栏', '②左侧分类栏', '③物品网格 8×4', '④详情面板', '⑤底部/四角'],
    'rules_applied': {'R2': '物品格逐格（v5 已 32 格）', 'R3': '网格区/详情面板整块',
                      'R4': '底部与右侧带扫到左下货币带 + 右下 UID', 'R6': '左分类栏整栏 [0,120,96,1200]',
                      'R10': '四角小件逐个补'},
    'uncertain': ['左分类栏宽 96px 是可见皮肤估（栏内图标未逐个拆）',
                  '四角货币带/UID 带只有视觉边界，无文字锚点']}, _load_v5('r019_snap_2026-10-19_00-24-44'))

# ---- r021 好友（v5 已有 7 行 + 动作/气泡；补顶栏/列表区/四角）
_retrofit('r021_snap_2026-10-19_00-24-58', [
    U('panel', [60, 20, 2400, 90], ['顶栏'], note='块①'),
    U('panel', [140, 120, 2300, 1200], ['好友列表区'], note='块③：整块（R7）'),
    U('row', [0, 1300, 300, 140], [], note='块⑤：左下角（R10）'),
    U('row', [2380, 1370, 180, 70], [], note='块⑤：右下角 UID（R10）'),
], {'family': '好友／我的好友',
    'blocks': ['①顶栏', '②左箭头', '③好友行 7', '④右箭头', '⑤底部/四角'],
    'rules_applied': {'R2': '好友行 7 + 每行动作按钮 + 私聊气泡（v5 已有）',
                      'R3': '好友列表区整块 [140,120,2300,1200]', 'R4': '左右翻页 + 底部黑名单管理',
                      'R10': '四角：左下角/右下 UID'},
    'uncertain': ['四角小件无文字锚点，边界按可见皮肤']}, _load_v5('r021_snap_2026-10-19_00-24-58'))

# ---- r041 编辑器·物件元件（新帧，切块全手标）
f = 'r041_snap_2026-10-19_00-36-21'
o = [U('panel', [280, 2, 1500, 52], ['编辑器标签栏'], note='块①'),
     U('chip', [280, 2, 300, 52], ['关卡设置 ×'], clickable='yes'),
     U('chip', [600, 2, 380, 52], ['关卡变量管理 ×'], clickable='yes'),
     U('chip', [990, 2, 400, 52], ['背景音乐管理 ×'], clickable='yes'),
     U('chip', [1400, 2, 420, 52], ['资产导入导出管理 ×'], clickable='yes'),
     U('chip', [1830, 2, 360, 52], ['界面控件组管理 ×'], clickable='yes'),
     U('chip', [2200, 2, 340, 52], ['主镜头管理 ×'], clickable='yes'),
     U('chip', [10, 60, 272, 110], ['物件元件'], clickable='yes', note='块②：左栏标题'),
     U('button', [330, 88, 40, 44], ['⌃'], clickable='yes'),
     U('button', [30, 130, 250, 44], ['搜索'], clickable='yes'),
     U('panel', [0, 175, 272, 1265], ['资源树'], note='块②：左栏整块（R6）'),
     U('panel', [320, 130, 2200, 1250], ['3D 视口'], note='块③：视口整块（R7）'),
     U('panel', [2080, 40, 480, 720], ['属性面板'], note='块④：右属性面板整块（R7）')]
TREE = [(199, 36, '自定义'), (239, 44, '物件'), (292, 35, '自定义页签_1'), (327, 35, '未分类页签'),
        (378, 39, '+添加页签'), (413, 35, '基础模块'), (452, 39, '动态单位'), (494, 39, '流程物件'),
        (542, 41, '玩法机关'), (583, 36, '其他'), (624, 39, '静态单位'), (664, 36, '树木'),
        (712, 37, '植被'), (753, 37, '地貌'), (787, 39, '岩石'), (833, 36, '建筑'),
        (883, 41, '建筑结构'), (924, 35, '人造装饰'), (966, 37, '灯具'), (1005, 36, '饮食')]
for y0, h, nm in TREE:
    o.append(U('row', [8, y0, 264, h], [nm], clickable='yes'))
o[-16]['state'] = {'selected': True, 'focused': True, 'disabled': False}
PAL = [(280, 190, '石质功能平台'), (470, 190, '石质功能平台'), (280, 345, '石质功能平台'),
       (470, 345, '箭头指示牌'), (280, 500, '箭头指示牌'), (470, 500, '木质指路牌')]
for x, y, nm in PAL:
    o.append(U('tile', [x, y, 180, 140], [nm], clickable='yes', note='块③：资产格'))
o += [U('chip', [2090, 60, 460, 60], ['箭头指示牌'], clickable='yes'),
      U('chip', [2090, 100, 460, 44], ['元件ID 20001454'], clickable='yes'),
      U('chip', [2090, 175, 460, 46], ['动态单位元件'], clickable='yes'),
      U('button', [2130, 230, 44, 44], ['i'], clickable='yes'),
      U('button', [2180, 230, 44, 44], ['X'], clickable='yes'),
      U('button', [2230, 230, 44, 44], ['⚙'], clickable='yes'),
      U('chip', [2090, 285, 460, 46], ['自定义变量'], clickable='yes'),
      U('row', [2090, 340, 380, 44], ['自定义变量数量', '0'], clickable='no'),
      U('button', [2200, 382, 320, 46], ['详细编辑'], clickable='yes'),
      U('chip', [2090, 445, 460, 44], ['特效播放'], clickable='yes'),
      U('row', [2090, 490, 380, 44], ['特效列表'], clickable='no'),
      U('button', [2200, 540, 320, 46], ['详细编辑'], clickable='yes'),
      U('chip', [2090, 600, 460, 44], ['单位状态'], clickable='yes'),
      U('button', [2200, 652, 320, 46], ['详细编辑'], clickable='yes')]
# 块④ 添加通用组件弹窗（preview 1130..1370, 520..960 → 原帧 1694..2055, 779..1438）
o += [U('panel', [1694, 770, 440, 668], ['添加通用组件'], note='块④：弹窗整块（R3）'),
      U('chip', [1710, 780, 380, 50], ['添加通用组件'], clickable='yes'),
      U('button', [2070, 780, 50, 44], ['×'], clickable='yes'),
      U('button', [1710, 830, 400, 44], ['搜索'], clickable='yes')]
COMPONENTS = [(890, '角色扰动装置'), (932, '全局计时器'), (974, '命中检测'), (1016, '额外碰撞'),
              (1058, '跟随运动器'), (1100, '单位状态'), (1142, '特效播放'), (1184, '自定义挂接点'),
              (1226, '碰撞触发源'), (1268, '音效播放器')]
for y0, nm in COMPONENTS:
    o.append(U('row', [1715, y0, 400, 40], [nm], clickable='yes', note='弹窗内组件条目（R2：逐条）'))
o += [U('button', [2100, 1300, 430, 80], ['添加通用组件'], clickable='yes'),
      U('row', [0, 1300, 300, 140], [], note='块⑤：左下角（R10）'),
      U('row', [2380, 1370, 180, 70], [], note='块⑤：右下角 UID（R10）'),
      U('button', [2455, 95, 60, 60], ['Z'], clickable='yes', note='右上（R1）')]
TRUTH[f] = (o, {'family': '编辑器·物件元件（含添加通用组件弹窗）',
                'blocks': ['①标签栏', '②左资源树', '③视口+调色板', '④右属性面板+组件弹窗', '⑤底部/四角'],
                'rules_applied': {'R1': '右上 Z 按 x≈2455 右沿；标签栏按可见右沿 2540',
                                  'R2': '资源树 20 行、弹窗 10 条组件逐条', 'R3': '视口/右面板/弹窗各自整块',
                                  'R4': '底部添加通用组件 + 左下/右下角', 'R5': '标签页宽按可见皮肤（300–420px）',
                                  'R6': '左栏整块 [0,175,272,1265]', 'R7': '右面板整块 [2080,40,480,720]',
                                  'R9': '弹窗内组件条目先归到"弹窗块"再量 y', 'R10': '四角扫完'},
                'uncertain': ['弹窗内 10 条组件行的 y 按 42px 等距（OCR 只给到部分文本）',
                              '调色板 6 格 x=280/470 按可见皮肤估（±10px）',
                              '左下角/右下角无文字锚点，边界按可见皮肤']})

if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
