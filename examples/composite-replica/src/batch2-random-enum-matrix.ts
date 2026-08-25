// 复刻「常用复合节点大全 v1.7」资源包 —— 第二批：随机工具包 + 枚举转换包 + 矩阵运算包
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'

const randomJudge = g.defineComposite('random_judge', {
  inputs: { probability: { type: 'float' } },
  outputs: { result: { type: 'bool' } },
  forceFull: true,
  build: ({ probability }, f) => {
    const r = f.getRandomFloatingPointNumber(new float(0), new float(1))
    return { result: f.lessThanOrEqualTo(r, probability) }
  }
})

const weightedRandom = g.defineComposite('weighted_random', {
  inputs: { weights: { type: 'int_list' } },
  outputs: { index: { type: 'int' } },
  forceFull: true,
  build: ({ weights }, f) => ({
    index: f.weightedRandom(weights as any)
  })
})

const matAdd = g.defineComposite('mat_add', {
  inputs: {
    a0: { type: 'vec3' }, a1: { type: 'vec3' }, a2: { type: 'vec3' },
    b0: { type: 'vec3' }, b1: { type: 'vec3' }, b2: { type: 'vec3' }
  },
  outputs: { r0: { type: 'vec3' }, r1: { type: 'vec3' }, r2: { type: 'vec3' } },
  forceFull: true,
  build: ({ a0, a1, a2, b0, b1, b2 }, f) => ({
    r0: f._3dVectorAddition(a0, b0),
    r1: f._3dVectorAddition(a1, b1),
    r2: f._3dVectorAddition(a2, b2)
  })
})

const matSub = g.defineComposite('mat_sub', {
  inputs: {
    a0: { type: 'vec3' }, a1: { type: 'vec3' }, a2: { type: 'vec3' },
    b0: { type: 'vec3' }, b1: { type: 'vec3' }, b2: { type: 'vec3' }
  },
  outputs: { r0: { type: 'vec3' }, r1: { type: 'vec3' }, r2: { type: 'vec3' } },
  forceFull: true,
  build: ({ a0, a1, a2, b0, b1, b2 }, f) => ({
    r0: f._3dVectorSubtraction(a0, b0),
    r1: f._3dVectorSubtraction(a1, b1),
    r2: f._3dVectorSubtraction(a2, b2)
  })
})

const matScale = g.defineComposite('mat_scale', {
  inputs: {
    a0: { type: 'vec3' }, a1: { type: 'vec3' }, a2: { type: 'vec3' },
    scalar: { type: 'float' }
  },
  outputs: { r0: { type: 'vec3' }, r1: { type: 'vec3' }, r2: { type: 'vec3' } },
  forceFull: true,
  build: ({ a0, a1, a2, scalar }, f) => ({
    r0: f._3dVectorZoom(a0, scalar),
    r1: f._3dVectorZoom(a1, scalar),
    r2: f._3dVectorZoom(a2, scalar)
  })
})

const matTranspose = g.defineComposite('mat_transpose', {
  inputs: { a0: { type: 'vec3' }, a1: { type: 'vec3' }, a2: { type: 'vec3' } },
  outputs: { r0: { type: 'vec3' }, r1: { type: 'vec3' }, r2: { type: 'vec3' } },
  forceFull: true,
  build: ({ a0, a1, a2 }, f) => {
    const s0 = f.split3dVector(a0)
    const s1 = f.split3dVector(a1)
    const s2 = f.split3dVector(a2)
    return {
      r0: f.create3dVector(s0.xComponent, s1.xComponent, s2.xComponent),
      r1: f.create3dVector(s0.yComponent, s1.yComponent, s2.yComponent),
      r2: f.create3dVector(s0.zComponent, s1.zComponent, s2.zComponent)
    }
  }
})

const graph = g
  .server({ id: 1073741825, variables: {} })
  .on('whenEntityIsCreated', (_evt, f) => {
    const r = f.callComposite(randomJudge, { probability: new float(0.5) })
    f.printString(f.dataTypeConversion(r.result, 'str'))
  })

export default graph
