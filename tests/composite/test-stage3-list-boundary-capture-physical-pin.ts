// @ts-nocheck
/**
 * A Composite int input routed as the `index` capture of Get Corresponding Value
 * From List must keep a typed physical InParam pin in the legacy Stage 3 backend.
 *
 * Real-game evidence: rubik-3x3 `view_turn_lookup` (def 1610700026) routes the
 * outer `slot` input into the capture `index` argument of
 * `get_corresponding_value_from_list` via compositePins. Under
 * `options.stage3.vendorImplGraphBeta=false` that node lost its InParam[1],
 * leaving the compositePins route pointing at a non-existent physical pin and
 * breaking the data wire (game refused to load).
 *
 * Run (legacy backend):
 *   npm run build
 *   npx tsx tests/composite/test-stage3-list-boundary-capture-physical-pin.ts
 */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { listLiteral } from '../../dist/src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = fileURLToPath(
  new URL(
    '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
    import.meta.url
  )
)

// 强制 legacy 后端（本回归锁定的正是 vendorImplGraphBeta=false 路径）。
const previousEnv = process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH
process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH = '0'

const composite = g.defineComposite('list边界capture物理引脚回归', {
  inputs: { slot: { type: 'int' } },
  outputs: { piece: { type: 'int' } },
  build({ slot }, f) {
    const piece = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('visualP').asType('int_list'),
      slot
    )
    return { piece }
  }
})

g.server({
  name: 'list-boundary-capture-physical-pin',
  id: 1073742501,
  variables: { visualP: new listLiteral('int', [0n, 1n, 2n]) }
}).on('whenEntityIsCreated', (_event, f) => {
  f.callComposite(composite, { slot: 0 })
})

const document = buildServerGraphRegistriesIRDocuments({
  defaultName: 'list-boundary-capture-physical-pin'
}).at(-1)
assert.ok(document)

const bytes = irToGia(document, {
  graphId: 1073742501,
  name: 'list-boundary-capture-physical-pin',
  protoPath: PROTO_PATH
})

if (previousEnv === undefined) delete process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH
else process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH = previousEnv

const outputPath = join(tmpdir(), 'gsts-list-boundary-capture-physical-pin.gia')
writeFileSync(outputPath, Buffer.from(bytes))

const decoded = decode_gia_file(outputPath, PROTO_PATH)
const impl = decoded.accessories?.find((accessory) => accessory.which === 9)?.graph?.inner?.graph
assert.ok(impl, 'composite impl graph must be emitted')

// compositePins 把外层 slot (InParam[0]) 指向 get_corresponding_value_from_list 的 InParam[1]。
const inputBoundary = impl.compositePins?.find(
  (pin) => pin.outerPin?.kind === 3 && pin.outerPin?.index === 0
)
assert.ok(inputBoundary, 'slot boundary route must exist')
assert.equal(inputBoundary.innerPin?.kind, 3)
assert.equal(inputBoundary.innerPin?.index, 1)

const listNode = impl.nodes?.find((node) => node.nodeIndex === inputBoundary.innerNodeId)
assert.ok(listNode, 'get_corresponding_value_from_list node must exist')
assert.equal(listNode.genericId?.nodeId, 128)

// 边界路由指向的 capture index 必须保留物理 InParam（type=Integer, IntBase value）。
const indexInput = listNode.pins?.find(
  (pin) => pin.i1?.kind === 3 && pin.i1?.index === 1
)
assert.ok(indexInput, 'boundary capture index must materialize InParam[1]')
assert.equal(indexInput.type, 3)
assert.equal(indexInput.value?.class, 2)
assert.equal(Object.hasOwn(indexInput.value ?? {}, 'bInt'), true)

// 非 capture 的 list 连接也必须保留（type=IntegerList, connects 指向 get_node_graph_variable）。
const listInput = listNode.pins?.find(
  (pin) => pin.i1?.kind === 3 && pin.i1?.index === 0
)
assert.ok(listInput, 'list conn must materialize InParam[0]')
assert.equal(listInput.type, 8)
assert.equal((listInput.connects ?? []).length, 1)

console.log('PASS composite list boundary capture materializes physical InParam in legacy backend')
