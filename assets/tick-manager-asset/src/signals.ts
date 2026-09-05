// @gsts:signals
// TickManager 多档频率信号（可复用资产信号 schema）
// 用法：消费方在自己的图里监听所需档位，不要在低频逻辑上监听高频档。
// 参数统一：manager=TickManager 实体；now_ms=GlobalTick 当前毫秒；interval_s=本档标称间隔（秒）。
import { defineSignal } from 'genshin-ts/runtime/core'

export const TickManagerSignal = {
  tick60: defineSignal('TickUpdate_60', [
    ['manager', 'entity'],
    ['now_ms', 'int'],
    ['interval_s', 'float']
  ]),
  tick200: defineSignal('TickUpdate_200', [
    ['manager', 'entity'],
    ['now_ms', 'int'],
    ['interval_s', 'float']
  ]),
  tick1000: defineSignal('TickUpdate_1000', [
    ['manager', 'entity'],
    ['now_ms', 'int'],
    ['interval_s', 'float']
  ])
} as const
