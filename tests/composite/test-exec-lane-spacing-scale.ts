import assert from 'node:assert/strict'

import {
  buildExecutionGraph,
  layoutPositions
} from '../../src/compiler/ir_to_gia_transform/layout.js'
import type { IRNode } from '../../src/compiler/ir_to_gia_transform/types.js'

const nodes: IRNode[] = [
  { id: 1, type: 'when_entity_is_created', args: [], next: [2, 3] },
  { id: 2, type: 'print_string', args: [{ type: 'str', value: 'upper' }] },
  {
    id: 3,
    type: 'print_string',
    args: [{ type: 'conn', value: { node_id: 4, index: 0, type: 'str' } }]
  },
  { id: 4, type: 'data_type_conversion_int_to_str', args: [{ type: 'int', value: 1 }] }
]

const graph = buildExecutionGraph(nodes)
const baseline = layoutPositions(nodes, graph)
const scaled = layoutPositions(nodes, graph, [], { execLaneSpacingScale: 0.6 })

const execIds = [...graph.execNodes]
const anchorY = Math.min(...execIds.map((id) => baseline.get(id)![1]))
for (const nodeId of execIds) {
  const [baseX, baseY] = baseline.get(nodeId)!
  const [scaledX, scaledY] = scaled.get(nodeId)!
  assert.equal(scaledX, baseX, `exec node ${nodeId} x must remain unchanged`)
  assert.equal(
    scaledY,
    anchorY + Math.round((baseY - anchorY) * 0.6),
    `exec node ${nodeId} y must use the requested lane scale`
  )
}

assert.deepEqual(scaled.get(4), baseline.get(4), 'data node position must remain unchanged')
console.log('PASS exec lane spacing scale preserves data positions')
