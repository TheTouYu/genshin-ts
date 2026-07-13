// @ts-nocheck
/**
 * P2-W7 captured-connection boundary baseline for the vendor Graph embedding experiment.
 *
 * The composite input is a capture boundary route, so it must remain out of ordinary vendor
 * literal materialization and be represented only by the impl compositePins overlay.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p2w7-captured-connection-vendor-graph.ts [output.gia]
 *   GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w7-captured-connection-vendor-graph.ts [output.gia]
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { float } from '../../dist/src/runtime/value.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const EXPORT_DIR =
  '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
const OUTPUT_PATH = process.argv[2] ?? `${EXPORT_DIR}/P2W7-captured-connection-vendor-graph-candidate.gia`
const GRAPH_ID = 1073742397
const COMPOSITE_NAME = 'P2W7_CapturedConnectionVendorGraph_GSTS'
const USE_VENDOR_IMPL_GRAPH = process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH === '1'

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const captureComposite = g.defineComposite(COMPOSITE_NAME, {
  inputs: { capturedFloat: { type: 'float' } },
  outputs: {},
  build(inputs: any, f: any) {
    const local = f.getLocalVariable(inputs.capturedFloat)
    const setter = f.node('set_local_variable', [local.localVariable, new float(1.25)])
    const read = f.addition(local.value, new float(0))
    const print = f.node('print_string', [f.dataTypeConversion(read, 'str')])
    f.link(f.entry(), 0, setter)
    f.link(setter, 0, print)
    return {}
  }
})

g.server({ name: 'P2W7-captured-connection-vendor-graph', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event: any, f: any) => {
    const producer = f.addition(new float(4), new float(6))
    const call = f.declareDetached(captureComposite, { capturedFloat: producer })
    f.link(f.entry(), 0, call)
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'P2W7-captured-connection-vendor-graph' })
const bytes = irToGia(docs.at(-1), {
  graphId: GRAPH_ID,
  name: 'P2W7-captured-connection-vendor-graph',
  protoPath: PROTO_PATH
})
await writeFile(OUTPUT_PATH, Buffer.from(bytes))

const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const rootGraph = decoded.graph?.graph?.inner?.graph
assert.ok(rootGraph, 'root graph missing')
const definitions = new Map(
  decoded.accessories
    ?.filter((accessory: any) => accessory.which === 12)
    .map((accessory: any) => [accessory.relatedIds?.[0]?.id, accessory.name]) ?? []
)
const implGraph = decoded.accessories
  ?.find(
    (accessory: any) =>
      accessory.which === 9 && definitions.get(accessory.id?.id) === COMPOSITE_NAME
  )
  ?.graph?.inner?.graph
assert.ok(implGraph, `composite impl missing: ${COMPOSITE_NAME}`)

const rootAddition = rootGraph.nodes?.find((node: any) => node.genericId?.nodeId === 200)
assert.ok(rootAddition, 'root float Addition producer missing')
const rootCall = rootGraph.nodes?.find((node: any) => node.genericId?.kind === 22001)
assert.ok(rootCall, 'root composite call missing')
const rootCallInput = rootCall.pins?.find((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === 0)
assert.ok(rootCallInput, 'root composite call InParam[0] missing')
assert.equal(rootCallInput.connects?.length, 1, 'root producer must connect to composite call input')
assert.equal(rootCallInput.connects?.[0]?.id, rootAddition.nodeIndex, 'root call input source must be Addition')
assert.equal(rootCallInput.connects?.[0]?.connect?.kind, 4, 'root call input source kind must be OutParam')
assert.equal(rootCallInput.connects?.[0]?.connect?.index, 0, 'root call input source must be OutParam[0]')

const nodes = implGraph.nodes ?? []
assert.equal(nodes.filter((node: any) => node.genericId?.nodeId === 18).length, 1, 'one local getter')
assert.equal(nodes.filter((node: any) => node.genericId?.nodeId === 19).length, 1, 'one local setter')
assert.equal(nodes.filter((node: any) => node.genericId?.nodeId === 200).length, 1, 'one addition')
assert.equal(nodes.filter((node: any) => node.genericId?.nodeId === 180).length, 1, 'one conversion')
assert.equal(nodes.filter((node: any) => node.genericId?.nodeId === 1).length, 1, 'one print')

const getter = nodes.find((node: any) => node.genericId?.nodeId === 18)
assert.equal(getter.concreteId?.nodeId, 2659, 'captured float local getter concrete ID')
const capturedValuePin = getter.pins?.find((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === 0)
assert.ok(capturedValuePin, 'getter must retain the vendor-created InParam[0] schema pin')
assert.equal(capturedValuePin.connects?.length ?? 0, 0, 'captured connection must not become an impl ordinary edge')

const captureRoute = implGraph.compositePins?.find(
  (pin: any) =>
    pin.outerPin?.kind === 3 &&
    pin.outerPin?.index === 0 &&
    pin.innerNodeId === getter.nodeIndex &&
    pin.innerPin?.kind === 3 &&
    pin.innerPin?.index === 0
)
assert.ok(captureRoute, 'captured connection must route through compositePins to getter InParam[0]')
assert.equal(
  implGraph.compositePins?.filter((pin: any) => pin.outerPin?.kind === 3).length,
  1,
  'one captured-connection boundary route'
)

const setter = nodes.find((node: any) => node.genericId?.nodeId === 19)
assert.equal(setter.concreteId?.nodeId, 2677, 'float setter concrete ID')
const flowCount = nodes.flatMap((node: any) => node.pins ?? []).filter(
  (pin: any) => pin.i1?.kind === 2 && pin.connects?.length
).length
assert.equal(flowCount, 1, 'one ordinary execution-flow edge')

const sha256 = createHash('sha256').update(bytes).digest('hex')
console.log(`PASS P2-W7 ${USE_VENDOR_IMPL_GRAPH ? 'vendor-Graph candidate' : 'legacy baseline'}: ${OUTPUT_PATH}`)
console.log(`SHA-256: ${sha256}`)
console.log(
  USE_VENDOR_IMPL_GRAPH
    ? 'PENDING EDITOR REVIEW: candidate uses vendor Graph with a captured connection composite input boundary'
    : 'PENDING EDITOR REVIEW: legacy baseline only; do not treat it as vendor Graph evidence'
)
