// @ts-nocheck
/**
 * P2-W5 legacy baseline for the vendor Graph embedding experiment.
 *
 * This file deliberately uses the current composite implementation. Its editor-approved output
 * becomes the only reference for the later refactored candidate; it does not prove that vendor
 * Graph embedding works.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p2w5-vendor-graph-baseline.ts [output.gia]
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
const EXPORT_DIR =
  '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
const OUTPUT_PATH = process.argv[2] ?? `${EXPORT_DIR}/P2W5-vendor-graph-legacy-baseline.gia`
const GRAPH_ID = 1073742395
const COMPOSITE_NAME = 'P2W5_VendorGraphEmbedding_GSTS'
const USE_VENDOR_IMPL_GRAPH = process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH === '1'

// Preserve ordinary arithmetic and conversion nodes for both editor reviews.
setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

function addOrdinaryGraphBranches(f: any) {
  const literalLocal = f.getLocalVariable(new float(10))
  const literalSetter = f.node('set_local_variable', [
    literalLocal.localVariable,
    new float(1.25)
  ])
  const literalRead = f.addition(literalLocal.value, new float(0))
  const literalPrint = f.node('print_string', [f.dataTypeConversion(literalRead, 'str')])

  const connectedLocal = f.getLocalVariable(new float(20))
  const producer = f.addition(new float(2), new float(3))
  const connectedSetter = f.node('set_local_variable', [
    connectedLocal.localVariable,
    asRuntimeValue(producer)
  ])
  const connectedRead = f.addition(connectedLocal.value, new float(0))
  const connectedPrint = f.node('print_string', [f.dataTypeConversion(connectedRead, 'str')])

  return { literalSetter, literalPrint, connectedSetter, connectedPrint }
}

const vendorGraphComposite = g.defineComposite(COMPOSITE_NAME, {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    const branches = addOrdinaryGraphBranches(f)
    const entry = f.entry()
    f.link(entry, 0, branches.literalSetter)
    f.link(entry, 0, branches.connectedSetter)
    f.link(branches.literalSetter, 0, branches.literalPrint)
    f.link(branches.connectedSetter, 0, branches.connectedPrint)
    return {}
  }
})

g.server({ name: 'P2W5-vendor-Graph-legacy-baseline', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event: any, f: any) => {
    const branches = addOrdinaryGraphBranches(f)
    const compositeCall = f.declareDetached(vendorGraphComposite, {})
    const entry = f.entry()
    f.link(entry, 0, branches.literalSetter)
    f.link(entry, 0, branches.connectedSetter)
    f.link(entry, 0, compositeCall)
    f.link(branches.literalSetter, 0, branches.literalPrint)
    f.link(branches.connectedSetter, 0, branches.connectedPrint)
  }
)

const docs = buildServerGraphRegistriesIRDocuments({
  defaultName: 'P2W5-vendor-Graph-legacy-baseline'
})
const bytes = irToGia(docs.at(-1), {
  graphId: GRAPH_ID,
  name: 'P2W5-vendor-Graph-legacy-baseline',
  protoPath: PROTO_PATH
})
await writeFile(OUTPUT_PATH, Buffer.from(bytes))

const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const rootGraph = decoded.graph?.graph?.inner?.graph
assert.ok(rootGraph, 'root graph missing')

const eventNode = rootGraph.nodes?.find((node: any) => node.genericId?.nodeId === 71)
const eventTargets = eventNode?.pins
  ?.find((pin: any) => pin.i1?.kind === 2 && pin.i1?.index === 0)
  ?.connects?.map((connect: any) => connect.id) ?? []
assert.equal(eventTargets.length, 3, 'event must fan out to both branches and the composite call')

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

for (const [scope, graph] of [
  ['root', rootGraph],
  ['impl', implGraph]
]) {
  const nodes = graph.nodes ?? []
  const getters = nodes.filter((node: any) => node.genericId?.nodeId === 18)
  const setters = nodes.filter((node: any) => node.genericId?.nodeId === 19)
  assert.equal(getters.length, 2, `${scope}: two local-variable getters`)
  assert.equal(setters.length, 2, `${scope}: two local-variable setters`)
  assert.equal(nodes.filter((node: any) => node.genericId?.nodeId === 200).length, 3, `${scope}: additions`)
  assert.equal(nodes.filter((node: any) => node.genericId?.nodeId === 180).length, 2, `${scope}: conversions`)
  assert.equal(nodes.filter((node: any) => node.genericId?.nodeId === 1).length, 2, `${scope}: prints`)

  for (const getter of getters) {
    assert.equal(getter.concreteId?.nodeId, 2659, `${scope}: float getter concrete ID`)
  }
  for (const setter of setters) {
    assert.equal(setter.concreteId?.nodeId, 2677, `${scope}: float setter concrete ID`)
  }

  const connectedSetter = setters.find((node: any) =>
    node.pins?.some((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === 1 && pin.connects?.length)
  )
  assert.ok(connectedSetter, `${scope}: Addition must connect to a setter value pin`)
  const flowCount = nodes.flatMap((node: any) => node.pins ?? []).filter(
    (pin: any) => pin.i1?.kind === 2 && pin.connects?.length
  ).length
  assert.equal(
    flowCount,
    scope === 'root' ? 3 : 2,
    `${scope}: expected ordinary execution-flow edges`
  )
}

const sha256 = createHash('sha256').update(bytes).digest('hex')
console.log(`PASS P2-W5 ${USE_VENDOR_IMPL_GRAPH ? 'vendor-Graph candidate' : 'legacy baseline'}: ${OUTPUT_PATH}`)
console.log(`SHA-256: ${sha256}`)
console.log(
  USE_VENDOR_IMPL_GRAPH
    ? 'PENDING EDITOR REVIEW: this candidate uses vendor Graph for the composite impl ordinary graph'
    : 'PENDING EDITOR REVIEW: this is the legacy reference only; do not treat it as vendor Graph evidence'
)
