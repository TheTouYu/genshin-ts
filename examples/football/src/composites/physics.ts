// 足球物理复合（纯数据 + exec）：三力积分 / 碰撞 / 判定 / 停球 / tick 链
// 命名前缀：phys_*
// 物理模型见 DESIGN.md §5：重力 + 空气阻力 + 马格努斯 + 旋转衰减 + 滚动摩擦
import { g } from 'genshin-ts/runtime/core'
import { bool, str } from 'genshin-ts/runtime/value'
import { motionLinear, motionSpin, motionInstant } from './motion.js'

// —— 物理常量（编译期预计算为字面量）——
const DT = 0.2 // 5Hz tick
const G_ACC = -9.8 // 重力
const KD = 0.03 // 空气阻力系数
const KM = 0.008 // 马格努斯系数
const KW_DECAY = 0.98413 // exp(-0.08*0.2)，旋转衰减
const BALL_R = 0.25 // 球半径
const GROUND_E = 0.65 // 地面反弹法向恢复
const GROUND_FX = 0.85 // 地面反弹水平摩擦
const ROLL_FRICTION = 0.985 // 滚动摩擦（贴地每 tick 减速）
const STOP_SPEED = 0.3 // 停球速度阈值
const GOAL_X = -52.5 // 门线
const GOAL_HALF = 3.66 // 门半宽
const GOAL_TOP = 2.5 // 门高
const POST_R = 0.37 // 门柱碰撞半径
const POST_E = 0.7 // 门柱恢复
const OUT_X = 60 // 出界范围
const OUT_Z = 40
const RAD2DEG = 57.29577951308232 // 180/π，rad/s → °/s

