// @ts-nocheck
/**
 * P2-W9 nested composite-call boundary baseline for vendor Graph embedding.
 *
 * The outer impl combines a synthetic nested SysGraph call with ordinary Print nodes. The
 * vendor gate must keep the synthetic call out of vendor ordinary materialization while retaining
 * the flow boundary between it and the vendor-materialized ordinary nodes.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts [output.gia]
 *   GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts [output.gia]
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
const EXPORT_DIR =
  '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
const OUTPUT_PATH = process.argv[2] ?? `${EXPORT_DIR}/P2W9-nested-call-vendor-graph-candidate.gia`
const GRAPH_ID = 1073742399
const INNER_NAME = 'P2W9_InnerVendorGraph_GSTS'
const OUTER_NAME = 'P2W9_OuterNestedVendorGraph_GSTS'
const USE_VENDOR_IMPL_GRAPH = process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH === '1'

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const inner = g.defineComposite(INNER_NAME, {
  inputs: {},
  outputs: {},
  outflows: ['完成'],
  build(_inputs: any, f: any) {
    const innerPrint = f.node('print_string', [new str('P2W9 inner')])
    f.link(f.entry(), 0, innerPrint)
    f.outflow('完成', innerPrint, 0)
    return {}
  }
})

const outer = g.defineComposite(OUTER_NAME, {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    const nestedCall = f.declareDetached(inner, {})
    const outerPrint = f.node('print_string', [new str('P2W9 outer')])
    f.link(f.entry(), 0, nestedCall)
    f.link(nestedCall, 0, outerPrint)
    return {}
  }
})

g.server({ name: 'P2W9-nested-call-vendor-graph', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event: any, f: any) => {
    f.callComposite(outer, {})
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'P2W9-nested-call-vendor-graph' })
const bytes = irToGia(docs.at(-1), {
  graphId: GRAPH_ID,
  name: 'P2W9-nested-call-vendor-graph',
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
assert.ok(
  outerAccessory.relatedIds?.some((id: any) => definitionIds.has(id.id)),
  'outer impl relatedIds must retain the nested composite definition reference'
)

const nestedNode = outerImpl.nodes?.find(
  (node: any) => node.genericId?.kind === 22001 && definitionIds.has(node.genericId?.nodeId)
)
assert.ok(nestedNode, 'outer impl nested SysGraph call missing')
const outerPrint = outerImpl.nodes?.find((node: any) => node.genericId?.nodeId === 1)
assert.ok(outerPrint, 'outer ordinary Print missing')
const nestedFlow = nestedNode.pins?.find((pin: any) => pin.i1?.kind === 2 && pin.i1?.index === 0)
assert.equal(
  nestedFlow?.compositePinIndex,
  innerDefinition.outflows?.[0]?.pinIndex,
  'nested call OutFlow[0] must use child outflow pinIndex'
)
assert.equal(nestedFlow?.connects?.length, 1, 'synthetic overlay must not duplicate the legacy flow edge')
assert.ok(nestedFlow?.connects?.some((connect: any) => connect.id === outerPrint.nodeIndex),
  'nested call OutFlow[0] must reach vendor-materialized outer Print'
)

const sha256 = createHash('sha256').update(bytes).digest('hex')
console.log(`PASS P2-W9 ${USE_VENDOR_IMPL_GRAPH ? 'vendor-Graph candidate' : 'legacy baseline'}: ${OUTPUT_PATH}`)
console.log(`SHA-256: ${sha256}`)
console.log(
  USE_VENDOR_IMPL_GRAPH
    ? 'PENDING EDITOR REVIEW: candidate uses vendor Graph for ordinary nodes around a nested SysGraph call'
    : 'PENDING EDITOR REVIEW: legacy baseline only; do not treat it as vendor Graph evidence'
)
