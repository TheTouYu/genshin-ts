// @gsts:signals

import { defineSignal } from 'genshin-ts/runtime/core'

export const Signal = {
  ganyu_settle: defineSignal('ganyu_settle', [['win', 'int']])
} as const
