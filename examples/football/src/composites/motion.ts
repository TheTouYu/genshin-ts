// 足球运动器复合（exec）：匀速直线 + 匀速旋转 + 瞬间移动
// 命名前缀：motion_*
// 2026-08-22 修正：定点运动器 move_speed 填 0 是错的——改用匀速直线运动器（velocity 速度向量）
// 旋转用匀速旋转运动器（axis 旋转轴 + angularVelocity 角速度 °/s）
import { g } from 'genshin-ts/runtime/core'
import { bool, float, str } from 'genshin-ts/runtime/value'
import { MovementMode, FixedMotionParameterType } from 'genshin-ts/definitions/enum'

// 匀速直线运动器（velocity 速度向量，duration 0.2s tick 插值）
// 球以 velocity 移动 0.2s，到达 p + velocity·0.2（与物理积分一致）
export const motionLinear = g.defineComposite('motion_linear', {
  inputs: { e: { type: 'entity' }, vel: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, vel }, f) => {
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

// 瞬间移动（定点运动器 INSTANT 模式，复位用；move_speed 瞬间到达无意义）
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
