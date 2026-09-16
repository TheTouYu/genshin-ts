// @gsts:signals

import { defineSignal } from 'genshin-ts/runtime/core'

export const Signal = {
  T12隐藏物已拾取: defineSignal('T12隐藏物已拾取', [['序号', 'int']])
} as const
