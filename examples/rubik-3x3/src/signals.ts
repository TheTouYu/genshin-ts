// 3×3 魔方跨控制器 / 跨图信号定义
import { defineSignal } from 'genshin-ts/runtime/core'

export const RubikSignal = {
  rubik3x3_tab: defineSignal('rubik3x3_tab', [['tabId', 'int']]),
  // 求解器 -> 主图：请求主图发布逻辑状态
  rubik3x3_solve_req: defineSignal('rubik3x3_solve_req', []),
  // 主图 -> 求解器：状态已发布，可以开始求解
  rubik3x3_solve_ready: defineSignal('rubik3x3_solve_ready', []),
  // 求解器 -> 主图：请求执行一步（game moveId 1..6）
  rubik3x3_solve_move: defineSignal('rubik3x3_solve_move', [['moveId', 'int']]),
  // 主图 -> 求解器：上一步动画完成回执
  rubik3x3_solve_ack: defineSignal('rubik3x3_solve_ack', []),
  // 求解器 -> 主图：求解结束（ok 1=完成 0=失败）
  rubik3x3_solve_done: defineSignal('rubik3x3_solve_done', [['ok', 'int']])
} as const
