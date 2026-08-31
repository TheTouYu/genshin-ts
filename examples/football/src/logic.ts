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
import { ballPhysTick, ballApplyImmediate, ballResetFlow } from './composites/ball-phys.js'
import { Signal } from './resources/signals.js'

// ================================================================
// tab 踢球参数表（文件内复合）：tabId → 新速度/新自旋写图变量 tmpVel/tmpSpin
// 统一叠加式：nv = 当前球速 + 表值×scaleF；IDLE 时 scaleF=1（等价全量设定），
// 运动态 scaleF=0.35（v4 IMPULSE_SCALE 加载量级）。clamp 由 ballApplyImmediate 统一做。
// ================================================================
const tabVelTable: Record<number, [number, number, number]> = {
  1: [-14, 4, 6],
  2: [-24, 5, 0],
  3: [-15, 14, 0],
  4: [-16, 6, 12],
  5: [-16, 6, -12],
  6: [18, 4, 12],
  7: [-14, 5, 8],
  8: [4, 6, 18]
}
const tabSpinTable: Record<number, [number, number, number]> = {
  1: [0, -6, 0],
  2: [0, -8, 0],
  3: [0, 0, 6],
  4: [0, -9, 0],
  5: [0, 9, 0],
  6: [0, 0, 10],
  7: [0, 0, -8],
  8: [6, 0, 0]
}

