// 足球运动器复合（exec）：点到点匀速直线 + 匀速旋转 + 瞬间移动
// 命名前缀：motion_*
// 2026-08-23 重构：velocity 运动器重在"给定速度"会 free drift；这里按 (target-loc)/0.2
// 计算速度，让球精确到达预计算目标点（目标点已做地面/墙约束，永不越界），
// 同时用可与旋转运动器叠加的匀速直线运动器，避免定点运动器与旋转运动器互相打断。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, str } from 'genshin-ts/runtime/value'
import { MovementMode, FixedMotionParameterType } from 'genshin-ts/definitions/enum'

// 点到点移动：0.2s 内精确移动到 target（匀速直线运动器，速度按位移÷时长计算）
// 目标点由物理预计算（重力/阻力/马格努斯/地面反弹/墙反弹/球门），y 已约束 ≥0.25、x/z 在墙内
// 2026-08-23 修复：定点运动器(activate_fixed_point_motion_device)与同一事件链里激活的
// 旋转运动器互相打断，直线设备被秒停 → 球原地不动（日志逐帧：GetEntityLocation 始终不动）。
// 改回可与旋转运动器叠加的匀速直线运动器，但速度仍按 (target-loc)/0.2 计算，
// 保留"精确到达预计算目标点"的防穿模目标，不做自由漂移。
export const motionToPoint = g.defineComposite('motion_to_point', {
  inputs: { e: { type: 'entity' }, target: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, target }, f) => {
    const loc = f.getEntityLocationAndRotation(e).location
    const delta = f._3dVectorSubtraction(target, loc)
    const vel = f._3dVectorZoom(delta, 5) // (target - loc) / 0.2
    const tail = f.registerExecNode('add_uniform_basic_linear_motion_device', [
      e,
      new str('physics'),
      new float(0.2),
      vel
    ])
    f.outflow('done', tail, 0)
    return {}
  }
})

// 按速度移动（0.2s 匀速直线运动器，速度 = 逻辑球速，不依赖实体位置）：
// 2026-08-27 足球传导链铁证——用 (target-loc)/0.2 反推速度时，若实体位置因
// 运动器被打断而滞后 ballPos，delta 被放大（20~35 m/s），引擎可能不驱动实体
// → 实体更滞后 → 恶性循环。改成直接用逻辑球速，速度恒在正常范围，实体正常被驱动。
export const motionByVel = g.defineComposite('motion_by_vel', {
  inputs: { e: { type: 'entity' }, vel: { type: 'vec3' }, grounded: { type: 'bool' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, vel, grounded }, f) => {
    const vx = f.split3dVector(vel).xComponent
    const vz = f.split3dVector(vel).zComponent
    const velY = f.split3dVector(vel).yComponent
    // grounded=true（贴地滚动）：垂直速度 = 拉回地面（0.25），治"空中滚动"（2026-08-27 实证球 y=5.7 不下落）
    // grounded=false（飞行/射门）：保留 vel.y——否则飞行垂直速度被覆盖，球永远 y=0.25 飞不起来
    const loc = f.getEntityLocationAndRotation(e).location
    const lp = f.split3dVector(loc)
    const dy = f.subtraction(new float(0.25), lp.yComponent)
    const vyRaw = f.division(dy, new float(0.2))
    const vyFloor = f.division(f.addition(f.subtraction(vyRaw, new float(5)), f.absoluteValueOperation(f.addition(vyRaw, new float(5)))), 2)
    const vyGround = f.division(f.subtraction(f.addition(vyFloor, new float(5)), f.absoluteValueOperation(f.subtraction(vyFloor, new float(5)))), 2)
    // 数据选择 vy（不分裂执行流）：vy = velY + (vyGround − velY) × gF
    // 双分支 outflow 会产生两个 done，调用方只连 done[0] → false 分支下游丢失
    // （2026-08-27 实证：飞行 grounded=false 时链断，kick_launch 的 setState 不执行 → 球空中定住）
    const gI = f.dataTypeConversion(grounded, 'int')
    const gF = f.dataTypeConversion(gI, 'float')
    const vy = f.addition(velY, f.multiplication(f.subtraction(vyGround, velY), gF))
    const fullVel = f.create3dVector(vx, vy, vz)
    const tail = f.registerExecNode('add_uniform_basic_linear_motion_device', [e, new str('physics'), new float(0.2), fullVel])
    f.outflow('done', tail, 0)
    return {}
  }
})

// 匀速旋转运动器（axis 旋转轴 + angVel 角速度 °/s，duration 0.2s）
// 球绕自旋轴 ω 视觉旋转；axis = ω 方向（世界轴=局部轴，因 ω 是旋转轴），angVel = |ω|·180/π
export const motionSpin = g.defineComposite('motion_spin', {
  inputs: { e: { type: 'entity' }, axis: { type: 'vec3' }, angVel: { type: 'float' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, axis, angVel }, f) => {
    // 旋转运动器 axis 是实体局部轴；球带着任意朝向时，必须把世界自旋轴转回局部系：
    // local = Rz(-rz)·Rx(-rx)·Ry(-ry)·worldAxis（YXZ 内旋），否则横传/曲线球方向会错。
    const rot = f.getEntityLocationAndRotation(e).rotate
    const r = f.split3dVector(rot)
    const negX = f.multiplication(r.xComponent, -1)
    const negY = f.multiplication(r.yComponent, -1)
    const negZ = f.multiplication(r.zComponent, -1)
    const afterY = f._3dVectorRotation(f.create3dVector(0, negY, 0), axis)
    const afterX = f._3dVectorRotation(f.create3dVector(negX, 0, 0), afterY)
    const localAxis = f._3dVectorRotation(f.create3dVector(0, 0, negZ), afterX)
    const tail = f.registerExecNode('add_uniform_basic_rotation_based_motion_device', [
      e,
      new str('spin'),
      new float(0.2),
      angVel,
      localAxis
    ])
    f.outflow('done', tail, 0)
    return {}
  }
})

// 瞬间移动（定点运动器 INSTANT 模式，复位用）
// lockRotation=false 才会应用 targetRotation=(0,0,0)；true 是"锁定当前旋转"（日志 2832 实证：
// 复位后球仍保留上一段高吊的 z≈105.7° 朝向，导致后续横传的 local axis ≠ world axis，旋转方向错）
export const motionInstant = g.defineComposite('motion_instant', {
  inputs: { e: { type: 'entity' }, location: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, location }, f) => {
    const tail = f.registerExecNode('activate_fixed_point_motion_device', [
      e,
      new str('physics'),
      MovementMode.InstantMovement,
      new float(0),
      location,
      f.create3dVector(0, 0, 0),
      new bool(false),
      FixedMotionParameterType.FixedSpeed,
      new float(0)
    ])
    f.outflow('done', tail, 0)
    return {}
  }
})
