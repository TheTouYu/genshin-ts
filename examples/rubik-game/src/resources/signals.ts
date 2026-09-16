// @gsts:signals

import { defineSignal } from 'genshin-ts/runtime/core'

export const Signal = {
  rbv_echo: defineSignal('rbv_echo', [
    ['tag', 'str'],
    ['e', 'int'],
    ['slot', 'int'],
    ['piece', 'int'],
    ['axis', 'vec3'],
    ['vel1', 'vec3'],
    ['vel2', 'vec3']
  ]),
  rbv_go: defineSignal('rbv_go', [['e', 'int']]),
  rbx_echo: defineSignal('rbx_echo', [
    ['tag', 'str'],
    ['e', 'int']
  ]),
  rubik3x3_solve: defineSignal('rubik3x3_solve', [
    ['op', 'int'],
    ['val', 'int']
  ]),
  rubik3x3_solve_ack: defineSignal('rubik3x3_solve_ack', []),
  rubik3x3_solve_done: defineSignal('rubik3x3_solve_done', [['ok', 'int']]),
  rubik3x3_solve_move: defineSignal('rubik3x3_solve_move', [['moveId', 'int']]),
  rubik3x3_solve_ready: defineSignal('rubik3x3_solve_ready', []),
  rubik3x3_solve_req: defineSignal('rubik3x3_solve_req', []),
  rubik3x3_tab: defineSignal('rubik3x3_tab', [['tabId', 'int']]),
  rubikgame_input: defineSignal('rubikgame_input', [['btnId', 'int']]),
  rubikgame_state: defineSignal('rubikgame_state', [
    ['ev', 'int'],
    ['val', 'int']
  ])
} as const
