// @ts-nocheck
/**
 * P4-W3: composite call lowerer independent I/O contract.
 *
 * Pure-function contract for SysGraph identity, sparse declaration indexes,
 * capture-input skip, literal/connection classification, and OutFlow
 * compositePinIndex. Full GIA regressions remain in B2/B3/B4 + nested call fixtures.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p4w3-call-lowerer-contract.ts
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'

import {
  NodeGraph_Id_Kind,
  NodePin_Index_Kind
} from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import {
  buildCompositeCallPins,
  classifyCompositeCallBinding,
  collectCalledCompositeIds,
  COMPOSITE_CALL_LOWERER_CONTRACT,
  COMPOSITE_CALL_NODE_TYPE,
  isCompositeCallNode,
  readCompositeCallId,
  resolveCompositeCallIdentity,
  validateCompositeCallOutflowConnections
} from '../../dist/src/compiler/ir_to_gia_transform/lower_composite_call.js'

const childDef = {
  id: 9001,
  name: 'P4W3_Child',
  inputs: [
    { name: 'first', type: 'float', index: 0, pinIndex: 10, visible: true },
    { name: 'second', type: 'float', index: 1, pinIndex: 11, visible: true }
  ],
  outputs: [],
  inflows: [{ name: '执行', index: 0, pinIndex: 1, visible: true }],
  outflows: [
    { name: '完成', index: 0, pinIndex: 20, visible: true },
    { name: '失败', index: 1, pinIndex: 21, visible: true }
  ],
  implNodes: [],
  implEdges: {},
  compositePins: []
}

assert.equal(COMPOSITE_CALL_LOWERER_CONTRACT.nodeType, COMPOSITE_CALL_NODE_TYPE)
assert.equal(COMPOSITE_CALL_LOWERER_CONTRACT.graphKind, NodeGraph_Id_Kind.SysGraph)

const callNode = {
  id: 50,
  type: COMPOSITE_CALL_NODE_TYPE,
  args: [
    { type: 'int', value: 9001 },
    // sparse second-only binding + capture first input
    { type: 'float', value: 0, capture: true, compositeInputIndex: 0 },
    { type: 'float', value: 12.5, compositeInputIndex: 1 },
    // ordinary connection on a third logical slot kept sparse
    {
      type: 'conn',
      value: { node_id: 40, index: 0 },
      compositeInputIndex: 0
    }
  ]
}

// The third binding intentionally reuses declaration index 0 as a non-capture connection
// after the capture-marked slot is skipped — production IR does not emit both, but the
// lowerer must still classify each arg independently without compressing indexes.
const secondOnlyNode = {
  id: 51,
  type: COMPOSITE_CALL_NODE_TYPE,
  args: [
    { type: 'int', value: 9001 },
    { type: 'float', value: 12.5, compositeInputIndex: 1 }
  ]
}

const emptyCallNode = {
  id: 52,
  type: COMPOSITE_CALL_NODE_TYPE,
  args: [{ type: 'int', value: 9001 }]
}

const connectionCallNode = {
  id: 53,
  type: COMPOSITE_CALL_NODE_TYPE,
  args: [
    { type: 'int', value: 9001 },
    {
      type: 'conn',
      value: { node_id: 40, index: 0 },
      compositeInputIndex: 0
    }
  ]
}

assert.equal(isCompositeCallNode(callNode), true)
assert.equal(isCompositeCallNode({ id: 1, type: 'print_string' }), false)
assert.equal(readCompositeCallId(callNode), 9001)
assert.equal(readCompositeCallId({ id: 1, type: 'print_string' }), undefined)

const identity = resolveCompositeCallIdentity(
  callNode,
  new Map([[9001, childDef]])
)
assert.ok(identity)
assert.equal(identity.isCompositeCall, true)
assert.equal(identity.compositeId, 9001)
assert.equal(identity.nodeId, 9001)
assert.equal(identity.genericId.kind, NodeGraph_Id_Kind.SysGraph)
assert.equal(identity.genericId.nodeId, 9001)
assert.equal(identity.calledDef, childDef)

const captureClassified = classifyCompositeCallBinding(callNode.args[1], 1)
assert.equal(captureClassified.kind, 'capture')
assert.equal(captureClassified.inputIndex, 0)

const sparseLiteral = classifyCompositeCallBinding(secondOnlyNode.args[1], 1)
assert.equal(sparseLiteral.kind, 'literal')
assert.equal(sparseLiteral.inputIndex, 1)
assert.equal(sparseLiteral.value, 12.5)

const connection = classifyCompositeCallBinding(connectionCallNode.args[1], 1)
assert.equal(connection.kind, 'connection')
assert.equal(connection.inputIndex, 0)
assert.deepEqual(connection.upstream, { node_id: 40, index: 0 })

const sparsePins = buildCompositeCallPins({
  node: secondOnlyNode,
  calledDef: childDef,
  implEdges: {
    [secondOnlyNode.id]: [{ node_id: 99, source_index: 0, target_index: 0 }]
  },
  requiredOutflowIndexes: new Set([1]),
  requiredInflowIndexes: new Set([0])
})

const inFlows = sparsePins.pins.filter((pin) => pin.i1?.kind === NodePin_Index_Kind.InFlow)
assert.deepEqual(
  inFlows.map((pin) => pin.i1.index),
  [0],
  'a parent compositePins InFlow route must materialize the nested call InFlow'
)
assert.equal(
  inFlows[0].compositePinIndex,
  1,
  'nested call InFlow must carry the child definition InFlow pinIndex'
)

const inParams = sparsePins.pins.filter((pin) => pin.i1?.kind === NodePin_Index_Kind.InParam)
assert.equal(inParams.length, 1, 'second-only binding must emit exactly one physical InParam')
assert.equal(inParams[0].i1.index, 1, 'sparse binding must not compress into InParam[0]')
assert.equal(inParams[0].compositePinIndex, 11, 'physical pin must carry child definition pinIndex')
assert.equal(inParams[0].type, 5 /* VarType.Float */, 'child definition type must drive pin type')
assert.deepEqual(sparsePins.physicalInputIndexes, [1])
assert.deepEqual(sparsePins.captureInputIndexes, [])

