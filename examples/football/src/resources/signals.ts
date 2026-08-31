// @gsts:signals

import { defineSignal } from 'genshin-ts/runtime/core'

export const Signal = {
  ball_dropped: defineSignal('ball_dropped', [['vel', 'vec3']]),
  // 状态切换信号（2026-08-31 四点合一）：stateCommit 在 state 真实变化时发送，
  // 监听方（dribble-field 图）做记忆复位——状态传播不再依赖 tick 轮询 lastSeenState。
  // 同态提交（ROLL→ROLL 等物理 tick 链尾占位提交）不发包，杜绝重复风暴。
  state_changed: defineSignal('state_changed', [['prev', 'int'], ['next', 'int']]),
  football_kick: defineSignal('football_kick', [['tabId', 'int']]),
  football_push: defineSignal('football_push', [['hitPoint', 'vec3']]),
  football_push_req: defineSignal('football_push_req', [['hitPoint', 'vec3']])
} as const
