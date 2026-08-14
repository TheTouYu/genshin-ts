// @ts-nocheck
/**
 * 复合控制流 pin 完整性回归（2026-08-14 #11 系列）：
 * compositePins 的 InFlow/OutFlow 映射指向的内部节点必须存在物理 flow pin
 * （vendor 物化缺 flow pins 曾导致 outflow 不触发 + inflow 悬空）。
 * 修复后断言：flow 映射内部节点存在（编码层完整性由 materialize 补丁保证）。
 */
import assert from 'node:assert/strict'
import { g, buildServerGraphRegistriesIRDocuments } from '../../src/runtime/core.js'
import { entity, float, listLiteral, str, vec3, dictLiteral } from '../../src/runtime/value.js'

const h = g.defineComposite('flow_pin_fixture', {
  inputs: { e: { type: 'entity' }, v: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, v }, f) => {
    const tail = f.registerExecNode('add_uniform_basic_linear_motion_device', [
      e, new str('m1'), new float(0.2), v
    ])
    f.outflow('done', tail, 0)
    return {}
  }
})
g.server({ id: 1073741825, variables: { lock: false, blocks: new listLiteral('entity', []), axes: new dictLiteral([{ k: 1, v: [0, 0, 0] }]) } }).on('whenTabIsSelected', (_evt, f) => {
  f.callComposite(h, { e: new entity(0), v: new vec3([1, 0, 0]) })
})
const docs = buildServerGraphRegistriesIRDocuments()
const cd = docs[0].compositeDefs.find((c) => c.name === 'flow_pin_fixture')
assert.ok(cd, 'composite def exists')
const flowMaps = cd.compositePins.filter((cp) => cp.outerPinKind === 1 || cp.outerPinKind === 2)
assert.ok(flowMaps.length >= 2, 'fixture has inflow+outflow maps')
for (const cp of flowMaps) {
  const inner = cd.implNodes.find((n) => n.id === cp.innerNodeId)
  assert.ok(inner, 'inner node exists for flow map')
}
console.log('composite flow pin integrity fixture: PASS')
console.log('  flowMaps=' + flowMaps.length)
