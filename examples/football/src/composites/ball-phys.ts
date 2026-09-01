// 足球 v5 三层架构 · 逻辑层物理复合（单一积分器族，黑板=球实体自定义变量）
// 命名前缀：ball_phys_*
//
// 职责（对齐 docs/architecture-v5.md）：
//   ballPhysTick      分发器：drain 冲量队列 → 按状态分发 → IDLE/GOAL 防御停转
//   ballPhysFlyTick   FLY 分支：三力积分 → 球门/墙/地面 → 落地分流判定
//   ballPhysRollTick  ROLL 分支：滚滑积分 → 球门/墙 → 停球判定
//   ballPhysSlideTick SLIDE 分支：滑动积分 → 球门/墙 → 停/转滚判定
//   ballPhysCarriedTick CARRIED 分支：位置欧拉积分 + 自旋收敛纯滚 + 脱手判定
//   ballWallCollideTmp 墙碰撞（图变量 tmpPos/tmpVel 版，v4 physWallCollide 黑板化）
//
// 与 v4 差异：
//   - 数据源：图变量 ballPos/ballVel/ballSpin → 球实体自定义变量 pos/vel/spin（跨图事实源）
//   - 每拍开头统一 drain 冲量队列（impVel/impSpin 读后清零，速度加法叠加 + clamp）
//   - 不挂任何运动设备（渲染层职责，v5 渲染图独立）
//   - 状态提交走 ballStateTransition（合法性终审 + 循环启停编排）
//   - DT 0.2→0.12（v4 5Hz 设备停止链 → v5 0.12s loop）；KW_DECAY 0.99→0.994
//     （exp(-0.05·0.12)，旋转衰减按秒量纲重标）
//   - 纯数据复合（physIntegrate/physGoalCollide/physGroundBounce/physStopCheck/
//     physRollIntegrate/physSlideIntegrate）直接复用 v4 physics.ts，不搬不改
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str, vec3 } from 'genshin-ts/runtime/value'
import {
  physIntegrate,
  physGoalCollide,
  physGroundBounce,
  physStopCheck,
  physRollIntegrate,
  physSlideIntegrate
} from './physics.js'
import {
  ballStateTransition,
  BALL_FLY,
  BALL_ROLL,
  BALL_SLIDE,
  BALL_CARRIED,
  BALL_GOAL,
  BALL_IDLE
} from './ball-state.js'
import { dribbleFieldGetRole, dribbleFieldCompute } from './dribble-field.js'
import { motionInstant } from './motion.js'
import { Signal } from '../resources/signals.js'

// —— 物理常量（秒量纲参数不变；拍距相关两处已换算 0.12s）——
const DT = 0.5 // 逻辑拍距（2026-08-31 降载 0.12->0.5，与 LOOP_TICK 联动）
const KW_DECAY = 0.9753 // exp(-0.05·0.5) 旋转衰减/拍（拍距联动换算）
const BALL_R = 0.25
const INV_BALL_R = 4 // 1/BALL_R（纯滚换算）
const MAX_SPEED = 24 // 冲量叠加速度上限（m/s）
const CARRY_SPIN_GAIN = 0.4 // CARRIED 自旋向纯滚收敛增益/拍（v4 K_F=0.35@0.12s 与 ROLL_SPIN_GAIN=0.5@0.2s 折中）
const LOST_TICKS_MAX = 3 // 脱手持续拍数（0.36s）
const DROP_DIST2 = 4.0 // 脱手距离²上沿（2.0m，与获得下沿构成滞回）
const PULL_FWD_MIN = -0.3 // 身后门（球在玩家身后 fwd≤此值计脱手）
const GOAL_RESET_S = 2 // 进球复位延时（s）
// —— 球门（世界坐标，|x| 对称；同 v4）——
const GOAL_X = 52.5
const POST_Z = 3.6
const POST_R = 0.06
const BAR_Y = 2.5
const HIT_R2 = 0.0961
const POST_E_REFLECT = -1.72 // -(1+0.72) 门柱/横梁反射系数
const NET_DAMP = 0.25
const GOAL_INNER_Z = 3.29
const GOAL_INNER_Y = 2.19
// —— 草地四面墙（同 v4）——
const WALL_X_MIN = -55
const WALL_X_MAX = 60
const WALL_Z_MIN = -55
const WALL_Z_MAX = 60
const WALL_E = 0.65
const WALL_E_NEG = -0.65

// max(a,b)=(a+b+|a−b|)/2（无节点依赖，v4 同款）
const maxF = (f: any, a: any, b: any) =>
  f.division(f.addition(f.addition(a, b), f.absoluteValueOperation(f.subtraction(a, b))), 2)

