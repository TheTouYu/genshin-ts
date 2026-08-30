// 足球物理复合（纯数据 + exec）：状态机驱动的完整物理
// 命名前缀：phys_*
// 状态机：0=FREE 1=FLYING 2=ROLLING 3=SLIDE 4=CARRIED 5=GOAL（与 game.ts 对齐）
// 状态提交：各 tick 复合链尾一次性写图变量 state + 球自定义变量 state（单一写路径）
// 球门几何（世界坐标，两个门对称于 x=0，用 |x| 统一处理）：
//   门线 |x|=52.5，门柱中心 z=±3.6（半径 0.06），横梁中心 y=2.5，球网深 1.8m
import { g } from 'genshin-ts/runtime/core'
import { bool, str } from 'genshin-ts/runtime/value'
import { motionByVel, motionSpin } from './motion.js'

// —— 物理常量（编译期预计算为字面量）——
const DT = 0.2 // 5Hz tick
const G_ACC = -9.8 // 重力
const KD = 0.02 // 空气阻力系数
const KM = 0.01 // 马格努斯系数
const KW_DECAY = 0.99 // exp(-0.05*0.2)，旋转衰减
const BALL_R = 0.25 // 球半径
const INV_BALL_R = 4 // 1 / BALL_R（滚滑角速度 = 线速度 / 半径）
const GROUND_E = 0.65 // 地面反弹法向恢复
const GROUND_FX = 0.85 // 地面反弹水平摩擦
const ROLL_DECEL = 3.0 // 滚动匀减速（m/s²）：带球球速 6 滚 ~6m 停；射门 15 滚 ~37m。真实带球球滚 1-3m 球员追上，不滚到停
const SLIDE_DECEL = 6.0 // 滑动强减速（m/s²）：踢球瞬间打滑，迅速降到滚动
const SLIDE_ENTER_SPEED = 4.5 // 踢后球速 > 该值 → 进入滑动状态
const SLIDE_TO_ROLL_SPEED = 2.5 // 滑动降到该值 → 转滚动
const ROLL_SPIN_GAIN = 0.5 // 压力摩擦产生的力矩把 ω 拉向纯滚动目标的系数（滑转再收敛）
const ROLL_BOUNCE_VY = 1.0 // 反弹后 |vy| 低于该值才转滚滑，否则继续空中弹跳
const STOP_SPEED = 0.3 // 停球速度阈值
const GOAL_RESET_S = 2 // 进球后复位延时（s）
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
// —— 草地四面墙边界（25×25 格，col/row 98..122，球心活动范围留半格）——
const WALL_X_MIN = -55 // -X 墙（左）
const WALL_X_MAX = 60 // +X 墙（右）
const WALL_Z_MIN = -55 // -Z 墙（后）
const WALL_Z_MAX = 60 // +Z 墙（前）
const WALL_E = 0.7 // 墙反弹恢复系数
const WALL_E_NEG = -0.7 // 负恢复系数（反弹方向取负用）
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
    hitPost1: { type: 'bool' },
    hitPost2: { type: 'bool' },
    hitBar: { type: 'bool' },
    netHit: { type: 'bool' },
    isGoal: { type: 'bool' },
    nvelPost1: { type: 'vec3' },
    nvelPost2: { type: 'vec3' },
    nvelBar: { type: 'vec3' },
    nvelNet: { type: 'vec3' }
  },
  build: ({ pos, vel }, f) => {
    const p = f.split3dVector(pos)
    const v = f.split3dVector(vel)
    const ax = f.absoluteValueOperation(p.xComponent) // |px|
    // 球到门线带符号距离 dx = |px| - 52.5（负=门前，正=门后）
    const dx = f.subtraction(ax, GOAL_X)
    // 反射系数 -(1+e)（e=恢复系数，标准反射公式 v' = v - (1+e)(v·n)n）
    const reflCoef = -1.7
    // —— 门柱 z=+3.6 与 z=-3.6：精确法向反射 ——
    const dz1 = f.subtraction(p.zComponent, POST_Z)
    const hd1 = f.addition(f.multiplication(dx, dx), f.multiplication(dz1, dz1))
    const hitGeom1 = f.lessThan(hd1, HIT_R2)
    const dz2 = f.addition(p.zComponent, POST_Z)
    const hd2 = f.addition(f.multiplication(dx, dx), f.multiplication(dz2, dz2))
    const hitGeom2 = f.lessThan(hd2, HIT_R2)
    const postCap = f.addition(BAR_Y, f.addition(POST_R, BALL_R))
    const inPostHeight = f.lessThan(p.yComponent, postCap)
    const hitPost1 = f.logicalAndOperation(hitGeom1, inPostHeight)
    const hitPost2 = f.logicalAndOperation(hitGeom2, inPostHeight)
    // 门柱 1 法向反射：n1 = normalize(dx, 0, dz1)
    const dvec1 = f.create3dVector(dx, 0, dz1)
    const n1 = f._3dVectorNormalization(dvec1)
    const vdotn1 = f._3dVectorDotProduct(vel, n1)
    const nvelPost1 = f._3dVectorAddition(
      vel,
      f._3dVectorZoom(n1, f.multiplication(vdotn1, reflCoef))
    )
    // 门柱 2 法向反射：n2 = normalize(dx, 0, dz2)
    const dvec2 = f.create3dVector(dx, 0, dz2)
    const n2 = f._3dVectorNormalization(dvec2)
    const vdotn2 = f._3dVectorDotProduct(vel, n2)
    const nvelPost2 = f._3dVectorAddition(
      vel,
      f._3dVectorZoom(n2, f.multiplication(vdotn2, reflCoef))
    )
    // —— 横梁 y=2.5（水平圆柱，沿 z）：精确法向反射（x-y 平面）——
    const dy = f.subtraction(p.yComponent, BAR_Y)
    const vd = f.addition(f.multiplication(dx, dx), f.multiplication(dy, dy))
    const hitBarGeom = f.lessThan(vd, HIT_R2)
    const barZ = f.addition(POST_Z, f.addition(POST_R, BALL_R))
    const inBarZ = f.lessThan(f.absoluteValueOperation(p.zComponent), barZ)
    const hitBar = f.logicalAndOperation(hitBarGeom, inBarZ)
    const bvec = f.create3dVector(dx, dy, 0)
    const nb = f._3dVectorNormalization(bvec)
    const vdotnb = f._3dVectorDotProduct(vel, nb)
    const nvelBar = f._3dVectorAddition(
      vel,
      f._3dVectorZoom(nb, f.multiplication(vdotnb, reflCoef))
    )
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
    const nvelNet = f._3dVectorZoom(vel, NET_DAMP)
    return {
      hitPost1, hitPost2, hitBar, netHit, isGoal,
      nvelPost1, nvelPost2, nvelBar, nvelNet
    }
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

// ================================================================
// 运动器激活（exec）：定点移动（精确到目标点）+ 匀速旋转，封装成"一件事"
// 目标点由物理积分预计算（含地面/墙约束），球精确到达，不漂移不穿模
// ================================================================
export const physApplyMotion = g.defineComposite('phys_apply_motion', {
  inputs: { e: { type: 'entity' }, vel: { type: 'vec3' }, spin: { type: 'vec3' }, grounded: { type: 'bool' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, vel, spin, grounded }, f) => {
    const axis = f._3dVectorNormalization(spin)
    const angVel = f.multiplication(f._3dVectorModuloOperation(spin), RAD2DEG)
    // 用逻辑球速驱动（motionByVel），不再 (target-实体位置)/0.2 反推：
    // 实体位置滞后会放大 delta → 速度 20~35 超限 → 引擎不驱动 → 更滞后（恶性循环）
    const lin = f.callComposite(motionByVel, { e, vel, grounded })
    const spn = f.callComposite(motionSpin, { e, axis, angVel })
    f.connect(lin as never, 0, spn as never, 0)
    f.outflow('done', spn as never, 0)
    return {}
  }
})

// ================================================================
// 四面墙碰撞（exec）：球越界拉回墙内 + 速度分量反向（草地边界，防穿墙）
// 读最新 ballPos/ballVel 图变量，检测 |x|/|z| 越界 → 位置钳制 + 对应速度分量反向
// ================================================================
export const physWallCollide = g.defineComposite('phys_wall_collide', {
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_i, f) => {
    const pos = f.getNodeGraphVariable('ballPos').asType('vec3')
    const vel = f.getNodeGraphVariable('ballVel').asType('vec3')
    const p = f.split3dVector(pos)
    const v = f.split3dVector(vel)
    // -X 墙（左）：球心 x < 墙 → 拉回 + vx 反向
    f.doubleBranch(f.lessThan(p.xComponent, WALL_X_MIN), () => {
      const np = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), f.create3dVector(WALL_X_MIN, p.yComponent, p.zComponent), new bool(false)])
      const nv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(f.multiplication(f.absoluteValueOperation(v.xComponent), WALL_E), v.yComponent, v.zComponent), new bool(false)])
      f.connect(np, 0, nv, 0)
    }, () => {})
    // +X 墙（右）
    f.doubleBranch(f.greaterThan(p.xComponent, WALL_X_MAX), () => {
      const np = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), f.create3dVector(WALL_X_MAX, p.yComponent, p.zComponent), new bool(false)])
      const nv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(f.multiplication(f.absoluteValueOperation(v.xComponent), WALL_E_NEG), v.yComponent, v.zComponent), new bool(false)])
      f.connect(np, 0, nv, 0)
    }, () => {})
    // -Z 墙（后）
    f.doubleBranch(f.lessThan(p.zComponent, WALL_Z_MIN), () => {
      const np = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), f.create3dVector(p.xComponent, p.yComponent, WALL_Z_MIN), new bool(false)])
      const nv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(v.xComponent, v.yComponent, f.multiplication(f.absoluteValueOperation(v.zComponent), WALL_E)), new bool(false)])
      f.connect(np, 0, nv, 0)
    }, () => {})
    // +Z 墙（前）
    f.doubleBranch(f.greaterThan(p.zComponent, WALL_Z_MAX), () => {
      const np = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), f.create3dVector(p.xComponent, p.yComponent, WALL_Z_MAX), new bool(false)])
      const nv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(v.xComponent, v.yComponent, f.multiplication(f.absoluteValueOperation(v.zComponent), WALL_E_NEG)), new bool(false)])
      f.connect(np, 0, nv, 0)
    }, () => {})
    const tail = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f._3dVectorZoom(f.getNodeGraphVariable('ballSpin').asType('vec3'), 1), new bool(false)])
    f.outflow('done', tail, 0)
    return {}
  }
})

