import assert from 'node:assert'
import path from 'node:path'

import { irToGia } from '../../src/compiler/ir_to_gia_transform/index.js'
import { loadGiaProto } from '../../src/injector/proto.js'
import { buildClientGraphRegistriesIRDocuments, g } from '../../src/runtime/core.js'
import { configId } from '../../src/runtime/value.js'
import {
  NodePin_Index_Kind,
  type Root as GiaRoot
} from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'

const statusId = 1082130992
const decisionId = 1082130993

const status = g.creationStatus({ id: statusId })
status.on('start1', (_evt, f) => {
  f.executeSkill(true, 1n)
})
status.on('start2', (_evt, f) => {
  f.continueExecutingPreviousFrameBehavior()
})

const decision = g.creationStatusDecision({ id: decisionId })
decision.on('start1', (_evt, f) => {
  f.switchToSelfExecutionStatus(true, new configId(statusId), 1n)
})
decision.on('start3', (_evt, f) => {
  f.switchToSelfExecutionStatus(true, new configId(statusId), 2n)
})

const protoPath = path.resolve(
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
)
const { rootMessage } = loadGiaProto(protoPath)
const documents = buildClientGraphRegistriesIRDocuments()

for (const [graphId, expectedCount] of [
  [statusId, 2],
  [decisionId, 3]
] as const) {
  const document = documents.find((candidate) => candidate.graph.id === graphId)
  assert.ok(document, `missing ordered client graph ${graphId}`)
  const entry = document.nodes?.find((node) => node.type === 'node_graph_begins')
  assert.ok(entry, `missing ordered start node for graph ${graphId}`)
  assert.strictEqual(
    Math.max(
      ...(entry.next ?? []).map((next) =>
        typeof next === 'number' ? 1 : (next.source_index ?? 0) + 1
      )
    ),
    expectedCount
  )

  const bytes = irToGia(document, { protoPath })
  const message = rootMessage.decode(bytes.slice(20, -4))
  const root = rootMessage.toObject(message, { defaults: true, longs: Number }) as GiaRoot
  const startNode = root.graph?.graph?.inner.graph?.nodes?.find(
    (node) => Number(node.genericId?.nodeId) === 200126
  )
  assert.ok(startNode, `missing encoded ordered start node for graph ${graphId}`)
  assert.strictEqual(Number(startNode.statusNodeExtension?.inner?.value), expectedCount)

  const outputPins =
    startNode.pins?.filter((pin) => Number(pin.i1?.kind) === NodePin_Index_Kind.OutFlow) ?? []
  assert.deepStrictEqual(
    outputPins.map((pin) => Number(pin.i1?.index)),
    Array.from({ length: expectedCount }, (_, index) => index)
  )
}

console.log('[ok] client ordered start output pins verified')