// ================================================================
// 墙碰撞（图变量 tmpPos/tmpVel 版）：检测 |x|/|z| 越界 → 位置钳制 + 速度分量反弹
// ================================================================
export const ballWallCollideTmp = g.defineComposite('ball_wall_collide_tmp', {
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_i, f) => {
    const pos = f.getNodeGraphVariable('tmpPos').asType('vec3')
    const vel = f.getNodeGraphVariable('tmpVel').asType('vec3')
    const p = f.split3dVector(pos)
    const v = f.split3dVector(vel)
    f.doubleBranch(f.lessThan(p.xComponent, WALL_X_MIN), () => {
      const np = f.registerExecNode('set_node_graph_variable', [new str('tmpPos'), f.create3dVector(WALL_X_MIN, p.yComponent, p.zComponent), new bool(false)])
      const nv = f.registerExecNode('set_node_graph_variable', [new str('tmpVel'), f.create3dVector( f.multiplication(f.absoluteValueOperation(v.xComponent), WALL_E), v.yComponent, v.zComponent ), new bool(false)])
      f.connect(np, 0, nv, 0)
    }, () => {})
    f.doubleBranch(f.greaterThan(p.xComponent, WALL_X_MAX), () => {
      const np = f.registerExecNode('set_node_graph_variable', [new str('tmpPos'), f.create3dVector(WALL_X_MAX, p.yComponent, p.zComponent), new bool(false)])
      const nv = f.registerExecNode('set_node_graph_variable', [new str('tmpVel'), f.create3dVector( f.multiplication(f.absoluteValueOperation(v.xComponent), WALL_E_NEG), v.yComponent, v.zComponent ), new bool(false)])
      f.connect(np, 0, nv, 0)
    }, () => {})
    f.doubleBranch(f.lessThan(p.zComponent, WALL_Z_MIN), () => {
      const np = f.registerExecNode('set_node_graph_variable', [new str('tmpPos'), f.create3dVector(p.xComponent, p.yComponent, WALL_Z_MIN), new bool(false)])
      const nv = f.registerExecNode('set_node_graph_variable', [new str('tmpVel'), f.create3dVector( v.xComponent, v.yComponent, f.multiplication(f.absoluteValueOperation(v.zComponent), WALL_E) ), new bool(false)])
      f.connect(np, 0, nv, 0)
    }, () => {})
    f.doubleBranch(f.greaterThan(p.zComponent, WALL_Z_MAX), () => {
      const np = f.registerExecNode('set_node_graph_variable', [new str('tmpPos'), f.create3dVector(p.xComponent, p.yComponent, WALL_Z_MAX), new bool(false)])
      const nv = f.registerExecNode('set_node_graph_variable', [new str('tmpVel'), f.create3dVector( v.xComponent, v.yComponent, f.multiplication(f.absoluteValueOperation(v.zComponent), WALL_E_NEG) ), new bool(false)])
      f.connect(np, 0, nv, 0)
    }, () => {})
    const tail = f.registerExecNode('set_node_graph_variable', [new str('tmpSpin'), f._3dVectorZoom(f.getNodeGraphVariable('tmpSpin').asType('vec3'), 1), new bool(false)])
    f.outflow('done', tail, 0)
    return {}
  }
})

// ================================================================
// 球门碰撞（纯数据复用 v4 physGoalCollide 的输出选择）：hitPost1/2、hitBar、netHit、
// isGoal + 反射速度。此包装层只为复用常量命名——实际直接调用 physGoalCollide。
// ================================================================

// ================================================================
// 发布黑板（exec）：图变量 tmpPos/tmpVel/tmpSpin → 球实体自定义变量 pos/vel/spin
// （发布组仅逻辑层写；渲染层/使用层只读）
// ================================================================
export const ballPhysPublish = g.defineComposite('ball_phys_publish', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    const sPos = f.registerExecNode('set_custom_variable', [e, new str('pos'), f.getNodeGraphVariable('tmpPos').asType('vec3'), new bool(false)])
    const sVel = f.registerExecNode('set_custom_variable', [e, new str('vel'), f.getNodeGraphVariable('tmpVel').asType('vec3'), new bool(false)])
    f.connect(sPos, 0, sVel, 0)
    const sSpin = f.registerExecNode('set_custom_variable', [e, new str('spin'), f.getNodeGraphVariable('tmpSpin').asType('vec3'), new bool(false)])
    f.connect(sVel, 0, sSpin, 0)
    f.outflow('done', sSpin, 0)
    return {}
  }
})

// ================================================================
// 进球计分（exec，三分支共用逻辑内联）：isGoal → goalNew（scored 去重 + tmpGoal 物化）
// → goalCount 自增（图变量）+ 黑板发布 → goal_reset 定时器
// 输入：goalC = physGoalCollide 调用结果（数据），pos/vel 快照来自图变量 tmp*
// ================================================================
const goalScoreBlock = (f: any, e: any, goalC: any) => {
  const scoredOld = f.getNodeGraphVariable('scored').asType('bool')
  const goalNew = f.logicalAndOperation(goalC.isGoal, f.logicalNotOperation(scoredOld))
  const sGoalTmp = f.registerExecNode('set_node_graph_variable', [new str('tmpGoal'), goalNew, new bool(false)])
  const gc = f.registerExecNode('set_node_graph_variable', [new str('goalCount'), f.addition( f.getNodeGraphVariable('goalCount').asType('int'), f.dataTypeConversion(f.getNodeGraphVariable('tmpGoal').asType('bool'), 'int') ), new bool(false)])
  f.connect(sGoalTmp, 0, gc, 0)
  const sc = f.registerExecNode('set_node_graph_variable', [new str('scored'), f.logicalOrOperation(scoredOld, f.getNodeGraphVariable('tmpGoal').asType('bool')), new bool(false)])
  f.connect(gc, 0, sc, 0)
  const gcPub = f.registerExecNode('set_custom_variable', [e, new str('goalCount'), f.getNodeGraphVariable('goalCount').asType('int'), new bool(false)])
  f.connect(sc, 0, gcPub, 0)
  f.doubleBranch(f.getNodeGraphVariable('tmpGoal').asType('bool'), () => {
    f.registerExecNode('start_timer', [e, new str('goal_reset'), new bool(false), f.assemblyList([GOAL_RESET_S], 'float')])
  }, () => {})
  return gcPub
}

