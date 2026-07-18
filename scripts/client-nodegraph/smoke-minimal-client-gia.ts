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
  const isFilter = subType === 'bool_filter' || subType === 'int_filter'
  const irNodeId = isFilter ? 7 : 1
  const ir: ClientIRDocument = {
    ir_version: 1,
    ir_type: 'node_graph',
    graph: { type: 'client', sub_type: subType, name: `minimal_${subType}` },
    nodes: [{ id: irNodeId, type: nodeType }]
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
  assert.strictEqual(
    Number(node.nodeIndex),
    isFilter ? 1 : irNodeId,
    `${subType}: emitted node index`
  )
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

const filterIndexCollisionIr: ClientIRDocument = {
  ir_version: 1,
  ir_type: 'node_graph',
  graph: { type: 'client', sub_type: 'int_filter', name: 'filter_index_collision' },
  nodes: [
    {
      id: 1,
      type: 'get_random_number',
      args: [
        { type: 'int', value: 1 },
        { type: 'int', value: 10 }
      ]
    },
    {
      id: 7,
      type: 'node_graph_end_integer',
      args: [{ type: 'conn', value: { node_id: 1, index: 0, type: 'int' } }]
    }
  ]
}
const collisionFile = path.join(OUT_DIR, 'filter_index_collision.gia')
fs.writeFileSync(collisionFile, irToGia(filterIndexCollisionIr, { protoPath: PROTO_PATH }))
const collisionNodes =
  decode_gia_file(collisionFile, undefined, true).graph.graph?.inner.graph?.nodes ?? []
const collisionEnd = collisionNodes.find((node) => Number(node.genericId?.nodeId) === 200122)
const collisionSource = collisionNodes.find((node) => Number(node.genericId?.nodeId) === 200032)
assert.strictEqual(Number(collisionEnd?.nodeIndex), 1, 'filter result keeps reserved index 1')
assert.strictEqual(Number(collisionSource?.nodeIndex), 2, 'ordinary IR node 1 relocates to index 2')
const collisionResultPin = collisionEnd?.pins?.find(
  (pin) => Number(pin.i1?.kind) === 3 && Number(pin.i1?.index) === 0
)
assert.strictEqual(
  Number(collisionResultPin?.connects?.[0]?.id),
  2,
  'filter result connection follows the relocated source index'
)
console.log('[ok] client filter result/source node-index collision remapping verified')
