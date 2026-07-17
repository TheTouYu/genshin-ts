import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import protobuf from 'protobufjs'

import {
  clientBindingPin,
  clientBoolValue,
  clientDataPin,
  clientFloatValue,
  clientIdValue,
  clientIntValue,
  clientLegacyNode,
  clientLegacySkillGraph,
  clientOutflowPin,
  ClientVarType,
  NodePin_Index_Kind,
  wrap_gia
} from '../../src/compiler/gia_vendor.js'

const protoPath = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const root = new protobuf.Root().loadSync(protoPath, { keepCase: true })
const rootMessage = root.lookupType('Root')

const doubleBranchShellId = 200056
const doubleBranchKernelId = 2000

/**
 * Build a skill graph fixture:
 *   Node Graph Begins → Double Branch
 *     ├─ True (shell 0 / kernel 1) → Play Timed Effects A (position [10,0,0])
 *     └─ False (shell 1 / kernel 2) → Play Timed Effects B (position [-10,0,0])
 */
function buildGraph(graphId, condition, graphName) {
  return clientLegacySkillGraph({
    graphId,
    graphName,
    filePath: `110170759-1784280000-1073741848-\\gsts-双分支-${condition}.gia`,
    gameVersion: '6.7.0',
    nodes: [
      clientLegacyNode({
        nodeIndex: 1,
        shellId: 200042,
        kernelId: 2001,
        pins: [clientOutflowPin(2)],
        contextDeclaration: { kind: NodePin_Index_Kind.ClientSignal, index: 0 },
        x: -700,
        y: 0
      }),
      clientLegacyNode({
        nodeIndex: 2,
        shellId: doubleBranchShellId,
        kernelId: doubleBranchKernelId,
        pins: [
          // True outflow: shell 0 / kernel 1 → node 3 (Play Timed Effects A)
          {
            i1: { kind: NodePin_Index_Kind.OutFlow, index: 0 },
            i2: { kind: NodePin_Index_Kind.OutFlow, index: 1 },
            connects: [
              {
                id: 3,
                connect: { kind: NodePin_Index_Kind.InFlow, index: 0 },
                connect2: { kind: NodePin_Index_Kind.InFlow, index: 0 }
              }
            ]
          },
          // False outflow: shell 1 / kernel 2 → node 4 (Play Timed Effects B)
          {
            i1: { kind: NodePin_Index_Kind.OutFlow, index: 1 },
            i2: { kind: NodePin_Index_Kind.OutFlow, index: 2 },
            connects: [
              {
                id: 4,
                connect: { kind: NodePin_Index_Kind.InFlow, index: 0 },
                connect2: { kind: NodePin_Index_Kind.InFlow, index: 0 }
              }
            ]
          },
          // Condition: shell 0 / kernel 1, Boolean
          clientDataPin({
            shellIndex: 0,
            kernelIndex: 1,
            type: ClientVarType.Boolean_,
            value: clientBoolValue(condition)
          }),
          // client binding
          {
            i1: { kind: NodePin_Index_Kind.ClientExecNode, index: 0 },
            i2: { kind: NodePin_Index_Kind.ClientExecNode, index: 0 },
            value: {
              class: 0,
              itemType: {
                classBase: 2,
                type_client: { type: ClientVarType.UnknownVar_ }
              }
            },
            type: ClientVarType.UnknownVar_,
            connects: [],
            clientExecNode: {
              kind: NodePin_Index_Kind.ClientExecNode,
              index: 1,
              nodeId: { id: doubleBranchShellId }
            }
          }
        ],
        x: -200,
        y: 0
      }),
      clientLegacyNode({
        nodeIndex: 3,
        shellId: 200038,
        kernelId: 2000,
        pins: [
          clientDataPin({ shellIndex: 0, kernelIndex: 4, type: ClientVarType.Configuration_, value: clientIdValue(ClientVarType.Configuration_, 27) }),
          clientDataPin({ shellIndex: 1, kernelIndex: 1, type: ClientVarType.Vector_, value: { class: 7, alreadySetVal: true, itemType: { classBase: 2, type_client: { type: ClientVarType.Vector_ } }, bVector: { val: { x: 10, y: 0, z: 0 } } } }),
          clientDataPin({ shellIndex: 2, kernelIndex: 2, type: ClientVarType.Vector_, value: { class: 7, alreadySetVal: true, itemType: { classBase: 2, type_client: { type: ClientVarType.Vector_ } }, bVector: { val: { x: 0, y: 0, z: 0 } } } }),
          clientDataPin({ shellIndex: 3, kernelIndex: 3, type: ClientVarType.Float_, value: { class: 4, alreadySetVal: true, itemType: { classBase: 2, type_client: { type: ClientVarType.Float_ } }, bFloat: { val: 1 } } }),
          clientDataPin({ shellIndex: 4, kernelIndex: 0, type: ClientVarType.Integer_, value: clientIntValue() }),
          clientDataPin({ shellIndex: 5, kernelIndex: 5, type: ClientVarType.Boolean_, value: clientBoolValue(false) }),
          clientBindingPin(200038)
        ],
        x: 350,
        y: -180
      }),
      clientLegacyNode({
        nodeIndex: 4,
        shellId: 200038,
        kernelId: 2000,
        pins: [
          clientDataPin({ shellIndex: 0, kernelIndex: 4, type: ClientVarType.Configuration_, value: clientIdValue(ClientVarType.Configuration_, 27) }),
          clientDataPin({ shellIndex: 1, kernelIndex: 1, type: ClientVarType.Vector_, value: { class: 7, alreadySetVal: true, itemType: { classBase: 2, type_client: { type: ClientVarType.Vector_ } }, bVector: { val: { x: -10, y: 0, z: 0 } } } }),
          clientDataPin({ shellIndex: 2, kernelIndex: 2, type: ClientVarType.Vector_, value: { class: 7, alreadySetVal: true, itemType: { classBase: 2, type_client: { type: ClientVarType.Vector_ } }, bVector: { val: { x: 0, y: 0, z: 0 } } } }),
          clientDataPin({ shellIndex: 3, kernelIndex: 3, type: ClientVarType.Float_, value: { class: 4, alreadySetVal: true, itemType: { classBase: 2, type_client: { type: ClientVarType.Float_ } }, bFloat: { val: 1 } } }),
          clientDataPin({ shellIndex: 4, kernelIndex: 0, type: ClientVarType.Integer_, value: clientIntValue() }),
          clientDataPin({ shellIndex: 5, kernelIndex: 5, type: ClientVarType.Boolean_, value: clientBoolValue(false) }),
          clientBindingPin(200038)
        ],
        x: 350,
        y: 180
      })
    ]
  })
}

