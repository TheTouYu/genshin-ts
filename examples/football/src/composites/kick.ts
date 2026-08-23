// 足球施力复合（exec）：选项施力 + 复位
// 命名前缀：kick_*
// 8 个施力选项（tabId 1-8，每选项给球施加不同方向/力度/旋转的力）+ 复位（tabId 9）
// 球持续运动直到动能耗尽（速度足够小）才进入静止状态
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { motionInstant } from './motion.js'
import { physApplyMotion, physIntegrate } from './physics.js'

// 场地中间（复位点）
const CENTER_X = 0
const CENTER_Y = 0.25 // = BALL_R
const CENTER_Z = 0
const IMPULSE_SCALE = 0.35 // 运动中追加冲量相对“静态施力向量”的比例（加载量级）

// ================================================================
// 施力参数表：tabId → ballVel/ballSpin（exec 复合，内部 multipleBranches 分派）
// 覆盖：重力（高吊）、空气阻力（重射高速）、马格努斯（内/外旋弧线）、
//       弹力（落地反弹）、摩擦（滚滑）、旋转（上旋/下旋/内旋）
// ================================================================
export const kickApplyForce = g.defineComposite('kick_apply_force', {
  inputs: { tabId: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ tabId }, f) => {
    // 默认值节点（entry 链首，multipleBranches 之前），分支覆盖
    const done = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(0, 0, 0), new bool(false)])
    f.multipleBranches(tabId, {
      1: () => {
        // 轻射：-X 小力 + 内旋
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-14, 2, 0), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, -6, 0), new bool(false)])
      },
      2: () => {
        // 重射：-X 大力 + 内旋
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-24, 3, 0), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, -8, 0), new bool(false)])
      },
      3: () => {
        // 高吊：斜上大力 + 上旋
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-15, 9, 0), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, 0, 6), new bool(false)])
      },
      4: () => {
        // 内旋弧（香蕉球）：-X + 内旋强 + z 正偏
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-16, 2, 2), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, -9, 0), new bool(false)])
      },
      5: () => {
        // 外旋弧：-X + 外旋强 + z 负偏
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-16, 2, -2), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, 9, 0), new bool(false)])
      },
      6: () => {
        // 上旋低平：快速落地前滚（测试滚滑摩擦）
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-18, 0.5, 0), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, 0, 10), new bool(false)])
      },
      7: () => {
        // 下旋（回旋）：落地回弹减速
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-14, 2, 0), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, 0, -8), new bool(false)])
      },
      8: () => {
        // 横传：向 +Z 方向 + 上旋（v 主要沿 +Z，前滚轴 = +X）
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(2, 3, 12), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(6, 0, 0), new bool(false)])
      },
      default: () => {}
    })
    f.outflow('done', done, 0)
    return {}
  }
})

// ================================================================
// 施力启动：set state=空中 + scored=false + 激活运动器（exec 复合）
// ================================================================
export const kickLaunch = g.defineComposite('kick_launch', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    // 同步逻辑位置到球实体视觉位置（球从实际所在位置施力）
    const loc = f.getEntityLocationAndRotation(e).location
    const vel = f.getNodeGraphVariable('ballVel').asType('vec3')
    const spin = f.getNodeGraphVariable('ballSpin').asType('vec3')
    // 第一个目标点必须用与 physFlyTick 完全相同的半隐式积分结果：
    // 否则首段视觉按 v0·dt 走、物理按 v1·dt 走，造成 launch 过冲/回头（“虚拟天花板”）。
    const integ = f.callComposite(physIntegrate, { pos: loc, vel, spin })
    // 首段目标 clamp 到地面：上旋/低平球的第一步积分可能已被马格努斯压到 y<0.25，
    // 直接拿 integ.npos 当视觉目标会让球第一段就扎进草里。
    const ip = f.split3dVector(integ.npos)
    const diffY = f.subtraction(ip.yComponent, CENTER_Y)
    const clampedY = f.division(f.addition(f.addition(ip.yComponent, CENTER_Y), f.absoluteValueOperation(diffY)), 2)
    const clampedPos = f.create3dVector(ip.xComponent, clampedY, ip.zComponent)
    // 关键顺序：先消费 integ.npos/nspin 再写回 ballVel/ballSpin。
    // physIntegrate 的输入来自图变量 get；若先写 ballVel 再消费 integ.*，
    // 引擎会按“每个消费点求值一次”重新积分 → 首段目标被二次重力拖到地下（球往草里扎）。
    const setPos = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), clampedPos, new bool(false)])
    const ap = f.callComposite(physApplyMotion, { e, pos: clampedPos, spin: integ.nspin })
    f.connect(setPos, 0, ap as never, 0)
    const setVel = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), integ.nvel, new bool(false)])
    f.connect(ap as never, 0, setVel, 0)
    const setSpin = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), integ.nspin, new bool(false)])
    f.connect(setVel, 0, setSpin, 0)
    const setState = f.registerExecNode('set_node_graph_variable', [
      new str('state'), new int(1), new bool(false)
    ])
    f.connect(setSpin, 0, setState, 0)
    const setScored = f.registerExecNode('set_node_graph_variable', [
      new str('scored'), new bool(false), new bool(false)
    ])
    f.connect(setState, 0, setScored, 0)
    f.outflow('done', setScored, 0)
    return {}
  }
})

