import assert from 'node:assert/strict'

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
  clientVectorValue,
  NodePin_Index_Kind,
  wrap_gia
} from '../../dist/src/compiler/gia_vendor.js'

const graphStartShellId = 200042
const graphStartKernelId = 2001
const playTimedEffectsShellId = 200038
const playTimedEffectsKernelId = 2000

const graph = clientLegacySkillGraph({
  graphId: 1082130433,
  graphName: '新建角色技能节点图',
  filePath: '110170759-1784257196-1073741848-\\播放限时特效.gia',
  gameVersion: '6.7.0',
  nodes: [
    clientLegacyNode({
      nodeIndex: 1,
      shellId: graphStartShellId,
      kernelId: graphStartKernelId,
      pins: [clientOutflowPin(2)],
      contextDeclaration: { kind: NodePin_Index_Kind.ClientSignal, index: 0 }
    }),
    clientLegacyNode({
      nodeIndex: 2,
      shellId: playTimedEffectsShellId,
      kernelId: playTimedEffectsKernelId,
      pins: [
        clientDataPin({
          shellIndex: 0,
          kernelIndex: 4,
          type: ClientVarType.Configuration_,
          value: clientIdValue(ClientVarType.Configuration_, 27)
        }),
        clientDataPin({
          shellIndex: 1,
          kernelIndex: 1,
          type: ClientVarType.Vector_,
          value: clientVectorValue([1, 2, 3])
        }),
        clientDataPin({
          shellIndex: 2,
          kernelIndex: 2,
          type: ClientVarType.Vector_,
          value: clientVectorValue([10, 20, 30])
        }),
        clientDataPin({
          shellIndex: 3,
          kernelIndex: 3,
          type: ClientVarType.Float_,
          value: clientFloatValue(1.25)
        }),
        clientDataPin({
          shellIndex: 4,
          kernelIndex: 0,
          type: ClientVarType.Integer_,
          value: clientIntValue()
        }),
        clientDataPin({
          shellIndex: 5,
          kernelIndex: 5,
          type: ClientVarType.Boolean_,
          value: clientBoolValue(false)
        }),
        clientBindingPin(playTimedEffectsShellId)
      ],
      x: 312.6856994628906,
      y: -63.67618942260742
    })
  ]
})

assert.deepEqual(graph.graph.id, { class: 1, type: 3, id: 1082130433 })
assert.equal(graph.graph.which, 11)
assert.deepEqual(graph.accessories, [])
assert.equal(graph.gameVersion, '6.7.0')

const innerGraph = graph.graph.graph?.inner.graph
assert.ok(innerGraph)
assert.deepEqual(innerGraph.id, {
  class: 10000,
  type: 20002,
  kind: 21001,
  id: 1082130433
})
assert.equal(innerGraph.entrySlotIndex, 1)
assert.deepEqual(innerGraph.graphValues, [])

const [begin, effect] = innerGraph.nodes
assert.equal(begin.contextDeclaration?.kind, 6)
assert.equal(begin.contextDeclaration?.index ?? 0, 0)
assert.equal(begin.genericId.nodeId, graphStartShellId)
assert.equal(begin.concreteId?.nodeId, graphStartKernelId)
assert.equal(effect.genericId.nodeId, playTimedEffectsShellId)
assert.equal(effect.concreteId?.nodeId, playTimedEffectsKernelId)
assert.deepEqual(
  effect.pins.slice(0, 6).map((pin) => [pin.i1.index ?? 0, pin.i2.index ?? 0, pin.type]),
  [
    [0, 4, 18],
    [1, 1, 11],
    [2, 2, 11],
    [3, 3, 7],
    [4, 0, 3],
    [5, 5, 5]
  ]
)
assert.equal(effect.pins[4].value.alreadySetVal ?? false, false)
assert.equal(effect.pins[5].value.alreadySetVal, true)
assert.deepEqual(effect.pins[6].clientExecNode, {
  kind: 5,
  index: 1,
  nodeId: { id: playTimedEffectsShellId }
})

const protoPath = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const root = new protobuf.Root().loadSync(protoPath, { keepCase: true })
const rootMessage = root.lookupType('Root')
const encoded = rootMessage.encode(graph).finish()
const decoded = rootMessage.decode(encoded)
assert.deepEqual(Buffer.from(rootMessage.encode(decoded).finish()), Buffer.from(encoded))

const container = new Uint8Array(wrap_gia(rootMessage, decoded as never))
assert.equal(container.length, 585)
assert.equal(new DataView(container.buffer).getUint32(8, false), 0x0326)
assert.equal(new DataView(container.buffer).getUint32(container.length - 4, false), 0x0679)

console.log('PASS project adapter materializes the verified legacy client skill graph')
