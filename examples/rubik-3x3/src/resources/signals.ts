// @gsts:signals

import { defineSignal } from 'genshin-ts/runtime/core'

export const Signal = {
  rubik3x3_tab: defineSignal('rubik3x3_tab', [['tabId', 'int']]),
  rubik3x3_solve_req: defineSignal('rubik3x3_solve_req', []),
  rubik3x3_solve_move: defineSignal('rubik3x3_solve_move', [['moveId', 'int']]),
  rubik3x3_solve_ack: defineSignal('rubik3x3_solve_ack', []),
  rubik3x3_solve_done: defineSignal('rubik3x3_solve_done', [['ok', 'int']])
} as const
