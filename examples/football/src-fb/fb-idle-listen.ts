// fb-idle-listen.ts —— 空载验证图（票 19 小类 2.2，compile-only 至 4.1 注入）
//
// 职责：空载阶段（大类 5 阶段 1）服务端最小消费面——收 fb_idle_state → 图变量计数。
// 归因依据=analysis/19-load-attribution.md（服务端 96% 是判读面，本图全部禁入）：
//   ✓ 零回声账务（无 total 计数/tag 多级分发/per-instance 计数/实体变量写）
//   ✓ 零位置轮询 / 零 HP 事件账务 / 零扣血循环 / 零定时器（事件驱动唯一路径）
//   ✓ 零 print（判读走帧流：详情日志按图开，IN 参数即 10 分量数据正确性证据）
// 隔离策略（读现网 fb-server.ts L515-707 消费结构后定案）：
//   · fb_server 对 fb_ball_state 非 P tag 走 else 打印 'fb:tear'（L703-706）→ 高频
//     非 P tag 会 60 次/s 打印洪泛；tag='P' 且 tick 匹配会触发全套 apply 重逻辑
//     （镜像 11 写+驱动+进球判定）→ 「独立 tag 复用 fb_ball_state」两路皆否决。
//   · 定案=**新信号 fb_idle_state**（6 参 vec3 与 fb_ball_state 同 wire 形态，
//     donor=fb_ball_state，2026-09-03 注册 1610612780/781/782）——现网 fb_server/
//     fb-svlisten 均不订阅 → 空载阶段服务端重逻辑零执行；同形态=验证的正是接管
//     数据路径。接管（阶段 2）=fb-phys2 改发 fb_ball_state 'P' 重编译注入（回退/
//     切换路径见 4.3 回退文档）。
// ⚠️ 图 ID 1073741832 = 真实分配（2026-09-04 assets:node-graphs create --type 20000，
//   候选→写回→回读过；注入对象=本图 + fb-phys2，四件套红线另守）。挂载目标=球实体
//   1077936135（getSelfEntity=球；本图零定时器，与同实体 fb-server/fb-svlisten
//   名单制零串扰）。
// 计数器=图变量（DSL 声明即生效免注册，fb-server fb_auto 同款）；≈3-4 帧/echo
// （vs 3133 判读面 13.8 帧/echo；纯空 handler 的到达记录可见性未实证，计数器=
// 保底观测面，每 echo 必有可判读帧）。
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