// ================================================================
// 分发器（exec）：drain 冲量 → 状态分发 → IDLE/GOAL 防御
// 由 logic.ts 的 phys_loop 定时器（0.12s）与 IMMEDIATE 唤醒路径共同调用——
// 单一积分器不变量：所有路径走本复合，首拍与常拍完全同构（根除 kickLaunch 首段偏差家族）
// ================================================================
export const ballPhysTick = g.defineComposite('ball_phys_tick', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  build: ({ e }, f) => {
    // —— drain 冲量队列（读后清零；nv 在 set tmpVel 求值时已算好，清零不影响）——
    const boardVel = f.getCustomVariable(e, new str('vel')).asType('vec3')
    const impVel = f.getCustomVariable(e, new str('impVel')).asType('vec3')
    const velSum = f._3dVectorAddition(boardVel, impVel)
    const mag = f._3dVectorModuloOperation(velSum)
    const magClamped = maxF(f, mag, f.multiplication(MAX_SPEED, -1))
    const magFinal = f.division(
      f.addition(f.addition(magClamped, MAX_SPEED), f.absoluteValueOperation(f.subtraction(magClamped, MAX_SPEED))),
      2
    )
    const velDrained = f._3dVectorZoom(velSum, f.division(magFinal, f.addition(mag, 0.0001)))
    const sTmpVel = f.registerExecNode('set_node_graph_variable', [new str('tmpVel'), velDrained, new bool(false)])
    const boardSpin = f.getCustomVariable(e, new str('spin')).asType('vec3')
    const impSpin = f.getCustomVariable(e, new str('impSpin')).asType('vec3')
    const spinDrained = f._3dVectorAddition(boardSpin, impSpin)
    const sTmpSpin = f.registerExecNode('set_node_graph_variable', [new str('tmpSpin'), spinDrained, new bool(false)])
    f.connect(sTmpVel, 0, sTmpSpin, 0)
    const c1 = f.registerExecNode('set_custom_variable', [e, new str('impVel'), f.create3dVector(0, 0, 0), new bool(false)])
    f.connect(sTmpSpin, 0, c1, 0)
    const c2 = f.registerExecNode('set_custom_variable', [e, new str('impSpin'), f.create3dVector(0, 0, 0), new bool(false)])
    f.connect(c1, 0, c2, 0)

    // —— 状态分发（multipleBranches：FLY/ROLL/SLIDE/CARRIED；default=IDLE/GOAL 防御停转）——
    // 分支内复合调用由 MB 分支出口驱动（语句序 auto-chain），不做手动 connect——
    // 2026-08-31 实证：手动 connect(分支复合, done, c2) 与 auto-chain 的 c2→MB 相连
    // 构成执行流环（c2→MB→分支复合→c2，引擎报"ball_phys_tick 有执行流循环"）。
    const state = f.getNodeGraphVariable('state').asType('int')
    f.multipleBranches(state, {
      [BALL_FLY]: () => {
        f.callComposite(ballPhysFlyTick, { e })
      },
      [BALL_ROLL]: () => {
        f.callComposite(ballPhysRollTick, { e })
      },
      [BALL_SLIDE]: () => {
        f.callComposite(ballPhysSlideTick, { e })
      },
      [BALL_CARRIED]: () => {
        f.callComposite(ballPhysCarriedTick, { e })
      },
      default: () => {
        // IDLE/GOAL：loop 不应运行（transition 已停转）——防御性停转自愈
        f.registerExecNode('stop_timer', [e, new str('phys_loop')])
      }
    })
    return {}
  }
})