// ================================================================
// 滚滑积分一步：贴地水平摩擦（无重力，重力被地面支持力抵消，球不弹跳）
// ================================================================
export const physRollIntegrate = g.defineComposite('phys_roll_integrate', {
  inputs: { pos: { type: 'vec3' }, vel: { type: 'vec3' }, spin: { type: 'vec3' } },
  outputs: { npos: { type: 'vec3' }, nvel: { type: 'vec3' }, nspin: { type: 'vec3' } },
  build: ({ pos, vel, spin }, f) => {
    const p = f.split3dVector(pos)
    const v = f.split3dVector(vel)
    // 匀减速：水平速度每 tick 减 ROLL_DECEL·DT（方向保留），线性衰减、无急停
    const spd = f._3dVectorModuloOperation(f.create3dVector(v.xComponent, 0, v.zComponent))
    const spdSub = f.subtraction(spd, f.multiplication(ROLL_DECEL, DT))
    // max(spdSub, 0) = (spdSub + |spdSub|)/2
    const spd2 = f.division(
      f.addition(spdSub, f.absoluteValueOperation(spdSub)),
      2
    )
    const ratio = f.division(spd2, f.addition(spd, 0.0001))
    const nvx = f.multiplication(v.xComponent, ratio)
    const nvz = f.multiplication(v.zComponent, ratio)
    const npos = f.create3dVector(
      f.addition(p.xComponent, f.multiplication(nvx, DT)),
      BALL_R,
      f.addition(p.zComponent, f.multiplication(nvz, DT))
    )
    const nvel = f.create3dVector(nvx, 0, nvz)
    // 压力 × 摩擦力会产生绕接触点的力矩，把 ω 往“纯滚动”方向拉；
    // 不是每 tick 强制无滑，而是按 ROLL_SPIN_GAIN 收敛（允许先滑动再滚）。
    const s = f.split3dVector(spin)
    const targetSpinX = f.multiplication(nvz, INV_BALL_R)
    const targetSpinZ = f.multiplication(nvx, -INV_BALL_R)
    const nsx = f.addition(
      s.xComponent,
      f.multiplication(f.subtraction(targetSpinX, s.xComponent), ROLL_SPIN_GAIN)
    )
    const nsy = f.multiplication(s.yComponent, KW_DECAY)
    const nsz = f.addition(
      s.zComponent,
      f.multiplication(f.subtraction(targetSpinZ, s.zComponent), ROLL_SPIN_GAIN)
    )
    const nspin = f.create3dVector(nsx, nsy, nsz)
    return { npos, nvel, nspin }
  }
})

