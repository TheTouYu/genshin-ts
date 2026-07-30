// @ts-nocheck
/**
 * Stage 3 must not return a partially encoded GIA when one Composite accessory fails.
 *
 * Run after `npm run build`:
 *   npx tsx tests/composite/test-stage3-composite-accessory-fail-fast.ts
 *   GSTS_STAGE3_VENDOR_IMPL_GRAPH=0 \
 *     npx tsx tests/composite/test-stage3-composite-accessory-fail-fast.ts
 */

import assert from 'node:assert/strict'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { resolveStage3ImplBackend } from '../../dist/src/compiler/ir_to_gia_transform/stage3_backend.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

const valid = {
  name: 'FailFast_Valid_GSTS',
  id: 1610700990,
  type: 'composite',
  inflows: [],
  outflows: [],
  inputs: [],
  outputs: [],
  implNodes: [],
  implEdges: {},
  compositePins: []
}

const invalid = {
  name: 'FailFast_UnsupportedNode_GSTS',
  id: 1610700991,
  type: 'composite',
  inflows: [{ name: '', visible: true, index: 0, pinIndex: 1 }],
  outflows: [{ name: 'complete', visible: true, index: 0, pinIndex: 2 }],
  inputs: [],
  outputs: [],
  implNodes: [{ id: 1, type: '__unsupported_accessory_test_node__', args: [] }],
  implEdges: {},
  compositePins: [
    {
      outerPinKind: 1,
      outerPinIndex: 0,
      innerNodeId: 1,
      innerPinKind: 1,
      innerPinIndex: 0
    },
    {
      outerPinKind: 2,
      outerPinIndex: 0,
      innerNodeId: 1,
      innerPinKind: 2,
      innerPinIndex: 0
    }
  ]
}

const ir = {
  ir_version: 1,
  ir_type: 'node_graph',
  graph: {
    name: 'composite-accessory-fail-fast',
    id: 1073742470,
    type: 'server',
    mode: 'beyond'
  },
  nodes: [{ id: 1, type: 'when_entity_is_created' }],
  compositeDefs: [valid, invalid]
}

const backend = resolveStage3ImplBackend().backend

assert.throws(
  () =>
    irToGia(ir, {
      graphId: ir.graph.id,
      name: ir.graph.name,
      protoPath: PROTO_PATH
    }),
  (error) => {
    assert.match(error.message, /GSTS-COMPOSITE-ACCESSORY-BUILD-FAILED/)
    assert.match(error.message, /FailFast_UnsupportedNode_GSTS/)
    assert.match(error.message, /unsupported_accessory_test_node/)
    return true
  },
  'Stage 3 must fail instead of returning a GIA with only the valid Composite accessories'
)

console.log(`PASS Composite accessory failure is fail-fast (${backend})`)
