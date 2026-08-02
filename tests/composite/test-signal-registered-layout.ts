import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'
import {
  buildSignalDefinitionAccessories,
  collectSignalUsages,
  patchEncodedSignalNodes,
  restoreRegisteredSignalDefinitionBytes
} from '../../src/compiler/ir_to_gia_transform/build_signal_definition.js'
import {
  createSignalRegistry,
  type RegisteredSignalDefinition
} from '../../src/compiler/signal_registry.js'
import { buildFile, readFieldBytes } from '../../src/injector/binary.js'
import { loadGiaProto } from '../../src/injector/proto.js'
import { NodePin_Index_Kind } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'

const ids = { sendId: 1610612741, monitorId: 1610612742, serverId: 1610612743 }
const definitionBytes = {
  send: 'IioKEQiRThCgnAEY8asBKIWAgIAGEhEIkU4QoJwBGPGrASiFgICABiIAKAKiBgoQARoCCAEiAEADqgYKEAEaAggCIgBABbIGFgoEZmFjZRABGgIIAyIGCAUYBiAGQAyyBh0KCWRpcmVjdGlvbhABGgQIAxABIgYIBRgGIAZAENIGOAoJ5L+h5Y+35ZCNIiMIBRIZCAUQASIFCAGiBgDKBgsKCWN1YmVfdHVybjABOgIIBCoECAYQAUAr2gY3COkHqgYxCgljdWJlX3R1cm4SEQiRThCgnAEY8asBKIaAgIAGGhEIkU4QopwBGPGrASiHgICABsIMDOWPkemAgeS/oeWPt9gMAeAMCA==',
  monitor:
    'IioKEQiRThCgnAEY8asBKIaAgIAGEhEIkU4QoJwBGPGrASiGgICABiIAKAKqBgoQARoCCAIiAEANugYfCg/kuovku7bmupDlrp7kvZMQARoCCAQiBBgBIAFAD7oGIQoN5LqL5Lu25rqQR1VJRBABGgQIBBABIgYIARgCIAJAELoGJAoS5L+h5Y+35p2l5rqQ5a6e5L2TEAEaBAgEEAIiBBgBIAFAEboGGAoEZmFjZRABGgQIBBADIgYIBRgGIAZAIroGHQoJZGlyZWN0aW9uEAEaBAgEEAQiBggFGAYgBkAj0gY4Cgnkv6Hlj7flkI0iIwgFEhkIBRABIgUIAaIGAMoGCwoJY3ViZV90dXJuMAE6AggEKgQIBhABQCzaBjcI6geyBjEKCWN1YmVfdHVybhIRCJFOEKCcARjxqwEohYCAgAYaEQiRThCinAEY8asBKIeAgIAGwgwM55uR5ZCs5L+h5Y+32AwC4AwI',
  server:
    'IicKEQiRThCinAEY8asBKIeAgIAGEg4IkU4QopwBGPCrASjQDyIAKAKiBgoQARoCCAEiAEATqgYKEAEaAggCIgBAFLIGFgoEZmFjZRABGgIIAyIGCAUYCSAJQCiyBh0KCWRpcmVjdGlvbhABGgQIAxABIgYIBRgJIAlAKdIGGxABGgIIBSIECAIgAyoLCAUQAaIGBAi8mwxALdIGRAoJ5L+h5Y+35ZCNEAEaBAgFEAEiJwgFEhsIBRABIgcIAqoGAhAJygYLCgljdWJlX3R1cm4gCTABOgIIBCoECAYQAUAu2gY3COkHqgYxCgljdWJlX3R1cm4SEQiRThCgnAEY8asBKIaAgIAGGhEIkU4QoJwBGPGrASiFgICABsIMIeWQkeacjeWKoeWZqOiKgueCueWbvuWPkemAgeS/oeWPt9gMAeAMCA=='
}

const signal = {
  name: 'cube_turn',
  params: [
    { name: 'face', type: 'str', sendPinIndex: 12, monitorPinIndex: 34, serverPinIndex: 40 },
    { name: 'direction', type: 'str', sendPinIndex: 16, monitorPinIndex: 35, serverPinIndex: 41 }
  ],
  ...ids,
  encoding: {
    signalVersion: 2,
    sendNameCompositePinIndex: 43,
    monitorNameCompositePinIndex: 44,
    definitionBytes,
    source: { uid: 110170759, mapId: 1073741849, gameVersion: '6.7.0' }
  }
} as unknown as RegisteredSignalDefinition