// ================================================================
// 滑动积分（纯数据）：贴地打滑，匀减速更强（SLIDE_DECEL），自旋缓慢衰减
// ================================================================
export const physSlideIntegrate = g.defineComposite('phys_slide_integrate', {
  inputs: { pos: { type: 'vec3' }, vel: { type: 'vec3' }, spin: { type: 'vec3' } },
  outputs: { npos: { type: 'vec3' }, nvel: { type: 'vec3' }, nspin: { type: 'vec3' } },
  build: ({ pos, vel, spin }, f) => {
    const p = f.split3dVector(pos)
    const v = f.split3dVector(vel)
    const spd = f._3dVectorModuloOperation(f.create3dVector(v.xComponent, 0, v.zComponent))
    const spdSub = f.subtraction(spd, f.multiplication(SLIDE_DECEL, DT))
    const spd2 = f.division(f.addition(spdSub, f.absoluteValueOperation(spdSub)), 2)
    const ratio = f.division(spd2, f.addition(spd, 0.0001))
    const nvx = f.multiplication(v.xComponent, ratio)
    const nvz = f.multiplication(v.zComponent, ratio)
    const npos = f.create3dVector(
      f.addition(p.xComponent, f.multiplication(nvx, DT)),
      BALL_R,
      f.addition(p.zComponent, f.multiplication(nvz, DT))
    )
    const nvel = f.create3dVector(nvx, 0, nvz)
    // 物理定义：滑动摩擦产生力矩，把自旋向"纯滚动"（ω=v/R）收敛（ROLL_SPIN_GAIN）
    const s = f.split3dVector(spin)
    const targetSpinX = f.multiplication(nvz, INV_BALL_R)
    const targetSpinZ = f.multiplication(nvx, -INV_BALL_R)
    const nsx = f.addition(
      s.xComponent,
      f.multiplication(f.subtraction(targetSpinX, s.xComponent), ROLL_SPIN_GAIN)
    )
    const nsy = f.multiplication(s.yComponent, KW_DECAY)
    const nsz = f.addition(
      s.zComponent,
      f.multiplication(f.subtraction(targetSpinZ, s.zComponent), ROLL_SPIN_GAIN)
    )
    const nspin = f.create3dVector(nsx, nsy, nsz)
    return { npos, nvel, nspin }
  }
})

