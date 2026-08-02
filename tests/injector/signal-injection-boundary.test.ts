import assert from 'node:assert/strict'

import {
  buildSignalDefinitionAccessories,
  type CollectedSignalUsage
} from '../../src/compiler/ir_to_gia_transform/build_signal_definition.js'
import {
  createSignalRegistry,
  type RegisteredSignalDefinition
} from '../../src/compiler/signal_registry.js'
import {
  buildFile,
  encodeVarint,
  parseMessage,
  readFieldBytes,
  readFieldMessages
} from '../../src/injector/binary.js'
import { createInjector } from '../../src/injector/index.js'
import { loadGiaProto } from '../../src/injector/proto.js'
import { buildSignalNodeIdMapFromFields } from '../../src/injector/signal_nodes.js'
import type { LenField } from '../../src/injector/types.js'

const proto = loadGiaProto()
const targetId = 1073741999

function concat(...parts: Uint8Array[]): Uint8Array {
  return new Uint8Array(Buffer.concat(parts.map((part) => Buffer.from(part))))
}

function bytesField(field: number, value: Uint8Array): Uint8Array {
  return concat(encodeVarint((field << 3) | 2), encodeVarint(value.length), value)
}

function graph(id: number, nodes: unknown[] = []) {
  return proto.nodeGraphMessage.create({
    id: { class: 10000, type: 20003, kind: 21001, id },
    name: '_GSTS_signal_injection_boundary',
    nodes
  })
}

function signalNode(name: string, paramTypes: number[]) {
  return {
    nodeIndex: 1,
    genericId: { class: 10001, type: 20000, kind: 22001, nodeId: 300000 },
    concreteId: { class: 10001, type: 20000, kind: 22001, nodeId: 300000 },
    pins: [
      {
        i1: { kind: 5, index: 1 },
        value: { class: 5, bString: { val: name } },
        clientExecNode: { kind: 6, index: 1 }
      },
      ...paramTypes.map((type, index) => ({
        i1: { kind: 3, index },
        i2: { kind: 3, index },
        type,
        value: { class: type === 5 ? 4 : 2, alreadySetVal: true }
      }))
    ]
  }
}

function usage(signal: RegisteredSignalDefinition): CollectedSignalUsage {
  return {
    name: signal.name,
    params: signal.params.map((param) => ({ name: param.name, type: param.type })),
    hasSend: true,
    hasMonitor: false,
    monitorOutIndexes: []
  }
}

function accessories(signal: RegisteredSignalDefinition) {
  return buildSignalDefinitionAccessories([usage(signal)], createSignalRegistry([signal]))
}

function makeGia(signal: RegisteredSignalDefinition): Uint8Array {
  const root = proto.rootMessage.create({
    graph: {
      id: { class: 1, type: 3, id: targetId },
      which: 9,
      graph: {
        inner: {
          graph: graph(targetId, [
            signalNode(
              signal.name,
              signal.params.map((p) => (p.type === 'float' ? 5 : 3))
            )
          ])
        }
      }
    },
    accessories: accessories(signal)
  })
  return buildFile(proto.rootMessage.encode(root).finish(), {
    schema: 0,
    headTag: 0x0326,
    fileType: 3,
    tailTag: 0x0679
  })
}

function varintField(field: number, value: number): Uint8Array {
  return concat(encodeVarint(field << 3), encodeVarint(value))
}

function nodeIdentity(type: number, id: number): Uint8Array {
  return concat(
    varintField(1, 10001),
    varintField(2, type),
    varintField(3, 22001),
    varintField(5, id)
  )
}

function signalContainer(
  signal: RegisteredSignalDefinition,
  kind: 'send' | 'monitor' | 'server'
): Uint8Array {
  const id =
    kind === 'send' ? signal.sendId : kind === 'monitor' ? signal.monitorId : signal.serverId
  const type = kind === 'server' ? 20002 : 20000
  const nameDef = bytesField(
    107,
    bytesField(101, bytesField(1, new TextEncoder().encode(signal.name)))
  )
  const params = signal.params.map((param) =>
    bytesField(
      102,
      concat(
        bytesField(1, new TextEncoder().encode(param.name)),
        bytesField(4, varintField(4, param.type === 'float' ? 5 : 3))
      )
    )
  )
  const outputs =
    kind === 'monitor' ? [1, 2, 3].map((value) => bytesField(103, encodeVarint(value))) : []
  return concat(
    bytesField(4, bytesField(1, nodeIdentity(type, id))),
    nameDef,
    ...params,
    ...outputs
  )
}