// ================================================================
// FLY 分支：三力积分 → 球门碰撞/计分 → 墙 → 地面反弹 → 落地分流 → 发布 + 转移
// ================================================================
export const ballPhysFlyTick = g.defineComposite('ball_phys_fly_tick', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    // 黑板读 + 物化（pos 来自黑板；vel/spin 来自 drain 后的图变量 tmp*）
    const pos0 = f.getCustomVariable(e, new str('pos')).asType('vec3')
    const integ = f.callComposite(physIntegrate, { pos: pos0, vel: f.getNodeGraphVariable('tmpVel').asType('vec3'), spin: f.getNodeGraphVariable('tmpSpin').asType('vec3') })
    const sPos = f.registerExecNode('set_node_graph_variable', [new str('tmpPos'), integ.npos, new bool(false)])
    const sVel = f.registerExecNode('set_node_graph_variable', [new str('tmpVel'), integ.nvel, new bool(false)])
    f.connect(sPos, 0, sVel, 0)
    const sSpin = f.registerExecNode('set_node_graph_variable', [new str('tmpSpin'), integ.nspin, new bool(false)])
    f.connect(sVel, 0, sSpin, 0)

    // 球门碰撞 + 计分 + GOAL 定时器
    const goal = f.callComposite(physGoalCollide, { pos: f.getNodeGraphVariable('tmpPos').asType('vec3'), vel: f.getNodeGraphVariable('tmpVel').asType('vec3') })
    const scoreTail = goalScoreBlock(f, e, goal)

    // 门柱/横梁/网反射（写 tmpVel）
    const applyRefl = (hit: any, nvel: any, tail: any) => {
      f.doubleBranch(hit, () => {
        const gv = f.registerExecNode('set_node_graph_variable', [new str('tmpVel'), nvel, new bool(false)])
        f.connect(tail as never, 0, gv as never, 0)
      }, () => {})
    }
    applyRefl(goal.hitPost1, goal.nvelPost1, scoreTail)
    applyRefl(goal.hitPost2, goal.nvelPost2, scoreTail)
    applyRefl(goal.hitBar, goal.nvelBar, scoreTail)
    const velAfterFrame = f.getNodeGraphVariable('tmpVel').asType('vec3')
    applyRefl(goal.netHit, f._3dVectorZoom(velAfterFrame, NET_DAMP), scoreTail)

    // 墙碰撞
    const wall = f.callComposite(ballWallCollideTmp, {  })

    // 地面反弹
    const velAfterWall = f.getNodeGraphVariable('tmpVel').asType('vec3')
    const ground = f.callComposite(physGroundBounce, { pos: f.getNodeGraphVariable('tmpPos').asType('vec3'), vel: velAfterWall })
    f.doubleBranch(ground.hit, () => {
      const gp = f.registerExecNode('set_node_graph_variable', [new str('tmpPos'), ground.npos, new bool(false)])
      const gv = f.registerExecNode('set_node_graph_variable', [new str('tmpVel'), ground.nvel, new bool(false)])
      f.connect(gp, 0, gv, 0)
    }, () => {})

    // 落地分流判定（v4 同构）：GOAL > 停 > 贴地打滑(3) > 贴地弹跳死(2) > 空中(1)
    const posFinal = f.getNodeGraphVariable('tmpPos').asType('vec3')
    const velFinal = f.getNodeGraphVariable('tmpVel').asType('vec3')
    const stop = f.callComposite(physStopCheck, { pos: posFinal, vel: velFinal })
    const pp = f.split3dVector(posFinal)
    const vv = f.split3dVector(velFinal)
    const grounded = f.lessThan(pp.yComponent, f.addition(BALL_R, 0.05))
    const bounceDead = f.lessThan(f.absoluteValueOperation(vv.yComponent), 1.0)
    const hSpd = f._3dVectorModuloOperation(f.create3dVector(vv.xComponent, 0, vv.zComponent))
    const slideEntry = f.logicalAndOperation(
      f.logicalAndOperation(grounded, bounceDead),
      f.greaterThan(hSpd, 4.5)
    )
    const b2f = (b: any) => f.dataTypeConversion(f.dataTypeConversion(b, 'int'), 'float')
    const bGoal = b2f(f.getNodeGraphVariable('tmpGoal').asType('bool'))
    const bStop = b2f(stop.isStop)
    const bGround = b2f(grounded)
    const bSlide = b2f(slideEntry)
    const bDead = b2f(bounceDead)
    const notStop = f.subtraction(1, bStop)
    const notSlide = f.subtraction(1, bSlide)
    const notDead = f.subtraction(1, bDead)
    const notGround = f.subtraction(1, bGround)
    const groundedPart = f.addition(
      f.multiplication(bSlide, 3),
      f.multiplication(notSlide, f.addition(f.multiplication(bDead, 2), f.multiplication(notDead, 1)))
    )
    const normal = f.multiplication(
      notStop,
      f.addition(f.multiplication(bGround, groundedPart), f.multiplication(notGround, 1))
    )
    const nextF = f.addition(f.multiplication(bGoal, 5), f.multiplication(f.subtraction(1, bGoal), normal))
    const nextState = f.dataTypeConversion(nextF, 'int')

    // 发布黑板 + 状态转移
    const pub = f.callComposite(ballPhysPublish, { e })
    const tr = f.callComposite(ballStateTransition, { e, next: nextState, vel: velFinal })
    f.connect(pub as never, 0, tr as never, 0)
    f.outflow('done', tr as never, 0)
    return {}
  }
})

