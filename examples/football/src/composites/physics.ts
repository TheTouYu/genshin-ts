// 足球物理复合（纯数据 + exec）：状态机驱动的完整物理
// 命名前缀：phys_*
// 状态机：0=静止 FREE / 1=空中 FLYING / 2=滚滑 ROLLING
// 球门几何（世界坐标，两个门对称于 x=0，用 |x| 统一处理）：
//   门线 |x|=52.5，门柱中心 z=±3.6（半径 0.06），横梁中心 y=2.5，球网深 1.8m
import { g } from 'genshin-ts/runtime/core'
import { bool, int, str } from 'genshin-ts/runtime/value'
import { motionInstant, motionLinear, motionSpin } from './motion.js'

// —— 物理常量（编译期预计算为字面量）——
const DT = 0.2 // 5Hz tick
const G_ACC = -9.8 // 重力
const KD = 0.02 // 空气阻力系数
const KM = 0.01 // 马格努斯系数
const KW_DECAY = 0.99 // exp(-0.05*0.2)，旋转衰减
const BALL_R = 0.25 // 球半径
const GROUND_E = 0.65 // 地面反弹法向恢复
const GROUND_FX = 0.85 // 地面反弹水平摩擦
const ROLL_FRICTION = 0.985 // 滚动摩擦（贴地每 tick 减速）
const STOP_SPEED = 0.3 // 停球速度阈值
// —— 球门（世界坐标，|x| 对称）——
const GOAL_X = 52.5 // 门线 |x|
const POST_Z = 3.6 // 门柱中心 z 偏移
const POST_R = 0.06 // 门柱/横梁半径
const BAR_Y = 2.5 // 横梁中心高度
const HIT_R2 = 0.0961 // (BALL_R+POST_R)^2 = 0.31^2
const POST_E = 0.7 // 门柱/横梁恢复系数
const NET_DAMP = 0.25 // 球网速度衰减（穿网后保留 25%）
const GOAL_INNER_Z = 3.29 // POST_Z - POST_R - BALL_R（门柱内边减球半径）
const GOAL_INNER_Y = 2.19 // BAR_Y - POST_R - BALL_R（横梁下边减球半径）
// —— 边界（足球场 105×68m，半场）——
const OUT_X = 60 // 出界 |x|
const OUT_Z = 34 // 出界 |z|
const RAD2DEG = 57.29577951308232 // 180/π，rad/s → °/s

// ================================================================
// 三力积分一步（空中）：重力 + 空气阻力 + 马格努斯 + 旋转衰减
// ================================================================
export const physIntegrate = g.defineComposite('phys_integrate', {
  inputs: { pos: { type: 'vec3' }, vel: { type: 'vec3' }, spin: { type: 'vec3' } },
  outputs: { npos: { type: 'vec3' }, nvel: { type: 'vec3' }, nspin: { type: 'vec3' } },
  build: ({ pos, vel, spin }, f) => {
    const spd = f._3dVectorModuloOperation(vel)
    // 空气阻力 a_d = -KD·|v|·v
    const ad = f._3dVectorZoom(vel, f.multiplication(-KD, spd))
    // 马格努斯 a_m = KM·(ω×v)
    const am = f._3dVectorZoom(f._3dVectorCrossProduct(spin, vel), KM)
    // 重力 a_g = (0, -9.8, 0)
    const ag = f.create3dVector(0, G_ACC, 0)
    // v' = v + (a_g + a_d + a_m)·DT
    const nvel = f._3dVectorAddition(
      vel,
      f._3dVectorZoom(f._3dVectorAddition(f._3dVectorAddition(ag, ad), am), DT)
    )
    // p' = p + v'·DT
    const npos = f._3dVectorAddition(pos, f._3dVectorZoom(nvel, DT))
    // ω' = ω·KW_DECAY
    const nspin = f._3dVectorZoom(spin, KW_DECAY)
    return { npos, nvel, nspin }
  }
})

