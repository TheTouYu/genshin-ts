import assert from 'node:assert/strict'

import {
  buildClientGraphRegistriesIRDocuments,
  g
} from '../../src/runtime/core.js'
import { resetClientGraphRegistriesForTest } from '../../src/runtime/client.js'

resetClientGraphRegistriesForTest()

g.client({ type: 'skill', id: 1082130433, name: 'client-signal-ir' }).onStart((f) => {
  f.sendSignalToServerNodeGraph('信号_1', 1, 2.5, [1, 2, 3], 'literal')
})

const [document] = buildClientGraphRegistriesIRDocuments()
assert.equal(document.graph.type, 'client')
assert.equal(document.graph.client_type, 'skill')
assert.equal(document.graph.id, 1082130433)
assert.equal(document.nodes?.length, 2)
assert.deepEqual(document.nodes?.[0], {
  id: 1,
  type: 'client_graph_begins',
  next: [{ node_id: 2, target_index: 0 }]
})
assert.deepEqual(document.nodes?.[1], {
  id: 2,
  type: 'send_signal_to_server_node_graph',
  signalRef: { name: '信号_1' },
  clientValues: [
    { kind: 'literal', type: 'float', value: 1 },
    { kind: 'literal', type: 'float', value: 2.5 },
    { kind: 'literal', type: 'vec3', value: [1, 2, 3] },
    { kind: 'literal', type: 'str', value: 'literal' }
  ],
  next: []
})

assert.throws(
  () => g.client({ type: 'skill', id: 1082130433 }),
  /only one client graph may be declared/
)
assert.throws(
  () => g.server({ id: 1073741825 }),
  /cannot mix g\.server\(\) and g\.client\(\)/
)

resetClientGraphRegistriesForTest()
assert.throws(
  () => g.client({ type: 'skill', id: 1082169754 }),
  /client graph id must be an integer/
)

resetClientGraphRegistriesForTest()
g.server({ id: 1073741825 })
assert.throws(
  () => g.client({ type: 'skill', id: 1082130434 }),
  /cannot mix g\.server\(\) and g\.client\(\)/
)

console.log('Client runtime IR seam checks passed.')
