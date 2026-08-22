// 足球运动器复合（exec）：定点运动器激活封装
// 命名前缀：motion_*
// 阶段 0 只有两种运动器：匀速直线 tick（插值）+ 瞬间移动（复位）
import { g } from 'genshin-ts/runtime/core'
import { bool, float, str } from 'genshin-ts/runtime/value'
import { MovementMode, FixedMotionParameterType } from 'genshin-ts/definitions/enum'

// 匀速直线运动器（固定时间 0.2s tick 插值，H6/H8 验证）
export const motionLinearTick = g.defineComposite('motion_linear_tick', {
  inputs: { e: { type: 'entity' }, location: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, location }, f) => {
    const tail = f.registerExecNode('activate_fixed_point_motion_device', [
      e,
      new str('physics'),
      MovementMode.UniformLinearMotion,
      new float(0),
      location,
      f.create3dVector(0, 0, 0),
      new bool(true),
      FixedMotionParameterType.FixedTime,
      new float(0.2)
    ])
    f.outflow('done', tail, 0)
    return {}
  }
})

// 瞬间移动运动器（复位用，H1 验证）
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