const outFlows = sparsePins.pins.filter((pin) => pin.i1?.kind === NodePin_Index_Kind.OutFlow)
assert.deepEqual(
  outFlows.map((pin) => pin.i1.index).sort((a, b) => a - b),
  [0, 1],
  'OutFlow indexes must merge edges and required compositePins routes'
)
assert.equal(outFlows.find((pin) => pin.i1.index === 0)?.compositePinIndex, 20)
assert.equal(outFlows.find((pin) => pin.i1.index === 1)?.compositePinIndex, 21)

assert.doesNotThrow(() =>
  validateCompositeCallOutflowConnections(secondOnlyNode, childDef, [
    { fromId: secondOnlyNode.id, toId: 99, fromIndex: 0 }
  ])
)
const missingOutflowDef = { ...childDef, name: '二维移动控制器', outflows: [] }
assert.throws(
  () =>
    validateCompositeCallOutflowConnections(secondOnlyNode, missingOutflowDef, [
      { fromId: secondOnlyNode.id, toId: 99, fromIndex: 0 }
    ]),
  (error) => {
    assert.match(error.message, /GSTS-COMPOSITE-MISSING-OUTFLOW/)
    assert.match(error.message, /二维移动控制器/)
    assert.match(error.message, /defineComposite\(\.\.\., \{ outflows: \['完成'\]/)
    assert.match(error.message, /f\.outflow\('完成', sourceNode, sourceOutflowIndex\)/)
    assert.match(error.message, /downstream node\(s\): 99/)
    return true
  },
  'an exec composite with downstream flow must declare and bind its OutFlow'
)
assert.doesNotThrow(() =>
  validateCompositeCallOutflowConnections(secondOnlyNode, missingOutflowDef, [])
)

const missingOutflowIr = {
  ir_version: 1,
  ir_type: 'node_graph',
  graph: { name: 'missing-outflow', id: 1073741825, type: 'server', mode: 'beyond' },
  nodes: [
    {
      id: 1,
      type: 'entity_created_event',
      args: [],
      next: [{ node_id: 2, source_index: 0, target_index: 0 }]
    },
    {
      ...secondOnlyNode,
      next: [{ node_id: 3, source_index: 0, target_index: 0 }]
    },
    { id: 3, type: 'print_string', args: [{ type: 'str', value: 'after composite' }] }
  ],
  compositeDefs: [missingOutflowDef]
}
assert.throws(
  () =>
    irToGia(missingOutflowIr, {
      protoPath: join(
        process.cwd(),
        'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
      )
    }),
  /GSTS-COMPOSITE-MISSING-OUTFLOW/,
  'Stage 3 compile entry must reject the broken execution chain'
)

const emptyPins = buildCompositeCallPins({
  node: emptyCallNode,
  calledDef: childDef,
  implEdges: {}
})
assert.equal(
  emptyPins.pins.filter((pin) => pin.i1?.kind === NodePin_Index_Kind.InParam).length,
  0,
  'empty binding must not invent physical inputs'
)
assert.deepEqual(emptyPins.physicalInputIndexes, [])
assert.deepEqual(emptyPins.captureInputIndexes, [])

const capturePins = buildCompositeCallPins({
  node: {
    id: 54,
    type: COMPOSITE_CALL_NODE_TYPE,
    args: [
      { type: 'int', value: 9001 },
      { type: 'float', value: 0, capture: true, compositeInputIndex: 0 },
      { type: 'float', value: 3.5, compositeInputIndex: 1 }
    ]
  },
  calledDef: childDef,
  implEdges: {}
})
const captureInParams = capturePins.pins.filter(
  (pin) => pin.i1?.kind === NodePin_Index_Kind.InParam
)
assert.equal(captureInParams.length, 1, 'capture input must not receive a physical InParam')
assert.equal(captureInParams[0].i1.index, 1)
assert.deepEqual(capturePins.captureInputIndexes, [0])
assert.deepEqual(capturePins.physicalInputIndexes, [1])

const connPins = buildCompositeCallPins({
  node: connectionCallNode,
  calledDef: childDef,
  implEdges: {}
})
assert.equal(connPins.dataConns.length, 1)
assert.equal(connPins.dataConns[0].upstreamNodeId, 40)
assert.equal(connPins.dataConns[0].upstreamPinIndex, 0)
assert.equal(connPins.dataConns[0].pin.i1.index, 0)
assert.equal(connPins.dataConns[0].pin.compositePinIndex, 10)

assert.deepEqual(
  collectCalledCompositeIds([
    callNode,
    secondOnlyNode,
    { id: 60, type: 'print_string', args: [] },
    {
      id: 61,
      type: COMPOSITE_CALL_NODE_TYPE,
      args: [{ type: 'int', value: 9002 }]
    }
  ]),
  [9001, 9002]
)

console.log('PASS P4-W3 call lowerer pure contract')
