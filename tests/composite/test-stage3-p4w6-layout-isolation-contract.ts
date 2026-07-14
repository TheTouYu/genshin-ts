// @ts-nocheck
/**
 * P4-W6: composite layout isolation independent I/O contract.
 *
 * Pure-function contract for virtual anchors, capture-normalized boundaryPins
 * consumption, ordinary-only position maps and non-semantic layout options.
 * Full GIA regressions remain in nested/capture/multi-flow fixtures.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p4w6-layout-isolation-contract.ts
 */
import assert from 'node:assert/strict'

import {
  NodePin_Index_Kind
} from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'
import {
  buildCompositeLayoutVirtualGraph,
  COMPOSITE_IMPL_EXEC_LANE_SPACING_SCALE,
  COMPOSITE_INPUT_ANCHOR_TYPE,
  COMPOSITE_LAYOUT_CONTRACT,
  COMPOSITE_OUTPUT_ANCHOR_TYPE,
  computeCompositeImplLayout
} from '../../dist/src/compiler/ir_to_gia_transform/build_composite_layout.js'
import {
  DEFAULT_FIRST_ENCODED_NODE_INDEX,
  normalizeCompositeCaptures
} from '../../dist/src/compiler/ir_to_gia_transform/normalize_capture.js'

assert.equal(
  COMPOSITE_LAYOUT_CONTRACT.applicationOrder,
  'after-capture-normalization'
)
assert.equal(COMPOSITE_LAYOUT_CONTRACT.virtualAnchorsEncoded, false)
assert.equal(COMPOSITE_LAYOUT_CONTRACT.returnsOrdinaryPositionsOnly, true)
assert.equal(COMPOSITE_LAYOUT_CONTRACT.boundaryPinsSource, 'capture-normalized')
assert.equal(COMPOSITE_LAYOUT_CONTRACT.mutatesNodePinSemantics, false)
assert.equal(
  COMPOSITE_LAYOUT_CONTRACT.defaultExecLaneSpacingScale,
  COMPOSITE_IMPL_EXEC_LANE_SPACING_SCALE
)
assert.deepEqual(
  [...COMPOSITE_LAYOUT_CONTRACT.virtualAnchorTypes],
  [COMPOSITE_INPUT_ANCHOR_TYPE, COMPOSITE_OUTPUT_ANCHOR_TYPE]
)

const captureId = 10
const firstExecId = 20
const printId = 30
const dataId = 40
const callId = 50

const captureNormalized = normalizeCompositeCaptures({
  implNodes: [
    { id: captureId, type: '__composite_capture__', args: [] },
    { id: firstExecId, type: 'set_local_variable', args: [{ type: 'float', value: 1, capture: true }] },
    { id: printId, type: 'print_string', args: [] },
    { id: dataId, type: 'get_local_variable', args: [{ type: 'float', value: 0, capture: true }] },
    { id: callId, type: '__composite_call__', args: [{ type: 'int', value: 99 }] }
  ],
  implEdges: {
    [captureId]: [{ node_id: firstExecId, source_index: 0, target_index: 0 }],
    [firstExecId]: [printId]
  },
  compositePins: [
    {
      outerPinKind: NodePin_Index_Kind.InFlow,
      outerPinIndex: 0,
      innerNodeId: captureId,
      innerPinKind: NodePin_Index_Kind.InFlow,
      innerPinIndex: 0
    },
    {
      outerPinKind: NodePin_Index_Kind.InFlow,
      outerPinIndex: 1,
      innerNodeId: printId,
      innerPinKind: NodePin_Index_Kind.InFlow,
      innerPinIndex: 0
    },
    {
      outerPinKind: NodePin_Index_Kind.OutFlow,
      outerPinIndex: 0,
      innerNodeId: callId,
      innerPinKind: NodePin_Index_Kind.OutFlow,
      innerPinIndex: 1
    },
    {
      outerPinKind: NodePin_Index_Kind.InParam,
      outerPinIndex: 0,
      innerNodeId: dataId,
      innerPinKind: NodePin_Index_Kind.InParam,
      innerPinIndex: 0
    },
    {
      outerPinKind: NodePin_Index_Kind.OutParam,
      outerPinIndex: 0,
      innerNodeId: dataId,
      innerPinKind: NodePin_Index_Kind.OutParam,
      innerPinIndex: 1
    }
  ]
})

assert.equal(
  captureNormalized.ordinaryNodes.some((node) => node.type === '__composite_capture__'),
  false
)
assert.equal(
  captureNormalized.boundaryPins.find(
    (pin) => pin.outerPinKind === NodePin_Index_Kind.InFlow && pin.outerPinIndex === 0
  )?.innerNodeId,
  firstExecId,
  'layout must receive capture-redirected InFlow routes'
)

const virtualGraph = buildCompositeLayoutVirtualGraph({
  ordinaryNodes: captureNormalized.ordinaryNodes,
  ordinaryEdges: captureNormalized.ordinaryEdges,
  boundaryPins: captureNormalized.boundaryPins
})

