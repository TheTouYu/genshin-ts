// @ts-nocheck
/**
 * P2-W10 nested ordinary-data → synthetic composite-call boundary regression.
 *
 * A float Addition in the outer impl feeds the only non-capture input of a nested SysGraph call.
 * Under the vendor gate, Addition is materialized by vendor Graph while the nested call retains
 * legacy composite lowering. The data edge must remain on the child call InParam, not become a
 * capture route or disappear during ordinary Graph encoding.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p2w10-nested-data-input-vendor-graph.ts [output.gia]
 *   GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w10-nested-data-input-vendor-graph.ts [output.gia]
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
const OUTPUT_PATH = process.argv[2] ?? `${EXPORT_DIR}/P2W10-nested-data-input-vendor-graph-candidate.gia`
const GRAPH_ID = 1073742400
const INNER_NAME = 'P2W10_InnerDataInput_GSTS'
const OUTER_NAME = 'P2W10_OuterNestedDataInput_GSTS'
const USE_VENDOR_IMPL_GRAPH = process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH === '1'

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const inner = g.defineComposite(INNER_NAME, {
  inputs: { value: { type: 'float' } },
  outputs: {},
  outflows: ['完成'],
  build(_inputs: any, f: any) {
    const innerPrint = f.node('print_string', [new str('P2W10 inner')])
    f.link(f.entry(), 0, innerPrint)
    f.outflow('完成', innerPrint, 0)
    return {}
  }
})

const outer = g.defineComposite(OUTER_NAME, {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    const producer = f.addition(new float(4), new float(6))
    const nestedCall = f.declareDetached(inner, { value: producer })
    const outerPrint = f.node('print_string', [new str('P2W10 outer')])
    f.link(f.entry(), 0, nestedCall)
    f.link(nestedCall, 0, outerPrint)
    return {}
  }
})

g.server({ name: 'P2W10-nested-data-input-vendor-graph', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event: any, f: any) => {
    f.callComposite(outer, {})
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'P2W10-nested-data-input-vendor-graph' })
const bytes = irToGia(docs.at(-1), {
  graphId: GRAPH_ID,
  name: 'P2W10-nested-data-input-vendor-graph',
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

const nestedNode = outerImpl.nodes?.find(
  (node: any) => node.genericId?.kind === 22001 && definitionIds.has(node.genericId?.nodeId)
)
assert.ok(nestedNode, 'outer impl nested SysGraph call missing')
const nestedInput = nestedNode.pins?.find((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === 0)
assert.ok(nestedInput, 'nested call float InParam[0] missing')
assert.equal(
  nestedInput.compositePinIndex,
  innerDefinition.inputs?.[0]?.pinIndex,
  'nested call InParam[0] must use the child input pinIndex'
)
assert.equal(nestedInput.connects?.length, 1, 'nested call input must retain one ordinary data edge')

const producerIndex = nestedInput.connects?.[0]?.id
const producer = outerImpl.nodes?.find((node: any) => node.nodeIndex === producerIndex)
assert.ok(producer, 'nested call data source must resolve to an outer ordinary node')
assert.equal(producer.genericId?.nodeId, 200, 'nested call data source must be the float Addition producer')
assert.ok(
  producer.pins?.some((pin: any) => pin.i1?.kind === 4 && pin.i1?.index === 0),
  'vendor-materialized Addition must retain OutParam[0]'
)
assert.equal(
  outerImpl.compositePins?.filter((pin: any) => pin.outerPin?.kind === 3).length ?? 0,
  0,
  'non-capture nested data input must not become an outer compositePins route'
)

const sha256 = createHash('sha256').update(bytes).digest('hex')
console.log(`PASS P2-W10 ${USE_VENDOR_IMPL_GRAPH ? 'vendor-Graph candidate' : 'legacy baseline'}: ${OUTPUT_PATH}`)
console.log(`SHA-256: ${sha256}`)
console.log(
  USE_VENDOR_IMPL_GRAPH
    ? 'PENDING EDITOR REVIEW: candidate uses a vendor-materialized float Addition feeding a nested SysGraph input'
    : 'PENDING EDITOR REVIEW: legacy baseline only; do not treat it as vendor Graph evidence'
)
