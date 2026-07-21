import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

import { irToGia } from '../../src/compiler/ir_to_gia_transform/index.js'
import type { ClientGraphSubType, ClientIRDocument } from '../../src/runtime/IR.js'
import { getClientGraphEncoding } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_graph_encoding.js'
import { requireClientNodeMetadata } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_helpers.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { GraphUnit_Id_Class } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'

const PROTO_PATH =
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
const OUT_DIR = 'tests/client_generated'
const GRAPH_UNIT_ID_TYPE_CLIENT_GRAPH = 3

const MINIMAL_NODE_TYPE_BY_SUB_TYPE: Record<ClientGraphSubType, string> = {
  character_skill: 'node_graph_begins',
  character_control_skill: 'node_graph_begins',
  creation_skill: 'node_graph_begins',
  creation_status: 'node_graph_begins',
  creation_status_decision: 'node_graph_begins',
  bool_filter: 'node_graph_end_boolean',
  int_filter: 'node_graph_end_integer'
}

fs.mkdirSync(OUT_DIR, { recursive: true })

for (const [subType, nodeType] of Object.entries(MINIMAL_NODE_TYPE_BY_SUB_TYPE) as Array<
  [ClientGraphSubType, string]
>) {
  const ir: ClientIRDocument = {
    ir_version: 1,
    ir_type: 'node_graph',
    graph: { type: 'client', sub_type: subType, name: `minimal_${subType}` },
    nodes: [{ id: 1, type: nodeType }]
  }

  const bytes = irToGia(ir, { protoPath: PROTO_PATH })
  const outFile = path.join(OUT_DIR, `minimal_${subType}.gia`)
  fs.writeFileSync(outFile, bytes)

  const decoded = decode_gia_file(outFile, undefined, true)
  const encoding = getClientGraphEncoding(subType)
  const metadata = requireClientNodeMetadata(subType, nodeType)

  assert.strictEqual(
    Number(decoded.graph.id.type),
    GRAPH_UNIT_ID_TYPE_CLIENT_GRAPH,
    `${subType}: GraphUnit.id.type`
  )
  assert.strictEqual(
    Number(decoded.graph.id.class),
    GraphUnit_Id_Class.Node,
    `${subType}: GraphUnit.id.class`
  )
  assert.strictEqual(Number(decoded.graph.which), encoding.graphWhich, `${subType}: which`)
  const innerGraph = decoded.graph.graph?.inner.graph
  assert.ok(innerGraph, `${subType}: inner NodeGraph missing`)
  assert.strictEqual(Number(innerGraph.entrySlotIndex), 1, `${subType}: entrySlotIndex`)
  assert.strictEqual(
    Number(innerGraph.id.type),
    encoding.graphType,
    `${subType}: NodeGraph.id.type`
  )

  const nodes = innerGraph.nodes ?? []
  assert.strictEqual(nodes.length, 1, `${subType}: node count`)
  const node = nodes[0]
  assert.strictEqual(Number(node.genericId?.nodeId), metadata.genericId, `${subType}: genericId`)
  assert.strictEqual(
    Number(node.concreteId?.nodeId),
    Number(metadata.concreteId),
    `${subType}: concreteId`
  )
  assert.strictEqual(
    Number(node.genericId?.type),
    metadata.graphType,
    `${subType}: NodeProperty.type`
  )
  if (metadata.specialKind === 'start' && subType.startsWith('creation_status')) {
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(node.statusNodeExtension)),
      { type: 1, inner: { value: 1 } },
      `${subType}: statusNodeExtension`
    )
  }

  console.log(
    `[ok] ${subType}: minimal .gia round-trip verified (which=${encoding.graphWhich}, graphType=${encoding.graphType}, node=${metadata.genericId}/${metadata.concreteId})`
  )
}