// ================================================================
// 空中物理 tick（exec 复合）：三力积分 + 球门碰撞 + 地面反弹 + 落地转滚滑
// ================================================================
export const physFlyTick = g.defineComposite('phys_fly_tick', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    const pos = f.getNodeGraphVariable('ballPos').asType('vec3')
    const vel = f.getNodeGraphVariable('ballVel').asType('vec3')
    const spin = f.getNodeGraphVariable('ballSpin').asType('vec3')

    // ① 三力积分（重力+阻力+马格努斯）
    const integ = f.callComposite(physIntegrate, { pos, vel, spin })
    const sPos = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), integ.npos, new bool(false)])
    const sVel = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), integ.nvel, new bool(false)])
    f.connect(sPos, 0, sVel, 0)
    const sSpin = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), integ.nspin, new bool(false)])
    f.connect(sVel, 0, sSpin, 0)
    // 物化快照：后面 goal/ground 一律读 tmp*，不再读 integ.*（避免重新求值）
    const tPos = f.registerExecNode('set_node_graph_variable', [new str('tmpPos'), f.getNodeGraphVariable('ballPos').asType('vec3'), new bool(false)])
    f.connect(sSpin, 0, tPos, 0)
    const tVel = f.registerExecNode('set_node_graph_variable', [new str('tmpVel'), f.getNodeGraphVariable('ballVel').asType('vec3'), new bool(false)])
    f.connect(tPos, 0, tVel, 0)
    const tSpin = f.registerExecNode('set_node_graph_variable', [new str('tmpSpin'), f.getNodeGraphVariable('ballSpin').asType('vec3'), new bool(false)])
    f.connect(tVel, 0, tSpin, 0)
    const posSnap = f.getNodeGraphVariable('tmpPos').asType('vec3')
    const velSnap = f.getNodeGraphVariable('tmpVel').asType('vec3')

    // ② 球门碰撞
    const goal = f.callComposite(physGoalCollide, { pos: posSnap, vel: velSnap })

    // 进球计分（数据选择，不分裂执行流；goalNew 仅首次越线为真）
    // 物化 tmpGoal：scored 写回后 goalNew 的消费点重求值会读到 scored=true → false（重复求值家族）
    const scoredOld = f.getNodeGraphVariable('scored').asType('bool')
    const goalNew = f.logicalAndOperation(goal.isGoal, f.logicalNotOperation(scoredOld))
    const sGoalTmp = f.registerExecNode('set_node_graph_variable', [new str('tmpGoal'), goalNew, new bool(false)])
    const gc = f.registerExecNode('set_node_graph_variable', [new str('goalCount'), f.addition(f.getNodeGraphVariable('goalCount').asType('int'), f.dataTypeConversion(f.getNodeGraphVariable('tmpGoal').asType('bool'), 'int')), new bool(false)])
    f.connect(sGoalTmp, 0, gc, 0)
    const sc = f.registerExecNode('set_node_graph_variable', [new str('scored'), f.logicalOrOperation(scoredOld, f.getNodeGraphVariable('tmpGoal').asType('bool')), new bool(false)])
    f.connect(gc, 0, sc, 0)
    // 进球 → GOAL 复位定时器（2s 一次性；定时器事件由宿主 whenTimerIsTriggered 处理）
    f.doubleBranch(f.getNodeGraphVariable('tmpGoal').asType('bool'), () => {
      f.registerExecNode('start_timer', [e, new str('goal_reset'), new bool(false), f.assemblyList([GOAL_RESET_S], 'float')])
    }, () => {})

    // 门柱/横梁/球网反射（出界已改墙反弹，不再瞬移复位）
    f.doubleBranch(goal.hitPost1, () => {
      const gv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), goal.nvelPost1, new bool(false)])
    }, () => {})
    f.doubleBranch(goal.hitPost2, () => {
      const gv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), goal.nvelPost2, new bool(false)])
    }, () => {})
    f.doubleBranch(goal.hitBar, () => {
      const gv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), goal.nvelBar, new bool(false)])
    }, () => {})
    const velAfterFrame = f.getNodeGraphVariable('ballVel').asType('vec3')
    const netVel = f._3dVectorZoom(velAfterFrame, NET_DAMP)
    f.doubleBranch(goal.netHit, () => {
      const gv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), netVel, new bool(false)])
    }, () => {})

    // ③ 四面墙碰撞（草地边界反弹）
    const wall = f.callComposite(physWallCollide, {})

    // ④ 地面反弹
    const velAfterGoal = f.getNodeGraphVariable('ballVel').asType('vec3')
    const ground = f.callComposite(physGroundBounce, { pos: posSnap, vel: velAfterGoal })
    f.doubleBranch(ground.hit, () => {
      const gp = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), ground.npos, new bool(false)])
      const gv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), ground.nvel, new bool(false)])
      f.connect(gp, 0, gv, 0)
    }, () => {})

    // ⑤ 状态判定（纯数据，单一提交）+ 运动器（数据选择，无执行分支）
    const velFinal = f.getNodeGraphVariable('ballVel').asType('vec3')
    const posFinal = f.getNodeGraphVariable('ballPos').asType('vec3')
    const spinFinal = f.getNodeGraphVariable('ballSpin').asType('vec3')
    const stop = f.callComposite(physStopCheck, { pos: posFinal, vel: velFinal })
    const pp = f.split3dVector(posFinal)
    const vv = f.split3dVector(velFinal)
    const grounded = f.lessThan(pp.yComponent, f.addition(BALL_R, 0.05))
    const bounceDead = f.lessThan(f.absoluteValueOperation(vv.yComponent), ROLL_BOUNCE_VY)
    const hSpd = f._3dVectorModuloOperation(f.create3dVector(vv.xComponent, 0, vv.zComponent))
    const slideEntry = f.logicalAndOperation(
      f.logicalAndOperation(grounded, bounceDead),
      f.greaterThan(hSpd, SLIDE_ENTER_SPEED)
    )
    // nextState 数据选择（值域 {0,1,2,3,5}）：GOAL > 停 > 贴地打滑(3) > 贴地弹跳死(2) > 空中(1)
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
    // 停/进球 → 零速占位运动器（链自然停，避免执行分支）
    const haltF = b2f(f.logicalOrOperation(stop.isStop, f.getNodeGraphVariable('tmpGoal').asType('bool')))
    const motionVel = f._3dVectorZoom(velFinal, f.subtraction(1, haltF))
    const motionGrounded = f.logicalAndOperation(grounded, bounceDead)
    const ap = f.callComposite(physApplyMotion, { e, vel: motionVel, spin: spinFinal, grounded: motionGrounded })
    // ⑥ 状态提交（图变量 + 球自定义变量一次性写；行为图经自定义变量读到）
    const cg = f.registerExecNode('set_node_graph_variable', [new str('state'), nextState, new bool(false)])
    f.connect(ap as never, 0, cg, 0)
    const cc = f.registerExecNode('set_custom_variable', [e, new str('state'), nextState, new bool(false)])
    f.connect(cg, 0, cc, 0)
    f.outflow('done', cc, 0)
    return {}
  }
})