function makeGil(signal: RegisteredSignalDefinition): Uint8Array {
  const graphWrapper = bytesField(1, proto.nodeGraphMessage.encode(graph(targetId)).finish())
  const registrations = [
    signalContainer(signal, 'send'),
    signalContainer(signal, 'monitor'),
    signalContainer(signal, 'server')
  ].map((container) => bytesField(2, bytesField(1, container)))
  return buildFile(bytesField(10, concat(bytesField(1, graphWrapper), ...registrations)), {
    schema: 0,
    headTag: 0x0326,
    fileType: 1,
    tailTag: 0x0679
  })
}

function definitionBytes(bytes: Uint8Array): Uint8Array[] {
  const top = readFieldBytes(bytes.slice(20, -4), 10)
  assert.ok(top)
  return readFieldMessages(top, 2)
    .map((wrapper) => readFieldBytes(wrapper, 1))
    .filter((value): value is Uint8Array => !!value)
}

const existing: RegisteredSignalDefinition = {
  name: '生产信号',
  params: [{ name: '数值', type: 'int' }],
  sendId: 1610612801,
  monitorId: 1610612802,
  serverId: 1610612803
}
const injector = createInjector({ lang: 'en' })
const gilBytes = makeGil(existing)
const parsedFields: LenField[] = []
parseMessage(gilBytes.slice(20, -4), 0, gilBytes.length - 24, 0, 0, 0, 0, 0, 0, 0, parsedFields)
const signalMap = buildSignalNodeIdMapFromFields(gilBytes.slice(20, -4), parsedFields)
assert.equal(signalMap.get(existing.name)?.send?.nodeId, existing.sendId)
assert.equal(signalMap.get(existing.name)?.monitor?.nodeId, existing.monitorId)
const beforeDefinitions = definitionBytes(gilBytes)

const matched = injector.injectBytes({ gilBytes, giaBytes: makeGia(existing), targetId })
assert.deepEqual(
  definitionBytes(matched.bytes),
  beforeDefinitions,
  'ordinary NodeGraph injection must preserve target signal definitions byte-for-byte'
)

const donor = {
  ...existing,
  sendId: 1610612901,
  monitorId: 1610612902,
  serverId: 1610612903
}
const rebound = injector.injectBytes({ gilBytes, giaBytes: makeGia(donor), targetId })
assert.deepEqual(
  definitionBytes(rebound.bytes),
  beforeDefinitions,
  'cross-map identity rebinding must preserve target signal definitions'
)

const unknown = {
  ...existing,
  name: '未注册信号',
  sendId: 1610612901,
  monitorId: 1610612902,
  serverId: 1610612903
}
assert.throws(
  () => injector.injectBytes({ gilBytes, giaBytes: makeGia(unknown), targetId }),
  /signal.*not (?:defined|registered)|signal.*missing/i,
  'an unknown signal must fail closed instead of adding unnamed definitions'
)

const wrongCount = {
  ...existing,
  params: [...existing.params, { name: '额外', type: 'int' as const }]
}
assert.throws(
  () => injector.injectBytes({ gilBytes, giaBytes: makeGia(wrongCount), targetId }),
  /schema|parameter|signal/i,
  'a signal parameter-count mismatch must fail closed'
)

const wrongType = { ...existing, params: [{ name: '数值', type: 'float' as const }] }
assert.throws(
  () => injector.injectBytes({ gilBytes, giaBytes: makeGia(wrongType), targetId }),
  /schema|parameter|signal/i,
  'a signal parameter-type mismatch must fail closed'
)

assert.deepEqual(
  definitionBytes(gilBytes),
  beforeDefinitions,
  'failed injections must not mutate input GIL bytes'
)
console.log(
  'PASS signal injection boundary: resolve existing registration, preserve definitions, fail closed'
)
