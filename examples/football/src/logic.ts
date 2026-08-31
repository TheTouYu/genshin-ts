// 足球 v5 三层架构 · 逻辑层根图（挂球实体 1077936135，图 1073741825——接管 v4 game.ts）
//
// 职责（docs/architecture-v5.md）：
//   - 唯一状态仲裁者（经 ballStateTransition；本图不直接写 state）
//   - 唯一物理积分器宿主（phys_loop 0.12s + IMMEDIATE 当拍路径，全部走 ballPhysTick）
//   - 黑板发布（pos/vel/spin/state/goalCount——球实体自定义变量，唯一写者）
//   - 使用层信号入口：ball_kick / ball_impulse / ball_reset / ball_set_state
//   - tab 输入（使用层首版内联于此；后续玩法增多时抽独立输入图）
//
// 图变量 = 逻辑层内部态（物化快照/计分/脱手计数）；跨图事实一律走球实体自定义变量。
// 空转治理：静止（IDLE/GOAL）全系统零定时器——phys_loop 由 transition 启停，
// 渲染层 loop 由 state_changed 自启停；本图除 goal_reset（一次性）外无常驻定时器。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str, vec3 } from 'genshin-ts/runtime/value'
import { ballStateTransition, BALL_IDLE, BALL_GOAL } from './composites/ball-state.js'
import { ballPhysTick, ballResetFlow } from './composites/ball-phys.js'
import { Signal } from './resources/signals.js'


// ================================================================
// 逻辑层根图
// ================================================================
const graph = g
  .server({
    id: 1073741825,
    variables: {
      // 状态（ballStateTransition 唯一写；图变量为逻辑层 fast path，跨图广播走实体自定义变量）
      state: new int(0),
      // 单 tick 物化快照（防二次求值；ballPhysTick 各分支读写）
      tmpPos: new vec3([0, 0.25, 0]),
      tmpVel: new vec3([0, 0, 0]),
      tmpSpin: new vec3([0, 0, 0]),
      tmpGoal: new bool(false), // 进球判定物化（scored 写回后再读 goalNew 会重算出 false——重复求值家族）
      scored: new bool(false), // 进球去重（复位清零）
      goalCount: new int(0), // 累计进球（跨复位保留；进球拍发布黑板）
      lostTicks: new float(0) // CARRIED 脱手计数（脱手/获得时清零）
    }
  })
  // ================================================================
  // 实体创建：黑板同步实体现实 + 运行态复位（3017 防幽灵球：变量与实体位置跨会话
  // 分歧后所有位置逻辑量的是幽灵球——每次创建拉回真实位置）
  // ================================================================
  .on('whenEntityIsCreated', (evt: any, f: any) => {
    const ball = f.getSelfEntity()
    const loc = f.getEntityLocationAndRotation(ball).location
    const zero = f.create3dVector(0, 0, 0)
    f.setCustomVariable(ball, 'pos', loc, false)
    f.setCustomVariable(ball, 'vel', zero, false)
    f.setCustomVariable(ball, 'spin', zero, false)
    f.setCustomVariable(ball, 'impVel', zero, false)
    f.setCustomVariable(ball, 'impSpin', zero, false)
    f.setNodeGraphVariable('scored', new bool(false), false)
    f.setNodeGraphVariable('lostTicks', new float(0), false)
    // 状态复位（GOAL→IDLE 或 CARRIED→IDLE 等真实变化会广播：渲染层停 loop、带球图复位）
    const tr = f.callComposite(ballStateTransition, { e: ball, next: new int(BALL_IDLE), vel: zero })
  })
  // ================================================================
  // tab 输入已拆至使用层输入图 input.ts（图 1073741826，2026-08-31 节点预算分载：
  // ballApplyImmediate 展开 914/实例，双实例挤本图 → 根图展开超拒载线）。
  // ball_impulse handler 同拆至 input.ts（IMMEDIATE 实例同因预算；信号广播跨图可达）。
  // ================================================================
  // ball_reset 信号：复位流程（幂等）
  // ================================================================
  .onSignal(Signal.ball_reset, (evt: any, f: any) => {
    const rf = f.callComposite(ballResetFlow, { e: f.getSelfEntity() })
    void rf
  })
  // ================================================================
  // ball_set_state 信号（高级：强制状态切换——获得判定请求/裁判判罚走此）。
  // 守卫终审在 ballStateTransition（GOAL 锁/获得守卫/同态跳过）
  // ================================================================
  .onSignal(Signal.ball_set_state, (evt: any, f: any) => {
    const ball = f.getSelfEntity()
    f.callComposite(ballStateTransition, { e: ball, next: evt.params.next, vel: evt.params.vel })
  })
  // ================================================================
  // 定时器：phys_loop（0.12s 逻辑循环）+ goal_reset（进球 2s 复位）
  // ================================================================
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    f.doubleBranch(
      f.equal(evt.timerName, new str('phys_loop')),
      () => {
        f.callComposite(ballPhysTick, { e: f.getSelfEntity() })
      },
      () => {
        f.doubleBranch(
          f.equal(evt.timerName, new str('goal_reset')),
          () => {
            const rf = f.callComposite(ballResetFlow, { e: f.getSelfEntity() })
            void rf
          },
          () => {}
        )
      }
    )
  })

export default graph