// ================================================================
// 滚滑物理 tick（exec 复合）：水平摩擦 + 球门碰撞 + 停球（贴地滚不弹跳）
// ================================================================
export const physRollTick = g.defineComposite('phys_roll_tick', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    const pos = f.getNodeGraphVariable('ballPos').asType('vec3')
    const vel = f.getNodeGraphVariable('ballVel').asType('vec3')
    const spin = f.getNodeGraphVariable('ballSpin').asType('vec3')

    // ① 滚滑积分（水平摩擦，无重力）
    const integ = f.callComposite(physRollIntegrate, { pos, vel, spin })
    const sPos = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), integ.npos, new bool(false)])
    const sVel = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), integ.nvel, new bool(false)])
    f.connect(sPos, 0, sVel, 0)
    const sSpin = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), integ.nspin, new bool(false)])
    f.connect(sVel, 0, sSpin, 0)
    // 物化快照：goal 只读 tmp*，不读 integ.*（避免重复求值）
    const tPos = f.registerExecNode('set_node_graph_variable', [new str('tmpPos'), f.getNodeGraphVariable('ballPos').asType('vec3'), new bool(false)])
    f.connect(sSpin, 0, tPos, 0)
    const tVel = f.registerExecNode('set_node_graph_variable', [new str('tmpVel'), f.getNodeGraphVariable('ballVel').asType('vec3'), new bool(false)])
    f.connect(tPos, 0, tVel, 0)
    const posSnap = f.getNodeGraphVariable('tmpPos').asType('vec3')
    const velSnap = f.getNodeGraphVariable('tmpVel').asType('vec3')

    // ② 球门碰撞（球滚到门柱）
    const goal = f.callComposite(physGoalCollide, { pos: posSnap, vel: velSnap })

    // 进球计分（数据选择，不分裂执行流；goalNew 仅首次越线为真）
    // 物化 tmpGoal：scored 写回后 goalNew 的消费点重求值会读到 scored=true → false（重复求值家族）
    const scoredOld = f.getNodeGraphVariable('scored').asType('bool')
    const goalNew = f.logicalAndOperation(goal.isGoal, f.logicalNotOperation(scoredOld))
    const sGoalTmp = f.registerExecNode('set_node_graph_variable', [new str('tmpGoal'), goalNew, new bool(false)])
    const gc = f.registerExecNode('set_node_graph_variable', [new str('goalCount'), f.addition(f.getNodeGraphVariable('goalCount').asType('int'), f.dataTypeConversion(f.getNodeGraphVariable('tmpGoal').asType('bool'), 'int')), new bool(false)])
    f.connect(sGoalTmp, 0, gc, 0)
    const sc = f.registerExecNode('set_node_graph_variable', [new str('scored'), f.logicalOrOperation(scoredOld, f.getNodeGraphVariable('tmpGoal').asType('bool')), new bool(false)])
    f.connect(gc, 0, sc, 0)
    // 进球 → GOAL 复位定时器（2s 一次性；定时器事件由宿主 whenTimerIsTriggered 处理）
    f.doubleBranch(f.getNodeGraphVariable('tmpGoal').asType('bool'), () => {
      f.registerExecNode('start_timer', [e, new str('goal_reset'), new bool(false), f.assemblyList([GOAL_RESET_S], 'float')])
    }, () => {})

    // 门柱/横梁反射（球滚到门框弹回，出界已改墙反弹）
    f.doubleBranch(goal.hitPost1, () => {
      const gv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), goal.nvelPost1, new bool(false)])
    }, () => {})
    f.doubleBranch(goal.hitPost2, () => {
      const gv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), goal.nvelPost2, new bool(false)])
    }, () => {})
    f.doubleBranch(goal.hitBar, () => {
      const gv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), goal.nvelBar, new bool(false)])
    }, () => {})
    // 球网衰减（球滚进网减速）
    const velAfterFrame = f.getNodeGraphVariable('ballVel').asType('vec3')
    const netVel = f._3dVectorZoom(velAfterFrame, NET_DAMP)
    f.doubleBranch(goal.netHit, () => {
      const gv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), netVel, new bool(false)])
    }, () => {})

    // ③ 四面墙碰撞（草地边界反弹）
    const wall = f.callComposite(physWallCollide, {})

    // ④ 停球判定 + 状态提交（纯数据，单一提交）+ 运动器（数据选择）
    const velFinal = f.getNodeGraphVariable('ballVel').asType('vec3')
    const posFinal = f.getNodeGraphVariable('ballPos').asType('vec3')
    const spinFinal = f.getNodeGraphVariable('ballSpin').asType('vec3')
    const stop = f.callComposite(physStopCheck, { pos: posFinal, vel: velFinal })
    const b2f = (b: any) => f.dataTypeConversion(f.dataTypeConversion(b, 'int'), 'float')
    const bGoal = b2f(f.getNodeGraphVariable('tmpGoal').asType('bool'))
    const bStop = b2f(stop.isStop)
    // nextState：GOAL(5) > 停(0) > 滚动(2)
    const nextF = f.addition(
      f.multiplication(bGoal, 5),
      f.multiplication(f.subtraction(1, bGoal), f.multiplication(f.subtraction(1, bStop), 2))
    )
    const nextState = f.dataTypeConversion(nextF, 'int')
    const haltF = b2f(f.logicalOrOperation(stop.isStop, f.getNodeGraphVariable('tmpGoal').asType('bool')))
    const motionVel = f._3dVectorZoom(velFinal, f.subtraction(1, haltF))
    const ap = f.callComposite(physApplyMotion, { e, vel: motionVel, spin: spinFinal, grounded: new bool(true) })
    // 状态提交（图变量 + 球自定义变量一次性写）
    const cg = f.registerExecNode('set_node_graph_variable', [new str('state'), nextState, new bool(false)])
    f.connect(ap as never, 0, cg, 0)
    const cc = f.registerExecNode('set_custom_variable', [e, new str('state'), nextState, new bool(false)])
    f.connect(cg, 0, cc, 0)
    f.outflow('done', cc, 0)
    return {}
  }
})