// ================================================================
// 球门碰撞（门柱 + 横梁 + 球网 + 进球判定），纯数据，|x| 对称
// ================================================================
export const physGoalCollide = g.defineComposite('phys_goal_collide', {
  inputs: { pos: { type: 'vec3' }, vel: { type: 'vec3' } },
  outputs: {
    hitPost: { type: 'bool' },
    hitBar: { type: 'bool' },
    netHit: { type: 'bool' },
    isGoal: { type: 'bool' },
    isOut: { type: 'bool' },
    nvelPost: { type: 'vec3' },
    nvelBar: { type: 'vec3' },
    nvelNet: { type: 'vec3' }
  },
  build: ({ pos, vel }, f) => {
    const p = f.split3dVector(pos)
    const v = f.split3dVector(vel)
    const ax = f.absoluteValueOperation(p.xComponent) // |px|
    // 球到门线带符号距离 dx = |px| - 52.5（负=门前，正=门后）
    const dx = f.subtraction(ax, GOAL_X)
    // —— 门柱 z=+3.6 与 z=-3.6 ——
    const dz1 = f.subtraction(p.zComponent, POST_Z)
    const hd1 = f.addition(f.multiplication(dx, dx), f.multiplication(dz1, dz1))
    const hitPz1 = f.lessThan(hd1, HIT_R2)
    const dz2 = f.addition(p.zComponent, POST_Z)
    const hd2 = f.addition(f.multiplication(dx, dx), f.multiplication(dz2, dz2))
    const hitPz2 = f.lessThan(hd2, HIT_R2)
    // 球在门柱高度内
    const postCap = f.addition(BAR_Y, f.addition(POST_R, BALL_R))
    const inPostHeight = f.lessThan(p.yComponent, postCap)
    const hitPost = f.logicalAndOperation(
      f.logicalOrOperation(hitPz1, hitPz2),
      inPostHeight
    )
    // —— 横梁 y=2.5（水平圆柱，沿 z）——
    const dy = f.subtraction(p.yComponent, BAR_Y)
    const vd = f.addition(f.multiplication(dx, dx), f.multiplication(dy, dy))
    const hitBarGeom = f.lessThan(vd, HIT_R2)
    const barZ = f.addition(POST_Z, f.addition(POST_R, BALL_R))
    const inBarZ = f.lessThan(f.absoluteValueOperation(p.zComponent), barZ)
    const hitBar = f.logicalAndOperation(hitBarGeom, inBarZ)
    // —— 球网：越门线 且 门框内 ——
    const overLine = f.greaterThan(ax, GOAL_X)
    const inNetZ = f.lessThan(f.absoluteValueOperation(p.zComponent), POST_Z)
    const inNetY = f.lessThan(p.yComponent, BAR_Y)
    const netHit = f.logicalAndOperation(
      overLine,
      f.logicalAndOperation(inNetZ, inNetY)
    )
    // —— 进球：球心越过门线 + 球半径，且完全入门框 ——
    const pastLine = f.greaterThan(ax, f.addition(GOAL_X, BALL_R))
    const inGoalZ = f.lessThan(f.absoluteValueOperation(p.zComponent), GOAL_INNER_Z)
    const inGoalY = f.lessThan(p.yComponent, GOAL_INNER_Y)
    const isGoal = f.logicalAndOperation(
      pastLine,
      f.logicalAndOperation(inGoalZ, inGoalY)
    )
    // —— 出界：|z|>34 或 |x|>60 ——
    const isOut = f.logicalOrOperation(
      f.greaterThan(f.absoluteValueOperation(p.zComponent), OUT_Z),
      f.greaterThan(ax, OUT_X)
    )
    // —— 反射速度 ——
    const nvelPost = f.create3dVector(
      f.multiplication(v.xComponent, -POST_E),
      v.yComponent,
      f.multiplication(v.zComponent, -POST_E)
    )
    const nvelBar = f.create3dVector(
      v.xComponent,
      f.multiplication(v.yComponent, -POST_E),
      v.zComponent
    )
    const nvelNet = f._3dVectorZoom(vel, NET_DAMP)
    return { hitPost, hitBar, netHit, isGoal, isOut, nvelPost, nvelBar, nvelNet }
  }
})

// ================================================================
// 地面反弹：球心 y < r 且向下 → 拉回 y=r + 法向反弹 + 水平摩擦
// ================================================================
export const physGroundBounce = g.defineComposite('phys_ground_bounce', {
  inputs: { pos: { type: 'vec3' }, vel: { type: 'vec3' } },
  outputs: { npos: { type: 'vec3' }, nvel: { type: 'vec3' }, hit: { type: 'bool' } },
  build: ({ pos, vel }, f) => {
    const p = f.split3dVector(pos)
    const v = f.split3dVector(vel)
    const hit = f.logicalAndOperation(
      f.lessThan(p.yComponent, BALL_R),
      f.lessThan(v.yComponent, 0)
    )
    const npos = f.create3dVector(p.xComponent, BALL_R, p.zComponent)
    const nvel = f.create3dVector(
      f.multiplication(v.xComponent, GROUND_FX),
      f.multiplication(v.yComponent, -GROUND_E),
      f.multiplication(v.zComponent, GROUND_FX)
    )
    return { npos, nvel, hit }
  }
})