const usage = {
  name: signal.name,
  params: [
    { name: '参数_1', type: 'str' },
    { name: '参数_2', type: 'str' }
  ],
  hasSend: true,
  hasMonitor: true,
  monitorOutIndexes: [3, 4]
}
const registry = createSignalRegistry([signal])
assert.deepEqual(
  collectSignalUsages({
    graph: { type: 'server', id: 1073741844 },
    nodes: [{ id: 99, type: 'send_signal', args: [{ type: 'str', value: '' }] }]
  } as never),
  [],
  'empty signal names must not create signal definitions'
)
const accessories = buildSignalDefinitionAccessories([usage], registry)
const proto = loadGiaProto()
const graphId = 1073741844
const nodes: any[] = [
  {
    nodeIndex: 1,
    genericId: { class: 10001, type: 20000, kind: 22000, nodeId: 300000 },
    concreteId: { class: 10001, type: 20000, kind: 22000, nodeId: 300000 },
    pins: [
      {
        i1: { kind: NodePin_Index_Kind.InParam, index: 0 },
        i2: { kind: NodePin_Index_Kind.InParam, index: 0 },
        type: 6
      },
      {
        i1: { kind: NodePin_Index_Kind.InParam, index: 1 },
        i2: { kind: NodePin_Index_Kind.InParam, index: 1 },
        type: 6
      },
      {
        i1: { kind: NodePin_Index_Kind.ClientExecNode, index: 0 },
        value: { bString: { val: signal.name } }
      }
    ]
  },
  {
    nodeIndex: 2,
    genericId: { class: 10001, type: 20000, kind: 22000, nodeId: 300001 },
    concreteId: { class: 10001, type: 20000, kind: 22000, nodeId: 300001 },
    pins: [
      {
        i1: { kind: NodePin_Index_Kind.ClientExecNode, index: 0 },
        value: { bString: { val: signal.name } }
      }
    ]
  }
]
patchEncodedSignalNodes(nodes, new Map([[signal.name, signal as never]]))

const root = proto.rootMessage.create({
  graph: {
    id: { class: 5, type: 0, id: graphId },
    name: 'signal-layout-regression',
    which: 9,
    graph: {
      inner: { graph: { id: { class: 10000, type: 20000, kind: 21001, id: graphId }, nodes } }
    }
  },
  accessories,
  filePath: '110170759-1-1073741849-\\signal-layout-regression.gia',
  gameVersion: '6.7.0'
})
const encoded = buildFile(proto.rootMessage.encode(root).finish(), {
  schema: 1,
  headTag: 0x0326,
  fileType: 3,
  tailTag: 0x0679
})
const bytes = restoreRegisteredSignalDefinitionBytes(encoded, registry)
const decoded: any = proto.rootMessage.decode(bytes.slice(20, -4))
const byId = new Map(decoded.accessories.map((unit: any) => [Number(unit.id?.id), unit]))
const sendDef: any = byId.get(ids.sendId)?.compositeDef?.inner?.def
const monitorDef: any = byId.get(ids.monitorId)?.compositeDef?.inner?.def
const serverDef: any = byId.get(ids.serverId)?.compositeDef?.inner?.def
const parameterShape = (items: any[]) =>
  items.map((item) => ({
    name: item.name,
    index: Number(item.index?.index ?? 0),
    type: Number(item.type?.type1 ?? 0),
    pinIndex: Number(item.pinIndex)
  }))

assert.deepEqual(parameterShape(sendDef.inputs), [
  { name: 'face', index: 0, type: 6, pinIndex: 12 },
  { name: 'direction', index: 1, type: 6, pinIndex: 16 }
])
assert.deepEqual(parameterShape(monitorDef.outputs.slice(3)), [
  { name: 'face', index: 3, type: 6, pinIndex: 34 },
  { name: 'direction', index: 4, type: 6, pinIndex: 35 }
])
assert.deepEqual(parameterShape(serverDef.inputs), [
  { name: 'face', index: 0, type: 9, pinIndex: 40 },
  { name: 'direction', index: 1, type: 9, pinIndex: 41 }
])
assert.equal(nodes[0].genericId.nodeId, ids.sendId)
assert.equal(nodes[1].genericId.nodeId, ids.monitorId)
assert.equal(nodes[0].signalVersion, 2)
assert.equal(nodes[1].signalVersion, 2)
assert.deepEqual(
  nodes[0].pins.map((pin) => pin.compositePinIndex),
  [12, 16, 43]
)
assert.equal(nodes[1].pins[0].compositePinIndex, 44)
assert.ok(signal.name)
assert.equal(decoded.filePath, '110170759-1-1073741849-\\signal-layout-regression.gia')
assert.equal(decoded.gameVersion, '6.7.0')
assert.equal(new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, false), 3)

const rawById = new Map<number, Uint8Array>()
for (const field of (parseWireMessage(bytes.slice(20, -4)) ?? []).filter(
  (entry) => entry.number === 2 && entry.wire === 2
)) {
  const unit = parseWireMessage(field.value as Uint8Array) ?? []
  const composite = unit.find((entry) => entry.number === 14 && entry.wire === 2)
  const wrapper = composite ? readFieldBytes(composite.value as Uint8Array, 1) : undefined
  const raw = wrapper ? readFieldBytes(wrapper, 1) : undefined
  if (!raw) continue
  const def = proto.root.lookupType('CompositeDef').decode(raw) as any
  rawById.set(Number(def.id?.genericId?.id), raw)
}
const hashes = [ids.sendId, ids.monitorId, ids.serverId].map((id) =>
  createHash('sha256').update(rawById.get(id)!).digest('hex')
)
assert.deepEqual(hashes, [
  'e017c0503c8e8e6e5d0c05156c7491ca987351b859fd90583c8c5ef2c0d341bf',
  'da052f45fbe999495a4fa1e1779f1e7414ecf7253ff9e66df1c1dfc1e765b40b',
  '1af84b3bf63607f40ce2967ab2a46bccf257e7c6aff1a071c1b5fdf87a7ff4fb'
])
console.log('signal registered layout regression: PASS')
