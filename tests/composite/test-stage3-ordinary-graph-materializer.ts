// @ts-nocheck
import assert from 'node:assert/strict'

import { Graph, Node } from '../../dist/src/compiler/gia_vendor.js'
import { materializeOrdinaryGraphEdges } from '../../dist/src/compiler/ir_to_gia_transform/ordinary_graph_materializer.js'

const graph = new Graph('server', 0, '', 0)
const source = graph.add_node(new Node(1, 'server', 201, 200))
const target = graph.add_node(new Node(2, 'server', 201, 200))
const nodesById = new Map([[10, source], [20, target]])

materializeOrdinaryGraphEdges({
  graph,
  nodesById,
  dataEdges: [{ fromId: 10, toId: 20, fromIndex: 0, toIndex: 1 }],
  flowEdges: [{ fromId: 10, toId: 20, fromIndex: 0, toIndex: 0 }],
  mapOutputIndex: (_nodeId, pinIndex) => pinIndex + 1,
  mapInputIndex: (_nodeId, pinIndex) => pinIndex + 2,
  flowInsertPosition: () => 0
})

assert.deepEqual(
  graph.get_connect(source, target, 1, 3)?.to_index,
  3,
  'shared materializer must apply physical pin mappings once'
)
assert.deepEqual(
  graph.get_flow(source, target, 1, 2)?.to_index,
  2,
  'shared materializer must apply mapped flow pin indexes'
)

assert.throws(
  () => materializeOrdinaryGraphEdges({
    graph,
    nodesById,
    dataEdges: [{ fromId: 99, toId: 20, fromIndex: 0, toIndex: 0 }]
  }),
  /ordinary data edge endpoint missing/
)

console.log('PASS P3-W20 shared ordinary Graph edge materializer contract')