// ================================================================
// 滚动/滑动摩擦：贴地时水平速度 ×0.985
// ================================================================
export const physRollFriction = g.defineComposite('phys_roll_friction', {
  inputs: { pos: { type: 'vec3' }, vel: { type: 'vec3' } },
  outputs: { nvel: { type: 'vec3' }, rolling: { type: 'bool' } },
  build: ({ pos, vel }, f) => {
    const p = f.split3dVector(pos)
    const v = f.split3dVector(vel)
    const grounded = f.lessThan(p.yComponent, f.addition(BALL_R, 0.05))
    const moving = f.greaterThan(f.absoluteValueOperation(v.xComponent), 0.01)
    const rolling = f.logicalAndOperation(grounded, moving)
    const nvel = f.create3dVector(
      f.multiplication(v.xComponent, ROLL_FRICTION),
      v.yComponent,
      f.multiplication(v.zComponent, ROLL_FRICTION)
    )
    return { nvel, rolling }
  }
})

// ================================================================
// 停球判定：|v| < 0.3 且 贴地 → 停（动能耗尽）
// ================================================================
export const physStopCheck = g.defineComposite('phys_stop_check', {
  inputs: { pos: { type: 'vec3' }, vel: { type: 'vec3' } },
  outputs: { isStop: { type: 'bool' } },
  build: ({ pos, vel }, f) => {
    const p = f.split3dVector(pos)
    const spd = f._3dVectorModuloOperation(vel)
    const isStop = f.logicalAndOperation(
      f.lessThan(spd, STOP_SPEED),
      f.lessThan(p.yComponent, f.addition(BALL_R, 0.1))
    )
    return { isStop }
  }
})

// 状态常量（与 game.ts 图变量 state 对齐）
const STATE_FREE = 0
const STATE_FLY = 1
const STATE_ROLL = 2

// ================================================================
// 运动器激活（exec）：匀速直线 + 匀速旋转，封装成"一件事"
// ================================================================
export const physApplyMotion = g.defineComposite('phys_apply_motion', {
  inputs: { e: { type: 'entity' }, vel: { type: 'vec3' }, spin: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, vel, spin }, f) => {
    const axis = f._3dVectorNormalization(spin)
    const angVel = f.multiplication(f._3dVectorModuloOperation(spin), RAD2DEG)
    const lin = f.callComposite(motionLinear, { e, vel })
    const spn = f.callComposite(motionSpin, { e, axis, angVel })
    f.connect(lin as never, 0, spn as never, 0)
    f.outflow('done', spn as never, 0)
    return {}
  }
})

