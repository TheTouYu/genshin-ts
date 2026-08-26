// @gsts:signals

import { defineSignal } from 'genshin-ts/runtime/core'

export const Signal = {
  football_kick: defineSignal('football_kick', [['tabId', 'int']]),
  football_push: defineSignal('football_push', [['target', 'vec3']]),
  football_push_req: defineSignal('football_push_req', [['target', 'vec3']])
} as const
