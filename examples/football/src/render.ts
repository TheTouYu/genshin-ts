// 足球 v5 三层架构 · 渲染层根图（挂球实体，图 1073741829——新图，需 assets 挂载）
//
// 职责（docs/architecture-v5.md）：把逻辑层发布的黑板速度/自旋变成运动设备——
//   render_loop（0.12s，state_changed 遥控启停）：每拍读黑板 → ballRenderFrame 顶替设备
//   render_now 信号：IMMEDIATE 路径插队帧（当拍渲染，零延迟反馈）
//   state_changed：进运动态=启 loop+首帧；进 IDLE/GOAL=停 loop+终位（零速设备）
//
// 不变量：本图零图变量、零黑板写入（纯消费者）——逻辑层卡拍时设备 0.15s 时长自行
// 延续，球平滑减速不瞬断；静止时零定时器（空转治理）。
// 负载优化空间（二期）：匀速段设备时长拉长降顶替频率；速度模长<ε 跳过顶替。
import { g } from 'genshin-ts/runtime/core'
import { bool, str } from 'genshin-ts/runtime/value'
import { ballRenderFrame, ballRenderHalt } from './composites/ball-render.js'
import { Signal } from './resources/signals.js'

const RENDER_TICK = 0.5 // 渲染拍距（2026-08-31 降载联动；原 0.12）
const RENDER_LOOP = 'render_loop'

const graph = g
  .server({
    id: 1073741829,
    variables: {}
  })
  // 实体创建：终位兜底（场景重载时实体可能残留旧设备速度——零速顶替即刻静止）
  .on('whenEntityIsCreated', (evt: any, f: any) => {
    const halt = f.callComposite(ballRenderHalt, { e: f.getSelfEntity() })
    void halt
  })
  // ================================================================
  // 状态广播：渲染 loop 生命周期遥控（空转治理——静止零定时器）
  // ================================================================
  .onSignal(Signal.state_changed, (evt: any, f: any) => {
    const ball = f.getSelfEntity()
    const next = evt.params.next
    // 进运动态（FLY/ROLL/SLIDE/CARRIED）：启 loop + 立即首帧（不等第一拍 0.12s）
    const toMotion = f.logicalOrOperation(
      f.logicalOrOperation(f.equal(next, 1n), f.equal(next, 2n)),
      f.logicalOrOperation(f.equal(next, 3n), f.equal(next, 4n))
    )
    f.doubleBranch(
      toMotion,
      () => {
        f.startTimer(ball, RENDER_LOOP, true, f.assemblyList([RENDER_TICK], 'float'))
        const frame = f.callComposite(ballRenderFrame, { e: ball })
      },
      () => {
        // 进 IDLE/GOAL：停 loop + 终位（零速设备一帧，此后无顶替——球定住）
        f.stopTimer(ball, RENDER_LOOP)
        const halt = f.callComposite(ballRenderHalt, { e: ball })
      }
    )
  })
  // ================================================================
  // IMMEDIATE 插队帧：kick/触球当拍渲染（黑板已被逻辑层写入）
  // ================================================================
  .onSignal(Signal.render_now, (evt: any, f: any) => {
    const frame = f.callComposite(ballRenderFrame, { e: f.getSelfEntity() })
    void frame
  })
  // ================================================================
  // 常态渲染循环：每拍顶替设备（0.15s 时长 > 0.12s 拍距——重叠无缝）
  // ================================================================
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    f.doubleBranch(
      f.equal(evt.timerName, new str(RENDER_LOOP)),
      () => {
        const frame = f.callComposite(ballRenderFrame, { e: f.getSelfEntity() })
        void frame
      },
      () => {}
    )
  })

export default graph
