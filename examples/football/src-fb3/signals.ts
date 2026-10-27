// @status: 物理内核 v1（2026-10-27 增 fb_input：Lua 输入桥信号）
// fb3/signals.ts —— v3 地图（1073741827）已注册信号的真值表
//
// 单一事实源：`gsts assets:signals inspect --map-id 1073741827`
//   kit_state send=1610612744 monitor=1610612745 server=1610612746
//     params = [tag:str, tick:int, pos:vec3, vel:vec3, spin:vec3, state:int]
//   zaowu_probe（造物探针，上一轮证据）
//   fb_input —— Lua 客户端脚本 → 服务器图（kitListen）的输入票
//     params = [key:int, state:int]；key=0/state=0 是脚本 OnStart 的心跳（证明整链通）
import { defineSignal } from 'genshin-ts/runtime/core'

export const KitSignal = {
  kit_state: defineSignal('kit_state', [
    ['tag', 'str'],
    ['tick', 'int'],
    ['pos', 'vec3'],
    ['vel', 'vec3'],
    ['spin', 'vec3'],
    ['state', 'int']
  ]),
  // Lua 桥：`local s=game.ServerSignal('fb_input'); s:AddInt(key); s:AddInt(state); s:SendSignal()`
  fb_input: defineSignal('fb_input', [
    ['key', 'int'],
    ['state', 'int']
  ])
} as const
