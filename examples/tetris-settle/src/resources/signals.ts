// @gsts:signals

import { defineSignal } from 'genshin-ts/runtime/core'

// 与地图 hl（1073741834）里已注册的 tetris_settle 完全一致：空参
export const Signal = {
  "tetris_settle": defineSignal("tetris_settle", []),
} as const