// ================================================================
// ROLL 分支：滚滑积分 → 球门/墙 → 停判定 → 发布 + 转移
// ================================================================
export const ballPhysRollTick = g.defineComposite('ball_phys_roll_tick', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    const pos0 = f.getCustomVariable(e, new str('pos')).asType('vec3')
    const integ = f.callComposite(physRollIntegrate, { pos: pos0, vel: f.getNodeGraphVariable('tmpVel').asType('vec3'), spin: f.getNodeGraphVariable('tmpSpin').asType('vec3') })
    const sPos = f.registerExecNode('set_node_graph_variable', [new str('tmpPos'), integ.npos, new bool(false)])
    const sVel = f.registerExecNode('set_node_graph_variable', [new str('tmpVel'), integ.nvel, new bool(false)])
    f.connect(sPos, 0, sVel, 0)
    const sSpin = f.registerExecNode('set_node_graph_variable', [new str('tmpSpin'), integ.nspin, new bool(false)])
    f.connect(sVel, 0, sSpin, 0)

    const goal = f.callComposite(physGoalCollide, { pos: f.getNodeGraphVariable('tmpPos').asType('vec3'), vel: f.getNodeGraphVariable('tmpVel').asType('vec3') })
    const scoreTail = goalScoreBlock(f, e, goal)
    const applyRefl = (hit: any, nvel: any, tail: any) => {
      f.doubleBranch(hit, () => {
        const gv = f.registerExecNode('set_node_graph_variable', [new str('tmpVel'), nvel, new bool(false)])
        f.connect(tail as never, 0, gv as never, 0)
      }, () => {})
    }
    applyRefl(goal.hitPost1, goal.nvelPost1, scoreTail)
    applyRefl(goal.hitPost2, goal.nvelPost2, scoreTail)
    applyRefl(goal.hitBar, goal.nvelBar, scoreTail)
    const velAfterFrame = f.getNodeGraphVariable('tmpVel').asType('vec3')
    applyRefl(goal.netHit, f._3dVectorZoom(velAfterFrame, NET_DAMP), scoreTail)

    const wall = f.callComposite(ballWallCollideTmp, {  })

    // 停判定：nextState = GOAL(5) > 停(0) > 滚动(2)
    const posFinal = f.getNodeGraphVariable('tmpPos').asType('vec3')
    const velFinal = f.getNodeGraphVariable('tmpVel').asType('vec3')
    const stop = f.callComposite(physStopCheck, { pos: posFinal, vel: velFinal })
    const b2f = (b: any) => f.dataTypeConversion(f.dataTypeConversion(b, 'int'), 'float')
    const bGoal = b2f(f.getNodeGraphVariable('tmpGoal').asType('bool'))
    const bStop = b2f(stop.isStop)
    const nextF = f.addition(
      f.multiplication(bGoal, 5),
      f.multiplication(f.subtraction(1, bGoal), f.multiplication(f.subtraction(1, bStop), 2))
    )
    const nextState = f.dataTypeConversion(nextF, 'int')

    const pub = f.callComposite(ballPhysPublish, { e })
    const tr = f.callComposite(ballStateTransition, { e, next: nextState, vel: velFinal })
    f.connect(pub as never, 0, tr as never, 0)
    f.outflow('done', tr as never, 0)
    return {}
  }
})

// ================================================================
// SLIDE 分支：滑动积分 → 球门/墙 → 停/转滚判定 → 发布 + 转移
// ================================================================
export const ballPhysSlideTick = g.defineComposite('ball_phys_slide_tick', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    const pos0 = f.getCustomVariable(e, new str('pos')).asType('vec3')
    const integ = f.callComposite(physSlideIntegrate, { pos: pos0, vel: f.getNodeGraphVariable('tmpVel').asType('vec3'), spin: f.getNodeGraphVariable('tmpSpin').asType('vec3') })
    const sPos = f.registerExecNode('set_node_graph_variable', [new str('tmpPos'), integ.npos, new bool(false)])
    const sVel = f.registerExecNode('set_node_graph_variable', [new str('tmpVel'), integ.nvel, new bool(false)])
    f.connect(sPos, 0, sVel, 0)
    const sSpin = f.registerExecNode('set_node_graph_variable', [new str('tmpSpin'), integ.nspin, new bool(false)])
    f.connect(sVel, 0, sSpin, 0)

    const goal = f.callComposite(physGoalCollide, { pos: f.getNodeGraphVariable('tmpPos').asType('vec3'), vel: f.getNodeGraphVariable('tmpVel').asType('vec3') })
    const scoreTail = goalScoreBlock(f, e, goal)
    const applyRefl = (hit: any, nvel: any, tail: any) => {
      f.doubleBranch(hit, () => {
        const gv = f.registerExecNode('set_node_graph_variable', [new str('tmpVel'), nvel, new bool(false)])
        f.connect(tail as never, 0, gv as never, 0)
      }, () => {})
    }
    applyRefl(goal.hitPost1, goal.nvelPost1, scoreTail)
    applyRefl(goal.hitPost2, goal.nvelPost2, scoreTail)
    applyRefl(goal.hitBar, goal.nvelBar, scoreTail)
    const velAfterFrame = f.getNodeGraphVariable('tmpVel').asType('vec3')
    applyRefl(goal.netHit, f._3dVectorZoom(velAfterFrame, NET_DAMP), scoreTail)

    const wall = f.callComposite(ballWallCollideTmp, {  })

    // 停/转滚判定：nextState = GOAL(5) > 停(0) > 转滚(2) > 继续滑(3)
    const posFinal = f.getNodeGraphVariable('tmpPos').asType('vec3')
    const velFinal = f.getNodeGraphVariable('tmpVel').asType('vec3')
    const stop = f.callComposite(physStopCheck, { pos: posFinal, vel: velFinal })
    const vv = f.split3dVector(velFinal)
    const spd = f._3dVectorModuloOperation(f.create3dVector(vv.xComponent, 0, vv.zComponent))
    const toRoll = f.lessThan(spd, 2.5)
    const b2f = (b: any) => f.dataTypeConversion(f.dataTypeConversion(b, 'int'), 'float')
    const bGoal = b2f(f.getNodeGraphVariable('tmpGoal').asType('bool'))
    const bStop = b2f(stop.isStop)
    const bRoll = b2f(toRoll)
    const nextF = f.addition(
      f.multiplication(bGoal, 5),
      f.multiplication(
        f.subtraction(1, bGoal),
        f.multiplication(
          f.subtraction(1, bStop),
          f.addition(f.multiplication(bRoll, 2), f.multiplication(f.subtraction(1, bRoll), 3))
        )
      )
    )
    const nextState = f.dataTypeConversion(nextF, 'int')

    const pub = f.callComposite(ballPhysPublish, { e })
    const tr = f.callComposite(ballStateTransition, { e, next: nextState, vel: velFinal })
    f.connect(pub as never, 0, tr as never, 0)
    f.outflow('done', tr as never, 0)
    return {}
  }
})

