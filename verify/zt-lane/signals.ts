// 计算通道 v2（同步机制核验 Round 1，2026-09-01，地图 1073741915「变量」）
// 客户端 20008 图回传信号：(tag, epoch, hash)
//   tag = 'ok' 快照完整已计算 / 'tearH' 哈希不符（半新半旧）/ 'tearE' 二读 epoch 变了（读取中被覆盖）
import { defineSignal } from 'genshin-ts/runtime/core'

export const ZtSignal = {
  zt_echo: defineSignal('zt_echo', [
    ['tag', 'str'],
    ['e', 'int'],
    ['h', 'int']
  ])
} as const
