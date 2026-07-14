// @ts-nocheck
/**
 * P3-W20 complex flow parity sentinel.
 *
 * Covers an ordinary fan-out inside a vendor-gated impl, two child OutFlow indexes crossing the
 * synthetic-call overlay, and ordinary data edges consumed on both sides of that boundary.
 * Run once without, then once with GSTS_STAGE3_VENDOR_IMPL_GRAPH=1.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { asRuntimeValue, float, str } from '../../dist/src/runtime/value.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUTPUT_PATH = process.argv[2] ?? '/tmp/P3W20-complex-flow-parity.gia'
const GRAPH_ID = 1073742420
const INNER_NAME = 'P3W20_ComplexFlowInner_GSTS'
const OUTER_NAME = 'P3W20_ComplexFlowOuter_GSTS'
const USE_VENDOR_IMPL_GRAPH = process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH === '1'

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const inner = g.defineComposite(INNER_NAME, {
  inputs: { value: { type: 'float' } },
  outputs: {},
  outflows: ['左', '右'],
  build(inputs: any, f: any) {
    const fanout = f.node('print_string', [f.dataTypeConversion(inputs.value, 'str')])
    const left = f.node('print_string', [new str('P3W20 left')])
    const right = f.node('print_string', [new str('P3W20 right')])
    f.link(f.entry(), 0, fanout)
    f.link(fanout, 0, left)
    f.link(fanout, 0, right)
    f.outflow('左', left, 0)
    f.outflow('右', right, 0)
    return {}
  }
})

const outer = g.defineComposite(OUTER_NAME, {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    const producer = f.addition(new float(3.5), new float(4.5))
    const nested = f.declareDetached(inner, { value: asRuntimeValue(producer) })
    const left = f.node('print_string', [f.dataTypeConversion(asRuntimeValue(producer), 'str')])
    const right = f.node('print_string', [f.dataTypeConversion(asRuntimeValue(producer), 'str')])
    f.link(f.entry(), 0, nested)
    f.link(nested, 0, left)
    f.link(nested, 1, right)
    return {}
  }
})

g.server({ name: 'P3W20-complex-flow-parity', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event: any, f: any) => f.callComposite(outer, {})
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'P3W20-complex-flow-parity' })
const bytes = irToGia(docs.at(-1), {
  graphId: GRAPH_ID,
  name: 'P3W20-complex-flow-parity',
  protoPath: PROTO_PATH
})
await writeFile(OUTPUT_PATH, Buffer.from(bytes))

const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const definitions = new Map(
  decoded.accessories
    ?.filter((accessory: any) => accessory.which === 12)
    .map((accessory: any) => [accessory.relatedIds?.[0]?.id, accessory.name]) ?? []
)
const graphFor = (name: string) => decoded.accessories?.find(
  (accessory: any) => accessory.which === 9 && definitions.get(accessory.id?.id) === name
)?.graph?.inner?.graph
const innerImpl = graphFor(INNER_NAME)
const outerImpl = graphFor(OUTER_NAME)
assert.ok(innerImpl, 'inner impl missing')
assert.ok(outerImpl, 'outer impl missing')

const innerPrints = innerImpl.nodes?.filter((node: any) => node.genericId?.nodeId === 1) ?? []
assert.equal(innerPrints.length, 3, 'inner ordinary fan-out fixture must retain three Print nodes')
const fanout = innerPrints.find((node: any) => node.pins?.some(
  (pin: any) => pin.i1?.kind === 2 && pin.i1?.index === 0 && (pin.connects?.length ?? 0) === 2
))
assert.ok(fanout, 'one ordinary inner Print OutFlow[0] must fan out to two downstream nodes')
const fanoutTargets = fanout.pins.find((pin: any) => pin.i1?.kind === 2 && pin.i1?.index === 0).connects
assert.equal(new Set(fanoutTargets.map((edge: any) => edge.id)).size, 2, 'fan-out targets must be distinct')

const nested = outerImpl.nodes?.find((node: any) => node.genericId?.kind === 22001)
assert.ok(nested, 'outer synthetic nested call missing')
const outerPrints = outerImpl.nodes?.filter((node: any) => node.genericId?.nodeId === 1) ?? []
assert.equal(outerPrints.length, 2, 'outer must retain two ordinary post-call consumers')
for (const outflowIndex of [0, 1]) {
  const pin = nested.pins?.find((entry: any) => entry.i1?.kind === 2 && entry.i1?.index === outflowIndex)
  assert.ok(pin, `nested OutFlow[${outflowIndex}] physical pin missing`)
  assert.equal(pin.connects?.length, 1, `nested OutFlow[${outflowIndex}] must have one overlay target`)
  assert.ok(
    outerPrints.some((node: any) => node.nodeIndex === pin.connects[0].id),
    `nested OutFlow[${outflowIndex}] must reach an ordinary outer consumer`
  )
}

const addition = outerImpl.nodes?.find((node: any) => node.genericId?.nodeId === 200)
assert.ok(addition, 'outer ordinary addition producer missing')
const conversions = outerImpl.nodes?.filter((node: any) => node.genericId?.nodeId === 180) ?? []
assert.equal(conversions.length, 2, 'outer must retain two ordinary DTC consumers')
for (const conversion of conversions) {
  assert.ok(
    conversion.pins?.some((pin: any) =>
      pin.i1?.kind === 3 && pin.connects?.some((edge: any) => edge.id === addition.nodeIndex)
    ),
    'each ordinary DTC input must connect to the shared addition producer'
  )
}
for (const print of outerPrints) {
  assert.ok(
    print.pins?.some((pin: any) =>
      pin.i1?.kind === 3 && pin.connects?.some((edge: any) =>
        conversions.some((conversion: any) => conversion.nodeIndex === edge.id)
      )
    ),
    'each ordinary Print input must retain its DTC data edge'
  )
}

console.log(`PASS P3-W20 complex flow parity (${USE_VENDOR_IMPL_GRAPH ? 'vendor' : 'legacy'}): ${OUTPUT_PATH}`)
console.log('Covers ordinary fan-out, two indexed synthetic outflows, and multi-consumer ordinary data edges')
