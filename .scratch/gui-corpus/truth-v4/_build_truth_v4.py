#!/usr/bin/env python3
"""_build_truth_v4.py — 视频语料（20261018）真值：**4 帧**（预算到点，交半成品并说明）。

为什么只有 4 帧（诚实说明，证据在 README）：Lead 的族普查是**关键词命中数**，而这条 9 分钟视频里
真正**打开过**的页面只有 角色属性 / 活动一览 / 地图 / 派蒙（千星版）；商城/背包/祈愿/任务/冒险
这些词只出现在**派蒙菜单格子里**或**编辑器窗口文字**里（`冒险之证`/`委托`/`追踪`/`购买`/`纠缠之缘` 全 0 命中）。

几何来源（同 v2/v3 纪律）：`edges.py` 扫描线 / `remeasure_grid.py` 同色连通域 / `boxer.py` 像素边界；
`read_image` 判身份；ys-screen 只在最后做交叉对照。
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
REPS = '.scratch/gui-corpus/video-20261018/reps'
SIZE = [2560, 1440]


def U(kind, bbox, text=None, parent=None, clickable='no', state=None, badges=None, clipped=None, note=None):
    o = {'id': None, 'parent': parent, 'bbox': [int(v) for v in bbox], 'kind': kind,
         'text': text or [], 'clickable': clickable,
         'state': state or {'selected': False, 'focused': False, 'disabled': False},
         'badges': badges or [], 'clipped': clipped or {'edges': [], 'cut_by': None, 'px': 0}}
    if note:
        o['note'] = note
    return o


LEFT_ICONS = [[33, 494, 62, 53], [30, 614, 86, 66], [33, 787, 62, 45], [30, 919, 68, 41], [33, 1068, 62, 59]]
TRUTH = {}

# ---------------------------------------------------------------- 1) 地图 v078_0487
mp = [U('panel', [0, 0, 1718, 1440], ['地图'], note='地图画面本体（左侧大图）'),
      U('button', [2440, 10, 110, 110], [], clickable='yes', note='关闭 X'),
      U('button', [40, 360, 56, 240], [], clickable='yes', note='地图缩放滑条（‑/＋/中心三档）')]
REGIONS = [('蒙德', '璃月'), ('稻妻', '须弥'), ('枫丹', '纳塔'), ('挪德卡莱', '至冬'),
           ('渊下宫', '层岩巨渊·地下矿区'), ('旧日之海', '远古圣山'),
           ('空之神殿', '霜月'), ('尘歌壶', '千星奇域·大厅')]
for i, (a, b) in enumerate(REGIONS):
    y = round(210 + 123.7 * i)
    mp.append(U('card', [1776, y, 348, 100], [a], clickable='yes',
                state={'selected': False, 'focused': False, 'disabled': False}))
    mp.append(U('card', [2140, y, 380, 100], [b], clickable='yes',
                state={'selected': i == 7, 'focused': False, 'disabled': False}))
TRUTH['v078_0487'] = (mp, {
    'family': '地图', 'layout': '地图（左：世界地图；右：地区/地下区列表 8 行 × 2 列）',
    'classes': ['地图画面', '地区卡列'],
    'method': '地区卡 2 列 × 8 行的 y 由 preview 比例 + edges.py x=2200 扫描带复核（pitch≈123.7）；'
              '列 x 由右栏边界估（1776/2140）；关闭与缩放控件按可见像素',
    'uncertain': ['列 x 边界按可见像素估（±20px）', '缩放滑条三档的独立热区未逐一拆（整条当一个控件）'],
    'tool_crosscheck': None,
})

# ---------------------------------------------------------------- 2) 活动一览 v101_0529
ac = [U('panel', [272, 268, 384, 900], ['活动一览'], note='左侧活动列表容器'),
      U('button', [2425, 165, 90, 90], [], clickable='yes', note='关闭 X'),
      U('button', [2000, 285, 270, 100], ['活动说明'], clickable='yes')]
ACTS = ['判测胜券本征', '幽境危战', '砺行修远', '虹旅藏金·耀星烁熠', '无神怜爱的冻土', '且试身手', '风仙亦是仙，古剑通幽玄！']
for i, nm in enumerate(ACTS):
    sel = i == 0
    y = 300 if sel else 420 + 120 * (i - 1)
    ac.append(U('row', [298 if sel else 272, y, 404 if sel else 384, 110], [nm], clickable='yes',
                state={'selected': sel, 'focused': sel, 'disabled': False}))
ac += [U('button', [700, 900, 300, 80], ['预测奖励'], clickable='yes'),
       U('button', [790, 1060, 300, 80], ['赛程总览'], clickable='yes'),
       U('button', [2000, 1050, 380, 90], ['活动详情'], clickable='yes'),
       U('panel', [1380, 500, 900, 380], ['「半决赛」预测进行中'], note='预测面板（两块阵营卡 + 两个箭头）'),
       U('card', [1420, 640, 360, 160], ['水果团的镜像'], clickable='yes'),
       U('card', [1790, 640, 360, 160], ['龙龙最可爱'], clickable='yes'),
       U('button', [1360, 690, 60, 90], ['‹'], clickable='yes'),
       U('button', [2220, 690, 60, 90], ['›'], clickable='yes')]
TRUTH['v101_0529'] = (ac, {
    'family': '活动一览', 'layout': '活动一览（左 7 行列表 + 右：预测面板 / 两个活动按钮 / 活动详情）',
    'classes': ['不透明纯色列表', '插画背景', '预测面板'],
    'method': '列表行 y 由 preview 比例 + edges.py x=600 扫描带复核（选中行药丸 300 起，其余 120 步长）；'
              '右侧按钮/面板/阵营卡按可见像素估',
    'uncertain': ['列表行高选中行 110、其余推测同为 110（未逐行扫描）',
                  '预测面板外沿与两个阵营卡 x 边界 ±20px'],
    'tool_crosscheck': None,
})

# ---------------------------------------------------------------- 3) 角色·属性 v088_0513
ch = [U('button', [2430, 20, 110, 110], [], clickable='yes', note='关闭 X'),
      U('button', [2210, 1345, 250, 70], ['突破'], clickable='yes', note='右下主按钮'),
      U('button', [232, 1340, 230, 60], ['提升指南'], clickable='yes',
         clipped={'edges': ['bottom'], 'cut_by': 'hud', 'px': 20}, note='左下按钮（被录制 HUD 压住下半）'),
      U('button', [1900, 640, 320, 60], ['详细信息'], clickable='yes'),
      U('button', [82, 690, 60, 80], ['‹'], clickable='yes', note='上一个角色'),
      U('button', [2450, 690, 60, 80], ['›'], clickable='yes', note='下一个角色')]
NAMES = ['', '', '', '', '', '', '', '', '']
for i in range(9):
    ch.append(U('avatar', [720 + 128 * i, 8, 105, 120], [], clickable='yes',
                note='顶栏角色头像 %d/9' % (i + 1),
                badges=[{'type': 'red', 'bbox': [720 + 128 * i + 76, 8, 30, 30]}] if i == 2 else None))
NAV6 = [('属性', 217, True), ('武器', 307, False), ('圣遗物', 405, False),
        ('命之座', 502, False), ('天赋', 607, False), ('资料', 697, False)]
for nm, cy, sel in NAV6:
    ch.append(U('row', [100, cy - 32, 240, 64], [nm], clickable='yes',
                state={'selected': sel, 'focused': sel, 'disabled': False},
                badges=[{'type': 'red', 'bbox': [268, 664, 30, 30]}] if nm == '资料' else None))
for i, (label, val) in enumerate([('生命值上限', '16,950'), ('攻击力', '2,614'), ('防御力', '778'),
                                  ('元素精通', '114'), ('体力上限', '240')]):
    ch.append(U('row', [1700, 380 + 49 * i, 820, 46], [label, val], clickable='no', note='属性行'))
ch.append(U('row', [1700, 720, 820, 40], ['好感', '7'], clickable='no', note='好感条（进度 7 级）'))
TRUTH['v088_0513'] = (ch, {
    'family': '角色·属性', 'layout': '角色详情·属性页（顶栏 9 头像 + 左 6 导航 + 右属性面板 + 底部按钮）',
    'classes': ['插画背景', '头像条', '属性行'],
    'method': '左导航 6 项 y 由 edges.py x=200 扫描带 + preview 比例定（217/307/405/502/607/697）；'
              '5 条属性行 y 由文本行位置定；顶部 9 头像按等距量（中心距 128px）',
    'uncertain': ['顶部 9 个头像的左右边界按等距外推（±12px）',
                  '属性行宽度与右界按可见像素估', '「突破」按钮与 F 键位提示是否为同一热区未闭合'],
    'tool_crosscheck': None,
})

# ---------------------------------------------------------------- 4) 派蒙菜单（千星版）v060_0461
pm = [U('panel', [196, 16, 812, 388], [], note='玩家信息卡（透雨 / 奇域等级 Lv.67 / 本期缤纷评分 15）'),
      U('avatar', [204, 46, 194, 190], [], parent=0, clickable='yes'),
      U('button', [936, 56, 72, 72], [], clickable='yes', note='改名铅笔'),
      U('button', [214, 280, 200, 60], ['复制'], clickable='yes')]
for b in LEFT_ICONS:
    pm.append(U('icon', b, [], clickable='yes', note='左列纯图标'))
pm[5]['badges'] = [{'type': 'red', 'bbox': [96, 610, 34, 34]}]
pm.append(U('icon', [1018, 1240, 104, 150], [], clickable='unknown', note='▲▼ 滚动指示'))
ROWS = [['千星商城', '人气奇域', '奇域收藏', '我的奇域'],
        ['大厅', '装扮搭配', '好友', '队伍'],
        ['地图', '更换角色', '颂愿', '纪游'],
        ['游玩指南', '特典活动', '官方社区', '版本热点'],
        ['反馈', '云·原神', '周边商城', '问卷']]
RED = {'千星商城', '奇域收藏', '大厅', '更换角色', '颂愿', '纪游', '游玩指南', '特典活动', '官方社区', '版本热点', '反馈'}
for r, names in enumerate(ROWS):
    y = 438 + 210 * r          # edges.py x=250 扫描：438/648/858/1068/1278
    for c, nm in enumerate(names):
        x = 165 + 210 * c      # edges.py y=520 扫描：165/375/585/795
        h = min(205, 1440 - y)   # 底行被屏底裁掉时按可见高度收口
        pm.append(U('tile', [x, y, 204, h], [nm], clickable='yes',
                    badges=[{'type': 'red', 'bbox': [x + 122, y - 20, 30, 30]}] if nm in RED else None,
                    clipped={'edges': ['bottom'], 'cut_by': 'screen', 'px': 60} if r == 4 else None))
pm.append(U('button', [2090, 1311, 397, 90], ['返回提瓦特'], clickable='yes'))
TRUTH['v060_0461'] = (pm, {
    'family': '派蒙菜单（千星奇域版）', 'layout': '派蒙菜单·千星版（4×5 网格 + 返回提瓦特）',
    'classes': ['不透明纯色网格', '纯图标列', '红点角标'],
    'method': '网格由 edges.py 两条扫描线定（列 165/375/585/795、行 438/648/858/1068/1278；格 204×205、pitch 210）；左列图标沿用同 UI 实测；'
              '「返回提瓦特」按可见药丸量',
    'uncertain': ['本帧是千星版派蒙菜单，格子比旧版大（204×205 vs 176×161），已用扫描线定边界（±8px）',
                  '底行（第 5 行）被屏底与录制 HUD 裁切，只标可见部分'],
    'tool_crosscheck': None,
})


XC4 = {
    "v060_0461": "ys-screen(cv) 命中 10/31 = 32.3%（iou 0.663，fp=4）",
    "v078_0487": "ys-screen(cv) 命中 3/19 = 15.8%（iou 0.698，fp=1）",
    "v088_0513": "ys-screen(cv) 命中 0/27 = 0.0%（iou 0.000，fp=3）",
    "v101_0529": "ys-screen(cv) 命中 1/18 = 5.6%（iou 0.763，fp=1）"
}

def _image_for(name):
    return '%s/%s.jpg' % (REPS, name)


def main():
    total = 0
    for name, (objs, meta) in TRUTH.items():
        for i, o in enumerate(objs):
            o['id'] = i
        doc = {'frame': name, 'image': _image_for(name), 'size': SIZE,
               'annotator': 'perception(subagent) · read_image 判身份 + edges.py/remeasure_grid.py/boxer.py 独立量边（未用 ys-screen 先验）',
               'criteria': 'truth/_rules.md（同一口径）',
               'layout': meta['layout'], 'classes': meta['classes'], 'units': len(objs),
               '_provenance': {'family': meta['family'], 'method': meta['method'],
                               'tool_assist': '几何=edges.py/remeasure_grid.py/boxer.py（本仓自写）；'
                                              'ys-screen 只在最后做交叉对照',
                               'ys_screen_prior': False,
                               'uncertain': meta.get('uncertain', []),
                               'tool_crosscheck': XC4.get(name, '未跑')},
               'objects': objs}
        with open(os.path.join(HERE, name + '.json'), 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
            f.write('\n')
        total += len(objs)
        print('%-12s units=%-3d family=%s' % (name, len(objs), meta['family']))
    print('TOTAL frames=%d units=%d' % (len(TRUTH), total))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
