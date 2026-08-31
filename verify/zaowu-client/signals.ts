// 造物技能路径探针共享信号定义：20008 造物技能图经「向服务器节点图发送信号」回传
// （C 线 Round 0，2026-08-31，地图 1073741915「变量」）
import { defineSignal } from 'genshin-ts/runtime/core'

export const ZaowuSignal = {
  zaowu_probe: defineSignal('zaowu_probe', [
    ['tag', 'str'],
    ['val', 'str']
  ])
} as const
