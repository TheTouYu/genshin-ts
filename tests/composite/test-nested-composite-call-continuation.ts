// @ts-nocheck

import assert from 'node:assert/strict'

import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { str } from '../../dist/src/runtime/value.js'

const child = g.defineComposite('continuation child', {
  outflows: ['完成'],
  build(_args, f) {
    const tail = f.registerExecNode('print_string', [new str('child')])
    f.outflow('完成', tail, 0)
    return {}
  }
})

const natural = g.defineComposite('continuation natural parent', {
  outflows: ['完成'],
  build(_args, f) {
    f.callComposite(child, {})
    const tail = f.registerExecNode('print_string', [new str('parent')])
    f.outflow('完成', tail, 0)
    return {}
  }
})

const explicit = g.defineComposite('continuation explicit parent', {
  outflows: ['完成'],
  build(_args, f) {
    const nested = f.declareDetached(child, {})
    const tail = f.node('print_string', [new str('explicit')])
    f.link(f.entry(), 0, nested)
    f.link(nested, 0, tail)
    f.outflow('完成', tail, 0)
    return {}
  }
})

g.server({ name: 'nested-composite-call-continuation', id: 1073742320 }).on(
  'whenEntityIsCreated', (_event, f) => {
    f.callComposite(natural, {})
    f.callComposite(explicit, {})
  }
)

const docs = buildServerGraphRegistriesIRDocuments({
  defaultName: 'nested-composite-call-continuation'
})
const doc = docs.at(-1)
assert.ok(doc)

const naturalDef = doc.compositeDefs?.find((def) => def.name === natural.name)
assert.ok(naturalDef)
assert.deepEqual(naturalDef.implEdges?.[2], [{ node_id: 3, source_index: 0 }])

const explicitDef = doc.compositeDefs?.find((def) => def.name === explicit.name)
assert.ok(explicitDef)
assert.deepEqual(explicitDef.implEdges?.[1], [
  { node_id: 2, source_index: 0, target_index: 0 }
])
assert.deepEqual(explicitDef.implEdges?.[2], [
  { node_id: 3, source_index: 0, target_index: 0 }
])

const mainNodes = doc.nodes ?? []
assert.equal(mainNodes.filter((node) => node.type === '__composite_call__').length, 2)
assert.deepEqual(mainNodes[0].next, [2])
assert.deepEqual(mainNodes[1].next, [3])

console.log('PASS nested composite call continuation')
