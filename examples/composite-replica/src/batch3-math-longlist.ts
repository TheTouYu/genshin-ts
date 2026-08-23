// 复现「rubik 项目抽象出的通用复合」—— 第三批：数学/几何 + 长列表工具
// 目的：验证从魔方项目提取的 A 类通用复合能脱离魔方状态独立编译。
// 来源：examples/rubik-3x3/src/composites/math.ts + list.ts（2x2 的 gsts_* 同名版本逻辑完全一致）
import { g } from 'genshin-ts/runtime/core'

const DEG2RAD = 0.017453292519943295

// math_rotate_vec：罗德里格斯旋转 v' = (u·v)u + (v−(u·v)u)c + (u×v)s
const mathRotateVec = g.defineComposite('math_rotate_vec', {
  inputs: { v: { type: 'vec3' }, u: { type: 'vec3' }, c: { type: 'float' }, s: { type: 'float' } },
  outputs: { out: { type: 'vec3' } },
  forceFull: true,
  build: ({ v, u, c, s }, f) => {
    const vp = f._3dVectorZoom(u, f._3dVectorDotProduct(u, v))
    const out = f._3dVectorAddition(
      f._3dVectorAddition(vp, f._3dVectorZoom(f._3dVectorSubtraction(v, vp), c)),
      f._3dVectorZoom(f._3dVectorCrossProduct(u, v), s)
    )
    return { out }
  }
})

// math_orbit_point：轨道段位置 p = vp + vPerp·c + axv·s
const mathOrbitPoint = g.defineComposite('math_orbit_point', {
  inputs: {
    vp: { type: 'vec3' }, vPerp: { type: 'vec3' }, axv: { type: 'vec3' },
    c: { type: 'float' }, s: { type: 'float' }
  },
  outputs: { p: { type: 'vec3' } },
  forceFull: true,
  build: ({ vp, vPerp, axv, c, s }, f) => ({
    p: f._3dVectorAddition(vp, f._3dVectorAddition(f._3dVectorZoom(vPerp, c), f._3dVectorZoom(axv, s)))
  })
})

// math_local_axis_rot：单轴局部旋转（调 rotate_vec）
const mathLocalAxisRot = g.defineComposite('math_local_axis_rot', {
  inputs: { v: { type: 'vec3' }, angle: { type: 'float' }, u: { type: 'vec3' } },
  outputs: { out: { type: 'vec3' } },
  forceFull: true,
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

// math_spin_axis_triple：三轴局部旋转（Y→X→Z）
const mathSpinAxisTriple = g.defineComposite('math_spin_axis_triple', {
  inputs: { v: { type: 'vec3' }, rot: { type: 'vec3' } },
  outputs: { out: { type: 'vec3' } },
  forceFull: true,
  build: ({ v, rot }, f) => {
    const v1 = f.callComposite(mathLocalAxisRot, { v, angle: rot.y, u: f.create3dVector(0, 1, 0) }).out
    const v2 = f.callComposite(mathLocalAxisRot, { v: v1, angle: rot.x, u: f.create3dVector(1, 0, 0) }).out
    const out = f.callComposite(mathLocalAxisRot, { v: v2, angle: rot.z, u: f.create3dVector(0, 0, 1) }).out
    return { out }
  }
})

// long_list_get_int：从 3 段 int_list 拼接的长列表按下标取 int（乘法选择器）
const longListGetInt = g.defineComposite('long_list_get_int', {
  inputs: {
    i: { type: 'int' }, chunkSize: { type: 'int' },
    c0: { type: 'int_list' }, c1: { type: 'int_list' }, c2: { type: 'int_list' }
  },
  outputs: { out: { type: 'int' } },
  forceFull: true,
  build: ({ i, chunkSize, c0, c1, c2 }, f) => {
    const chunk = f.division(i, chunkSize)
    const offset = f.subtraction(i, f.multiplication(chunk, chunkSize))
    const sel0 = f.dataTypeConversion(f.equal(chunk, 0n), 'int')
    const sel1 = f.dataTypeConversion(f.equal(chunk, 1n), 'int')
    const sel2 = f.dataTypeConversion(f.equal(chunk, 2n), 'int')
    const v0 = f.multiplication(f.getCorrespondingValueFromList(c0, offset), sel0)
    const v1 = f.multiplication(f.getCorrespondingValueFromList(c1, offset), sel1)
    const v2 = f.multiplication(f.getCorrespondingValueFromList(c2, offset), sel2)
    const out = f.addition(v0, f.addition(v1, v2))
    return { out }
  }
})

const graph = g
  .server({ id: 1073741825, variables: {} })
  .on('whenEntityIsCreated', (_evt, f) => {
    const rot = f.callComposite(mathSpinAxisTriple, {
      v: f.create3dVector(1, 0, 0),
      rot: f.create3dVector(90, 0, 0)
    })
    f.printString(f.dataTypeConversion(rot.out.x, 'str'))
  })

export default graph