// 三力积分一步：pos/vel/spin → 新 pos/vel/spin（DESIGN §5.1）
export const physIntegrate = g.defineComposite('phys_integrate', {
  inputs: { pos: { type: 'vec3' }, vel: { type: 'vec3' }, spin: { type: 'vec3' } },
  outputs: { npos: { type: 'vec3' }, nvel: { type: 'vec3' }, nspin: { type: 'vec3' } },
  build: ({ pos, vel, spin }, f) => {
    // |v|（阻力用）
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

// 进球/出界判定：pos → isGoal/isOut（DESIGN §6）
export const physJudge = g.defineComposite('phys_judge', {
  inputs: { pos: { type: 'vec3' } },
  outputs: { isGoal: { type: 'bool' }, isOut: { type: 'bool' } },
  build: ({ pos }, f) => {
    const p = f.split3dVector(pos)
    // 进球：x ≤ -52.5 且 |z| ≤ 3.66 且 y ≤ 2.5
    const isGoal = f.logicalAndOperation(
      f.logicalAndOperation(
        f.lessThanOrEqualTo(p.xComponent, GOAL_X),
        f.lessThanOrEqualTo(f.absoluteValueOperation(p.zComponent), GOAL_HALF)
      ),
      f.lessThanOrEqualTo(p.yComponent, GOAL_TOP)
    )
    // 出界：|x| > 60 或 |z| > 40
    const isOut = f.logicalOrOperation(
      f.logicalOrOperation(
        f.lessThan(p.xComponent, -OUT_X),
        f.greaterThan(p.xComponent, OUT_X)
      ),
      f.logicalOrOperation(
        f.lessThan(p.zComponent, -OUT_Z),
        f.greaterThan(p.zComponent, OUT_Z)
      )
    )
    return { isGoal, isOut }
  }
})

// 地面碰撞：球心 y < r → 拉回 + 法向反弹 + 水平摩擦（DESIGN §5.2）
export const physGroundCollide = g.defineComposite('phys_ground_collide', {
  inputs: { pos: { type: 'vec3' }, vel: { type: 'vec3' } },
  outputs: { npos: { type: 'vec3' }, nvel: { type: 'vec3' }, hit: { type: 'bool' } },
  build: ({ pos, vel }, f) => {
    const p = f.split3dVector(pos)
    const v = f.split3dVector(vel)
    const hit = f.lessThan(p.yComponent, BALL_R)
    // 拉回 y=r；v.y=-e·v.y；水平 ×0.85
    const npos = f.create3dVector(p.xComponent, BALL_R, p.zComponent)
    const nvel = f.create3dVector(
      f.multiplication(v.xComponent, GROUND_FX),
      f.multiplication(v.yComponent, -GROUND_E),
      f.multiplication(v.zComponent, GROUND_FX)
    )
    return { npos, nvel, hit }
  }
})

// 门柱碰撞：|x+52.5|<0.37 且 |z±3.66|<0.37 → z 速度反射（DESIGN §5.2）
export const physPostCollide = g.defineComposite('phys_post_collide', {
  inputs: { pos: { type: 'vec3' }, vel: { type: 'vec3' } },
  outputs: { nvel: { type: 'vec3' }, hit: { type: 'bool' } },
  build: ({ pos, vel }, f) => {
    const p = f.split3dVector(pos)
    const v = f.split3dVector(vel)
    const nearPost1 = f.logicalAndOperation(
      f.lessThan(f.absoluteValueOperation(f.addition(p.xComponent, -GOAL_X)), POST_R),
      f.lessThan(f.absoluteValueOperation(f.subtraction(p.zComponent, GOAL_HALF)), POST_R)
    )
    const nearPost2 = f.logicalAndOperation(
      f.lessThan(f.absoluteValueOperation(f.addition(p.xComponent, -GOAL_X)), POST_R),
      f.lessThan(f.absoluteValueOperation(f.addition(p.zComponent, GOAL_HALF)), POST_R)
    )
    const hit = f.logicalOrOperation(nearPost1, nearPost2)
    const nvel = f.create3dVector(
      v.xComponent,
      v.yComponent,
      f.multiplication(v.zComponent, -POST_E)
    )
    return { nvel, hit }
  }
})

// 滚动摩擦：贴地时水平速度 ×0.985（DESIGN §5.2 滚动摩擦）
export const physRollFriction = g.defineComposite('phys_roll_friction', {
  inputs: { pos: { type: 'vec3' }, vel: { type: 'vec3' } },
  outputs: { nvel: { type: 'vec3' }, rolling: { type: 'bool' } },
  build: ({ pos, vel }, f) => {
    const p = f.split3dVector(pos)
    const v = f.split3dVector(vel)
    // 贴地（y ≈ r）且水平速度非零 → 滚动摩擦
    const rolling = f.logicalAndOperation(
      f.lessThan(p.yComponent, BALL_R + 0.05),
      f.greaterThan(f.absoluteValueOperation(v.xComponent), 0.01)
    )
    const nvel = f.create3dVector(
      f.multiplication(v.xComponent, ROLL_FRICTION),
      v.yComponent,
      f.multiplication(v.zComponent, ROLL_FRICTION)
    )
    return { nvel, rolling }
  }
})

// 停球判定：贴地且慢 → 停（DESIGN §5.2）
export const physStop = g.defineComposite('phys_stop', {
  inputs: { pos: { type: 'vec3' }, vel: { type: 'vec3' } },
  outputs: { isStop: { type: 'bool' } },
  build: ({ pos, vel }, f) => {
    const p = f.split3dVector(pos)
    const spd = f._3dVectorModuloOperation(vel)
    const isStop = f.logicalAndOperation(
      f.lessThan(spd, STOP_SPEED),
      f.lessThan(p.yComponent, 0.5)
    )
    return { isStop }
  }
})

// 发球点（罚球点）
const SPAWN_X = -41.5
const SPAWN_Y = 0.247
const SPAWN_Z = 0

// 完整物理 tick 链（exec 复合）：积分 → 判定 → 碰撞 → 滚动摩擦 → 停球 → 运动器（直线+旋转）
// 这是 whenBasicMotionDeviceStops 事件的核心处理，封装成"一件事"
export const physTick = g.defineComposite('phys_tick', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    // ① 积分一步（三力模型）
    const pos = f.getNodeGraphVariable('ballPos').asType('vec3')
    const vel = f.getNodeGraphVariable('ballVel').asType('vec3')
    const spin = f.getNodeGraphVariable('ballSpin').asType('vec3')
    const integ = f.callComposite(physIntegrate, { pos, vel, spin })
    const setPos = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), integ.npos, new bool(false)])
    const setVel = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), integ.nvel, new bool(false)])
    f.connect(setPos, 0, setVel, 0)
    const setSpin = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), integ.nspin, new bool(false)])
    f.connect(setVel, 0, setSpin, 0)

    // ② 进球/出界判定
    const judge = f.callComposite(physJudge, { pos: integ.npos })
    const doReset = f.logicalOrOperation(judge.isGoal, judge.isOut)

    // ③ 分派：复位 vs 碰撞+滚动摩擦+停球+下一 tick
    f.doubleBranch(doReset, () => {
      // 进球/出界 → 复位
      const spawn = f.create3dVector(SPAWN_X, SPAWN_Y, SPAWN_Z)
      const move = f.callComposite(motionInstant, { e, location: spawn })
      const rp = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), spawn, new bool(false)])
      f.connect(move as never, 0, rp, 0)
      const rv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(0, 0, 0), new bool(false)])
      f.connect(rp, 0, rv, 0)
      const rs = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, 0, 0), new bool(false)])
      f.connect(rv, 0, rs, 0)
      const rf = f.registerExecNode('set_node_graph_variable', [new str('flying'), new bool(false), new bool(false)])
      f.connect(rs, 0, rf, 0)
      f.outflow('done', rf, 0)
    }, () => {
      // ③ 碰撞修正（地面 + 门柱）
      const gc = f.callComposite(physGroundCollide, { pos: integ.npos, vel: integ.nvel })
      f.doubleBranch(gc.hit, () => {
        const gp = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), gc.npos, new bool(false)])
        const gv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), gc.nvel, new bool(false)])
        f.connect(gp, 0, gv, 0)
      }, () => {})
      const pc = f.callComposite(physPostCollide, { pos: integ.npos, vel: integ.nvel })
      f.doubleBranch(pc.hit, () => {
        const pv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), pc.nvel, new bool(false)])
      }, () => {})

      // ④ 滚动摩擦（贴地滚动减速）
      const rf = f.callComposite(physRollFriction, { pos: integ.npos, vel: integ.nvel })
      f.doubleBranch(rf.rolling, () => {
        const rv = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), rf.nvel, new bool(false)])
      }, () => {})

      // ⑤ 停球判定
      const stop = f.callComposite(physStop, { pos: integ.npos, vel: integ.nvel })
      f.doubleBranch(stop.isStop, () => {
        const sf = f.registerExecNode('set_node_graph_variable', [new str('flying'), new bool(false), new bool(false)])
        f.outflow('done', sf, 0)
      }, () => {
        // ⑥ 下一 tick：匀速直线（velocity）+ 匀速旋转（axis + angVel）
        const axis = f._3dVectorNormalization(integ.nspin)
        const angVel = f.multiplication(f._3dVectorModuloOperation(integ.nspin), RAD2DEG)
        const lin = f.callComposite(motionLinear, { e, vel: integ.nvel })
        const spn = f.callComposite(motionSpin, { e, axis, angVel })
        f.connect(lin as never, 0, spn as never, 0)
        f.outflow('done', spn as never, 0)
      })
    })
    return {}
  }
})
