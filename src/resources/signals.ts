// @gsts:signals

import { defineSignal } from 'genshin-ts/runtime/core'

export const Signal = {
  cube_turn: defineSignal('cube_turn', [
    ['face', 'str'],
    ['direction', 'str']
  ]),
  gsts_type_probe_vec3_list: defineSignal('gsts_type_probe_vec3_list', [['value', 'vec3_list']]),
  信号_1_测试: defineSignal('信号_1_测试', [
    ['参数_1', 'int'],
    ['参数_2', 'entity'],
    ['参数_3', 'bool_list']
  ]),
  信号_2_测试: defineSignal('信号_2_测试', [
    ['参数_4', 'int'],
    ['参数_5', 'entity'],
    ['参数_6', 'bool_list']
  ]),
  信号测试全参数: defineSignal('信号测试全参数', [
    ['伤害值', 'int'],
    ['移动速度', 'float'],
    ['目标位置', 'vec3'],
    ['文本', 'str'],
    ['是否暴击', 'bool'],
    ['目标GUID', 'guid'],
    ['目标实体', 'entity'],
    ['预制体', 'prefab_id'],
    ['配置ID', 'config_id']
  ]),
  '信号测试全参数-列表': defineSignal('信号测试全参数-列表', [
    ['参数_1', 'config_id_list'],
    ['参数_2', 'prefab_id_list'],
    ['参数_3', 'entity_list'],
    ['参数_4', 'guid_list'],
    ['参数_5', 'bool_list'],
    ['参数_6', 'vec3_list'],
    ['参数_7', 'str_list'],
    ['参数_8', 'float_list'],
    ['参数_9', 'int_list']
  ]),
  工具_全列表: defineSignal('工具_全列表', [
    ['参数_1', 'config_id_list'],
    ['参数_2', 'prefab_id_list'],
    ['参数_3', 'entity_list'],
    ['参数_4', 'guid_list'],
    ['参数_5', 'bool_list'],
    ['参数_6', 'vec3_list'],
    ['参数_7', 'str_list'],
    ['参数_8', 'float_list'],
    ['参数_9', 'int_list']
  ]),
  工具_全参数: defineSignal('工具_全参数', [
    ['参数_1', 'int'],
    ['参数_2', 'float'],
    ['参数_3', 'vec3'],
    ['参数_4', 'str'],
    ['参数_5', 'bool'],
    ['参数_6', 'guid'],
    ['参数_7', 'entity'],
    ['参数_8', 'prefab_id'],
    ['参数_9', 'config_id']
  ]),
  工具_新信号: defineSignal('工具_新信号', [
    ['参数_1', 'int'],
    ['参数_2', 'str'],
    ['参数_3', 'bool_list']
  ]),
  工具_混合: defineSignal('工具_混合', [
    ['参数_1', 'int'],
    ['参数_2', 'str'],
    ['参数_3', 'bool_list'],
    ['参数_4', 'guid'],
    ['参数_5', 'entity_list'],
    ['参数_6', 'float'],
    ['参数_7', 'vec3_list'],
    ['参数_8', 'prefab_id'],
    ['参数_9', 'config_id_list']
  ])
} as const
