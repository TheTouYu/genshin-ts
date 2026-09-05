// fb-idle-listen.ts —— 空载验证图（票 19 小类 2.2）
// @status: 以 .scratch/football-v2/BOARD.md 为准（空载验证消费面；当前主线已由 fb-phys2 接管）
// 职责：收 fb_idle_state → 图变量计数；零定时器/零 print/零实体变量写。
// 信号：fb_idle_state（6 参 vec3，2026-09-03 注册 1610612780/781/782，定义见 signals.ts）。
// 图 ID：1073741832（type 20000，真实分配）；挂载目标按 BOARD/回读为准。
// 计数器=图变量（DSL 声明即生效免注册），每 echo 必有可判读帧。
// 设计沿革/隔离策略见 issues/19-*.md，不在源码头保留。
import { g } from 'genshin-ts/runtime/core'
import { int } from 'genshin-ts/runtime/value'

import { FbSignal } from './signals.js'

// 信号定义在 signals.ts（fb_idle_state，共享单一事实源——fb-phys2 发送侧同用）

g.server({ id: 1073741832, name: '_GSTS_fbIdleListen', variables: { fb_idle_cnt: new int(0) } }).onSignal(
  FbSignal.fb_idle_state,
  (_evt, f) => {
    // 最小到达标记：图变量 +1（IN 参数数据正确性从帧流判读，不在此消耗算力）
    const cnt = f.getNodeGraphVariable('fb_idle_cnt').asType('int')
    f.setNodeGraphVariable('fb_idle_cnt', cnt + 1n, false)
  }
)
