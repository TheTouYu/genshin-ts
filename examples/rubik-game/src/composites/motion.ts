// 表现层运动原语（exec/纯数据）
// 命名前缀：motion_*
import { g } from 'genshin-ts/runtime/core'
import { str } from 'genshin-ts/runtime/value'
import { mathOrbitPoint } from './math.js'

// 45° 段预计算常量（2 段折线逼近 90° 圆弧）
export const C1 = 0.7071068
export const S1 = 0.7071068
export const C2 = 0
export const S2 = 1

// 自旋块：直接使用调用方查表得到的局部轴 + 添加自旋运动器
export const motionSpinBlock = g.defineComposite('motion_spin_block', {
    id: 1610700020,
  inputs: {
    e: { type: 'entity' },
    axis: { type: 'vec3' },
    duration: { type: 'float' },
    angularVelocity: { type: 'float' }
  },
  outputs: {},
  outflows: ['done'],
  build: ({ e, axis, duration, angularVelocity }, f) => {
    const tail = f.registerExecNode('add_uniform_basic_rotation_based_motion_device', [
      e,
      new str('spin'),
      duration,
      angularVelocity,
      axis
    ])
    f.outflow('done', tail, 0)
    return {}
  }
})

// 轨道起点分解：位置差分解 v0/vp/vPerp/axv
export const motionOrbitPrep = g.defineComposite('motion_orbit_prep', {
    id: 1610700021,
  inputs: { e: { type: 'entity' }, axis: { type: 'vec3' }, center: { type: 'vec3' } },
  outputs: { v0: { type: 'vec3' }, vp: { type: 'vec3' }, vPerp: { type: 'vec3' }, axv: { type: 'vec3' } },
  build: ({ e, axis, center }, f) => {
    const loc = f.getEntityLocationAndRotation(e).location
    const v0 = f._3dVectorSubtraction(loc, center)
    const vp = f._3dVectorZoom(axis, f._3dVectorDotProduct(axis, v0))
    const vPerp = f._3dVectorSubtraction(v0, vp)
    const axv = f._3dVectorCrossProduct(axis, vPerp)
    return { v0, vp, vPerp, axv }
  }
})

// 轨道单段：p_k 位置 + vel_k 速度
export const motionOrbitStep = g.defineComposite('motion_orbit_step', {
    id: 1610700022,
  inputs: {
    vp: { type: 'vec3' },
    vPerp: { type: 'vec3' },
    axv: { type: 'vec3' },
    c: { type: 'float' },
    s: { type: 'float' },
    prev: { type: 'vec3' },
    kVel: { type: 'float' }
  },
  outputs: { p: { type: 'vec3' }, vel: { type: 'vec3' } },
  build: ({ vp, vPerp, axv, c, s, prev, kVel }, f) => {
    const p = f.callComposite(mathOrbitPoint, { vp, vPerp, axv, c, s }).p
    const vel = f._3dVectorZoom(f._3dVectorSubtraction(p, prev), kVel)
    return { p, vel }
  }
})

// 两段轨道速度：返回 vel1/vel2
export const motionOrbitVelocity = g.defineComposite('motion_orbit_velocity', {
    id: 1610700023,
  inputs: { e: { type: 'entity' }, axis: { type: 'vec3' }, center: { type: 'vec3' }, kVel: { type: 'float' } },
  outputs: { vel1: { type: 'vec3' }, vel2: { type: 'vec3' } },
  build: ({ e, axis, center, kVel }, f) => {
    const prep = f.callComposite(motionOrbitPrep, { e, axis, center })
    const s1 = f.callComposite(motionOrbitStep, {
      vp: prep.vp, vPerp: prep.vPerp, axv: prep.axv,
      c: C1, s: S1, prev: prep.v0, kVel
    })
    const s2 = f.callComposite(motionOrbitStep, {
      vp: prep.vp, vPerp: prep.vPerp, axv: prep.axv,
      c: C2, s: S2, prev: s1.p, kVel
    })
    return { vel1: s1.vel, vel2: s2.vel }
  }
})

// 存储两块速度到 vels1/vels2（按块索引）
export const motionOrbitStore = g.defineComposite('motion_orbit_store', {
    id: 1610700024,
  inputs: { i: { type: 'int' }, vel1: { type: 'vec3' }, vel2: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ i, vel1, vel2 }, f) => {
    const d1 = f.registerExecNode('set_list_value', [
      f.getNodeGraphVariable('vels1').asType('vec3_list'), i, vel1
    ])
    const d2 = f.registerExecNode('set_list_value', [
      f.getNodeGraphVariable('vels2').asType('vec3_list'), i, vel2
    ])
    f.connect(d1, 0, d2, 0)
    f.outflow('done', d2, 0)
    return {}
  }
})

// 添加一段线性运动器（orbit2 用）
export const motionOrbitSegment = g.defineComposite('motion_orbit_segment', {
    id: 1610700025,
  inputs: { i: { type: 'int' }, name: { type: 'str' }, vel: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ i, name, vel }, f) => {
    const e = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('blocks').asType('entity_list'),
      i
    )
    const tail = f.registerExecNode('add_uniform_basic_linear_motion_device', [
      e,
      name,
      f.getNodeGraphVariable('segmentDuration').asType('float'),
      vel
    ])
    f.outflow('done', tail, 0)
    return {}
  }
})
