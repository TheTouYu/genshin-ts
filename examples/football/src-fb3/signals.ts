// @status: 新线（v3 客户端计算最小链路，2026-10-24）
// fb3/signals.ts —— v3 地图（1073741827）已注册信号的真值表
//
// 单一事实源：`gsts assets:signals inspect --map-id 1073741827`
//   kit_state send=1610612744 monitor=1610612745 server=1610612746
//     params = [tag:str, tick:int, pos:vec3, vel:vec3, spin:vec3, state:int]
//   zaowu_probe（造物探针，上一轮证据）
import { defineSignal } from 'genshin-ts/runtime/core'

export const KitSignal = {
  kit_state: defineSignal('kit_state', [
    ['tag', 'str'],
    ['tick', 'int'],
    ['pos', 'vec3'],
    ['vel', 'vec3'],
    ['spin', 'vec3'],
    ['state', 'int']
  ])
} as const
