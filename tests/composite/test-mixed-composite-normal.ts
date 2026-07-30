// @ts-nocheck
/**
 * Pure-data Composite + detached ordinary exec node regression.
 *
 * The Composite output creates only a data edge. The detached print node runs because it is
 * explicitly linked from entry; data dependency alone must not be treated as execution flow.
 *
 * Run after `npm run build`:
 *   npx tsx tests/composite/test-mixed-composite-normal.ts [output.gia]
 *   GSTS_STAGE3_VENDOR_IMPL_GRAPH=0 \
 *     npx tsx tests/composite/test-mixed-composite-normal.ts [output.gia]
 */

import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { resolveStage3ImplBackend } from '../../dist/src/compiler/ir_to_gia_transform/stage3_backend.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { int } from '../../dist/src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUTPUT_PATH = process.argv[2] ?? '/tmp/gsts-mixed-composite-normal.gia'
const GRAPH_ID = 1073741872
const COMPOSITE_NAME = 'MixedFlow_PureDataQuery_GSTS'
const BACKEND = resolveStage3ImplBackend().backend

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const query = g.defineComposite(COMPOSITE_NAME, {
  inputs: { value: { type: 'int' } },
  outputs: { text: { type: 'str' } },
  build(args, f) {
    return { text: f.dataTypeConversion(args.value, 'str') }
  }
})

g.server({ name: 'mixed-composite-normal', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    const result = f.callComposite(query, { value: new int(7) })
    const print = f.node('print_string', [result.text])

    f.link(f.entry(), 0, print)
  }
)

const doc = buildServerGraphRegistriesIRDocuments({ defaultName: 'mixed-composite-normal' }).at(-1)
assert.ok(doc)

const call = doc.nodes?.find((node) => node.type === '__composite_call__')
const print = doc.nodes?.find((node) => node.type === 'print_string')
assert.ok(call, 'pure-data Composite call missing from IR')
assert.ok(print, 'detached print node missing from IR')
assert.equal(
  print.args?.[0]?.value?.node_id,
  call.id,
  'Composite output must create a data connection to the detached print node'
)
assert.equal(
  call.next,
  undefined,
  'pure-data Composite call must not participate in execution flow'
)
assert.equal(
  print.next,
  undefined,
  'terminal detached print must not invent a downstream execution edge'
)

const bytes = irToGia(doc, {
  graphId: GRAPH_ID,
  name: 'mixed-composite-normal',
  protoPath: PROTO_PATH
})
await writeFile(OUTPUT_PATH, Buffer.from(bytes))

const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const nodes = decoded.graph?.graph?.inner?.graph?.nodes ?? []
const eventNode = nodes.find((node) => node.genericId?.kind === 22000)
const callNode = nodes.find(
  (node) => node.genericId?.kind === 22001 && node.genericId?.nodeId === query.id
)
const printNode = nodes.find((node) => node.genericId?.nodeId === 1)
assert.ok(eventNode, 'decoded event node missing')
assert.ok(callNode, 'decoded pure-data Composite call missing')
assert.ok(printNode, 'decoded print node missing')

const eventOutflow = eventNode.pins?.find((pin) => pin.i1?.kind === 2 && pin.i1?.index === 0)
assert.deepEqual(
  eventOutflow?.connects?.map((connection) => connection.id),
  [printNode.nodeIndex],
  'decoded execution flow must go directly from event to print'
)
const printInput = printNode.pins?.find((pin) => pin.i1?.kind === 3 && pin.i1?.index === 0)
assert.ok(
  printInput?.connects?.some(
    (connection) =>
      connection.id === callNode.nodeIndex &&
      connection.connect?.kind === 4 &&
      connection.connect?.index === 0
  ),
  'decoded print data input must connect to Composite OutParam[0]'
)

console.log(`PASS pure-data Composite + detached node flow (${BACKEND}): ${OUTPUT_PATH}`)
console.log('PENDING GAME REVIEW: automatic IR and decoded GIA structure only')