// ================================================================
// 运动中追加冲量（exec 复合）：读当前 ballVel/ballSpin，加法叠加选项冲量，
// 同时启动一个唯一名的短时匀速直线运动器，让主运动器与冲量运动器“不同名叠加”
// 主名 physics 继续负责状态机；冲量名 = dataTypeConversion(impulseSeq,'str')，stop 被忽略。
// ================================================================
export const kickApplyImpulse = g.defineComposite('kick_apply_impulse', {
  inputs: { e: { type: 'entity' }, tabId: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, tabId }, f) => {
    const curVel = f.getNodeGraphVariable('ballVel').asType('vec3')
    const curSpin = f.getNodeGraphVariable('ballSpin').asType('vec3')
    const seq = f.getNodeGraphVariable('impulseSeq').asType('int')
    const impName = f.dataTypeConversion(seq, 'str')
    const maxSpeed = new float(24)
    // 运动状态：只在空中允许冲量带竖直分量；滚滑时竖直冲量会被下一 tick 滚滑状态吞掉，
    // 之前“海绵/突然自由落体”就是这个原因。这里把滚滑冲量投影为水平冲量。
    // 运动中再施力统一让球进入飞行状态；不要因为 state=2 就把竖直冲量砍成 0
    // （用户反馈：快静止时再施力能量接近 0，就是这里把 y 归零导致的）
    const vyScale = f.dataTypeConversion(new int(1), 'float')
    const makeDv = (x, y, z) => {
      const base = f.create3dVector(x, y, z)
      const d = f.split3dVector(base)
      return f.create3dVector(
        f.multiplication(d.xComponent, IMPULSE_SCALE),
        f.multiplication(f.multiplication(d.yComponent, IMPULSE_SCALE), vyScale),
        f.multiplication(d.zComponent, IMPULSE_SCALE)
      )
    }
    const makeDw = (x, y, z) => f._3dVectorZoom(f.create3dVector(x, y, z), IMPULSE_SCALE)
    // 默认节点（entry 链首），分支覆盖
    const done = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), curVel, new bool(false)])
    const clampSpeed = (v) => {
      const mag = f._3dVectorModuloOperation(v)
      const denom = f.addition(mag, 0.0001)
      const minMag = f.division(f.subtraction(f.addition(mag, maxSpeed), f.absoluteValueOperation(f.subtraction(mag, maxSpeed))), 2)
      return f._3dVectorZoom(v, f.division(minMag, denom))
    }
    f.multipleBranches(tabId, {
      1: () => {
        const dv = makeDv(-14, 2, 0)
        const dw = makeDw(0, -6, 0)
        const nv = clampSpeed(f._3dVectorAddition(curVel, dv))
        const nw = f._3dVectorAddition(curSpin, dw)
        const sV = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), nv, new bool(false)])
        const sW = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), nw, new bool(false)])
        f.connect(sV, 0, sW, 0)
        const imp = f.registerExecNode('add_uniform_basic_linear_motion_device', [e, impName, new float(0.2), dv])
        f.connect(sW, 0, imp, 0)
        const inc = f.registerExecNode('set_node_graph_variable', [new str('impulseSeq'), f.addition(seq, new int(1)), new bool(false)])
        const st = f.registerExecNode('set_node_graph_variable', [new str('state'), new int(1), new bool(false)])
        f.connect(imp, 0, st, 0)
        f.connect(st, 0, inc, 0)
      },
      2: () => {
        const dv = makeDv(-24, 3, 0)
        const dw = makeDw(0, -8, 0)
        const nv = clampSpeed(f._3dVectorAddition(curVel, dv))
        const nw = f._3dVectorAddition(curSpin, dw)
        const sV = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), nv, new bool(false)])
        const sW = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), nw, new bool(false)])
        f.connect(sV, 0, sW, 0)
        const imp = f.registerExecNode('add_uniform_basic_linear_motion_device', [e, impName, new float(0.2), dv])
        f.connect(sW, 0, imp, 0)
        const inc = f.registerExecNode('set_node_graph_variable', [new str('impulseSeq'), f.addition(seq, new int(1)), new bool(false)])
        const st = f.registerExecNode('set_node_graph_variable', [new str('state'), new int(1), new bool(false)])
        f.connect(imp, 0, st, 0)
        f.connect(st, 0, inc, 0)
      },
      3: () => {
        const dv = makeDv(-15, 9, 0)
        const dw = makeDw(0, 0, 6)
        const nv = clampSpeed(f._3dVectorAddition(curVel, dv))
        const nw = f._3dVectorAddition(curSpin, dw)
        const sV = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), nv, new bool(false)])
        const sW = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), nw, new bool(false)])
        f.connect(sV, 0, sW, 0)
        const imp = f.registerExecNode('add_uniform_basic_linear_motion_device', [e, impName, new float(0.2), dv])
        f.connect(sW, 0, imp, 0)
        const inc = f.registerExecNode('set_node_graph_variable', [new str('impulseSeq'), f.addition(seq, new int(1)), new bool(false)])
        const st = f.registerExecNode('set_node_graph_variable', [new str('state'), new int(1), new bool(false)])
        f.connect(imp, 0, st, 0)
        f.connect(st, 0, inc, 0)
      },
      4: () => {
        const dv = makeDv(-16, 2, 2)
        const dw = makeDw(0, -9, 0)
        const nv = clampSpeed(f._3dVectorAddition(curVel, dv))
        const nw = f._3dVectorAddition(curSpin, dw)
        const sV = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), nv, new bool(false)])
        const sW = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), nw, new bool(false)])
        f.connect(sV, 0, sW, 0)
        const imp = f.registerExecNode('add_uniform_basic_linear_motion_device', [e, impName, new float(0.2), dv])
        f.connect(sW, 0, imp, 0)
        const inc = f.registerExecNode('set_node_graph_variable', [new str('impulseSeq'), f.addition(seq, new int(1)), new bool(false)])
        const st = f.registerExecNode('set_node_graph_variable', [new str('state'), new int(1), new bool(false)])
        f.connect(imp, 0, st, 0)
        f.connect(st, 0, inc, 0)
      },
      5: () => {
        const dv = makeDv(-16, 2, -2)
        const dw = makeDw(0, 9, 0)
        const nv = clampSpeed(f._3dVectorAddition(curVel, dv))
        const nw = f._3dVectorAddition(curSpin, dw)
        const sV = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), nv, new bool(false)])
        const sW = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), nw, new bool(false)])
        f.connect(sV, 0, sW, 0)
        const imp = f.registerExecNode('add_uniform_basic_linear_motion_device', [e, impName, new float(0.2), dv])
        f.connect(sW, 0, imp, 0)
        const inc = f.registerExecNode('set_node_graph_variable', [new str('impulseSeq'), f.addition(seq, new int(1)), new bool(false)])
        const st = f.registerExecNode('set_node_graph_variable', [new str('state'), new int(1), new bool(false)])
        f.connect(imp, 0, st, 0)
        f.connect(st, 0, inc, 0)
      },
      6: () => {
        const dv = makeDv(-18, 0.5, 0)
        const dw = makeDw(0, 0, 10)
        const nv = clampSpeed(f._3dVectorAddition(curVel, dv))
        const nw = f._3dVectorAddition(curSpin, dw)
        const sV = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), nv, new bool(false)])
        const sW = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), nw, new bool(false)])
        f.connect(sV, 0, sW, 0)
        const imp = f.registerExecNode('add_uniform_basic_linear_motion_device', [e, impName, new float(0.2), dv])
        f.connect(sW, 0, imp, 0)
        const inc = f.registerExecNode('set_node_graph_variable', [new str('impulseSeq'), f.addition(seq, new int(1)), new bool(false)])
        const st = f.registerExecNode('set_node_graph_variable', [new str('state'), new int(1), new bool(false)])
        f.connect(imp, 0, st, 0)
        f.connect(st, 0, inc, 0)
      },
      7: () => {
        const dv = makeDv(-14, 2, 0)
        const dw = makeDw(0, 0, -8)
        const nv = clampSpeed(f._3dVectorAddition(curVel, dv))
        const nw = f._3dVectorAddition(curSpin, dw)
        const sV = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), nv, new bool(false)])
        const sW = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), nw, new bool(false)])
        f.connect(sV, 0, sW, 0)
        const imp = f.registerExecNode('add_uniform_basic_linear_motion_device', [e, impName, new float(0.2), dv])
        f.connect(sW, 0, imp, 0)
        const inc = f.registerExecNode('set_node_graph_variable', [new str('impulseSeq'), f.addition(seq, new int(1)), new bool(false)])
        const st = f.registerExecNode('set_node_graph_variable', [new str('state'), new int(1), new bool(false)])
        f.connect(imp, 0, st, 0)
        f.connect(st, 0, inc, 0)
      },
      8: () => {
        const dv = makeDv(2, 3, 12)
        const dw = makeDw(6, 0, 0)
        const nv = clampSpeed(f._3dVectorAddition(curVel, dv))
        const nw = f._3dVectorAddition(curSpin, dw)
        const sV = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), nv, new bool(false)])
        const sW = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), nw, new bool(false)])
        f.connect(sV, 0, sW, 0)
        const imp = f.registerExecNode('add_uniform_basic_linear_motion_device', [e, impName, new float(0.2), dv])
        f.connect(sW, 0, imp, 0)
        const inc = f.registerExecNode('set_node_graph_variable', [new str('impulseSeq'), f.addition(seq, new int(1)), new bool(false)])
        const st = f.registerExecNode('set_node_graph_variable', [new str('state'), new int(1), new bool(false)])
        f.connect(imp, 0, st, 0)
        f.connect(st, 0, inc, 0)
      },
      default: () => {}
    })
    f.outflow('done', done, 0)
    return {}
  }
})

// ================================================================
// 复位：瞬移回场地中间 + 清零状态（exec 复合）
// ================================================================
export const kickReset = g.defineComposite('kick_reset', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    const spawn = f.create3dVector(CENTER_X, CENTER_Y, CENTER_Z)
    const move = f.callComposite(motionInstant, { e, location: spawn })
    const setPos = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), spawn, new bool(false)])
    f.connect(move as never, 0, setPos, 0)
    const setVel = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(0, 0, 0), new bool(false)])
    f.connect(setPos, 0, setVel, 0)
    const setSpin = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, 0, 0), new bool(false)])
    f.connect(setVel, 0, setSpin, 0)
    const setState = f.registerExecNode('set_node_graph_variable', [new str('state'), new int(0), new bool(false)])
    f.connect(setSpin, 0, setState, 0)
    const setScored = f.registerExecNode('set_node_graph_variable', [new str('scored'), new bool(false), new bool(false)])
    f.connect(setState, 0, setScored, 0)
    f.outflow('done', setScored, 0)
    return {}
  }
})