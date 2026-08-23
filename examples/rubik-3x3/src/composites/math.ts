// 数学/几何复合（纯数据）
// 命名前缀：math_*
import { g } from 'genshin-ts/runtime/core'

const DEG2RAD = 0.017453292519943295 // π/180

// 罗德里格斯：v 绕单位轴 u 旋转 θ（c=cosθ, s=sinθ）
export const mathRotateVec = g.defineComposite('math_rotate_vec', {
    id: 1610700016,
  inputs: { v: { type: 'vec3' }, u: { type: 'vec3' }, c: { type: 'float' }, s: { type: 'float' } },
  outputs: { out: { type: 'vec3' } },
  build: ({ v, u, c, s }, f) => {
    const vp = f._3dVectorZoom(u, f._3dVectorDotProduct(u, v))
    const out = f._3dVectorAddition(
      f._3dVectorAddition(vp, f._3dVectorZoom(f._3dVectorSubtraction(v, vp), c)),
      f._3dVectorZoom(f._3dVectorCrossProduct(u, v), s)
    )
    return { out }
  }
})

// 轨道段位置：p_k = vp + vPerp·c + axv·s
export const mathOrbitPoint = g.defineComposite('math_orbit_point', {
    id: 1610700017,
  inputs: {
    vp: { type: 'vec3' },
    vPerp: { type: 'vec3' },
    axv: { type: 'vec3' },
    c: { type: 'float' },
    s: { type: 'float' }
  },
  outputs: { p: { type: 'vec3' } },
  build: ({ vp, vPerp, axv, c, s }, f) => {
    const p = f._3dVectorAddition(vp, f._3dVectorAddition(f._3dVectorZoom(vPerp, c), f._3dVectorZoom(axv, s)))
    return { p }
  }
})

// 单轴局部旋转：v 绕 u 旋转 angle（deg）
export const mathLocalAxisRot = g.defineComposite('math_local_axis_rot', {
    id: 1610700018,
  inputs: { v: { type: 'vec3' }, angle: { type: 'float' }, u: { type: 'vec3' } },
  outputs: { out: { type: 'vec3' } },
  build: ({ v, angle, u }, f) => {
    const rad = f.multiplication(angle, DEG2RAD)
    const out = f.callComposite(mathRotateVec, {
      v, u,
      c: f.cosineFunction(rad),
      s: f.multiplication(f.sineFunction(rad), -1)
    }).out
    return { out }
  }
})

// 三轴局部旋转：Y→X→Z 依次把世界轴转进块局部系
export const mathSpinAxisTriple = g.defineComposite('math_spin_axis_triple', {
    id: 1610700019,
  inputs: { v: { type: 'vec3' }, rot: { type: 'vec3' } },
  outputs: { out: { type: 'vec3' } },
  build: ({ v, rot }, f) => {
    const v1 = f.callComposite(mathLocalAxisRot, { v, angle: rot.y, u: f.create3dVector(0, 1, 0) }).out
    const v2 = f.callComposite(mathLocalAxisRot, { v: v1, angle: rot.x, u: f.create3dVector(1, 0, 0) }).out
    const out = f.callComposite(mathLocalAxisRot, { v: v2, angle: rot.z, u: f.create3dVector(0, 0, 1) }).out
    return { out }
  }
})
