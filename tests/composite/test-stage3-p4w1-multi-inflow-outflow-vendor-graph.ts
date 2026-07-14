// @ts-nocheck
/**
 * P4-W1 B4: multi-InFlow / multi-OutFlow boundary contract.
 *
 * Two root entry edges target distinct InFlow indexes of a synthetic composite call. Each child
 * OutFlow must retain its physical index and reach a distinct ordinary root Print consumer.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { str } from '../../dist/src/runtime/value.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUTPUT_PATH = process.argv[2] ?? '/tmp/P4W1-multi-inflow-outflow-vendor.gia'
const GRAPH_ID = 1073742421
const NAME = 'P4W1_MultiInflowOutflow_GSTS'
const USE_VENDOR_IMPL_GRAPH = process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH === '1'

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const multi = g.defineComposite(NAME, {
  inflows: [{ name: '左' }, { name: '右' }],
  outflows: [{ name: '左完成' }, { name: '右完成' }],
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    const left = f.node('print_string', [new str('P4W1 left')])
    const right = f.node('print_string', [new str('P4W1 right')])
    f.inflow('左', left)
    f.inflow('右', right)
    f.outflow('左完成', left, 0)
    f.outflow('右完成', right, 0)
    return {}
  }
})

g.server({ name: 'P4W1-multi-inflow-outflow', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event: any, f: any) => {
    const call = f.declareDetached(multi, {})
    const leftConsumer = f.node('print_string', [new str('P4W1 root left')])
    const rightConsumer = f.node('print_string', [new str('P4W1 root right')])
    f.link(f.entry(), 0, call, 0)
    f.link(f.entry(), 0, call, 1)
    f.link(call, 0, leftConsumer)
    f.link(call, 1, rightConsumer)
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'P4W1-multi-inflow-outflow' })
const bytes = irToGia(docs.at(-1), {
  graphId: GRAPH_ID,
  name: 'P4W1-multi-inflow-outflow',
  protoPath: PROTO_PATH
})
await writeFile(OUTPUT_PATH, Buffer.from(bytes))

const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const definition = decoded.accessories?.find(
  (accessory: any) => accessory.which === 12 && accessory.name === NAME
)?.compositeDef?.inner?.def
const definitionIds = new Set(
  decoded.accessories?.filter((accessory: any) => accessory.which === 12).map((accessory: any) => accessory.id?.id) ?? []
)
const rootGraph = decoded.graph?.graph?.inner?.graph
const implGraph = decoded.accessories?.find(
  (accessory: any) => accessory.which === 9 && accessory.name === '' && accessory.id?.id === definition?.id?.graphId?.id
)?.graph?.inner?.graph
assert.ok(definition, 'multi-flow definition missing')
assert.ok(rootGraph, 'root graph missing')
assert.ok(implGraph, 'multi-flow impl graph missing')
assert.equal(definition.inflows?.length, 2, 'definition must retain two InFlows')
assert.equal(definition.outflows?.length, 2, 'definition must retain two OutFlows')

const call = rootGraph.nodes?.find(
  (node: any) => node.genericId?.kind === 22001 && definitionIds.has(node.genericId?.nodeId)
)
assert.ok(call, 'root synthetic multi-flow call missing')
for (const index of [0, 1]) {
  const inflow = rootGraph.nodes?.flatMap((node: any) => node.pins ?? []).find(
    (pin: any) => pin.i1?.kind === 2 && pin.connects?.some(
      (connect: any) => connect.id === call.nodeIndex && connect.connect?.kind === 1 && connect.connect?.index === index
    )
  )
  assert.ok(inflow, `root entry must target synthetic call InFlow[${index}]`)
  const outflow = call.pins?.find((pin: any) => pin.i1?.kind === 2 && pin.i1?.index === index)
  assert.ok(outflow, `synthetic call must retain physical OutFlow[${index}]`)
  assert.equal(outflow.compositePinIndex, definition.outflows?.[index]?.pinIndex)
  assert.equal(outflow.connects?.length, 1, `synthetic call OutFlow[${index}] must have one consumer`)
}

const routes = implGraph.compositePins ?? []
for (const index of [0, 1]) {
  assert.ok(
    routes.some((pin: any) => pin.outerPin?.kind === 1 && pin.outerPin?.index === index && pin.innerPin?.kind === 1),
    `impl must route InFlow[${index}] through compositePins`
  )
  assert.ok(
    routes.some((pin: any) => pin.outerPin?.kind === 2 && pin.outerPin?.index === index && pin.innerPin?.kind === 2),
    `impl must route OutFlow[${index}] through compositePins`
  )
}

const sha256 = createHash('sha256').update(bytes).digest('hex')
console.log(`PASS P4-W1 B4 ${USE_VENDOR_IMPL_GRAPH ? 'vendor-Graph' : 'legacy'}: ${OUTPUT_PATH}`)
console.log(`SHA-256: ${sha256}`)
console.log('PENDING EDITOR REVIEW: two indexed InFlows and two indexed OutFlows reach distinct Print chains')