// ================================================================
// CARRIED 分支（v4 由带球图驱动，v5 收归逻辑层）：
//   位置欧拉积分（水平 + 贴地）→ 自旋向纯滚收敛 → 发布 → 脱手判定（持续 3 拍 → ROLL）
//   速度本身由带球决策图每拍写 impVel（黑板队列）→ 本分支 drain 后已含在 tmpVel
// ================================================================
export const ballPhysCarriedTick = g.defineComposite('ball_phys_carried_tick', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    const pos0 = f.getCustomVariable(e, new str('pos')).asType('vec3')
    const vel0 = f.getNodeGraphVariable('tmpVel').asType('vec3')
    const spin = f.getNodeGraphVariable('tmpSpin').asType('vec3')
    const p0 = f.split3dVector(pos0)
    // 同拍原子决策（2026-08-31 架构修正）：感知→G律→newVel 在本拍内完成，
    // 杜绝双 loop 黑板竞态（四轮补丁失败的终解）
    const dec = f.callComposite(ballDribbleDecideAtomic, { e, vel: vel0 })
    const sVel = f.registerExecNode('set_node_graph_variable', [new str('tmpVel'), dec.newVel, new bool(false)])
    const vel = f.getNodeGraphVariable('tmpVel').asType('vec3')
    const v = f.split3dVector(vel)

    // 位置欧拉积分：贴地带球（y 固定 BALL_R；速度水平分量驱动）
    const npos = f.create3dVector(
      f.addition(p0.xComponent, f.multiplication(v.xComponent, DT)),
      BALL_R,
      f.addition(p0.zComponent, f.multiplication(v.zComponent, DT))
    )
    const sPos = f.registerExecNode('set_node_graph_variable', [new str('tmpPos'), npos, new bool(false)])
    // 自旋向纯滚收敛（凸组合不超调；目标 targetSpin=(vz/R, 0, −vx/R)，v4 同式）
    const s = f.split3dVector(spin)
    const tsx = f.multiplication(v.zComponent, INV_BALL_R)
    const tsz = f.multiplication(v.xComponent, -INV_BALL_R)
    const nsx = f.addition(s.xComponent, f.multiplication(f.subtraction(tsx, s.xComponent), CARRY_SPIN_GAIN))
    const nsy = f.multiplication(s.yComponent, KW_DECAY)
    const nsz = f.addition(s.zComponent, f.multiplication(f.subtraction(tsz, s.zComponent), CARRY_SPIN_GAIN))
    const sSpin = f.registerExecNode('set_node_graph_variable', [new str('tmpSpin'), f.create3dVector(nsx, nsy, nsz), new bool(false)])
    f.connect(sPos, 0, sSpin, 0)

    // 脱手几何判定（v4 dribbleFieldTick 移植；lostTicks 图变量计数）
    const roleC = f.callComposite(dribbleFieldGetRole, {  })
    const roleLoc = f.getEntityLocationAndRotation(roleC.role)
    const D = f._3dVectorSubtraction(npos, roleLoc.location)
    const Dn = f._3dVectorNormalization(D)
    const fwd = f._3dVectorDotProduct(f.getEntityForwardVector(roleC.role), Dn)
    const dist2 = f._3dVectorDotProduct(D, D)
    const carriedFar = f.greaterThan(dist2, DROP_DIST2)
    const notFwdOk = f.logicalNotOperation(f.greaterThan(fwd, PULL_FWD_MIN))
    const lostCause = f.logicalOrOperation(carriedFar, notFwdOk)
    const lostTicks = f.getNodeGraphVariable('lostTicks').asType('float')
    const clF = f.dataTypeConversion(f.dataTypeConversion(lostCause, 'int'), 'float')
    const lostNew = f.multiplication(f.addition(lostTicks, 1), clF)
    const dropped = f.logicalAndOperation(
      lostCause,
      f.greaterThanOrEqualTo(lostNew, LOST_TICKS_MAX)
    )

    // 发布黑板 + 脱手判定（数据选择 next，单 outflow——双分支双 done 是断链陷阱，
    // 2026-08-27 铁证：调用方只连 done[0]；同态守卫天然吸收"未脱手=CARRIED→CARRIED 零副作用"）
    const pub = f.callComposite(ballPhysPublish, { e })
    const sLost = f.registerExecNode('set_node_graph_variable', [new str('lostTicks'), lostNew, new bool(false)])
    f.connect(pub as never, 0, sLost as never, 0)
    const dropF = f.dataTypeConversion(f.dataTypeConversion(dropped, 'int'), 'float')
    const nextF = f.addition(
      f.multiplication(dropF, BALL_ROLL),
      f.multiplication(f.subtraction(1, dropF), BALL_CARRIED)
    )
    const nextState = f.dataTypeConversion(nextF, 'int')
    const velFinal = f.getNodeGraphVariable('tmpVel').asType('vec3')
    const tr = f.callComposite(ballStateTransition, { e, next: nextState, vel: velFinal })
    f.connect(sLost as never, 0, tr as never, 0)
    f.outflow('done', tr as never, 0)
    return {}
  }
})

// 场地中心（复位点）
const CENTER_X = 0
const CENTER_Y = 0.25 // = BALL_R
const CENTER_Z = 0

