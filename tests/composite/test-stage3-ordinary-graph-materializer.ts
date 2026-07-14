// @ts-nocheck
import assert from 'node:assert/strict'

import { Graph, Node, Pin } from '../../dist/src/compiler/gia_vendor.js'
import { materializeOrdinaryGraphEdges } from '../../dist/src/compiler/ir_to_gia_transform/ordinary_graph_materializer.js'

const graph = new Graph('server', 0, '', 0)
const source = graph.add_node(new Node(1, 'server', 201, 200))
const target = graph.add_node(new Node(2, 'server', 201, 200))
const intTarget = graph.add_node(new Node(3, 'server', 200))
source.pins.push(new Pin(source.GenericId, 4, 1))
source.pins.at(-1).setType(source.pins.find((pin) => pin.kind === 4 && pin.index === 0).type)
target.pins.push(new Pin(target.GenericId, 3, 3))
target.pins.at(-1).setType(target.pins.find((pin) => pin.kind === 3 && pin.index === 0).type)

const nodesById = new Map([[10, source], [20, target], [30, intTarget]])

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

assert.throws(
  () => materializeOrdinaryGraphEdges({
    graph,
    nodesById,
    dataEdges: [{ fromId: 10, toId: 20, fromIndex: 9, toIndex: 0 }]
  }),
  /ordinary data edge pin missing/
)

assert.throws(
  () => materializeOrdinaryGraphEdges({
    graph,
    nodesById,
    dataEdges: [
      { fromId: 10, toId: 20, fromIndex: 0, toIndex: 0 },
      { fromId: 10, toId: 20, fromIndex: 1, toIndex: 0 }
    ]
  }),
  /ordinary data edge target is not unique/
)

assert.throws(
  () => materializeOrdinaryGraphEdges({
    graph,
    nodesById,
    dataEdges: [{ fromId: 10, toId: 30, fromIndex: 0, toIndex: 0 }]
  }),
  /ordinary data edge pin type mismatch/
)

assert.throws(
  () => materializeOrdinaryGraphEdges({
    graph,
    nodesById,
    dataEdges: [{ fromId: 10, toId: 20, fromIndex: 0, toIndex: 0 }],
    integrity: { excludedNodeIds: new Set([10]) }
  }),
  /ordinary data edge crosses excluded boundary/
)

assert.throws(
  () => materializeOrdinaryGraphEdges({
    graph,
    nodesById,
    integrity: { expectedNodeIndexes: new Map([[10, 99]]) }
  }),
  /ordinary nodeIndex mismatch/
)

console.log('PASS P3-W21 encoded ordinary Graph edge integrity contract')
