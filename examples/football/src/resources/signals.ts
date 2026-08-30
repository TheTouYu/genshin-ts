// @gsts:signals

import { defineSignal } from 'genshin-ts/runtime/core'

export const Signal = {
  ball_dropped: defineSignal('ball_dropped', [['vel', 'vec3']]),
  football_kick: defineSignal('football_kick', [['tabId', 'int']]),
  football_push: defineSignal('football_push', [['hitPoint', 'vec3']]),
  football_push_req: defineSignal('football_push_req', [['hitPoint', 'vec3']])
} as const