// Generate and verify for both True and False conditions
for (const { graphId, condition, graphName } of [
  { graphId: 1082130439, condition: true, graphName: 'gsts测试双分支_是' },
  { graphId: 1082130440, condition: false, graphName: 'gsts测试双分支_否' }
]) {
  const graph = buildGraph(graphId, condition, graphName)

  // Graph metadata assertions
  assert.deepEqual(graph.graph.id, { class: 1, type: 3, id: graphId })
  assert.equal(graph.graph.which, 11)
  assert.deepEqual(graph.accessories, [])
  assert.equal(graph.gameVersion, '6.7.0')

  // Inner graph
  const innerGraph = graph.graph.graph?.inner.graph
  assert.ok(innerGraph)
  assert.deepEqual(innerGraph.id, { class: 10000, type: 20002, kind: 21001, id: graphId })
  assert.equal(innerGraph.entrySlotIndex, 1)
  assert.deepEqual(innerGraph.graphValues, [])

  // Node count
  assert.equal(innerGraph.nodes.length, 4)

  // Double Branch node identity
  const branch = innerGraph.nodes.find((n) => n.genericId.nodeId === doubleBranchShellId)
  assert.ok(branch, 'Double Branch node must exist')
  assert.equal(branch.genericId.nodeId, doubleBranchShellId)
  assert.equal(branch.concreteId?.nodeId, doubleBranchKernelId)

  // Condition pin: shell 0 / kernel 1, Boolean
  const condPin = branch.pins.find((p) => p.i1.kind === NodePin_Index_Kind.InParam)
  assert.ok(condPin)
  assert.equal(condPin.i1.index ?? 0, 0)
  assert.equal(condPin.i2.index ?? 0, 1)
  assert.equal(condPin.type, ClientVarType.Boolean_)

  // True outflow: shell 0 / kernel 1 → node 3
  const trueFlow = branch.pins.find(
    (p) => p.i1.kind === NodePin_Index_Kind.OutFlow && (p.i1.index ?? 0) === 0
  )
  assert.ok(trueFlow)
  assert.equal(trueFlow.i2.index ?? 0, 1)

  // False outflow: shell 1 / kernel 2 → node 4
  const falseFlow = branch.pins.find(
    (p) => p.i1.kind === NodePin_Index_Kind.OutFlow && p.i1.index === 1
  )
  assert.ok(falseFlow)
  assert.equal(falseFlow.i2.index ?? 0, 2)

  // client binding pin
  const binding = branch.pins.find((p) => p.i1.kind === NodePin_Index_Kind.ClientExecNode)
  assert.ok(binding)
  assert.equal(binding.clientExecNode?.nodeId?.id?.low ?? binding.clientExecNode?.nodeId?.id, doubleBranchShellId)

  // Protobuf message round-trip
  const encoded = rootMessage.encode(graph).finish()
  const decoded = rootMessage.decode(encoded)
  const reencoded = rootMessage.encode(decoded).finish()
  assert.deepEqual(Buffer.from(reencoded), Buffer.from(encoded))

  // Container round-trip
  const container = Buffer.from(wrap_gia(rootMessage, decoded))
  // Verify header and trailer
  assert.equal(container.readUInt32BE(8), 0x0326)
  assert.equal(container.readUInt32BE(container.length - 4), 0x0679)

  // Verify payload integrity: unwrap→decode→encode→wrap should match container bytes
  const payload = container.subarray(20, -4)
  const decodedPayload = rootMessage.decode(payload)
  const reencPayload = rootMessage.encode(decodedPayload).finish()
  assert.deepEqual(Buffer.from(reencPayload), Buffer.from(payload))
}

console.log('PASS client double-branch materializer encodes, round-trips, and uses correct True/False OutFlow indices')
console.log('  True  (condition=yes): shell 0 / kernel 1 → node 3 (position [10,0,0])')
console.log('  False (condition=no):  shell 1 / kernel 2 → node 4 (position [-10,0,0])')
console.log('  Game-verified by user import, editor roundtrip, and in-game behavior on 2026-07-17')
