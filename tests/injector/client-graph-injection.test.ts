import assert from 'node:assert/strict'

import { buildFile, encodeVarint, parseMessage } from '../../src/injector/binary.js'
import { createInjector } from '../../src/injector/index.js'
import { extractGraphType, findNodeGraphTargets } from '../../src/injector/node_graph.js'
import { loadGiaProto } from '../../src/injector/proto.js'
import type { LenField } from '../../src/injector/types.js'
import { client_dictionary_wrapped_value } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/client_basic.js'
import { ClientVarType } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'

function concat(...parts: Uint8Array[]): Uint8Array {
  return Buffer.concat(parts.map((part) => Buffer.from(part)))
}

function varintField(field: number, value: number): Uint8Array {
  return concat(encodeVarint(field << 3), encodeVarint(value))
}

function bytesField(field: number, value: Uint8Array): Uint8Array {
  return concat(encodeVarint((field << 3) | 2), encodeVarint(value.length), value)
}

const targetId = 1082130436
const proto = loadGiaProto()

function makeGiaBytes(
  id: number,
  graphType: number,
  graphWhich: number,
  name: string,
  nodes: object[]
): Uint8Array {
  const graph = proto.nodeGraphMessage.create({
    id: { class: 10000, type: graphType, kind: 21001, id },
    name,
    nodes
  })
  const root = proto.rootMessage.create({
    graph: {
      id: { class: 1, type: 3, id },
      name,
      which: graphWhich,
      graph: { inner: { graph } }
    }
  })
  return buildFile(proto.rootMessage.encode(root).finish(), {
    schema: 1,
    headTag: 0x0326,
    fileType: 0,
    tailTag: 0x0679
  })
}

const entryNode = {
  nodeIndex: 1,
  genericId: { class: 10001, type: 20002, kind: 22000, nodeId: 200042 },
  concreteId: { class: 10001, type: 20002, kind: 22000, nodeId: 2001 }
}
const prefabDictionaryNode = {
  nodeIndex: 2,
  genericId: { class: 10001, type: 20002, kind: 22000, nodeId: 200152 },
  concreteId: { class: 10001, type: 20002, kind: 22000, nodeId: 2002 },
  pins: [
    {
      i1: { kind: 4, index: 0 },
      value: client_dictionary_wrapped_value(0, ClientVarType.Prefab_, ClientVarType.Integer_)
    }
  ]
}
const targetGraph = proto.nodeGraphMessage.create({
  id: { class: 10000, type: 20010, kind: 21001, id: targetId },
  name: '新建角色操控技能节点图',
  nodes: [entryNode]
})

const folderEntry = (typeValue: number, id = targetId) =>
  bytesField(
    6,
    bytesField(
      1,
      bytesField(3, bytesField(5, concat(varintField(1, typeValue), varintField(2, id))))
    )
  )
const targetGraphField = bytesField(
  10,
  bytesField(1, bytesField(1, proto.nodeGraphMessage.encode(targetGraph).finish()))
)
const gilBytes = buildFile(concat(folderEntry(200), folderEntry(7400), targetGraphField), {
  schema: 1,
  headTag: 0x0326,
  fileType: 0,
  tailTag: 0x0679
})

const giaBytes = makeGiaBytes(targetId, 20010, 64, '_GSTS_client_character_control_skill', [
  entryNode,
  prefabDictionaryNode
])

const result = createInjector({ lang: 'en' }).injectBytes({ gilBytes, giaBytes })
assert.equal(result.mode, 'replace')

const payload = result.bytes.slice(20, -4)
const fields: LenField[] = []
const nodeGraphBlobFields: LenField[] = []
parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields, {
  nodeGraphBlobFields
})
const matches = findNodeGraphTargets(payload, nodeGraphBlobFields, proto.nodeGraphMessage, targetId)
assert.equal(matches.length, 1)
assert.equal(extractGraphType(matches[0].obj), 20010)
assert.equal(matches[0].obj.name, '_GSTS_client_character_control_skill')
assert.equal((matches[0].obj.nodes as unknown[]).length, 2)

const mismatchedClientGia = makeGiaBytes(targetId, 20008, 52, '_GSTS_wrong_client_subtype', [
  entryNode
])
assert.throws(
  () => createInjector({ lang: 'en' }).injectBytes({ gilBytes, giaBytes: mismatchedClientGia }),
  /Client NodeGraph type mismatch: id=1082130436, incoming=20008, target=20010/
)

const serverTargetId = 1073741827
const serverTargetGraph = proto.nodeGraphMessage.create({
  id: { class: 10000, type: 20003, kind: 21001, id: serverTargetId },
  name: '_GSTS_existing_server_status',
  nodes: []
})
const serverGilBytes = buildFile(
  bytesField(
    10,
    bytesField(1, bytesField(1, proto.nodeGraphMessage.encode(serverTargetGraph).finish()))
  ),
  { schema: 1, headTag: 0x0326, fileType: 0, tailTag: 0x0679 }
)
const serverGiaBytes = makeGiaBytes(serverTargetId, 20000, 9, '_GSTS_incoming_server_entity', [])
const originalWarn = console.warn
let serverWarning = ''
console.warn = (...data: unknown[]) => {
  serverWarning = data.map(String).join(' ')
}
let serverResult: ReturnType<ReturnType<typeof createInjector>['injectBytes']>
try {
  serverResult = createInjector({ lang: 'en' }).injectBytes({
    gilBytes: serverGilBytes,
    giaBytes: serverGiaBytes
  })
} finally {
  console.warn = originalWarn
}
assert.match(serverWarning, /auto-corrected/)

const serverPayload = serverResult.bytes.slice(20, -4)
const serverFields: LenField[] = []
const serverNodeGraphBlobFields: LenField[] = []
parseMessage(serverPayload, 0, serverPayload.length, 0, 0, 0, 0, 0, 0, 0, serverFields, {
  nodeGraphBlobFields: serverNodeGraphBlobFields
})
const serverMatches = findNodeGraphTargets(
  serverPayload,
  serverNodeGraphBlobFields,
  proto.nodeGraphMessage,
  serverTargetId
)
assert.equal(extractGraphType(serverMatches[0].obj), 20003)

const firstGraphId = 1073741825
const firstGraphGil = buildFile(
  concat(folderEntry(7000, firstGraphId), bytesField(10, new Uint8Array())),
  { schema: 1, headTag: 0x0326, fileType: 0, tailTag: 0x0679 }
)
const firstGraphGia = makeGiaBytes(firstGraphId, 20000, 9, '_GSTS_first_server_graph', [])
const firstGraphResult = createInjector({ lang: 'en' }).injectBytes({
  gilBytes: firstGraphGil,
  giaBytes: firstGraphGia,
  targetId: firstGraphId
})
const firstGraphPayload = firstGraphResult.bytes.slice(20, -4)
const firstGraphFields: LenField[] = []
parseMessage(firstGraphPayload, 0, firstGraphPayload.length, 0, 0, 0, 0, 0, 0, 0, firstGraphFields)
assert.equal(
  findNodeGraphTargets(firstGraphPayload, firstGraphFields, proto.nodeGraphMessage, firstGraphId)
    .length,
  1,
  'fixed first server graph is created only from its existing folder placeholder'
)

console.log('[ok] client graph types are strict; server replacement and first-graph creation pass')
