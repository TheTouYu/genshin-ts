// @ts-nocheck
/**
 * P2-W12 nested sparse named-input regression for vendor Graph embedding.
 *
 * The outer impl calls one child composite four times: first-only, second-only, both, and empty.
 * Each synthetic child call must retain its declared logical InParam indexes and child definition
 * pinIndexes; sparse calls must not compress their supplied input into InParam[0], while the child
 * impl continues to consume both definition inputs under the vendor gate.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts [output.gia]
 *   GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts [output.gia]
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { float, str } from '../../dist/src/runtime/value.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const EXPORT_DIR =
  '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
const OUTPUT_PATH = process.argv[2] ?? `${EXPORT_DIR}/P2W12-nested-sparse-input-vendor-graph-candidate.gia`
const GRAPH_ID = 1073742402
const INNER_NAME = 'P2W12_InnerSparseInput_GSTS'
const OUTER_NAME = 'P2W12_OuterSparseInput_GSTS'
const USE_VENDOR_IMPL_GRAPH = process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH === '1'

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const inner = g.defineComposite(INNER_NAME, {
  inputs: {
    first: { type: 'float' },
    second: { type: 'float' }
  },
  outputs: {},
  outflows: ['完成'],
  build(inputs: any, f: any) {
    const firstPrint = f.node('print_string', [f.dataTypeConversion(inputs.first, 'str')])
    const secondPrint = f.node('print_string', [f.dataTypeConversion(inputs.second, 'str')])
    f.link(f.entry(), 0, firstPrint)
    f.link(firstPrint, 0, secondPrint)
    f.outflow('完成', secondPrint, 0)
    return {}
  }
})

const outer = g.defineComposite(OUTER_NAME, {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    f.fork(
      () => {
        f.callComposite(inner, { first: new float(1.25) })
        f.printString('P2W12 first-only')
      },
      () => {
        f.callComposite(inner, { second: new float(12.5) })
        f.printString('P2W12 second-only')
      },
      () => {
        f.callComposite(inner, { first: new float(3.5), second: new float(7.5) })
        f.printString('P2W12 both')
      },
      () => {
        f.callComposite(inner, {})
        f.printString('P2W12 empty')
      }
    )
    return {}
  }
})

g.server({ name: 'P2W12-nested-sparse-input-vendor-graph', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event: any, f: any) => {
    f.callComposite(outer, {})
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'P2W12-nested-sparse-input-vendor-graph' })
const doc = docs.at(-1)
const outerIr = doc?.compositeDefs?.find((definition: any) => definition.name === OUTER_NAME)
const nestedIr = outerIr?.implNodes?.find((node: any) => node.type === '__composite_call__')
assert.ok(nestedIr, 'outer IR nested composite call missing')
const nestedIrCalls = outerIr?.implNodes?.filter((node: any) => node.type === '__composite_call__') ?? []
assert.equal(nestedIrCalls.length, 4, 'outer IR must contain first-only, second-only, both, and empty calls')
assert.equal(nestedIr.args?.[1]?.compositeInputIndex, 0, 'first-only IR must retain declared input index 0')
assert.equal(nestedIrCalls[1]?.args?.[1]?.compositeInputIndex, 1, 'second-only IR must retain declared input index 1')
assert.equal(nestedIrCalls[2]?.args?.[1]?.compositeInputIndex, 0, 'both IR must retain first input index 0')
assert.equal(nestedIrCalls[2]?.args?.[2]?.compositeInputIndex, 1, 'both IR must retain second input index 1')
assert.equal(nestedIrCalls[3]?.args?.length, 1, 'empty IR call must retain only the composite ID arg')

const bytes = irToGia(doc, {
  graphId: GRAPH_ID,
  name: 'P2W12-nested-sparse-input-vendor-graph',
  protoPath: PROTO_PATH
})
await writeFile(OUTPUT_PATH, Buffer.from(bytes))

const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const definitions = new Map(
  decoded.accessories
    ?.filter((accessory: any) => accessory.which === 12)
    .map((accessory: any) => [accessory.relatedIds?.[0]?.id, accessory.name]) ?? []
)
const definitionIds = new Set(
  decoded.accessories
    ?.filter((accessory: any) => accessory.which === 12)
    .map((accessory: any) => accessory.id?.id) ?? []
)
const outerAccessory = decoded.accessories?.find(
  (accessory: any) => accessory.which === 9 && definitions.get(accessory.id?.id) === OUTER_NAME
)
const innerDefinition = decoded.accessories?.find(
  (accessory: any) => accessory.which === 12 && accessory.name === INNER_NAME
)?.compositeDef?.inner?.def
const outerImpl = outerAccessory?.graph?.inner?.graph
assert.ok(outerImpl, `outer impl missing: ${OUTER_NAME}`)
assert.ok(innerDefinition, `inner definition missing: ${INNER_NAME}`)

const nestedNodes = outerImpl.nodes?.filter(
  (node: any) => node.genericId?.kind === 22001 && definitionIds.has(node.genericId?.nodeId)
) ?? []
assert.equal(nestedNodes.length, 4, 'outer impl must retain all four nested SysGraph calls')

function assertLiteralInput(node: any, inputIndex: number, expectedPinIndex: number, label: string): void {
  const input = node.pins?.find((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === inputIndex)
  assert.ok(input, `${label} must emit InParam[${inputIndex}]`)
  assert.equal(input.compositePinIndex, expectedPinIndex, `${label} must use the child input pinIndex`)
  assert.equal(input.connects?.length ?? 0, 0, `${label} literal input must not become an ordinary data edge`)
}

const [firstOnly, secondOnly, both, empty] = nestedNodes
assertLiteralInput(firstOnly, 0, innerDefinition.inputs?.[0]?.pinIndex, 'first-only')
assert.equal(
  firstOnly.pins?.some((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === 1),
  false,
  'first-only must not emit InParam[1]'
)
assertLiteralInput(secondOnly, 1, innerDefinition.inputs?.[1]?.pinIndex, 'second-only')
assert.equal(
  secondOnly.pins?.some((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === 0),
  false,
  'second-only must not compress into InParam[0]'
)
assertLiteralInput(both, 0, innerDefinition.inputs?.[0]?.pinIndex, 'both first')
assertLiteralInput(both, 1, innerDefinition.inputs?.[1]?.pinIndex, 'both second')
assert.equal(empty.pins?.filter((pin: any) => pin.i1?.kind === 3).length ?? 0, 0, 'empty must emit no input pins')

const innerAccessory = decoded.accessories?.find(
  (accessory: any) => accessory.which === 9 && definitions.get(accessory.id?.id) === INNER_NAME
)
const innerImpl = innerAccessory?.graph?.inner?.graph
assert.ok(innerImpl, `inner impl missing: ${INNER_NAME}`)
assert.equal(
  innerImpl.compositePins?.filter((pin: any) => pin.outerPin?.kind === 3).length,
  2,
  'child impl must retain routes for both declared inputs'
)

const outerPrints = outerImpl.nodes?.filter((node: any) => node.genericId?.nodeId === 1) ?? []
assert.equal(outerPrints.length, 4, 'outer impl must retain one Print after each nested call')
for (const [index, nestedNode] of nestedNodes.entries()) {
  const nestedFlow = nestedNode.pins?.find((pin: any) => pin.i1?.kind === 2 && pin.i1?.index === 0)
  assert.ok(
    nestedFlow?.connects?.some((connect: any) => connect.id === outerPrints[index]?.nodeIndex),
    `nested call ${index} OutFlow[0] must reach its vendor-materialized outer Print`
  )
}

const entryRoutes = outerImpl.compositePins?.filter(
  (pin: any) => pin.outerPin?.kind === 1 && pin.outerPin?.index === 0
) ?? []
assert.equal(entryRoutes.length, 4, 'outer entry must fan out to all four nested calls')
assert.deepEqual(
  entryRoutes.map((pin: any) => pin.innerNodeId).sort((a: number, b: number) => a - b),
  nestedNodes.map((node: any) => node.nodeIndex).sort((a: number, b: number) => a - b),
  'outer entry routes must target every nested call'
)

const sha256 = createHash('sha256').update(bytes).digest('hex')
console.log(`PASS P2-W12 ${USE_VENDOR_IMPL_GRAPH ? 'vendor-Graph candidate' : 'legacy baseline'}: ${OUTPUT_PATH}`)
console.log(`SHA-256: ${sha256}`)
console.log(
  USE_VENDOR_IMPL_GRAPH
    ? 'PENDING EDITOR REVIEW: candidate exercises first-only, second-only, both, and empty child calls under the vendor gate'
    : 'PENDING EDITOR REVIEW: legacy baseline only; do not treat it as vendor Graph evidence'
)
