// @ts-nocheck
import assert from 'node:assert/strict'

import { Graph, Node, NodePin_Index_Kind, Pin } from '../../dist/src/compiler/gia_vendor.js'
import {
  applyEditorConnectionWireRules,
  materializeOrdinaryGraphEdges
} from '../../dist/src/compiler/ir_to_gia_transform/ordinary_graph_materializer.js'

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

const editorFlowPins = [
  {
    i1: { kind: NodePin_Index_Kind.OutFlow, index: 0 },
    i2: { kind: NodePin_Index_Kind.OutFlow, index: 0 },
    connects: []
  },
  {
    i1: { kind: NodePin_Index_Kind.OutFlow, index: 1 },
    i2: { kind: NodePin_Index_Kind.OutFlow, index: 1 },
    connects: []
  }
]
applyEditorConnectionWireRules([{ pins: editorFlowPins }])
assert.equal(editorFlowPins[0].i1.index, undefined, 'default OutFlow[0] may omit its index')
assert.equal(editorFlowPins[0].i2.index, undefined, 'default OutFlow[0] may omit its paired index')
assert.equal(editorFlowPins[1].i1.index, 1, 'non-default OutFlow[1] must retain its index')
assert.equal(editorFlowPins[1].i2.index, 1, 'non-default paired OutFlow[1] must retain its index')

console.log('PASS P3-W21 encoded ordinary Graph edge integrity contract')
