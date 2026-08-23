#!/usr/bin/env python3
"""cube-replica-c4 2×2 魔方：8 个角块元件的资产配置生成器（含自检断言）。

设计（阶段 0 规划 → 阶段 2 落地）：
- 模板 = 官方长方体 10009001（1×1×1，可见块体，assembly.color=深灰黑）
- 每块 3 个彩色薄片（同为 10009001 缩放成薄板），外贴在 3 个向外面上
- assembly.scale = 0.965（块间留缝 0.035），薄片随比例自动贴面
- 8 块按成品布局摆放：assembly.position = 中心 ± 半块宽(0.4825) 三向偏移（禁止堆叠；该坐标即节点图动态创建实体位置来源）
- 元件 ID >= 1077936129（0x40400001 区间）；aux ID 用地图空闲区间

输出：
- cube-replica-c4.asset-config.mjs   （assets.staticAssemblies 配置）
- cube-replica-c4.entities.json      （8 个场景实体：已还原立方，视觉核验用）
"""
import json
import sys

# ---- 常量（参数表，自检断言从此推导，禁止手写魔数）----
BODY_RES = 10009001
BODY_COLOR = 0x1A1A1A            # 深灰黑块体
SLAB_FACE = 0.94                 # 薄片面尺寸（局部，scale-1 块基准）
SLAB_THICK = 0.04                # 薄片厚度（局部）
SLAB_GAP = 0.006                 # 薄片与块表面间隙（局部）
ASSEMBLY_SCALE = 0.965           # 统一缩块 → 块间缝 = 1 - 0.965 = 0.035
HALF_ASSEMBLY = ASSEMBLY_SCALE / 2   # 0.4825：角块中心到魔方中心偏移（成品布局，禁止堆叠）
HALF_BODY = 0.5                  # 10009001 scale=1 = 1×1×1，半尺寸 0.5
MIN_PREFAB_ID = 1077936129       # 0x40400001
PREFAB_ID_BASE = 1077936129
AUX_ID_BASE = 1073741900
AUX_SKELETON_RESERVED = {1073741828, 1073741829}

# 面 -> 颜色（标准 Rubik 配色；白用浅灰白防刺眼）
COLORS = {
    'U': 0xD0D0D0,
    'D': 0xFFD500,
    'F': 0x009E60,
    'B': 0x0051BA,
    'R': 0xC41E3A,
    'L': 0xFF5800,
}

# 角块：(WCA 名, 位置符号(sx,sy,sz), 三外露面向的 (轴键, 颜色面))
# 轴键: '+X'=右(红) '-X'=左(橙) '+Y'=上(白) '-Y'=下(黄) '+Z'=前(绿) '-Z'=后(蓝)
CORNERS = [
    ('UBL', (-1, +1, -1), [('-X', 'L'), ('+Y', 'U'), ('-Z', 'B')]),
    ('UBR', (+1, +1, -1), [('+X', 'R'), ('+Y', 'U'), ('-Z', 'B')]),
    ('UFL', (-1, +1, +1), [('-X', 'L'), ('+Y', 'U'), ('+Z', 'F')]),
    ('UFR', (+1, +1, +1), [('+X', 'R'), ('+Y', 'U'), ('+Z', 'F')]),
    ('DBL', (-1, -1, -1), [('-X', 'L'), ('-Y', 'D'), ('-Z', 'B')]),
    ('DBR', (+1, -1, -1), [('+X', 'R'), ('-Y', 'D'), ('-Z', 'B')]),
    ('DFL', (-1, -1, +1), [('-X', 'L'), ('-Y', 'D'), ('+Z', 'F')]),
    ('DFR', (+1, -1, +1), [('+X', 'R'), ('-Y', 'D'), ('+Z', 'F')]),
]


