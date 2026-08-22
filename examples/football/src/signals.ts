// 足球跨图信号定义
import { defineSignal } from 'genshin-ts/runtime/core'

export const FootballSignal = {
  // 输入图 → 物理图：踢球指令（tabId 1-6 射门 / 7-8 传球 / 9 复位）
  football_kick: defineSignal('football_kick', [['tabId', 'int']])
} as const
