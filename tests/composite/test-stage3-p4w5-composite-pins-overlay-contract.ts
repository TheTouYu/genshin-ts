// @ts-nocheck
/**
 * P4-W5: compositePins overlay independent I/O contract.
 *
 * Pure-function contract for nodeIndex remap, protobuf CompositePin materialization,
 * outer/inner integrity checks and capture-route preservation. Full GIA regressions
 * remain in nested/capture/sparse/multi-flow fixtures.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p4w5-composite-pins-overlay-contract.ts
 */
import assert from 'node:assert/strict'

import {
  NodePin_Index_Kind
} from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'
import {
  assertCompositePinsIntegrity,
  buildCompositePinsOverlay,
  COMPOSITE_PINS_OVERLAY_CONTRACT,
  materializeCompositePin
} from '../../dist/src/compiler/ir_to_gia_transform/build_composite_pins.js'
import {
  DEFAULT_FIRST_ENCODED_NODE_INDEX,
  encodeBoundaryPins,
  normalizeCompositeCaptures
} from '../../dist/src/compiler/ir_to_gia_transform/normalize_capture.js'

assert.equal(
  COMPOSITE_PINS_OVERLAY_CONTRACT.applicationOrder,
  'after-materialization'
)
assert.equal(COMPOSITE_PINS_OVERLAY_CONTRACT.innerPin2MirrorsInnerPin, true)
assert.equal(COMPOSITE_PINS_OVERLAY_CONTRACT.productionDefaultPhysicalPins, false)
assert.deepEqual(
  [...COMPOSITE_PINS_OVERLAY_CONTRACT.integrityChecks],
  [
    'outer-definition-pin-exists',
    'inner-encoded-node-exists',
    'inner-node-pin-exists',
    'kind-index-alignment',
    'node-index-map-alignment',
    'no-duplicate-physical-route'
  ]
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

const definition = {
  inflows: [{ index: 0 }, { index: 1 }],
  outflows: [{ index: 0 }],
  inputs: [{ index: 0 }],
  outputs: [{ index: 0 }]
}

const encodedNodes = [
  {
    nodeIndex: DEFAULT_FIRST_ENCODED_NODE_INDEX,
    pins: [{ i1: { kind: NodePin_Index_Kind.InFlow, index: 0 } }]
  },
  {
    nodeIndex: DEFAULT_FIRST_ENCODED_NODE_INDEX + 1,
    pins: [{ i1: { kind: NodePin_Index_Kind.InFlow, index: 0 } }]
  },
  {
    nodeIndex: DEFAULT_FIRST_ENCODED_NODE_INDEX + 2,
    pins: [
      { i1: { kind: NodePin_Index_Kind.InParam, index: 0 } },
      { i1: { kind: NodePin_Index_Kind.OutParam, index: 1 } }
    ]
  },
  {
    nodeIndex: DEFAULT_FIRST_ENCODED_NODE_INDEX + 3,
    pins: [{ i1: { kind: NodePin_Index_Kind.OutFlow, index: 1 } }]
  }
]

const overlay = buildCompositePinsOverlay({
  boundaryPins: captureNormalized.boundaryPins,
  nodeIndexMap: captureNormalized.nodeIndexMap,
  definition,
  encodedNodes
})

assert.equal(overlay.encodedBoundaryPins.length, 5)
assert.equal(overlay.compositePins.length, 5)

// Capture InFlow redirect + nodeIndex remap (capture id 10 → first exec → encoded 2).
assert.equal(overlay.encodedBoundaryPins[0].innerNodeId, firstExecId)
assert.equal(overlay.encodedBoundaryPins[0].encodedInnerNodeId, DEFAULT_FIRST_ENCODED_NODE_INDEX)
assert.deepEqual(overlay.compositePins[0], {
  outerPin: { kind: NodePin_Index_Kind.InFlow, index: 0 },
  innerNodeId: DEFAULT_FIRST_ENCODED_NODE_INDEX,
  innerPin: { kind: NodePin_Index_Kind.InFlow, index: 0 },
  innerPin2: { kind: NodePin_Index_Kind.InFlow, index: 0 }
})

// Multi-InFlow second branch keeps its own outer index and remapped print target.
assert.equal(overlay.compositePins[1].outerPin.index, 1)
assert.equal(overlay.compositePins[1].innerNodeId, DEFAULT_FIRST_ENCODED_NODE_INDEX + 1)

// Nested call OutFlow route remaps callId and keeps inner OutFlow index 1.
assert.equal(overlay.compositePins[2].outerPin.kind, NodePin_Index_Kind.OutFlow)
assert.equal(overlay.compositePins[2].innerNodeId, DEFAULT_FIRST_ENCODED_NODE_INDEX + 3)
assert.equal(overlay.compositePins[2].innerPin.index, 1)
assert.deepEqual(
  overlay.compositePins[2].innerPin2,
  overlay.compositePins[2].innerPin,
  'innerPin2 must mirror innerPin'
)

// Capture data route.
assert.equal(overlay.compositePins[3].outerPin.kind, NodePin_Index_Kind.InParam)
assert.equal(overlay.compositePins[3].innerNodeId, DEFAULT_FIRST_ENCODED_NODE_INDEX + 2)
assert.equal(overlay.compositePins[3].innerPin.kind, NodePin_Index_Kind.InParam)

// OutParam route.
assert.equal(overlay.compositePins[4].outerPin.kind, NodePin_Index_Kind.OutParam)
assert.equal(overlay.compositePins[4].innerPin.index, 1)

// encodeBoundaryPins remains the shared remap helper; overlay materializes protobuf shape.
const remapped = encodeBoundaryPins(
  captureNormalized.boundaryPins,
  captureNormalized.nodeIndexMap
)
assert.deepEqual(
  remapped.map((entry) => entry.encodedInnerNodeId),
  overlay.encodedBoundaryPins.map((entry) => entry.encodedInnerNodeId)
)
assert.deepEqual(
  materializeCompositePin(remapped[0]),
  overlay.compositePins[0]
)

// Pure encode without definition/nodes still works.
const pure = buildCompositePinsOverlay({
  boundaryPins: [
    {
      outerPinKind: NodePin_Index_Kind.OutParam,
      outerPinIndex: 0,
      innerNodeId: 1,
      innerPinKind: NodePin_Index_Kind.OutParam,
      innerPinIndex: 0
    }
  ],
  nodeIndexMap: new Map([[1, 2]])
})
assert.equal(pure.compositePins[0].innerNodeId, 2)
assert.deepEqual(pure.compositePins[0].innerPin2, pure.compositePins[0].innerPin)

// Integrity: missing outer definition index.
assert.throws(
  () => assertCompositePinsIntegrity(
    [{
      outerPinKind: NodePin_Index_Kind.InParam,
      outerPinIndex: 9,
      innerNodeId: dataId,
      innerPinKind: NodePin_Index_Kind.InParam,
      innerPinIndex: 0,
      encodedInnerNodeId: DEFAULT_FIRST_ENCODED_NODE_INDEX + 2
    }],
    { definition, encodedNodes }
  ),
  /outer pin missing on definition/
)

// Integrity: missing encoded inner node.
assert.throws(
  () => assertCompositePinsIntegrity(
    [{
      outerPinKind: NodePin_Index_Kind.InParam,
      outerPinIndex: 0,
      innerNodeId: 999,
      innerPinKind: NodePin_Index_Kind.InParam,
      innerPinIndex: 0,
      encodedInnerNodeId: 999
    }],
    { definition, encodedNodes }
  ),
  /inner encoded node missing/
)

// Production default does not require physical pins (intentional holes).
assert.doesNotThrow(() => assertCompositePinsIntegrity(
  [{
    outerPinKind: NodePin_Index_Kind.OutParam,
    outerPinIndex: 0,
    innerNodeId: dataId,
    innerPinKind: NodePin_Index_Kind.OutParam,
    innerPinIndex: 9,
    encodedInnerNodeId: DEFAULT_FIRST_ENCODED_NODE_INDEX + 2
  }],
  { definition, encodedNodes }
))

// Opt-in physical pin check.
assert.throws(
  () => assertCompositePinsIntegrity(
    [{
      outerPinKind: NodePin_Index_Kind.OutParam,
      outerPinIndex: 0,
      innerNodeId: dataId,
      innerPinKind: NodePin_Index_Kind.OutParam,
      innerPinIndex: 9,
      encodedInnerNodeId: DEFAULT_FIRST_ENCODED_NODE_INDEX + 2
    }],
    { definition, encodedNodes, requirePhysicalPins: true }
  ),
  /inner pin missing on encoded node/
)

// Integrity: duplicate physical route.
assert.throws(
  () => assertCompositePinsIntegrity(
    [
      {
        outerPinKind: NodePin_Index_Kind.InParam,
        outerPinIndex: 0,
        innerNodeId: dataId,
        innerPinKind: NodePin_Index_Kind.InParam,
        innerPinIndex: 0,
        encodedInnerNodeId: DEFAULT_FIRST_ENCODED_NODE_INDEX + 2
      },
      {
        outerPinKind: NodePin_Index_Kind.InParam,
        outerPinIndex: 0,
        innerNodeId: dataId,
        innerPinKind: NodePin_Index_Kind.InParam,
        innerPinIndex: 0,
        encodedInnerNodeId: DEFAULT_FIRST_ENCODED_NODE_INDEX + 2
      }
    ],
    { definition, encodedNodes }
  ),
  /duplicate physical route/
)

// Non-strict mode records the same inputs without throwing.
assert.doesNotThrow(() => assertCompositePinsIntegrity(
  [{
    outerPinKind: NodePin_Index_Kind.InParam,
    outerPinIndex: 9,
    innerNodeId: 999,
    innerPinKind: NodePin_Index_Kind.InParam,
    innerPinIndex: 7,
    encodedInnerNodeId: 999
  }],
  { definition, encodedNodes, strictIntegrity: false }
))

console.log('PASS P4-W5 compositePins overlay I/O contract')