assert.equal(virtualGraph.execLaneSpacingScale, COMPOSITE_IMPL_EXEC_LANE_SPACING_SCALE)
assert.equal(virtualGraph.virtualInputAnchors.length, 2, 'one virtual input per outer InFlow index')
assert.equal(virtualGraph.virtualOutputAnchors.length, 1, 'one virtual output per OutParam route')

const inflow0Anchor = virtualGraph.virtualInputAnchors.find((node) => node.outerPinIndex === 0)
assert.ok(inflow0Anchor, 'InFlow[0] virtual input anchor required')
assert.equal(inflow0Anchor.type, COMPOSITE_INPUT_ANCHOR_TYPE)
assert.deepEqual(inflow0Anchor.next, [
  { node_id: firstExecId, source_index: 0, target_index: 0 }
], 'InFlow[0] anchor must target capture first child, not capture placeholder')

const inflow1Anchor = virtualGraph.virtualInputAnchors.find((node) => node.outerPinIndex === 1)
assert.ok(inflow1Anchor)
assert.deepEqual(inflow1Anchor.next, [
  { node_id: printId, source_index: 0, target_index: 0 }
])

assert.equal(
  virtualGraph.layoutNodes.some((node) => node.type === '__composite_capture__'),
  false,
  'layout graph must not reintroduce capture placeholder'
)
assert.equal(
  virtualGraph.layoutNodes.filter((node) => node.type === COMPOSITE_INPUT_ANCHOR_TYPE).length,
  2
)
assert.equal(
  virtualGraph.layoutNodes.filter((node) => node.type === COMPOSITE_OUTPUT_ANCHOR_TYPE).length,
  1
)

assert.deepEqual(virtualGraph.extraDataConnections, [
  {
    fromId: dataId,
    toId: virtualGraph.virtualOutputAnchors[0].id,
    fromIndex: 1,
    toIndex: 0
  }
])
assert.deepEqual(
  virtualGraph.virtualConsumerIds,
  virtualGraph.virtualOutputAnchors.map((node) => node.id)
)

// OutFlow routes never create layout anchors; they are synthetic call / overlay concerns.
assert.equal(
  virtualGraph.virtualInputAnchors.some((anchor) =>
    anchor.next.some((edge) => edge.node_id === callId)
  ),
  false,
  'OutFlow-only call routes must not invent input anchors'
)

const layout = computeCompositeImplLayout({
  ordinaryNodes: captureNormalized.ordinaryNodes,
  ordinaryEdges: captureNormalized.ordinaryEdges,
  boundaryPins: captureNormalized.boundaryPins
})

const ordinaryIds = new Set(captureNormalized.ordinaryNodes.map((node) => node.id))
for (const nodeId of layout.positions.keys()) {
  assert.ok(ordinaryIds.has(nodeId), `position map leaked non-ordinary id ${nodeId}`)
}
for (const node of captureNormalized.ordinaryNodes) {
  assert.ok(layout.positions.has(node.id), `ordinary node ${node.id} missing layout position`)
  const pos = layout.positions.get(node.id)!
  assert.equal(typeof pos.x, 'number')
  assert.equal(typeof pos.y, 'number')
}

for (const anchor of [
  ...layout.virtualGraph.virtualInputAnchors,
  ...layout.virtualGraph.virtualOutputAnchors
]) {
  assert.equal(
    layout.positions.has(anchor.id),
    false,
    `virtual anchor ${anchor.id} must not enter materializer position map`
  )
}

// nodeIndex mapping remains independent of layout; layout must not invent remaps.
assert.equal(captureNormalized.nodeIndexMap.get(firstExecId), DEFAULT_FIRST_ENCODED_NODE_INDEX)
assert.equal(
  layout.positions.has(captureId),
  false,
  'capture placeholder must not receive layout positions after normalization'
)

// Multi InFlow same outer index shares one virtual input anchor with multiple next edges.
const multiInflowSameIndex = buildCompositeLayoutVirtualGraph({
  ordinaryNodes: [
    { id: 1, type: 'print_string', args: [] },
    { id: 2, type: 'print_string', args: [] }
  ],
  ordinaryEdges: {},
  boundaryPins: [
    {
      outerPinKind: NodePin_Index_Kind.InFlow,
      outerPinIndex: 0,
      innerNodeId: 1,
      innerPinKind: NodePin_Index_Kind.InFlow,
      innerPinIndex: 0
    },
    {
      outerPinKind: NodePin_Index_Kind.InFlow,
      outerPinIndex: 0,
      innerNodeId: 2,
      innerPinKind: NodePin_Index_Kind.InFlow,
      innerPinIndex: 0
    }
  ]
})
assert.equal(multiInflowSameIndex.virtualInputAnchors.length, 1)
assert.deepEqual(multiInflowSameIndex.virtualInputAnchors[0].next, [
  { node_id: 1, source_index: 0, target_index: 0 },
  { node_id: 2, source_index: 0, target_index: 0 }
])

console.log('PASS P4-W6 layout isolation contract')
