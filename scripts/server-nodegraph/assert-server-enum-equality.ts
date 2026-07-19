import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import type {
  GraphNode,
  NodePin
} from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'

const repoRoot = process.cwd()
const giaPath = path.join(repoRoot, 'dist/tests/enum_operator_equal.gia')
const protoPath = path.join(
  repoRoot,
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
)

assert.ok(fs.existsSync(giaPath), `missing generated GIA: ${giaPath}`)
const root = decode_gia_file(giaPath, protoPath)
const nodes = root.graph?.graph?.inner?.graph?.nodes ?? []

function nodeId(node: GraphNode) {
  return node.concreteId?.nodeId ?? node.genericId?.nodeId
}

function inputPin(node: GraphNode, index: number): NodePin {
  const pin = (node.pins ?? []).find(
    (candidate) => candidate.i1.kind === 3 && candidate.i1.index === index
  )
  assert.ok(pin, `node ${nodeId(node)} is missing input pin ${index}`)
  return pin
}

const expected = new Map([
  [851, { ioc: 42, values: [6700, 6701] }],
  [852, { ioc: 43, values: [6710, 6711] }]
])

for (const [id, expectation] of expected) {
  const equalityNodes = nodes.filter((node) => nodeId(node) === id)
  assert.equal(equalityNodes.length, 2, `expected operator and direct-call nodes for ${id}`)
  for (const node of equalityNodes) {
    for (const index of [0, 1]) {
      const wrapped = inputPin(node, index).value?.bConcreteValue
      assert.equal(wrapped?.indexOfConcrete, expectation.ioc, `node ${id} input ${index} IOC`)
      assert.equal(
        wrapped?.value?.bEnum?.val,
        expectation.values[index],
        `node ${id} input ${index} value`
      )
    }
  }
}

assert.equal(
  nodes.some((node) => nodeId(node) === 475),
  false,
  'Enumerations Equal must not fall back to generic node 475'
)

console.log('[ok] server enum equality emits concrete nodes 851/852 with IOC 42/43')
