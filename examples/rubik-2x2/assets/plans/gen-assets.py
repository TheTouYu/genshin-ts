#!/usr/bin/env python3
"""生成 2×2 魔方元件配置（asset-config.mjs）。

v6（2026-08-12 用户视觉反馈修正）：
- 块间缝 0.07 → 0.035（元件 scale 0.965）。
- 薄片改长方体 10009001（平面 scale 厚度不生效，只有长方体缩放有真厚度），尺寸 0.9×0.025×0.9。
- 白色 0xFFFFFF/opacity85 → 浅灰白 0xD0D0D0/opacity 100（降刺眼，透明度方案效果不明显已弃）。
- 模板直接用长方体 10009001（1×1×1 可见主体，灰黑色）——不用空模型宿主
  （空模型有隐藏 1×1×1 体积，与同尺寸装饰物重叠会闪烁；缩放宿主还会连带缩放装饰物）。
- items = 3 块小颜色薄片（10009003）贴在 3 个外露面：0.9 留缝、外贴 0.52、平面法线 +Y 推导旋转。
- 元件 position = 2×2×2 魔方角位（底层 y=0.7 悬空 0.2、顶层 y=1.7；x/z ±0.5）——整体已拼成魔方。
- 命名 = WCA 标准角块名（角块_UBL 等），节点图引用可识别，未来 3×3 延续。
- 不创建场景实体：游戏开始时由节点图动态创建。
"""
import json

CUBE = 10009001   # 长方体（元件模板 + 薄片：平面 scale 厚度不生效，长方体才有真厚度）
PLANE = 10009003  # 平面（仅参考，不再用于薄片）
BODY_COLOR = 0x404040  # 灰黑主体
FACE_COLORS = {  # 方向 -> 薄片颜色（标准魔方；白色用浅灰白避免刺眼）
    'x+': 0xFF0000, 'x-': 0xFF8C00,
    'y+': 0xD0D0D0, 'y-': 0xFFFF00,
    'z+': 0x00FF00, 'z-': 0x0000FF,
}
# 薄片几何（长方体）：边长 0.9（留缝 0.1），厚度 0.025，外贴偏移 = 表面 0.5 + 半厚 0.0125 + 间隙 0.0075
PATCH_SCALE = [0.9, 0.025, 0.9]
PATCH_OFFSET = 0.52
CUBE_SCALE = [0.965, 0.965, 0.965]  # 元件统一缩放：块间留缝 0.035（薄片随比例缩，仍贴表面）
# 平面默认法线 +Y → 目标方向（YXZ 内旋：rotation=[Rx,Ry,Rz]）
FACE_ROT = {
    'x+': [0, 0, -90], 'x-': [0, 0, 90],
    'y+': [0, 0, 0],   'y-': [180, 0, 0],
    'z+': [90, 0, 0],  'z-': [-90, 0, 0],
}
Y_BOT, Y_TOP = 0.7, 1.7  # 底层/顶层中心 Y（底层离地 0.2 = 一点点悬空）
# WCA 角块名 -> 符号方向 (dx, dy, dz)
CORNERS = [
    ('DBL', (-1, -1, -1)), ('DBR', (1, -1, -1)),
    ('DFL', (-1, -1, 1)),  ('DFR', (1, -1, 1)),
    ('UBL', (-1, 1, -1)),  ('UBR', (1, 1, -1)),
    ('UFL', (-1, 1, 1)),   ('UFR', (1, 1, 1)),
]


def color(c):
    return {'enabled': True, 'rgb': c, 'opacity': 100, 'overlay': 'overwrite'}

def main():
    prefab_base = 1077936129
    aux_base = 1073741825
    assemblies = []
    for i, (name, (dx, dy, dz)) in enumerate(CORNERS):
        outer = []
        if dx > 0: outer.append('x+')
        if dx < 0: outer.append('x-')
        if dy > 0: outer.append('y+')
        if dy < 0: outer.append('y-')
        if dz > 0: outer.append('z+')
        if dz < 0: outer.append('z-')
        items = []
        for d in outer:
            px = PATCH_OFFSET if d == 'x+' else -PATCH_OFFSET if d.startswith('x') else 0.0
            py = PATCH_OFFSET if d == 'y+' else -PATCH_OFFSET if d.startswith('y') else 0.0
            pz = PATCH_OFFSET if d == 'z+' else -PATCH_OFFSET if d.startswith('z') else 0.0
            items.append({
                'resourceId': CUBE,
                'position': [px, py, pz],
                'rotation': FACE_ROT[d],
                'scale': list(PATCH_SCALE),
                'color': color(FACE_COLORS[d]),
            })
        def_aux = list(range(aux_base + i * 3, aux_base + i * 3 + 3))
        inst_aux = list(range(aux_base + 24 + i * 3, aux_base + 24 + i * 3 + 3))
        assemblies.append({
            'name': f'角块_{name}',
            'prefabId': prefab_base + i,
            'templatePrefabId': CUBE,
            'templateInstanceId': CUBE,
            'templateName': '长方体',
            'position': [0.5 * dx, Y_BOT if dy < 0 else Y_TOP, 0.5 * dz],
            'scale': list(CUBE_SCALE),
            'color': color(BODY_COLOR),
            'definitionAuxiliaryIds': def_aux,
            'instanceAuxiliaryIds': inst_aux,
            'items': items,
        })
    cfg = {'assets': {'staticAssemblies': assemblies}}
    with open('examples/rubik-2x2/assets/plans/asset-config.mjs', 'w', encoding='utf-8') as f:
        f.write('export default ' + json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')
    print(f'wrote asset-config.mjs ({len(assemblies)} assemblies, 8×3 items)')
    for a in assemblies:
        print(' ', a['name'], a['position'])

if __name__ == '__main__':
    main()
