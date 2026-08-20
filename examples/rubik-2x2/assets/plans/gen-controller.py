#!/usr/bin/env python3
"""生成 2×2 魔方控制器元件配置（controller-config.mjs）。

v8（2026-08-12）：
- 控制器 = 微缩 2×2×2 魔方（1×1×1 预算内总尺寸 0.9，含义=魔方缩影）。
- 8 微块 ×（灰黑长方体主体 0.44 + 3 个彩面薄片 0.41×0.02×0.41），六面六色与大魔方同配方。
- 模板 = DBL 微块主体（长方体 10009001），items = 7 主体 + 24 薄片 = 31。
- 组件：tabBar（code 17），regionName=魔方操作，6 选项 R/L/U/D/F/B。
- v9（2026-08-12 任务）：tabBar 区域配置升级为球体触发区域：regionType=sphere、
  regionRadius=3、regionCenter=[0.1,0,0]（区域类型/半径/中心偏移走 CLI 组件配置）。
- 放魔方右侧 x=1.5（大魔方右边缘 ~0.9825，间隙 0.07），y=1.2 与魔方同高。
- 独立于 gen-assets.py（魔方元件脚本），精调控制器不影响魔方。

几何推导（角块同款已验证配方）：
- 微块边长 0.44、块间缝 0.02 → 总宽 2×0.44+0.02 = 0.90；微块中心 = ±0.23（半块 0.22 + 半缝 0.01）。
- 薄片外贴偏移 = 表面 0.22 + 半厚 0.01 + 间隙 0.005 = 0.235。
"""
import json

CUBE = 10009001   # 长方体（装饰物主体 + 薄片；平面 scale 厚度不生效，长方体才有真厚度）
EMPTY = 10005018  # 空模型（模板：隐藏体积，不遮挡装饰物）
BODY_COLOR = 0x303030  # 灰黑主体（与大魔方一致；2026-08-13 亮度 50%→75%）
FACE_COLORS = {  # 方向 -> 薄片颜色（与大魔方一致；白色浅灰白避免刺眼；2026-08-13 亮度减半）
    'x+': 0xBF0000, 'x-': 0xBF6900,
    'y+': 0x9C9C9C, 'y-': 0xBFBF00,
    'z+': 0x00BF00, 'z-': 0x0000BF,
}
# 平面法线 +Y → 目标方向（YXZ 内旋，角块 v6 已验证旋转表）
FACE_ROT = {
    'x+': [0, 0, -90], 'x-': [0, 0, 90],
    'y+': [0, 0, 0],   'y-': [180, 0, 0],
    'z+': [90, 0, 0],  'z-': [-90, 0, 0],
}
# 2×2×2 角位符号方向（WCA 角块名）
CORNERS = [
    ('DBL', (-1, -1, -1)), ('DBR', (1, -1, -1)),
    ('DFL', (-1, -1, 1)),  ('DFR', (1, -1, 1)),
    ('UBL', (-1, 1, -1)),  ('UBR', (1, 1, -1)),
    ('UFL', (-1, 1, 1)),   ('UFR', (1, 1, 1)),
]

PREFAB = 1077936137              # 控制器元件 ID（角块 6129-136 之后）
DEF_AUX_BASE = 1073741873        # 角块 def aux 用到 1848；32 items → 1873-1904
INST_AUX_BASE = 1073741905       # 角块 inst aux 用到 1872；32 items → 1905-1936
POS = [1.5, 1.2, 0.0]            # 场景位置
MICRO = 0.44                     # 微块边长
MICRO_C = 0.23                   # 微块中心偏移
MICRO_PATCH = [0.38, 0.01, 0.38]  # 微块薄片尺寸（用户 2026-08-12 手动验证：厚度 0.01）
MICRO_GAP = 0.01                 # 薄片外贴间隙（SKILL 规律 0.005~0.01）
# 偏移公式：装饰物即主体 → 表面 = 块中心 + 块半长（0.23+0.22=0.45），再 + 半厚 + 间隙
MICRO_OFFSET = MICRO_C + MICRO / 2 + MICRO_PATCH[1] / 2 + MICRO_GAP
# 1-9 保持现有动作编号；整体 X/Y 旋转为 10/11，便于回到右侧小模板的严格朝向。
OPTIONS = ['R', 'L', 'U', 'D', 'F', 'B', '打乱', '自动复原', '重置', '整体翻转', '整体转向']
OUT = 'examples/rubik-2x2/assets/plans/controller-config.mjs'


def color(c):
    return {'enabled': True, 'rgb': c, 'opacity': 100, 'overlay': 'overwrite'}


