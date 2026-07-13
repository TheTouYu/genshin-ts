// @ts-nocheck
/**
 * P2-W8 captured custom-target boundary observation for vendor Graph embedding.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p2w8-captured-custom-target-vendor-graph.ts [output.gia]
 *   GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w8-captured-custom-target-vendor-graph.ts [output.gia]
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
const OUTPUT_PATH = process.argv[2] ?? `${EXPORT_DIR}/P2W8-captured-custom-target-vendor-graph-candidate.gia`
const GRAPH_ID = 1073742398
const COMPOSITE_NAME = 'P2W8_CapturedCustomTargetVendorGraph_GSTS'
const USE_VENDOR_IMPL_GRAPH = process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH === '1'

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const customTargetComposite = g.defineComposite(COMPOSITE_NAME, {
  inputs: { target: { type: 'entity' } },
  outputs: {},
  build(inputs: any, f: any) {
    f.setCustomVariable(inputs.target, 'p2w8_literal_float', new float(1.25), false)
    const producer = f.addition(new float(2), new float(3))
    f.setCustomVariable(inputs.target, 'p2w8_connected_float', producer, false)
    const getter = f.getCustomVariable(inputs.target, 'p2w8_connected_float').asType('float')
    f.printString(f.dataTypeConversion(f.addition(getter, new float(0)), 'str'))
    return {}
  }
})

g.server({ name: 'P2W8-captured-custom-target-vendor-graph', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event: any, f: any) => {
    const self = f.getSelfEntity()
    f.callComposite(customTargetComposite, { target: self })
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'P2W8-captured-custom-target-vendor-graph' })
const bytes = irToGia(docs.at(-1), {
  graphId: GRAPH_ID,
  name: 'P2W8-captured-custom-target-vendor-graph',
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

const rootCall = rootGraph.nodes?.find((node: any) => node.genericId?.kind === 22001)
assert.ok(rootCall, 'root composite call missing')
assert.ok(
  rootCall.pins?.some((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === 0),
  'root composite call must retain target InParam[0]'
)

function stringPin(node: any, index: number): string | undefined {
  return (node.pins ?? []).find(
    (pin: any) => pin.i1?.kind === 3 && pin.i1?.index === index
  )?.value?.bString?.val
}

function customNodes(giaGraph: any, genericId: number): any[] {
  return (giaGraph.nodes ?? []).filter((node: any) => node.genericId?.nodeId === genericId)
}

const setters = customNodes(implGraph, 22)
assert.equal(setters.length, 2, 'impl must contain both custom setters')
for (const name of ['p2w8_literal_float', 'p2w8_connected_float']) {
  const setter = setters.find((node: any) => stringPin(node, 1) === name)
  assert.ok(setter, `custom setter missing: ${name}`)
  assert.equal(setter.concreteId?.nodeId, 26, `${name}: float setter concrete ID`)
  assert.equal(
    setter.pins?.some((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === 0),
    false,
    `${name}: captured target must not materialize as an ordinary InParam[0]`
  )
}

const getter = customNodes(implGraph, 50).find(
  (node: any) => stringPin(node, 1) === 'p2w8_connected_float'
)
assert.ok(getter, 'impl custom getter missing')
assert.equal(getter.concreteId?.nodeId, 54, 'float custom getter concrete ID')
assert.equal(
  getter.pins?.some((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === 0),
  false,
  'captured target must not materialize as getter InParam[0]'
)

const targetRoutes = implGraph.compositePins?.filter(
  (pin: any) => pin.outerPin?.kind === 3 && pin.outerPin?.index === 0 && pin.innerPin?.kind === 3 && pin.innerPin?.index === 0
) ?? []
assert.equal(targetRoutes.length, 3, 'captured target must route to two setters and one getter')
const routedNodeIds = new Set(targetRoutes.map((pin: any) => pin.innerNodeId))
for (const node of [...setters, getter]) {
  assert.ok(routedNodeIds.has(node.nodeIndex), 'every custom node target must be routed through compositePins')
}

assert.equal(customNodes(implGraph, 200).length, 2, 'impl must retain both Addition producers')
assert.equal(customNodes(implGraph, 180).length, 1, 'impl must retain float-to-string conversion')
const connectedSetter = setters.find((node: any) => stringPin(node, 1) === 'p2w8_connected_float')
assert.ok(
  connectedSetter.pins?.some((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === 2 && pin.connects?.length),
  'connected custom setter value must retain an ordinary Addition edge'
)

const sha256 = createHash('sha256').update(bytes).digest('hex')
console.log(`PASS P2-W8 ${USE_VENDOR_IMPL_GRAPH ? 'vendor-Graph candidate' : 'legacy baseline'}: ${OUTPUT_PATH}`)
console.log(`SHA-256: ${sha256}`)
console.log(
  USE_VENDOR_IMPL_GRAPH
    ? 'PENDING EDITOR REVIEW: candidate uses vendor Graph with captured custom-variable target boundary routes'
    : 'PENDING EDITOR REVIEW: legacy baseline only; do not treat it as vendor Graph evidence'
)
