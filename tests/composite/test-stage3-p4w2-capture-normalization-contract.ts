// @ts-nocheck
/**
 * P4-W2: capture normalization independent I/O contract.
 *
 * Pure-function contract for filtering `__composite_capture__`, rewriting capture-source
 * edges, redirecting boundary pins, and producing deterministic nodeIndex mapping.
 * Full GIA encoding regressions remain in nested/B1 capture fixtures.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p4w2-capture-normalization-contract.ts
 */
import assert from 'node:assert/strict'

import {
  COMPOSITE_CAPTURE_NODE_TYPE,
  DEFAULT_FIRST_ENCODED_NODE_INDEX,
  encodeBoundaryPins,
  normalizeCompositeCaptures,
  ORDINARY_LOWERER_FORBIDDEN_CAPTURE
} from '../../dist/src/compiler/ir_to_gia_transform/normalize_capture.js'

const captureId = 10
const firstExecId = 20
const printId = 30
const dataId = 40

const implNodes = [
  { id: captureId, type: COMPOSITE_CAPTURE_NODE_TYPE, args: [] },
  { id: firstExecId, type: 'set_local_variable', args: [{ type: 'float', value: 1, capture: true }] },
  { id: printId, type: 'print_string', args: [{ type: 'conn', value: { node_id: dataId, index: 0 } }] },
  { id: dataId, type: 'get_local_variable', args: [{ type: 'float', value: 0, capture: true }] }
]

const implEdges = {
  [captureId]: [{ node_id: firstExecId, source_index: 0, target_index: 0 }],
  [firstExecId]: [printId]
}

const compositePins = [
  {
    outerPinKind: 1, // InFlow
    outerPinIndex: 0,
    innerNodeId: captureId,
    innerPinKind: 1,
    innerPinIndex: 0
  },
  {
    outerPinKind: 3, // InParam capture route
    outerPinIndex: 0,
    innerNodeId: dataId,
    innerPinKind: 3,
    innerPinIndex: 0
  },
  {
    outerPinKind: 4, // OutParam
    outerPinIndex: 0,
    innerNodeId: dataId,
    innerPinKind: 4,
    innerPinIndex: 1
  }
]

const normalized = normalizeCompositeCaptures({
  implNodes,
  implEdges,
  compositePins
})

assert.equal(normalized.captureNodeId, captureId)
assert.equal(normalized.captureFirstChildId, firstExecId)

assert.equal(
  normalized.ordinaryNodes.some((node) => node.type === COMPOSITE_CAPTURE_NODE_TYPE),
  false,
  'ordinaryNodes must not retain __composite_capture__'
)
assert.deepEqual(
  normalized.ordinaryNodes.map((node) => node.id),
  [firstExecId, printId, dataId]
)

assert.equal(
  normalized.ordinaryEdges[captureId],
  undefined,
  'capture-source edges must be removed for ordinary lowering'
)
assert.deepEqual(normalized.ordinaryEdges[firstExecId], [printId])
assert.equal(
  Object.keys(normalized.ordinaryEdges).includes(String(captureId)),
  false
)

const inflowRoute = normalized.boundaryPins.find(
  (pin) => pin.outerPinKind === 1 && pin.outerPinIndex === 0
)
assert.ok(inflowRoute)
assert.equal(
  inflowRoute.innerNodeId,
  firstExecId,
  'InFlow boundary route that pointed at capture must redirect to first exec child'
)

const captureDataRoute = normalized.boundaryPins.find(
  (pin) => pin.outerPinKind === 3 && pin.outerPinIndex === 0
)
assert.ok(captureDataRoute)
assert.equal(
  captureDataRoute.innerNodeId,
  dataId,
  'data capture routes already on ordinary nodes stay unchanged'
)

assert.equal(normalized.nodeIndexMap.get(firstExecId), DEFAULT_FIRST_ENCODED_NODE_INDEX)
assert.equal(normalized.nodeIndexMap.get(printId), DEFAULT_FIRST_ENCODED_NODE_INDEX + 1)
assert.equal(normalized.nodeIndexMap.get(dataId), DEFAULT_FIRST_ENCODED_NODE_INDEX + 2)
assert.equal(
  normalized.nodeIndexMap.has(captureId),
  false,
  'capture node must not receive an encoded nodeIndex'
)

const encodedPins = encodeBoundaryPins(normalized.boundaryPins, normalized.nodeIndexMap)
assert.equal(encodedPins[0].encodedInnerNodeId, DEFAULT_FIRST_ENCODED_NODE_INDEX)
assert.equal(encodedPins[1].encodedInnerNodeId, DEFAULT_FIRST_ENCODED_NODE_INDEX + 2)

// No-capture pure-data composite: normalization is identity over nodes/edges/pins.
const pure = normalizeCompositeCaptures({
  implNodes: [{ id: 1, type: 'addition', args: [] }],
  implEdges: {},
  compositePins: [
    {
      outerPinKind: 4,
      outerPinIndex: 0,
      innerNodeId: 1,
      innerPinKind: 4,
      innerPinIndex: 0
    }
  ]
})
assert.equal(pure.captureNodeId, undefined)
assert.equal(pure.captureFirstChildId, undefined)
assert.deepEqual(pure.ordinaryNodes.map((node) => node.id), [1])
assert.deepEqual(pure.ordinaryEdges, {})
assert.equal(pure.boundaryPins[0].innerNodeId, 1)
assert.equal(pure.nodeIndexMap.get(1), DEFAULT_FIRST_ENCODED_NODE_INDEX)

// Capture node without outflow edges: still filtered; pin redirect cannot invent a child.
const orphanCapture = normalizeCompositeCaptures({
  implNodes: [
    { id: 7, type: COMPOSITE_CAPTURE_NODE_TYPE, args: [] },
    { id: 8, type: 'print_string', args: [] }
  ],
  implEdges: {},
  compositePins: [
    {
      outerPinKind: 1,
      outerPinIndex: 0,
      innerNodeId: 7,
      innerPinKind: 1,
      innerPinIndex: 0
    }
  ]
})
assert.equal(orphanCapture.captureNodeId, 7)
assert.equal(orphanCapture.captureFirstChildId, undefined)
assert.deepEqual(orphanCapture.ordinaryNodes.map((node) => node.id), [8])
assert.equal(
  orphanCapture.boundaryPins[0].innerNodeId,
  7,
  'without a first child, boundary pin keeps capture id rather than inventing a target'
)

assert.deepEqual(ORDINARY_LOWERER_FORBIDDEN_CAPTURE.nodeTypes, [COMPOSITE_CAPTURE_NODE_TYPE])
assert.equal(ORDINARY_LOWERER_FORBIDDEN_CAPTURE.remainingArgField, 'capture')

console.log('PASS P4-W2 capture normalization I/O contract')