def build():
    items = []
    for (_, (dx, dy, dz)) in CORNERS:
        cx, cy, cz = MICRO_C * dx, MICRO_C * dy, MICRO_C * dz
        # 模板是空模型（不可见），8 个微块主体全部进 items
        items.append({
            'resourceId': CUBE,
            'position': [cx, cy, cz],
            'rotation': [0, 0, 0],
            'scale': [MICRO, MICRO, MICRO],
            'color': color(BODY_COLOR),
        })
        for d in ('x+', 'x-', 'y+', 'y-', 'z+', 'z-'):
            sign = 1 if d.endswith('+') else -1
            if {'x': dx, 'y': dy, 'z': dz}[d[0]] != sign:
                continue  # 只贴外露面
            items.append({
                'resourceId': CUBE,
                'position': [
                    sign * MICRO_OFFSET if d.startswith('x') else cx,
                    sign * MICRO_OFFSET if d.startswith('y') else cy,
                    sign * MICRO_OFFSET if d.startswith('z') else cz,
                ],
                'rotation': FACE_ROT[d],
                'scale': list(MICRO_PATCH),
                'color': color(FACE_COLORS[d]),
            })
    return {
        'name': '魔方控制器',
        'prefabId': PREFAB,
        'templatePrefabId': EMPTY,
        'templateInstanceId': EMPTY,
        'templateName': '空模型',
        'position': list(POS),
        'scale': [1, 1, 1],
        'color': color(BODY_COLOR),
        'components': [{
            'type': 'tabBar',
            'regionName': '魔方操作',
            'regionType': 'sphere',
            'regionRadius': 3,
            'regionCenter': [0.1, 0, 0],
            'options': OPTIONS,
        }],
        'definitionAuxiliaryIds': list(range(DEF_AUX_BASE, DEF_AUX_BASE + len(items))),
        'instanceAuxiliaryIds': list(range(INST_AUX_BASE, INST_AUX_BASE + len(items))),
        'items': items,
    }


def selfcheck(a):
    # 自检纪律：断言数字必须从参数表推导，禁止魔数
    assert len(a['items']) == 8 + 24, len(a['items'])          # 8 主体 + 24 薄片
    assert len(a['definitionAuxiliaryIds']) == len(a['items'])
    assert len(a['instanceAuxiliaryIds']) == len(a['items'])
    assert a['components'][0]['options'] == OPTIONS
    assert a['components'][0]['regionType'] == 'sphere'
    assert a['components'][0]['regionRadius'] == 3
    assert a['components'][0]['regionCenter'] == [0.1, 0, 0]
    assert a['templatePrefabId'] == EMPTY  # 模板必须是空模型，灰长方体模板会把装饰物包住看不见
    half_thick = MICRO_PATCH[1] / 2
    # 薄片外贴断言：内表面 − 真实块表面 ≥ 0.005（容差 1e-6）
    # 装饰物即主体：真实表面 = 块中心 MICRO_C + 块半长 MICRO/2（=0.45），
    # 不是 MICRO/2（=0.22，那会漏中心偏移——v9/v10 全黑根因）
    surface = MICRO_C + MICRO / 2
    for it in a['items']:
        if it['scale'][1] != MICRO_PATCH[1]:
            continue  # 主体
        # 偏移轴 = 位置绝对值等于 MICRO_OFFSET 的轴（块中心是 MICRO_C，不等于 MICRO_OFFSET）
        axis = next(i for i in range(3) if abs(it['position'][i]) == MICRO_OFFSET)
        inner = abs(it['position'][axis]) - half_thick
        assert inner - surface >= 0.005 - 1e-6, (it['position'], axis, inner)
        # 薄片不越出块表面太多（外表面 = 表面 + 半厚 + 间隙 + 半厚）
        assert abs(it['position'][axis]) <= surface + MICRO_PATCH[1] + 0.02 + 1e-6, it['position']
    # 主体不互相穿透：块中心间距 0.46 > 块边长 0.44（每轴相邻两块）
    assert 2 * MICRO_C - MICRO > 0
    # 元件 scale 必须是目标边长 1（防止半尺寸混入 scale）
    assert a['scale'] == [1, 1, 1]


def main():
    a = build()
    selfcheck(a)
    cfg = {'assets': {'staticAssemblies': [a]}}
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('export default ' + json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')
    print(f'wrote {OUT} ({len(a["items"])} items, tabBar options={OPTIONS})')
    print(' prefab', PREFAB, 'def aux', DEF_AUX_BASE, '-', DEF_AUX_BASE + len(a['items']) - 1,
          'inst aux', INST_AUX_BASE, '-', INST_AUX_BASE + len(a['items']) - 1)
    print(' position', POS)


if __name__ == '__main__':
    main()
