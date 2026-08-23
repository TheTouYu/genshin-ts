// 3×3 魔方跨控制器 / 跨图信号定义
import { defineSignal } from 'genshin-ts/runtime/core'

export const RubikSignal = {
  rubik3x3_tab: defineSignal('rubik3x3_tab', [['tabId', 'int']]),
  // 单一求解信号：op 区分阶段，val 携带参数
  // op 1 求解器→主图 请求状态；2 主图→求解器 状态已发布；
  // op 3 求解器→主图 执行一步(val=moveId)；4 主图→求解器 该步完成；5 求解器→主图 完成(val=ok)
  rubik3x3_solve: defineSignal('rubik3x3_solve', [['op', 'int'], ['val', 'int']])
} as const