// ================================================================
// IMMEDIATE 统一路径（exec）：期望新速度/自旋 → clamp → 状态分流 → transition（vel 交接）
// → 当拍物理积分 → 通知渲染层当帧。
// 供 ball_kick 信号、ball_impulse(mode=1)、tab 踢球三路共用——所有"立即反馈"同构，
// 且当拍积分走 ballPhysTick（单一积分器不变量：首拍与常拍零偏差）。
// 分流规则：|vy|>1 → FLY；贴地水平 hSpd>4.5 → SLIDE；否则 ROLL（transition 守卫终审）。
// ================================================================
export const ballApplyImmediate = g.defineComposite('ball_apply_immediate', {
  inputs: { e: { type: 'entity' }, vel: { type: 'vec3' }, spin: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, vel, spin }, f) => {
    // clamp 速度上限 24 m/s（v4 clampSpeed 同式：min(|v|,24)/|v| 缩放）
    const mag = f._3dVectorModuloOperation(vel)
    const magFinal = f.division(
      f.addition(f.addition(mag, MAX_SPEED), f.absoluteValueOperation(f.subtraction(mag, MAX_SPEED))),
      2
    )
    const velC = f._3dVectorZoom(vel, f.division(magFinal, f.addition(mag, 0.0001)))
    // 写黑板 spin（transition 只交接 vel；spin 在此发布）
    const sSpin = f.registerExecNode('set_custom_variable', [e, new str('spin'), spin, new bool(false)])
    // 状态分流（数据选择）：flyF?1 : slideF?3 : 2
    const vyAbs = f.absoluteValueOperation(f.split3dVector(velC).yComponent)
    const vh = f.split3dVector(velC)
    const hSpd = f._3dVectorModuloOperation(f.create3dVector(vh.xComponent, 0, vh.zComponent))
    const flyF = f.dataTypeConversion(
      f.dataTypeConversion(f.greaterThan(vyAbs, 1.0), 'int'),
      'float'
    )
    const slideF = f.dataTypeConversion(
      f.dataTypeConversion(f.greaterThan(hSpd, 4.5), 'int'),
      'float'
    )
    const nextF = f.addition(
      f.multiplication(flyF, BALL_FLY),
      f.multiplication(
        f.subtraction(1, flyF),
        f.addition(f.multiplication(slideF, BALL_SLIDE), f.multiplication(f.subtraction(1, slideF), BALL_ROLL))
      )
    )
    const nextState = f.dataTypeConversion(nextF, 'int')
    const tr = f.callComposite(ballStateTransition, { e, next: nextState, vel: velC })
    f.connect(sSpin, 0, tr as never, 0)
    // 渲染插队帧（语句式 sendSignal，直线代码按注册序串行，stateCommit 同款模式；
    // 渲染层 onSignal(render_now) 当拍读黑板挂设备。2026-08-31 修正：原序
    // tick→signal 依赖 ballPhysTick 调用点的 exec 出边，但该 def 未声明 outflows，
    // 注入器按接口裁边后 signal 节点成孤儿（日志 3069 + .gil 回读实证）——改挂
    // transition.done 之后（其 def 有 done 出口，边可存活）；此时 vel 交接已上
    // 黑板，渲染当拍即读到新速度）
    f.sendSignal(Signal.render_now)
    // （2026-08-31 第五轮拒载修正）移除当拍 ballPhysTick 调用：其展开子树（936 节点）
    // 经本复合在 826（input 图）双实例化，把 826「可达 impl 展开之和」顶过 3000 拒载线
    // （2696→3265；对照备份 1788181022874——r4 地图缺 goalCollide 调用的残缺构建才
    // 侥幸在 2696）。首拍积分由 transition 启动的 phys_loop 首次触发承担（欧拉闭式
    // pos0+v·dt，墙钟对齐反而优于旧「当拍积分+0.5s 首火」的提前半拍结构）；
    // 当帧视觉由上方 render_now 挂设备覆盖。done 锚点改挂 transition（carried_tick
    // 同款收尾；done 现无调用方消费，语义 = transition 完成，signal 随后同拍发出）。
    f.outflow('done', tr as never, 0)
    return {}
  }
})

// ================================================================
// 复位流程（exec）：瞬移场地中心 → 清黑板物理量（pos/vel/spin/impVel/impSpin）
// → 清图变量（scored/lostTicks）→ transition(IDLE)（停 loop + 渲染层 state_changed 自停）。
// 供 ball_reset 信号、tab9、goal_reset 定时器三路共用（幂等）。
// ================================================================
export const ballResetFlow = g.defineComposite('ball_reset_flow', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    const spawn = f.create3dVector(CENTER_X, CENTER_Y, CENTER_Z)
    // 瞬移（lockRotation=false 重置朝向——v4 2832 铁证：防复位后局部轴错位）
    const move = f.callComposite(motionInstant, { e, location: spawn })
    // 清黑板（pos 指到中心、速度/自旋/冲量队列归零）
    const sPos = f.registerExecNode('set_custom_variable', [e, new str('pos'), spawn, new bool(false)])
    f.connect(move as never, 0, sPos as never, 0)
    const zero = f.create3dVector(0, 0, 0)
    const sVel = f.registerExecNode('set_custom_variable', [e, new str('vel'), zero, new bool(false)])
    f.connect(sPos, 0, sVel, 0)
    const sSpin = f.registerExecNode('set_custom_variable', [e, new str('spin'), zero, new bool(false)])
    f.connect(sVel, 0, sSpin, 0)
    const sIv = f.registerExecNode('set_custom_variable', [e, new str('impVel'), zero, new bool(false)])
    f.connect(sSpin, 0, sIv, 0)
    const sIs = f.registerExecNode('set_custom_variable', [e, new str('impSpin'), zero, new bool(false)])
    f.connect(sIv, 0, sIs, 0)
    // 清图变量
    const sScored = f.registerExecNode('set_node_graph_variable', [new str('scored'), new bool(false), new bool(false)])
    f.connect(sIs, 0, sScored, 0)
    const sLost = f.registerExecNode('set_node_graph_variable', [new str('lostTicks'), new float(0), new bool(false)])
    f.connect(sScored, 0, sLost, 0)
    // 状态转移（IDLE：停 loop；渲染层收 state_changed 停 loop + 终位）
    const tr = f.callComposite(ballStateTransition, { e, next: new int(BALL_IDLE), vel: zero })
    f.connect(sLost, 0, tr as never, 0)
    f.outflow('done', tr as never, 0)
    return {}
  }
})

