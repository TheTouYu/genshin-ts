// @ts-nocheck
/**
 * Three-level nested capture regression.
 *
 * Level1.input[0] -> Level2.input[0] -> Level3.input[1]. The test distinguishes the call IR
 * args slot from the called Composite declaration index, then verifies both parent impl Graphs
 * retain the same logical routes through compositePins.
 *
 * Run after `npm run build`:
 *   npx tsx tests/composite/test-three-level-nested-capture-routing.ts [output.gia]
 *   GSTS_STAGE3_VENDOR_IMPL_GRAPH=0 \
 *     npx tsx tests/composite/test-three-level-nested-capture-routing.ts [output.gia]
 */

import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { resolveStage3ImplBackend } from '../../dist/src/compiler/ir_to_gia_transform/stage3_backend.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { entityLiteral } from '../../dist/src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUTPUT_PATH = process.argv[2] ?? '/tmp/gsts-three-level-nested-capture-routing.gia'
const GRAPH_ID = 1073742468
const LEVEL_1 = 'ThreeLevelCapture_Level1_GSTS'
const LEVEL_2 = 'ThreeLevelCapture_Level2_GSTS'
const LEVEL_3 = 'ThreeLevelCapture_Level3_GSTS'
const BACKEND = resolveStage3ImplBackend().backend

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const level3 = g.defineComposite(LEVEL_3, {
  inputs: {
    unused: { type: 'str' },
    pivot: { type: 'entity' }
  },
  outputs: { text: { type: 'str' } },
  build(args, f) {
    return { text: f.dataTypeConversion(args.pivot, 'str') }
  }
})

const level2 = g.defineComposite(LEVEL_2, {
  inputs: { pivot: { type: 'entity' } },
  outputs: { text: { type: 'str' } },
  build(args, f) {
    return { text: f.callComposite(level3, { pivot: args.pivot }).text }
  }
})

const level1 = g.defineComposite(LEVEL_1, {
  inputs: { pivot: { type: 'entity' } },
  outputs: { text: { type: 'str' } },
  build(args, f) {
    return { text: f.callComposite(level2, { pivot: args.pivot }).text }
  }
})

g.server({ name: 'three-level-nested-capture-routing', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    const result = f.callComposite(level1, { pivot: new entityLiteral(10001) })
    f.printString(result.text)
  }
)

const doc = buildServerGraphRegistriesIRDocuments({
  defaultName: 'three-level-nested-capture-routing'
}).at(-1)
assert.ok(doc)

function assertIrRoute(parentName: string, childId: number, expectedChildInputIndex: number): void {
  const parent = doc.compositeDefs?.find((definition) => definition.name === parentName)
  assert.ok(parent, `${parentName} IR definition missing`)
  const nestedCall = parent.implNodes?.find(
    (node) => node.type === '__composite_call__' && node.args?.[0]?.value === childId
  )
  assert.ok(nestedCall, `${parentName} nested call missing`)
  assert.equal(nestedCall.args?.length, 2, `${parentName} call must contain id + one binding`)
  assert.equal(nestedCall.args?.[1]?.capture, true, `${parentName} binding must be captured`)
  assert.equal(
    nestedCall.args?.[1]?.compositeInputIndex,
    expectedChildInputIndex,
    `${parentName} binding must retain the called Composite declaration index`
  )
  assert.ok(
    parent.compositePins?.some(
      (pin) =>
        pin.outerPinKind === 3 &&
        pin.outerPinIndex === 0 &&
        pin.innerNodeId === nestedCall.id &&
        pin.innerPinKind === 3 &&
        pin.innerPinIndex === expectedChildInputIndex
    ),
    `${parentName} IR compositePins must route outer InParam[0] to nested InParam[${expectedChildInputIndex}]`
  )
}

assertIrRoute(LEVEL_1, level2.id, 0)
assertIrRoute(LEVEL_2, level3.id, 1)

const bytes = irToGia(doc, {
  graphId: GRAPH_ID,
  name: 'three-level-nested-capture-routing',
  protoPath: PROTO_PATH
})
await writeFile(OUTPUT_PATH, Buffer.from(bytes))

const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const definitionNamesByImplId = new Map(
  decoded.accessories
    ?.filter((accessory) => accessory.which === 12)
    .map((accessory) => [accessory.relatedIds?.[0]?.id, accessory.name]) ?? []
)

function assertGiaRoute(
  parentName: string,
  childId: number,
  expectedChildInputIndex: number
): void {
  const impl = decoded.accessories?.find(
    (accessory) =>
      accessory.which === 9 && definitionNamesByImplId.get(accessory.id?.id) === parentName
  )?.graph?.inner?.graph
  assert.ok(impl, `${parentName} decoded impl Graph missing`)
  const nestedCall = impl.nodes?.find(
    (node) => node.genericId?.kind === 22001 && node.genericId?.nodeId === childId
  )
  assert.ok(nestedCall, `${parentName} decoded nested call missing`)
  assert.equal(
    nestedCall.pins?.some((pin) => pin.i1?.kind === 3 && pin.i1?.index === expectedChildInputIndex),
    false,
    `${parentName} captured nested input must not materialize a physical InParam`
  )
  assert.ok(
    impl.compositePins?.some(
      (pin) =>
        pin.outerPin?.kind === 3 &&
        pin.outerPin?.index === 0 &&
        pin.innerNodeId === nestedCall.nodeIndex &&
        pin.innerPin?.kind === 3 &&
        pin.innerPin?.index === expectedChildInputIndex
    ),
    `${parentName} decoded compositePins must route outer InParam[0] to nested InParam[${expectedChildInputIndex}]`
  )
}

assertGiaRoute(LEVEL_1, level2.id, 0)
assertGiaRoute(LEVEL_2, level3.id, 1)

console.log(`PASS three-level nested capture routing (${BACKEND}): ${OUTPUT_PATH}`)
console.log('PENDING EDITOR/GAME REVIEW: automatic IR and decoded GIA structure only')
