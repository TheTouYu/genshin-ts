import assert from 'node:assert'
import path from 'node:path'

import { irToGia } from '../../src/compiler/ir_to_gia_transform/index.js'
import { loadGiaProto } from '../../src/injector/proto.js'
import {
  buildClientGraphRegistriesIRDocuments,
  buildServerGraphRegistriesIRDocuments,
  g
} from '../../src/runtime/core.js'
import { client_node_body } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/client_basic.js'
import { requireClientNodeMetadata } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_helpers.js'
import type { ClientNodeMetadata } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.js'
import { NODE_ID } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_id.js'
import {
  NodePin_Index_Kind,
  type Root as GiaRoot
} from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'

const graphId = 1073741838
const serverGraphId = 1073741839

g.characterSkill({ id: graphId }).on('start', (_evt, f) => {
  f.finiteLoop(0n, 1n, (_index, breakLoop) => {
    breakLoop()
  })

  f.finiteLoop(0n, 1n, () => {
    f.finiteLoop(0n, 1n, () => {
      f.return()
    })
  })
})

g.server({ id: serverGraphId }).on('whenEntityIsCreated', (_evt, f) => {
  f.finiteLoop(0n, 1n, (_index, breakLoop) => {
    breakLoop()
  })

  f.finiteLoop(0n, 1n, () => {
    f.finiteLoop(0n, 1n, () => {
      f.return()
    })
  })
})

const document = buildClientGraphRegistriesIRDocuments().find(
  (candidate) => candidate.graph.id === graphId
)
assert.ok(document, 'missing client exec binding smoke graph')

const protoPath = path.resolve(
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
)
const bytes = irToGia(document, { protoPath })
const { rootMessage } = loadGiaProto(protoPath)
const message = rootMessage.decode(bytes.slice(20, -4))
const root = rootMessage.toObject(message, { longs: Number }) as GiaRoot
const nodes = root.graph?.graph?.inner.graph?.nodes ?? []

let clientExecPinCount = 0
for (const node of nodes) {
  for (const pin of node.pins ?? []) {
    if (pin.i1?.kind === NodePin_Index_Kind.ClientExecNode) {
      clientExecPinCount += 1
      assert.strictEqual(pin.clientExecNode?.kind, NodePin_Index_Kind.ClientExecNode)
      assert.strictEqual(pin.clientExecNode?.index, 1)
      assert.ok(Number(pin.clientExecNode?.nodeId?.id) > 0)
      if ([200079, 200080].includes(Number(node.genericId?.nodeId))) {
        assert.strictEqual(pin.clientExecNode?.nodeId?.id, node.genericId?.nodeId)
      }
    }
  }
}

assert.ok(clientExecPinCount > 0, 'missing client execution binding pins')

const signalMetadata = requireClientNodeMetadata(
  'character_skill',
  'send_signal_to_server_node_graph'
)
const signalNode = client_node_body({
  metadata: {
    ...signalMetadata,
    flows: [{ index: 0, kind: 'client_signal', type: 'flow' }]
  } satisfies ClientNodeMetadata,
  unique_index: 1,
  x: 0,
  y: 0
})
const clientSignalPin = signalNode.pins?.find(
  (pin) => pin.i1?.kind === NodePin_Index_Kind.ClientSignal
)
assert.deepStrictEqual(clientSignalPin?.clientExecNode, {
  kind: NodePin_Index_Kind.ClientSignal,
  index: 1
})

const loopNodeIds = new Set(
  nodes
    .filter((node) => Number(node.genericId?.nodeId) === 200079)
    .map((node) => Number(node.nodeIndex))
)
const breakTargets = nodes
  .filter((node) => Number(node.genericId?.nodeId) === 200080)
  .map((node) =>
    (node.pins ?? [])
      .filter((pin) => pin.i1?.kind === NodePin_Index_Kind.OutFlow)
      .flatMap((pin) => pin.connects ?? [])
      .filter((connection) => loopNodeIds.has(Number(connection.id)))
  )

const breakTargetCounts = breakTargets
  .map((targets) => targets.length)
  .sort((left, right) => left - right)

assert.deepStrictEqual(
  breakTargetCounts,
  [1, 2],
  'client break nodes should target one loop for break and both loops for nested return'
)
for (const target of breakTargets.flat()) {
  assert.strictEqual(target.connect?.kind, NodePin_Index_Kind.InFlow)
  assert.strictEqual(target.connect?.index, 1)
  assert.strictEqual(target.connect2?.kind, NodePin_Index_Kind.InFlow)
  assert.strictEqual(target.connect2?.index, 1)
}

const serverDocument = buildServerGraphRegistriesIRDocuments().find(
  (candidate) => candidate.graph.id === serverGraphId
)
assert.ok(serverDocument, 'missing server loop binding smoke graph')

const serverBytes = irToGia(serverDocument, { protoPath })
const serverMessage = rootMessage.decode(serverBytes.slice(20, -4))
const serverRoot = rootMessage.toObject(serverMessage, { longs: Number }) as GiaRoot
const serverNodes = serverRoot.graph?.graph?.inner.graph?.nodes ?? []
const serverLoopNodeIds = new Set(
  serverNodes
    .filter((node) => Number(node.genericId?.nodeId) === NODE_ID.Finite_Loop)
    .map((node) => Number(node.nodeIndex))
)
const serverBreakTargets = serverNodes
  .filter((node) => Number(node.genericId?.nodeId) === NODE_ID.Break_Loop)
  .map((node) =>
    (node.pins ?? [])
      .filter((pin) => pin.i1?.kind === NodePin_Index_Kind.OutFlow)
      .flatMap((pin) => pin.connects ?? [])
      .filter((connection) => serverLoopNodeIds.has(Number(connection.id)))
  )

assert.deepStrictEqual(
  serverBreakTargets.map((targets) => targets.length).sort((left, right) => left - right),
  [1, 2],
  'server break nodes should target one loop for break and both loops for nested return'
)
for (const target of serverBreakTargets.flat()) {
  assert.strictEqual(target.connect?.kind, NodePin_Index_Kind.InFlow)
  assert.strictEqual(target.connect?.index, 1)
  assert.strictEqual(target.connect2?.kind, NodePin_Index_Kind.InFlow)
  assert.strictEqual(target.connect2?.index, 1)
}

console.log('[ok] client execution and client/server loop bindings verified')