// ================================================================
// 带球决策（原子版，2026-08-31 双 loop 竞态架构修正）：
// v5 初版把决策放 828 独立 loop 写 impVel 队列——四轮日志实证任何补丁（覆盖式/
// vel 物化/pos 物化）都堵不住双 loop 相位竞态（快照本身横跨 drain 拿未来值，
// impVel 恒 ±20、vel 模 24 震荡）。修正 = 感知-决策-积分收回同一拍原子执行
// （v4 语义）：本复合由 CARRIED 分支同拍调用，vel 参数传入、newVel 返回，
// 不经黑板队列。上升沿记忆 drivePrev 用宿主图（825）图变量。
// G 律/触球参数与 v4 dribbleFieldCompute 完全一致（R4 手感保真）。
// ================================================================
export const ballDribbleDecideAtomic = g.defineComposite('ball_dribble_decide_atomic', {
  inputs: { e: { type: 'entity' }, vel: { type: 'vec3' } },
  outputs: { newVel: { type: 'vec3' } },
  // outflows 必须声明（2026-08-31 第四轮日志 3069 修正）：本复合内含 exec 节点
  // （drivePrev 写回）却未声明 outflows 时，注入器按 def 接口裁掉调用点的 exec
  // 出边——ballPhysCarriedTick 在本复合之后的链（写 tmpVel/积分/发布/transition）
  // 全部成孤儿节点，球完全不动（.gia 有边、注入后 .gil 丢边）。
  outflows: ['done'],
  build: ({ e, vel }, f) => {
    const roleC = f.callComposite(dribbleFieldGetRole, {})
    const role = roleC.role
    const roleLoc = f.getEntityLocationAndRotation(role)
    const playerFwd = f.getEntityForwardVector(role)
    const playerSpd = f.queryCharacterSCurrentMovementSpd(role).currentSpeed
    const boardPos = f.getCustomVariable(e, new str('pos')).asType('vec3')
    const comp = f.callComposite(dribbleFieldCompute, {
      playerPos: roleLoc.location, playerFwd, playerSpd, ballPos: boardPos
    })
    const distOk = f.lessThan(comp.dist2, 2.25)
    const fwdOk = f.greaterThan(comp.fwd, -0.3)
    const drive = f.logicalAndOperation(distOk, fwdOk)
    const drivePrev = f.getNodeGraphVariable('drivePrev').asType('bool')
    const edge = f.logicalAndOperation(drive, f.logicalNotOperation(drivePrev))
    const b2f = (b: any) => f.dataTypeConversion(f.dataTypeConversion(b, 'int'), 'float')
    const driveF = b2f(drive)
    // G 律（R4 原式）：target = drive ? vFinal : 0；conv = vel + (target−vel)·G
    const targetX = f.multiplication(comp.newVelX, driveF)
    const targetZ = f.multiplication(comp.newVelZ, driveF)
    const bv = f.split3dVector(vel)
    const diffX = f.subtraction(targetX, bv.xComponent)
    const diffZ = f.subtraction(targetZ, bv.zComponent)
    const distDiff = f._3dVectorModuloOperation(f.create3dVector(diffX, 0, diffZ))
    const cEff = f.addition(f.multiplication(2.0, driveF), f.multiplication(4.0, f.subtraction(1, driveF)))
    const gNl = f.division(distDiff, f.addition(distDiff, cEff))
    const convX = f.addition(bv.xComponent, f.multiplication(diffX, gNl))
    const convZ = f.addition(bv.zComponent, f.multiplication(diffZ, gNl))
    const eF = b2f(edge)
    const keepF = f.subtraction(1, eF)
    const nvx = f.addition(f.multiplication(convX, keepF), f.multiplication(comp.touchX, eF))
    const nvz = f.addition(f.multiplication(convZ, keepF), f.multiplication(comp.touchZ, eF))
    // drivePrev 写回挂链尾并锚定 done 出口（同上：调用方 auto-chain 的下一条边
    // 依赖本 def 的 OutFlow 引脚存活；锚在链尾 exec 节点上语义 = 决策+记忆写完才继续）
    const sPrev = f.registerExecNode('set_node_graph_variable', [new str('drivePrev'), drive, new bool(false)])
    f.outflow('done', sPrev, 0)
    return { newVel: f.create3dVector(nvx, 0, nvz) }
  }
})
