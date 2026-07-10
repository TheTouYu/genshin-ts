// @gsts:signals

import { defineSignal } from 'genshin-ts/runtime/core'

export const Signal = {
  TickUpdate: defineSignal('TickUpdate', [
    ['TickManager', 'entity'],
    ['实际刷新时间[ms]', 'int'],
    ['实际刷新间隔[s]', 'float']
  ]),
  日志操作: defineSignal('日志操作', [
    ['事件名称', 'str'],
    ['msg', 'str_list'],
    ['日志操作', 'int'],
    ['i', 'int']
  ]),
  物理运动: defineSignal('物理运动', [
    ['run', 'int'],
    ['v', 'vec3'],
    ['w', 'vec3'],
    ['额外受力', 'float']
  ]),
  物理运动引擎实体: defineSignal('物理运动引擎实体', [
    ['运动实体', 'entity'],
    ['挂载实体', 'entity'],
    ['参数_1', 'entity']
  ]),
  物理运动计算: defineSignal('物理运动计算', [
    ['v', 'vec3'],
    ['w', 'vec3'],
    ['额外压力', 'float'],
    ['t', 'float']
  ]),
  足球: defineSignal('足球', [
    ['角色实体', 'entity'],
    ['事件', 'str'],
    ['v', 'vec3'],
    ['w', 'vec3'],
    ['f', 'float'],
    ['位置', 'vec3'],
    ['旋转', 'vec3']
  ])
} as const