// ================================================================
// 滑动 tick（exec 复合）：贴地打滑，匀减速强衰减（SLIDE_DECEL）；
// 球速降到 SLIDE_TO_ROLL_SPEED 以下 → 转滚动（spin 开始收敛纯滚动）
// ================================================================
export const physSlideTick = g.defineComposite('phys_slide_tick', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    const pos = f.getNodeGraphVariable('ballPos').asType('vec3')
    const vel = f.getNodeGraphVariable('ballVel').asType('vec3')
    const spin = f.getNodeGraphVariable('ballSpin').asType('vec3')
    const integ = f.callComposite(physSlideIntegrate, { pos, vel, spin })
    // 物化快照（防二次求值）
    const sTmpPos = f.registerExecNode('set_node_graph_variable', [new str('tmpPos'), integ.npos, new bool(false)])
    const sTmpVel = f.registerExecNode('set_node_graph_variable', [new str('tmpVel'), integ.nvel, new bool(false)])
    f.connect(sTmpPos, 0, sTmpVel, 0)
    const sTmpSpin = f.registerExecNode('set_node_graph_variable', [new str('tmpSpin'), integ.nspin, new bool(false)])
    f.connect(sTmpVel, 0, sTmpSpin, 0)
    const sPos = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), f.getNodeGraphVariable('tmpPos').asType('vec3'), new bool(false)])
    f.connect(sTmpSpin, 0, sPos, 0)
    // 新速度/自旋先写回（碰撞分支可能再覆盖）
    const sVel0 = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.getNodeGraphVariable('tmpVel').asType('vec3'), new bool(false)])
    f.connect(sPos, 0, sVel0, 0)

    // 球门碰撞 + 进球计分（数据选择）+ GOAL 复位定时器
    const posSnap = f.getNodeGraphVariable('tmpPos').asType('vec3')
    const velSnap = f.getNodeGraphVariable('tmpVel').asType('vec3')
    const goal = f.callComposite(physGoalCollide, { pos: posSnap, vel: velSnap })
    // 进球计分（数据选择）+ 物化 tmpGoal（scored 写回后再读 goalNew 会重算出 false）
    const scoredOld = f.getNodeGraphVariable('scored').asType('bool')
    const goalNew = f.logicalAndOperation(goal.isGoal, f.logicalNotOperation(scoredOld))
    const sGoalTmp = f.registerExecNode('set_node_graph_variable', [new str('tmpGoal'), goalNew, new bool(false)])
    const gc = f.registerExecNode('set_node_graph_variable', [new str('goalCount'), f.addition(f.getNodeGraphVariable('goalCount').asType('int'), f.dataTypeConversion(f.getNodeGraphVariable('tmpGoal').asType('bool'), 'int')), new bool(false)])
    f.connect(sGoalTmp, 0, gc, 0)
    const sc = f.registerExecNode('set_node_graph_variable', [new str('scored'), f.logicalOrOperation(scoredOld, f.getNodeGraphVariable('tmpGoal').asType('bool')), new bool(false)])
    f.connect(gc, 0, sc, 0)
    f.doubleBranch(f.getNodeGraphVariable('tmpGoal').asType('bool'), () => {
      f.registerExecNode('start_timer', [e, new str('goal_reset'), new bool(false), f.assemblyList([GOAL_RESET_S], 'float')])
    }, () => {})
    // 门柱/横梁反射（贴地滑行撞门框弹回）
    f.doubleBranch(goal.hitPost1, () => {
      f.registerExecNode('set_node_graph_variable', [new str('ballVel'), goal.nvelPost1, new bool(false)])
    }, () => {})
    f.doubleBranch(goal.hitPost2, () => {
      f.registerExecNode('set_node_graph_variable', [new str('ballVel'), goal.nvelPost2, new bool(false)])
    }, () => {})
    f.doubleBranch(goal.hitBar, () => {
      f.registerExecNode('set_node_graph_variable', [new str('ballVel'), goal.nvelBar, new bool(false)])
    }, () => {})
    const velAfterFrame = f.getNodeGraphVariable('ballVel').asType('vec3')
    const netVel = f._3dVectorZoom(velAfterFrame, NET_DAMP)
    f.doubleBranch(goal.netHit, () => {
      f.registerExecNode('set_node_graph_variable', [new str('ballVel'), netVel, new bool(false)])
    }, () => {})

    // 四面墙碰撞
    const wall = f.callComposite(physWallCollide, {})

    // 停球判定 + 滑转滚 + 状态提交（纯数据）
    const velFinal = f.getNodeGraphVariable('ballVel').asType('vec3')
    const posFinal = f.getNodeGraphVariable('ballPos').asType('vec3')
    const stop = f.callComposite(physStopCheck, { pos: posFinal, vel: velFinal })
    const vv = f.split3dVector(velFinal)
    const spd = f._3dVectorModuloOperation(f.create3dVector(vv.xComponent, 0, vv.zComponent))
    const toRoll = f.lessThan(spd, SLIDE_TO_ROLL_SPEED)
    const b2f = (b: any) => f.dataTypeConversion(f.dataTypeConversion(b, 'int'), 'float')
    const bGoal = b2f(f.getNodeGraphVariable('tmpGoal').asType('bool'))
    const bStop = b2f(stop.isStop)
    const bRoll = b2f(toRoll)
    // nextState：GOAL(5) > 停(0) > 转滚(2) > 继续滑(3)
    const nextF = f.addition(
      f.multiplication(bGoal, 5),
      f.multiplication(
        f.subtraction(1, bGoal),
        f.multiplication(f.subtraction(1, bStop), f.addition(f.multiplication(bRoll, 2), f.multiplication(f.subtraction(1, bRoll), 3)))
      )
    )
    const nextState = f.dataTypeConversion(nextF, 'int')
    const haltF = b2f(f.logicalOrOperation(stop.isStop, f.getNodeGraphVariable('tmpGoal').asType('bool')))
    const motionVel = f._3dVectorZoom(velFinal, f.subtraction(1, haltF))
    const ap = f.callComposite(physApplyMotion, { e, vel: motionVel, spin: f.getNodeGraphVariable('tmpSpin').asType('vec3'), grounded: new bool(true) })
    const sSpin = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.getNodeGraphVariable('tmpSpin').asType('vec3'), new bool(false)])
    f.connect(ap as never, 0, sSpin, 0)
    // 状态提交（图变量 + 球自定义变量一次性写）
    const cg = f.registerExecNode('set_node_graph_variable', [new str('state'), nextState, new bool(false)])
    f.connect(sSpin, 0, cg, 0)
    const cc = f.registerExecNode('set_custom_variable', [e, new str('state'), nextState, new bool(false)])
    f.connect(cg, 0, cc, 0)
    f.outflow('done', cc, 0)
    return {}
  }
})

// ================================================================
// 带球「速度场吸附」已拆到独立模块 dribble-field.ts（composites/dribble-field.ts）。
// 状态分发在宿主 game.ts（whenBasicMotionDeviceStops）：0=FREE 清速 / 1=fly / 2=roll / 3=slide /
// 4=CARRIED 带球图驱动 / 5=GOAL 复位定时器。各 tick 复合链尾单一提交 state。
// ================================================================