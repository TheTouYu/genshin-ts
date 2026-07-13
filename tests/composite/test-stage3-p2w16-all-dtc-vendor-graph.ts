// @ts-nocheck
/**
 * P2-W16: all currently mapped server-side data type conversion variants.
 *
 * The fixture keeps every source as a composite input so faction remains wired, then converts every
 * result to string for an observable Print String branch. The vendor-gated run only changes the
 * composite impl ordinary graph backend.
 *
 * Run:
 *   npx tsx tests/composite/test-stage3-p2w16-all-dtc-vendor-graph.ts /tmp/P2W16-all-dtc-legacy.gia
 *   GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w16-all-dtc-vendor-graph.ts /tmp/P2W16-all-dtc-vendor.gia
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { bool, entityLiteral, faction, float, guid, int, vec3 } from '../../dist/src/runtime/value.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUTPUT_PATH = process.argv[2] ?? '/tmp/P2W16-all-dtc-vendor-graph.gia'
const GRAPH_ID = 1073742416
const COMPOSITE_NAME = 'P2W16_AllDataTypeConversions_GSTS'
const USE_VENDOR_IMPL_GRAPH = process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH === '1'

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const expectedVariants = new Map([
  [180, { inputType: 3, outputType: 4, inputConcrete: 0, outputConcrete: 0 }],
  [181, { inputType: 3, outputType: 5, inputConcrete: 0, outputConcrete: 1 }],
  [182, { inputType: 3, outputType: 6, inputConcrete: 0, outputConcrete: 2 }],
  [183, { inputType: 1, outputType: 6, inputConcrete: 1, outputConcrete: 2 }],
  [184, { inputType: 2, outputType: 6, inputConcrete: 2, outputConcrete: 2 }],
  [185, { inputType: 4, outputType: 3, inputConcrete: 3, outputConcrete: 3 }],
  [186, { inputType: 4, outputType: 6, inputConcrete: 3, outputConcrete: 2 }],
  [187, { inputType: 5, outputType: 3, inputConcrete: 4, outputConcrete: 3 }],
  [188, { inputType: 5, outputType: 6, inputConcrete: 4, outputConcrete: 2 }],
  [189, { inputType: 12, outputType: 6, inputConcrete: 5, outputConcrete: 2 }],
  [255, { inputType: 17, outputType: 6, inputConcrete: 6, outputConcrete: 2 }]
])

const allDtc = g.defineComposite(COMPOSITE_NAME, {
  inputs: {
    intZero: { type: 'int' },
    intSeven: { type: 'int' },
    boolFalse: { type: 'bool' },
    boolTrue: { type: 'bool' },
    floatPositive: { type: 'float' },
    floatNegative: { type: 'float' },
    entityValue: { type: 'entity' },
    guidValue: { type: 'guid' },
    vectorValue: { type: 'vec3' }
  },
  outputs: {},
  variables: {
    factionValue: new faction(2)
  },
  build(inputs: any, f: any) {
    const intToBool = f.dataTypeConversion(inputs.intZero, 'bool')
    const intToFloat = f.dataTypeConversion(inputs.intSeven, 'float')
    const boolToInt = f.dataTypeConversion(inputs.boolTrue, 'int')
    const floatToInt = f.dataTypeConversion(inputs.floatPositive, 'int')
    const strings = [
      f.dataTypeConversion(intToBool, 'str'),
      f.dataTypeConversion(intToFloat, 'str'),
      f.dataTypeConversion(inputs.intSeven, 'str'),
      f.dataTypeConversion(inputs.entityValue, 'str'),
      f.dataTypeConversion(inputs.guidValue, 'str'),
      f.dataTypeConversion(boolToInt, 'str'),
      f.dataTypeConversion(inputs.boolFalse, 'str'),
      f.dataTypeConversion(floatToInt, 'str'),
      f.dataTypeConversion(inputs.floatNegative, 'str'),
      f.dataTypeConversion(inputs.vectorValue, 'str'),
      f.dataTypeConversion(f.get('factionValue'), 'str')
    ]
    for (const value of strings) f.printString(value)
    return {}
  }
})

g.server({ name: 'P2W16-all-dtc-vendor-graph', id: GRAPH_ID }).on('whenEntityIsCreated', (_event: any, f: any) => {
  f.callComposite(allDtc, {
    intZero: new int(0),
    intSeven: new int(7),
    boolFalse: new bool(false),
    boolTrue: new bool(true),
    floatPositive: new float(2.5),
    floatNegative: new float(-1.31),
    entityValue: new entityLiteral(0),
    guidValue: new guid(100001n),
    vectorValue: new vec3([1.05, 2.3, 3])
  })
})

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'P2W16-all-dtc-vendor-graph' })
const bytes = irToGia(docs.at(-1), {
  graphId: GRAPH_ID,
  name: 'P2W16-all-dtc-vendor-graph',
  protoPath: PROTO_PATH
})
await writeFile(OUTPUT_PATH, Buffer.from(bytes))

const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const definitions = new Map(
  decoded.accessories
    ?.filter((accessory: any) => accessory.which === 12)
    .map((accessory: any) => [accessory.relatedIds?.[0]?.id, accessory.name]) ?? []
)
const implGraph = decoded.accessories
  ?.find((accessory: any) => accessory.which === 9 && definitions.get(accessory.id?.id) === COMPOSITE_NAME)
  ?.graph?.inner?.graph
assert.ok(implGraph, `composite impl missing: ${COMPOSITE_NAME}`)

const variants = new Map<number, any>()
for (const node of implGraph.nodes ?? []) {
  if (node.genericId?.nodeId !== 180) continue
  const concreteId = node.concreteId?.nodeId
  if (expectedVariants.has(concreteId)) variants.set(concreteId, node)
}
assert.equal(variants.size, expectedVariants.size, 'all 11 primary DTC variants must be encoded')

for (const [concreteId, expected] of expectedVariants) {
  const node = variants.get(concreteId)
  assert.equal(node.genericId?.nodeId, 180, `${concreteId}: generic ID`)
  assert.equal(node.concreteId?.nodeId, concreteId, `${concreteId}: concrete ID`)
  if (USE_VENDOR_IMPL_GRAPH) {
    const input = node.pins?.find((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === 0)
    const output = node.pins?.find((pin: any) => pin.i1?.kind === 4 && pin.i1?.index === 0)
    assert.equal(output?.type, expected.outputType, `${concreteId}: output type`)
    assert.equal(
      output?.value?.bConcreteValue?.indexOfConcrete ?? 0,
      expected.outputConcrete,
      `${concreteId}: output wrapper`
    )
    if (input) {
      assert.equal(input.type, expected.inputType, `${concreteId}: input type`)
      assert.equal(input.value?.bConcreteValue?.indexOfConcrete, expected.inputConcrete, `${concreteId}: input wrapper`)
    } else {
      assert.ok(
        implGraph.compositePins?.some((pin: any) => pin.innerNodeId === node.nodeIndex && pin.innerPin?.index === 0),
        `${concreteId}: captured input must be represented by compositePins`
      )
    }
  }
}

const printNodes = (implGraph.nodes ?? []).filter((node: any) => node.genericId?.nodeId === 1)
assert.equal(printNodes.length, expectedVariants.size, 'every primary conversion must have an observable print branch')

const rootGraph = decoded.graph?.graph?.inner?.graph
assert.ok(rootGraph, 'root graph missing')
const compositeCall = rootGraph.nodes?.find((node: any) => node.genericId?.kind === 22001)
assert.ok(compositeCall, 'root composite call missing')
assert.equal(
  compositeCall.pins?.filter((pin: any) => pin.i1?.kind === 3).length,
  9,
  'root call must bind the nine captured inputs; faction is an impl graph-variable connection'
)

const sha256 = createHash('sha256').update(bytes).digest('hex')
console.log(`PASS P2-W16 ${USE_VENDOR_IMPL_GRAPH ? 'vendor-Graph candidate' : 'legacy baseline'}: ${OUTPUT_PATH}`)
console.log(`SHA-256: ${sha256}`)
console.log(
  USE_VENDOR_IMPL_GRAPH
    ? 'PENDING EDITOR REVIEW: verifies all 11 DTC variants in the vendor-materialized composite impl'
    : 'PENDING EDITOR REVIEW: legacy baseline only; not vendor Graph evidence'
)
