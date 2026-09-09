// 3×3 魔方跨控制器 / 跨图信号定义
import { defineSignal } from 'genshin-ts/runtime/core'

export const RubikSignal = {
  rubik3x3_tab: defineSignal('rubik3x3_tab', [['tabId', 'int']]),
  // 单一求解信号：op 区分阶段，val 携带参数
  // op 1 求解器→主图 请求状态；2 主图→求解器 状态已发布；
  // op 3 求解器→主图 执行一步(val=moveId)；4 主图→求解器 该步完成；5 求解器→主图 完成(val=ok)
  rubik3x3_solve: defineSignal('rubik3x3_solve', [['op', 'int'], ['val', 'int']]),
  // 客户端算力分载（W3 自 rubik-3x3-client 移植，2026-09-09 注册于 1920）：
  // 十字计算单元回传（tag: c0/c1/c2=宏表码 / xd=完成 / xr=撕裂）
  rbx_echo: defineSignal('rbx_echo', [['tag', 'str'], ['e', 'int']]),
  // 渲染参数单元回传（每槽一条：tag='s'、e=epoch、slot、piece、spin 轴 axis + 两段轨道速度
  // vel1/vel2，vec3 均计 1 参，共 6 参 ≤10；球跟随链 vel1/vel2 恒零保 wire 兼容）
  rbv_echo: defineSignal('rbv_echo', [
    ['tag', 'str'], ['e', 'int'], ['slot', 'int'], ['piece', 'int'],
    ['axis', 'vec3'], ['vel1', 'vec3'], ['vel2', 'vec3']
  ]),
  // visual 图收齐执行包后通知 turn 图按包起定时器（e=epoch）
  rbv_go: defineSignal('rbv_go', [['e', 'int']])
} as const

// rubik-game 对局信号（2026-09-09 注册于 1920，G3）
export const RgSignal = {
  // 玩家图→服务端：btnId 1..12=转动、20=提示、21=重开、22=菜单、100..103=开局档位(3/5/8/12)、200=自由
  rubikgame_input: defineSignal('rubikgame_input', [['btnId', 'int']]),
  // 对局图广播：ev 1=状态变化(rg_stage)、2=打乱完成、3=步数更新(rg_moves)、4=结算(星级)
  rubikgame_state: defineSignal('rubikgame_state', [['ev', 'int'], ['val', 'int']])
} as const
