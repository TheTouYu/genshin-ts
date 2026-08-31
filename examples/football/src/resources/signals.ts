// @gsts:signals

import { defineSignal } from 'genshin-ts/runtime/core'

export const Signal = {
  ball_dropped: defineSignal('ball_dropped', [['vel', 'vec3']]),
  ball_impulse: defineSignal('ball_impulse', [
    ['vel', 'vec3'],
    ['mode', 'int']
  ]),
  ball_kick: defineSignal('ball_kick', [['tabId', 'int']]),
  ball_reset: defineSignal('ball_reset', []),
  ball_set_state: defineSignal('ball_set_state', [
    ['next', 'int'],
    ['vel', 'vec3']
  ]),
  football_kick: defineSignal('football_kick', [['tabId', 'int']]),
  football_push: defineSignal('football_push', [['hitPoint', 'vec3']]),
  football_push_req: defineSignal('football_push_req', [['hitPoint', 'vec3']]),
  render_now: defineSignal('render_now', []),
  state_changed: defineSignal('state_changed', [
    ['prev', 'int'],
    ['next', 'int']
  ])
} as const
