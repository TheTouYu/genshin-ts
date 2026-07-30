// @ts-nocheck
/**
 * P2-W11 nested capture boundary regression for vendor Graph embedding.
 *
 * A root float literal enters the outer composite, then reaches a nested child SysGraph call only
 * through the outer impl compositePins overlay. The vendor gate must not materialize that child
 * input as a physical pin or ordinary data edge.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts [output.gia]
 *   GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts [output.gia]
 *   GSTS_STAGE3_VENDOR_IMPL_GRAPH=0 npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts [output.gia]
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { resolveStage3ImplBackend } from '../../dist/src/compiler/ir_to_gia_transform/stage3_backend.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { float, str } from '../../dist/src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUTPUT_PATH = process.argv[2] ?? '/tmp/gsts-p2w11-nested-capture-vendor-graph.gia'
const GRAPH_ID = 1073742401
const INNER_NAME = 'P2W11_InnerCapture_GSTS'
const OUTER_NAME = 'P2W11_OuterNestedCapture_GSTS'
const BACKEND = resolveStage3ImplBackend().backend

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const inner = g.defineComposite(INNER_NAME, {
  inputs: { value: { type: 'float' } },
  outputs: {},
  outflows: ['完成'],
  build(inputs: any, f: any) {
    const innerPrint = f.node('print_string', [f.dataTypeConversion(inputs.value, 'str')])
    f.link(f.entry(), 0, innerPrint)
    f.outflow('完成', innerPrint, 0)
    return {}
  }
})

const outer = g.defineComposite(OUTER_NAME, {
  inputs: { capturedFloat: { type: 'float' } },
  outputs: {},
  build(inputs: any, f: any) {
    const nestedCall = f.declareDetached(inner, { value: inputs.capturedFloat })
    const outerPrint = f.node('print_string', [new str('P2W11 outer')])
    f.link(f.entry(), 0, nestedCall)
    f.link(nestedCall, 0, outerPrint)
    return {}
  }
})

g.server({ name: 'P2W11-nested-capture-vendor-graph', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event: any, f: any) => {
    f.callComposite(outer, { capturedFloat: new float(10) })
  }
)

const docs = buildServerGraphRegistriesIRDocuments({
  defaultName: 'P2W11-nested-capture-vendor-graph'
})
const bytes = irToGia(docs.at(-1), {
  graphId: GRAPH_ID,
  name: 'P2W11-nested-capture-vendor-graph',
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
const outerDefinition = decoded.accessories?.find(
  (accessory: any) => accessory.which === 12 && accessory.name === OUTER_NAME
)?.compositeDef?.inner?.def
const innerDefinition = decoded.accessories?.find(
  (accessory: any) => accessory.which === 12 && accessory.name === INNER_NAME
)?.compositeDef?.inner?.def
const outerImpl = outerAccessory?.graph?.inner?.graph
assert.ok(outerImpl, `outer impl missing: ${OUTER_NAME}`)
assert.ok(outerDefinition, `outer definition missing: ${OUTER_NAME}`)
assert.ok(innerDefinition, `inner definition missing: ${INNER_NAME}`)

const nestedNode = outerImpl.nodes?.find(
  (node: any) => node.genericId?.kind === 22001 && definitionIds.has(node.genericId?.nodeId)
)
assert.ok(nestedNode, 'outer impl nested SysGraph call missing')
assert.equal(
  nestedNode.pins?.some((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === 0),
  false,
  'captured nested input must not materialize as a physical InParam[0]'
)

const captureRoute = outerImpl.compositePins?.find(
  (pin: any) =>
    pin.outerPin?.kind === 3 &&
    pin.outerPin?.index === 0 &&
    pin.innerNodeId === nestedNode.nodeIndex &&
    pin.innerPin?.kind === 3 &&
    pin.innerPin?.index === 0
)
assert.ok(captureRoute, 'outer captured input must route to nested call through compositePins')
assert.equal(
  typeof outerDefinition.inputs?.[0]?.pinIndex,
  'number',
  'outer definition must retain a physical pinIndex for its captured input'
)
assert.equal(
  typeof innerDefinition.inputs?.[0]?.pinIndex,
  'number',
  'child definition must retain a physical pinIndex for its captured input'
)
assert.equal(
  captureRoute.innerPin?.index,
  0,
  'nested capture route must target child logical input index 0'
)
assert.equal(
  nestedNode.pins?.flatMap((pin: any) => pin.connects ?? []).length ?? 0,
  1,
  'nested call retains only its execution-flow connection'
)

const outerPrint = outerImpl.nodes?.find((node: any) => node.genericId?.nodeId === 1)
assert.ok(outerPrint, 'outer ordinary Print missing')
const nestedFlow = nestedNode.pins?.find((pin: any) => pin.i1?.kind === 2 && pin.i1?.index === 0)
assert.ok(
  nestedFlow?.connects?.some((connect: any) => connect.id === outerPrint.nodeIndex),
  'nested call OutFlow[0] must reach outer Print'
)

const sha256 = createHash('sha256').update(bytes).digest('hex')
console.log(`PASS P2-W11 ${BACKEND}: ${OUTPUT_PATH}`)
console.log(`SHA-256: ${sha256}`)
console.log(
  BACKEND === 'shared-vendor-impl-graph'
    ? 'PENDING EDITOR REVIEW: candidate routes an outer captured float to a nested SysGraph call through compositePins'
    : 'PENDING EDITOR REVIEW: legacy baseline only; do not treat it as vendor Graph evidence'
)
