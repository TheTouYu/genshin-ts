// 回归：callComposite 字面量输入自动包装（2026-08-14 生产 bug #1）
import { g } from 'genshin-ts/runtime/core'

const scaleVec = g.defineComposite('字面量输入复合', {
  inputs: {
    v: { type: 'vec3' },
    k: { type: 'float' },
    count: { type: 'int' },
    enabled: { type: 'bool' }
  },
  outputs: {
    out: { type: 'vec3' }
  },
  build({ v, k, count, enabled }, f) {
    const scaled = f._3dVectorZoom(v, k)
    const countF = f.dataTypeConversion(count, 'float')
    const flagI = f.dataTypeConversion(enabled, 'int')
    const flagF = f.dataTypeConversion(flagI, 'float')
    return { out: f._3dVectorAddition(scaled, f._3dVectorZoom(v, f.multiplication(countF, flagF))) }
  }
})

g.server({
  name: '复合字面量输入回归',
  id: 1073741999,
  variables: {
    out: vec3([0, 0, 0]),
    items: [entity(0), entity(0)]
  }
}).on('whenEntityIsCreated', (_event, f) => {
  for (let i = 0n; i < 2n; i++) {
    const e = f.getCorrespondingValueFromList(f.getNodeGraphVariable('items').asType('entity_list'), i)
    const loc = f.getEntityLocationAndRotation(e).location
    const res = f.callComposite(scaleVec, {
      v: loc,
      k: 0.5,
      count: i,
      enabled: true
    })
    f.setNodeGraphVariable('out', res.out, false)
  }
})
