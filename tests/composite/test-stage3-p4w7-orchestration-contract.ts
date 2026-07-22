// @ts-nocheck
/**
 * P4-W7: composite.ts orchestration / Phase 4 exit contract.
 *
 * Asserts boundary pipeline ownership, ordinary pin builder free of
 * capture/call node branches, and production accessories still emit
 * definition + impl GraphUnit pairs with compositePins overlay.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p4w7-orchestration-contract.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  GraphUnit_Which,
  NodeGraph_Id_Kind,
  NodePin_Index_Kind
} from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'
import {
  buildCompositeAccessories,
  COMPOSITE_ORCHESTRATION_CONTRACT
} from '../../dist/src/compiler/ir_to_gia_transform/composite.js'
import {
  COMPOSITE_CAPTURE_NODE_TYPE
} from '../../dist/src/compiler/ir_to_gia_transform/normalize_capture.js'
import {
  COMPOSITE_CALL_NODE_TYPE
} from '../../dist/src/compiler/ir_to_gia_transform/lower_composite_call.js'

assert.deepEqual(
  [...COMPOSITE_ORCHESTRATION_CONTRACT.pipeline],
  [
    'normalize_capture',
    'resolve_ordinary_and_call',
    'layout',
    'materialize',
    'definition_interface',
    'composite_pins_overlay'
  ]
)
assert.equal(
  COMPOSITE_ORCHESTRATION_CONTRACT.boundaryModules.capture,
  'normalize_capture.ts'
)
assert.equal(
  COMPOSITE_ORCHESTRATION_CONTRACT.boundaryModules.call,
  'lower_composite_call.ts'
)
assert.equal(
  COMPOSITE_ORCHESTRATION_CONTRACT.boundaryModules.definition,
  'build_composite_definition.ts'
)
assert.equal(
  COMPOSITE_ORCHESTRATION_CONTRACT.boundaryModules.compositePins,
  'build_composite_pins.ts'
)
assert.equal(
  COMPOSITE_ORCHESTRATION_CONTRACT.boundaryModules.layout,
  'build_composite_layout.ts'
)
assert.deepEqual(
  [...COMPOSITE_ORCHESTRATION_CONTRACT.ordinaryPinBuilderForbiddenNodeTypes],
  [COMPOSITE_CAPTURE_NODE_TYPE, COMPOSITE_CALL_NODE_TYPE]
)
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.ordinaryArgCaptureSkip, true)
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.defaultVendorImplGraphGate, true)
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.legacyOrdinaryBackendPresent, true)

const sourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/compiler/ir_to_gia_transform/composite.ts'
)
const source = readFileSync(sourcePath, 'utf8')

// Locate ordinary pin builder body and assert no nested call/capture node branches.
const builderStart = source.indexOf('function buildImplNodePins(')
assert.ok(builderStart >= 0, 'buildImplNodePins must exist')
const builderEnd = source.indexOf('\nfunction isDataProducerNode(', builderStart)
assert.ok(builderEnd > builderStart, 'buildImplNodePins body bounds')
const builderBody = source.slice(builderStart, builderEnd)

assert.match(
  builderBody,
  /ordinary impl pin builder received boundary node/,
  'ordinary pin builder must reject boundary node types'
)
assert.equal(
  /if \(isCompositeCallNode\(node\)\) \{[\s\S]*buildCompositeCallPins/.test(builderBody),
  false,
  'ordinary pin builder must not re-implement call lowerer'
)
assert.equal(
  /if \(node\.type !== ['"]__composite_capture__['"]\)/.test(builderBody),
  false,
  'ordinary pin builder must not wrap body in capture-node skip'
)
// Arg-level capture skip remains allowed and required for physical pin holes.
assert.match(builderBody, /capture === true/)

// Orchestration still wires every boundary module.
for (const marker of [
  'normalizeCompositeCaptures',
  'buildCompositeCallPins',
  'buildCompositeDefinitionInterface',
  'buildCompositePinsOverlay',
  'computeCompositeImplLayout'
]) {
  assert.match(source, new RegExp(marker), `orchestration must call ${marker}`)
}

const childId = 9107
const parentId = 9108
const child = {
  id: childId,
  name: 'P4W7_Child',
  inputs: [{ name: 'value', type: 'float', index: 0, pinIndex: 10, visible: true }],
  outputs: [{ name: 'result', type: 'float', index: 0, pinIndex: 20, visible: true }],
  inflows: [{ name: '执行', index: 0, pinIndex: 1, visible: true }],
  outflows: [{ name: '完成', index: 0, pinIndex: 2, visible: true }],
  implNodes: [
    { id: 1, type: '__composite_capture__', args: [] },
    {
      id: 2,
      type: 'set_local_variable',
      args: [
        { type: 'str', value: 'tmp' },
        { type: 'float', value: 0, capture: true }
      ]
    },
    {
      id: 3,
      type: 'get_local_variable',
      args: [{ type: 'str', value: 'tmp' }]
    }
  ],
  implEdges: {
    1: [{ node_id: 2, source_index: 0, target_index: 0 }]
  },
  compositePins: [
    {
      outerPinKind: NodePin_Index_Kind.InFlow,
      outerPinIndex: 0,
      innerNodeId: 1,
      innerPinKind: NodePin_Index_Kind.InFlow,
      innerPinIndex: 0
    },
    {
      outerPinKind: NodePin_Index_Kind.InParam,
      outerPinIndex: 0,
      innerNodeId: 2,
      innerPinKind: NodePin_Index_Kind.InParam,
      innerPinIndex: 1
    },
    {
      outerPinKind: NodePin_Index_Kind.OutParam,
      outerPinIndex: 0,
      innerNodeId: 3,
      innerPinKind: NodePin_Index_Kind.OutParam,
      innerPinIndex: 1
    },
    {
      outerPinKind: NodePin_Index_Kind.OutFlow,
      outerPinIndex: 0,
      innerNodeId: 2,
      innerPinKind: NodePin_Index_Kind.OutFlow,
      innerPinIndex: 0
    }
  ],
  implVariables: [{ name: 'tmp', type: 'float' }]
}

const parent = {
  id: parentId,
  name: 'P4W7_Parent',
  inputs: [{ name: 'in', type: 'float', index: 0, pinIndex: 10, visible: true }],
  outputs: [],
  inflows: [{ name: '执行', index: 0, pinIndex: 1, visible: true }],
  outflows: [{ name: '完成', index: 0, pinIndex: 2, visible: true }],
  implNodes: [
    { id: 11, type: '__composite_capture__', args: [] },
    {
      id: 12,
      type: '__composite_call__',
      args: [
        { type: 'int', value: childId },
        { type: 'float', value: 0, capture: true, compositeInputIndex: 0 }
      ]
    }
  ],
  implEdges: {
    11: [{ node_id: 12, source_index: 0, target_index: 0 }]
  },
  compositePins: [
    {
      outerPinKind: NodePin_Index_Kind.InFlow,
      outerPinIndex: 0,
      innerNodeId: 11,
      innerPinKind: NodePin_Index_Kind.InFlow,
      innerPinIndex: 0
    },
    {
      outerPinKind: NodePin_Index_Kind.InParam,
      outerPinIndex: 0,
      innerNodeId: 12,
      innerPinKind: NodePin_Index_Kind.InParam,
      innerPinIndex: 0
    },
    {
      outerPinKind: NodePin_Index_Kind.OutFlow,
      outerPinIndex: 0,
      innerNodeId: 12,
      innerPinKind: NodePin_Index_Kind.OutFlow,
      innerPinIndex: 0
    }
  ]
}

const defs = new Map([
  [childId, child],
  [parentId, parent]
])

const childUnits = buildCompositeAccessories(child, defs)
assert.equal(childUnits.length, 2)
assert.equal(childUnits[0].which, GraphUnit_Which.CompositeGraph)
assert.equal(childUnits[1].which, GraphUnit_Which.EntityNode)
const childImpl = childUnits[1].graph?.inner?.graph
assert.ok(childImpl)
assert.equal(
  childImpl.nodes.some((node) => node.genericId?.kind === NodeGraph_Id_Kind.SysGraph),
  false,
  'capture-only child must not encode synthetic SysGraph call nodes'
)
assert.ok((childImpl.compositePins ?? []).length >= 3)

const parentUnits = buildCompositeAccessories(parent, defs)
assert.equal(parentUnits.length, 2)
const parentImpl = parentUnits[1].graph?.inner?.graph
assert.ok(parentImpl)
const callNode = parentImpl.nodes.find(
  (node) => node.genericId?.kind === NodeGraph_Id_Kind.SysGraph
)
assert.ok(callNode, 'parent must encode synthetic composite call')
assert.equal(callNode.genericId?.nodeId, childId)
// Capture-marked call input must not materialize physical InParam[0]
const callInParams = (callNode.pins ?? []).filter(
  (pin) => pin.i1?.kind === NodePin_Index_Kind.InParam
)
assert.equal(
  callInParams.some((pin) => pin.i1?.index === 0),
  false,
  'capture-bound call input must skip physical InParam'
)
assert.ok((parentImpl.compositePins ?? []).length >= 2)
assert.equal(
  process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH === '1',
  false,
  'focused orchestration contract runs on default shared backend'
)

console.log('P4-W7 orchestration contract: PASS')