// ================================================================
// 完整物理 tick 链（exec 复合）：状态机驱动
// 积分 → 球门碰撞 → 地面反弹 → 滚动摩擦 → 停球判定 → 状态写回 → 运动器
// ================================================================
export const physTick = g.defineComposite('phys_tick', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    // ① 读状态
    const state = f.getNodeGraphVariable('state').asType('int')
    const pos = f.getNodeGraphVariable('ballPos').asType('vec3')
    const vel = f.getNodeGraphVariable('ballVel').asType('vec3')
    const spin = f.getNodeGraphVariable('ballSpin').asType('vec3')

    f.doubleBranch(
      f.equal(state, 0n),
      () => {
        // 静止：不运动，直接结束
        const tail = f.registerExecNode('set_node_graph_variable', [
          new str('ballVel'), f.create3dVector(0, 0, 0), new bool(false)
        ])
        f.outflow('done', tail, 0)
      },
      () => {
        // ② 积分一步（三力模型）
        const integ = f.callComposite(physIntegrate, { pos, vel, spin })
        const sPos = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), integ.npos, new bool(false)])
        const sVel = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), integ.nvel, new bool(false)])
        f.connect(sPos, 0, sVel, 0)
        const sSpin = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), integ.nspin, new bool(false)])
        f.connect(sVel, 0, sSpin, 0)

        // ③ 球门碰撞（门柱/横梁/球网/进球/出界）
        const goal = f.callComposite(physGoalCollide, { pos: integ.npos, vel: integ.nvel })

        // 进球计分（去重：scored=false 时 goalCount+1）
        f.doubleBranch(goal.isGoal, () => {
          f.doubleBranch(f.get('scored'), () => {}, () => {
            const gc = f.registerExecNode('set_node_graph_variable', [
              new str('goalCount'),
              f.addition(f.getNodeGraphVariable('goalCount').asType('int'), new int(1)),
              new bool(false)
            ])
            const sc = f.registerExecNode('set_node_graph_variable', [new str('scored'), new bool(true), new bool(false)])
            f.connect(gc, 0, sc, 0)
          })
        }, () => {})

        // 出界 → 瞬移复位回场地中间（静止）
        const spawnCenter = f.create3dVector(0, BALL_R, 0)
        f.doubleBranch(goal.isOut, () => {
          const move = f.callComposite(motionInstant, { e, location: spawnCenter })
          const mp = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), spawnCenter, new bool(false)])
          f.connect(move as never, 0, mp, 0)
          const mv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(0, 0, 0), new bool(false)])
          f.connect(mp, 0, mv, 0)
          const ms = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, 0, 0), new bool(false)])
          f.connect(mv, 0, ms, 0)
          const mst = f.registerExecNode('set_node_graph_variable', [new str('state'), new int(STATE_FREE), new bool(false)])
          f.connect(ms, 0, mst, 0)
          f.outflow('done', mst, 0)
        }, () => {
          // 门柱反射
          f.doubleBranch(goal.hitPost, () => {
            const gv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), goal.nvelPost, new bool(false)])
          }, () => {})
          // 横梁反射
          f.doubleBranch(goal.hitBar, () => {
            const gv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), goal.nvelBar, new bool(false)])
          }, () => {})
          // 球网衰减（读门柱/横梁修正后的速度）
          const velAfterFrame = f.getNodeGraphVariable('ballVel').asType('vec3')
          const netVel = f._3dVectorZoom(velAfterFrame, NET_DAMP)
          f.doubleBranch(goal.netHit, () => {
            const gv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), netVel, new bool(false)])
          }, () => {})

          // ④ 地面反弹（读球门修正后的速度）
          const velAfterGoal = f.getNodeGraphVariable('ballVel').asType('vec3')
          const ground = f.callComposite(physGroundBounce, { pos: integ.npos, vel: velAfterGoal })
          f.doubleBranch(ground.hit, () => {
            const gp = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), ground.npos, new bool(false)])
            const gv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), ground.nvel, new bool(false)])
            f.connect(gp, 0, gv, 0)
          }, () => {})

          // ⑤ 滚动摩擦（读地面反弹修正后的速度）
          const velAfterGround = f.getNodeGraphVariable('ballVel').asType('vec3')
          const roll = f.callComposite(physRollFriction, { pos: integ.npos, vel: velAfterGround })
          f.doubleBranch(roll.rolling, () => {
            const rv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), roll.nvel, new bool(false)])
          }, () => {})

          // ⑥ 停球判定 → 静止；否则状态写回 + 运动器
          const velFinal = f.getNodeGraphVariable('ballVel').asType('vec3')
          const posFinal = f.getNodeGraphVariable('ballPos').asType('vec3')
          const spinFinal = f.getNodeGraphVariable('ballSpin').asType('vec3')
          const stop = f.callComposite(physStopCheck, { pos: posFinal, vel: velFinal })
          f.doubleBranch(stop.isStop, () => {
            // 动能耗尽 → 静止
            const sf = f.registerExecNode('set_node_graph_variable', [new str('state'), new int(STATE_FREE), new bool(false)])
            f.outflow('done', sf, 0)
          }, () => {
            // 状态判定：贴地 → 滚滑；离地 → 空中
            const pp = f.split3dVector(posFinal)
            const grounded = f.lessThan(pp.yComponent, f.addition(BALL_R, 0.05))
            f.doubleBranch(grounded, () => {
              const ss = f.registerExecNode('set_node_graph_variable', [new str('state'), new int(STATE_ROLL), new bool(false)])
              const ap = f.callComposite(physApplyMotion, { e, vel: velFinal, spin: spinFinal })
              f.connect(ss, 0, ap as never, 0)
              f.outflow('done', ap as never, 0)
            }, () => {
              const ss = f.registerExecNode('set_node_graph_variable', [new str('state'), new int(STATE_FLY), new bool(false)])
              const ap = f.callComposite(physApplyMotion, { e, vel: velFinal, spin: spinFinal })
              f.connect(ss, 0, ap as never, 0)
              f.outflow('done', ap as never, 0)
            })
          })
        })
      }
    )
    return {}
  }
})