const ballTabKick = g.defineComposite('ball_tab_kick', {
  inputs: { e: { type: 'entity' }, tabId: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, tabId }, f) => {
    // 缩放系数（数据选择）：IDLE=1.0（全量设定），运动态=0.35（冲量叠加）
    const state = f.getCustomVariable(e, new str('state')).asType('int')
    const isIdle = f.equal(state, new int(BALL_IDLE))
    const idleF = f.dataTypeConversion(f.dataTypeConversion(isIdle, 'int'), 'float')
    const scaleF = f.addition(idleF, f.multiplication(f.subtraction(1, idleF), 0.35))
    const boardVel = f.getCustomVariable(e, new str('vel')).asType('vec3')
    const boardSpin = f.getCustomVariable(e, new str('spin')).asType('vec3')
    // 默认节点（entry 链首，v4 kickApplyForce 同模式）：无匹配 tabId 时保持原速。
    // 复合内保留 registerExecNode 形态——outflow 需要节点句柄
    const done = f.registerExecNode('set_node_graph_variable', [new str('tmpVel'), boardVel, new bool(false)])
    f.multipleBranches(tabId, {
      1: () => {
        const nv = f._3dVectorAddition(
          boardVel,
          f._3dVectorZoom(f.create3dVector(...tabVelTable[1]), scaleF)
        )
        f.setNodeGraphVariable('tmpVel', nv, false)
        const nw = f._3dVectorAddition(
          boardSpin,
          f._3dVectorZoom(f.create3dVector(...tabSpinTable[1]), scaleF)
        )
        f.setNodeGraphVariable('tmpSpin', nw, false)
      },
      2: () => {
        const nv = f._3dVectorAddition(
          boardVel,
          f._3dVectorZoom(f.create3dVector(...tabVelTable[2]), scaleF)
        )
        f.setNodeGraphVariable('tmpVel', nv, false)
        const nw = f._3dVectorAddition(
          boardSpin,
          f._3dVectorZoom(f.create3dVector(...tabSpinTable[2]), scaleF)
        )
        f.setNodeGraphVariable('tmpSpin', nw, false)
      },
      3: () => {
        const nv = f._3dVectorAddition(
          boardVel,
          f._3dVectorZoom(f.create3dVector(...tabVelTable[3]), scaleF)
        )
        f.setNodeGraphVariable('tmpVel', nv, false)
        const nw = f._3dVectorAddition(
          boardSpin,
          f._3dVectorZoom(f.create3dVector(...tabSpinTable[3]), scaleF)
        )
        f.setNodeGraphVariable('tmpSpin', nw, false)
      },
      4: () => {
        const nv = f._3dVectorAddition(
          boardVel,
          f._3dVectorZoom(f.create3dVector(...tabVelTable[4]), scaleF)
        )
        f.setNodeGraphVariable('tmpVel', nv, false)
        const nw = f._3dVectorAddition(
          boardSpin,
          f._3dVectorZoom(f.create3dVector(...tabSpinTable[4]), scaleF)
        )
        f.setNodeGraphVariable('tmpSpin', nw, false)
      },
      5: () => {
        const nv = f._3dVectorAddition(
          boardVel,
          f._3dVectorZoom(f.create3dVector(...tabVelTable[5]), scaleF)
        )
        f.setNodeGraphVariable('tmpVel', nv, false)
        const nw = f._3dVectorAddition(
          boardSpin,
          f._3dVectorZoom(f.create3dVector(...tabSpinTable[5]), scaleF)
        )
        f.setNodeGraphVariable('tmpSpin', nw, false)
      },
      6: () => {
        const nv = f._3dVectorAddition(
          boardVel,
          f._3dVectorZoom(f.create3dVector(...tabVelTable[6]), scaleF)
        )
        f.setNodeGraphVariable('tmpVel', nv, false)
        const nw = f._3dVectorAddition(
          boardSpin,
          f._3dVectorZoom(f.create3dVector(...tabSpinTable[6]), scaleF)
        )
        f.setNodeGraphVariable('tmpSpin', nw, false)
      },
      7: () => {
        const nv = f._3dVectorAddition(
          boardVel,
          f._3dVectorZoom(f.create3dVector(...tabVelTable[7]), scaleF)
        )
        f.setNodeGraphVariable('tmpVel', nv, false)
        const nw = f._3dVectorAddition(
          boardSpin,
          f._3dVectorZoom(f.create3dVector(...tabSpinTable[7]), scaleF)
        )
        f.setNodeGraphVariable('tmpSpin', nw, false)
      },
      8: () => {
        const nv = f._3dVectorAddition(
          boardVel,
          f._3dVectorZoom(f.create3dVector(...tabVelTable[8]), scaleF)
        )
        f.setNodeGraphVariable('tmpVel', nv, false)
        const nw = f._3dVectorAddition(
          boardSpin,
          f._3dVectorZoom(f.create3dVector(...tabSpinTable[8]), scaleF)
        )
        f.setNodeGraphVariable('tmpSpin', nw, false)
      },
      default: () => {}
    })
    f.outflow('done', done, 0)
    return {}
  }
})

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
  // tab 输入（使用层首版内联）：9=复位 / 1-8=踢球（IDLE 全量设定 / 运动态冲量叠加）
  // ================================================================
  .on('whenTabIsSelected', (evt: any, f: any) => {
    const ball = f.getSelfEntity()
    const tabId = evt.tabId
    f.doubleBranch(
      f.equal(tabId, 9n),
      () => {
        const rf = f.callComposite(ballResetFlow, { e: ball })
        void rf
      },
      () => {
        // GOAL 态忽略施力（transition 守卫也会拦，前置判断省整条链执行）
        const state = f.getCustomVariable(ball, new str('state')).asType('int')
        f.doubleBranch(
          f.equal(state, new int(BALL_GOAL)),
          () => {},
          () => {
            const tk = f.callComposite(ballTabKick, { e: ball, tabId })
            const ap = f.callComposite(ballApplyImmediate, { e: ball, vel: f.getNodeGraphVariable('tmpVel').asType('vec3'), spin: f.getNodeGraphVariable('tmpSpin').asType('vec3') })
            f.connect(tk as never, 0, ap as never, 0)
          }
        )
      }
    )
  })
  // ================================================================
  // ball_kick 信号（高阶：设定式起脚）——IMMEDIATE 统一路径
  // ================================================================
  .onSignal(Signal.ball_kick, (evt: any, f: any) => {
    const ball = f.getSelfEntity()
    const state = f.getCustomVariable(ball, new str('state')).asType('int')
    f.doubleBranch(
      f.equal(state, new int(BALL_GOAL)),
      () => {},
      () => {
        f.callComposite(ballApplyImmediate, { e: ball, vel: evt.params.vel, spin: evt.params.spin })
      }
    )
  })
  // ================================================================
  // ball_impulse 信号（低阶核心）：
  //   有效模式 = IMMEDIATE 或 IDLE（IDLE 无 loop 消费队列，DEFERRED 自动升级 IMMEDIATE 唤醒）
  //   IMMEDIATE：读当前速度+Δ → 统一路径（当拍积分+当帧渲染）
  //   DEFERRED（运动态）：黑板队列 +=（多使用方累积语义；drain 读后清零）
  // ================================================================
  .onSignal(Signal.ball_impulse, (evt: any, f: any) => {
    const ball = f.getSelfEntity()
    const state = f.getCustomVariable(ball, new str('state')).asType('int')
    const isIdle = f.equal(state, new int(BALL_IDLE))
    const isGoal = f.equal(state, new int(BALL_GOAL))
    const modeImm = f.equal(evt.params.mode, 1n)
    const notGoal = f.logicalNotOperation(isGoal)
    // 有效 IMMEDIATE = (mode==1 ∨ IDLE) ∧ ¬GOAL
    const imm = f.logicalAndOperation(
      f.logicalOrOperation(modeImm, isIdle),
      notGoal
    )
    const active = f.logicalAndOperation(notGoal, f.logicalNotOperation(isGoal))
    const deferred = f.logicalAndOperation(active, f.logicalNotOperation(imm))
    f.doubleBranch(
      imm,
      () => {
        const boardVel = f.getCustomVariable(ball, new str('vel')).asType('vec3')
        const nv = f._3dVectorAddition(boardVel, evt.params.vel)
        const boardSpin = f.getCustomVariable(ball, new str('spin')).asType('vec3')
        const nw = f._3dVectorAddition(boardSpin, evt.params.spin)
        f.callComposite(ballApplyImmediate, { e: ball, vel: nv, spin: nw })
      },
      () => {
        f.doubleBranch(
          deferred,
          () => {
            const curIv = f.getCustomVariable(ball, new str('impVel')).asType('vec3')
            const nIv = f._3dVectorAddition(curIv, evt.params.vel)
            f.setCustomVariable(ball, 'impVel', nIv, false)
            const curIs = f.getCustomVariable(ball, new str('impSpin')).asType('vec3')
            const nIs = f._3dVectorAddition(curIs, evt.params.spin)
            f.setCustomVariable(ball, 'impSpin', nIs, false)
          },
          () => {}
        )
      }
    )
  })
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
