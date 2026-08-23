// 足球运动器复合（exec）：定点移动 + 匀速旋转 + 瞬间移动
// 命名前缀：motion_*
// 2026-08-23 重构：velocity 运动器会自由漂移（视觉位置=当前位置+速度×时间，与物理目标点
// 在碰撞修正后不一致导致穿模/悬空），改用定点运动器（activate_fixed_point_motion_device
// 匀速直线 + FixedTime），球精确到达预计算的目标点，目标点已做地面/墙约束，永不越界。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, str } from 'genshin-ts/runtime/value'
import { MovementMode, FixedMotionParameterType } from 'genshin-ts/definitions/enum'

// 定点移动：0.2s 内精确移动到 target（匀速直线 + 固定时间）
// 目标点由物理预计算（重力/阻力/马格努斯/地面反弹/墙反弹/球门），y 已约束 ≥0.25、x/z 在墙内
// move_speed 填实际速度（距离÷时间），兼容引擎 FixedTime/FixedSpeed 两种语义，避免 speed=0 球不动
export const motionToPoint = g.defineComposite('motion_to_point', {
  inputs: { e: { type: 'entity' }, target: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, target }, f) => {
    const loc = f.getEntityLocationAndRotation(e).location
    const dist = f._3dVectorModuloOperation(f._3dVectorSubtraction(target, loc))
    const speed = f.multiplication(dist, 5) // dist / 0.2
    const tail = f.registerExecNode('activate_fixed_point_motion_device', [
      e,
      new str('physics'),
      MovementMode.UniformLinearMotion,
      speed,
      target,
      f.create3dVector(0, 0, 0),
      new bool(true),
      FixedMotionParameterType.FixedTime,
      new float(0.2)
    ])
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
    const tail = f.registerExecNode('add_uniform_basic_rotation_based_motion_device', [
      e,
      new str('spin'),
      new float(0.2),
      angVel,
      axis
    ])
    f.outflow('done', tail, 0)
    return {}
  }
})

// 瞬间移动（定点运动器 INSTANT 模式，复位用）
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
      new bool(true),
      FixedMotionParameterType.FixedSpeed,
      new float(0)
    ])
    f.outflow('done', tail, 0)
    return {}
  }
})