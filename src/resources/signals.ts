// @gsts:signals

import { defineSignal } from 'genshin-ts/runtime/core'

export const Signal = {
  信号_1: defineSignal('信号_1', [
    ['参数_1', 'int'],
    ['参数_2', 'float'],
    ['参数_3', 'vec3'],
    ['参数_4', 'entity'],
    ['参数_5', 'entity_list']
  ]),
  信号_全部列表参数测试: defineSignal('信号_全部列表参数测试', [
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
  信号_全部参数测试: defineSignal('信号_全部参数测试', [
    ['参数_1', 'int'],
    ['参数_2', 'float'],
    ['参数_3', 'vec3'],
    ['参数_4', 'guid'],
    ['参数_5', 'bool'],
    ['参数_6', 'entity'],
    ['参数_7', 'prefab_id'],
    ['参数_8', 'config_id'],
    ['参数_9', 'str']
  ])
} as const