def make_slab(axis_key: str, color_face: str) -> dict:
    # axis_key 形如 '+X' / '-Y' / '+Z'：首位是符号，次位是轴字母
    sign_char, axis = axis_key[0], axis_key[1]
    sign = 1 if sign_char == '+' else -1
    off = HALF_BODY + SLAB_THICK / 2 + SLAB_GAP
    if axis == 'X':
        pos = [sign * off, 0.0, 0.0]
        scale = [SLAB_THICK, SLAB_FACE, SLAB_FACE]
    elif axis == 'Y':
        pos = [0.0, sign * off, 0.0]
        scale = [SLAB_FACE, SLAB_THICK, SLAB_FACE]
    else:  # Z
        pos = [0.0, 0.0, sign * off]
        scale = [SLAB_FACE, SLAB_FACE, SLAB_THICK]
    return {
        'resourceId': BODY_RES,
        'position': pos,
        'rotation': [0, 0, 0],
        'scale': scale,
        'color': {
            'enabled': True,
            'rgb': COLORS[color_face],
            'opacity': 100,
            'overlay': 'overwrite',
        },
    }


def build_assemblies() -> list:
    assemblies = []
    for idx, (name, signs, faces) in enumerate(CORNERS):
        prefab_id = PREFAB_ID_BASE + idx
        aux_start = AUX_ID_BASE + idx * 6
        def_aux = [aux_start + 0, aux_start + 1, aux_start + 2]
        inst_aux = [aux_start + 3, aux_start + 4, aux_start + 5]
        items = [make_slab(axis, cf) for axis, cf in faces]
        assemblies.append({
            'name': f'角块_{name}',
            'prefabId': prefab_id,
            'templatePrefabId': BODY_RES,
            'templateInstanceId': BODY_RES,
            'templateName': '长方体',
            # 成品布局：8 块按 2×2 魔方摆开（中心 ± 半块宽），禁止堆叠；
            # 该坐标即节点图动态创建实体的位置来源。
            'position': [HALF_ASSEMBLY * signs[0],
                         HALF_ASSEMBLY * signs[1],
                         HALF_ASSEMBLY * signs[2]],
            'rotation': [0, 0, 0],
            'scale': [ASSEMBLY_SCALE, ASSEMBLY_SCALE, ASSEMBLY_SCALE],
            'color': {
                'enabled': True,
                'rgb': BODY_COLOR,
                'opacity': 100,
                'overlay': 'overwrite',
            },
            'definitionAuxiliaryIds': def_aux,
            'instanceAuxiliaryIds': inst_aux,
            'items': items,
        })
    return assemblies


def build_entities() -> dict:
    """8 个场景实体：摆成已还原立方（块中心 ±0.5，立方中心抬到 y=1）。"""
    entities = []
    for idx, (name, signs, _faces) in enumerate(CORNERS):
        sx, sy, sz = signs
        entities.append({
            'name': f'场景角块_{name}',
            'id': 1077936137 + idx,
            'definitionId': PREFAB_ID_BASE + idx,
            'position': [0.5 * sx, 1.0 + 0.5 * sy, 0.5 * sz],
            'rotation': [0, 0, 0],
            'scale': [1, 1, 1],
        })
    return {'schemaVersion': 1, 'entities': entities}


def self_check(assemblies: list, entities: list) -> None:
    errors = []
    # 1) 每块恰好 3 个薄片
    for a in assemblies:
        if len(a['items']) != 3:
            errors.append(f"{a['name']}: items 数 != 3")
    # 2) 薄片内表面必须凸出块表面 >= 0.005（含容差）
    for a in assemblies:
        for it in a['items']:
            axis = next(i for i in range(3) if abs(it['scale'][i] - SLAB_THICK) < 1e-9)
            inner = abs(it['position'][axis]) - SLAB_THICK / 2
            if inner - HALF_BODY < 0.005 - 1e-6:
                errors.append(f"{a['name']}: 薄片内表面 {inner:.4f} 未凸出块表面")
    # 2b) 薄片厚度轴必须与所在面轴一致，且三面互异、方向与面符号一致
    for a in assemblies:
        seen_axes = []
        for it, (_axis_key, _cf) in zip(a['items'], next(c for c in CORNERS
                                                          if f'角块_{c[0]}' == a['name'])[2]):
            ax_letter = _axis_key[1]
            ax_sign = 1 if _axis_key[0] == '+' else -1
            thick_axis = next(i for i in range(3) if abs(it['scale'][i] - SLAB_THICK) < 1e-9)
            axis_names = 'XYZ'
            if axis_names[thick_axis] != ax_letter:
                errors.append(f"{a['name']}: 薄片 {_axis_key} 厚度轴应为 {ax_letter} "
                              f"实为 {axis_names[thick_axis]}")
            if it['position'][thick_axis] * ax_sign < 0:
                errors.append(f"{a['name']}: 薄片 {_axis_key} 方向错误")
            seen_axes.append(ax_letter)
        if len(set(seen_axes)) != 3:
            errors.append(f"{a['name']}: 三个薄片轴向不互异 {seen_axes}")
    # 3) scale 语义：模板 scale 由 assembly scale 决定（块体边长 = ASSEMBLY_SCALE）
    for a in assemblies:
        if a['scale'] != [ASSEMBLY_SCALE] * 3:
            errors.append(f"{a['name']}: assembly scale 不是 {ASSEMBLY_SCALE}")
    # 3b) 多件套成品布局：8 块 position 互异且 = 中心 ± HALF_ASSEMBLY（禁止堆叠）
    positions = []
    for a in assemblies:
        if a['position'] in positions:
            errors.append(f"{a['name']}: 与其它角块 position 重叠 {a['position']}")
        positions.append(a['position'])
    for a, (_name, signs, _faces) in zip(assemblies, CORNERS):
        expected = [HALF_ASSEMBLY * s for s in signs]
        if a['position'] != expected:
            errors.append(f"{a['name']}: position {a['position']} 应为成品布局 {expected}")
    # 4) 元件 ID 区间
    for a in assemblies:
        if a['prefabId'] < MIN_PREFAB_ID:
            errors.append(f"{a['name']}: prefabId {a['prefabId']} 低于 0x40400000 区间")
        for aux in a['definitionAuxiliaryIds'] + a['instanceAuxiliaryIds']:
            if aux in AUX_SKELETON_RESERVED:
                errors.append(f"{a['name']}: aux {aux} 命中骨架占位 ID")
            if aux < 1073741824:
                errors.append(f"{a['name']}: aux {aux} 越界")
    # 5) 六色齐备
    used_colors = set()
    for a in assemblies:
        for it in a['items']:
            used_colors.add(it['color']['rgb'])
    if used_colors != set(COLORS.values()):
        errors.append(f"颜色集合不完整: {sorted(hex(c) for c in used_colors)}")
    # 6) 实体 ID/引用
    for e in entities['entities']:
        if e['id'] < MIN_PREFAB_ID:
            errors.append(f"{e['name']}: 实体 ID {e['id']} 低于 0x40400000 区间")
        if e['definitionId'] not in [PREFAB_ID_BASE + i for i in range(len(CORNERS))]:
            errors.append(f"{e['name']}: definitionId {e['definitionId']} 引用错误")
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        sys.exit(1)
    print(f'[ok] self-check passed: {len(assemblies)} assemblies, '
          f'{len(entities["entities"])} entities')


def emit_mjs(assemblies: list) -> str:
    cfg = {'assets': {'staticAssemblies': assemblies}}
    js = 'export default ' + json.dumps(cfg, ensure_ascii=False, indent=2) + '\n'
    return js


def main() -> int:
    assemblies = build_assemblies()
    entities = build_entities()
    self_check(assemblies, entities)
    base = 'examples/cube-replica-c4'
    with open(f'{base}/cube-replica-c4.asset-config.mjs', 'w', encoding='utf-8') as f:
        f.write(emit_mjs(assemblies))
    with open(f'{base}/cube-replica-c4.entities.json', 'w', encoding='utf-8') as f:
        json.dump(entities, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'[ok] wrote {base}/cube-replica-c4.asset-config.mjs')
    print(f'[ok] wrote {base}/cube-replica-c4.entities.json')
    return 0


if __name__ == '__main__':
    sys.exit(main())
