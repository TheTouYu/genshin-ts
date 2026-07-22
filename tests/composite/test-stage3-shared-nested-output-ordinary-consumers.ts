// @ts-nocheck
/**
 * Shared impl regression: nested Composite OutParams must reach ordinary consumers through
 * the post-vendor synthetic overlay. This covers scalar/vector/bool target pin templates.
 *
 * Run:
 *   npm run build
 *   GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 \
 *     npx tsx tests/composite/test-stage3-shared-nested-output-ordinary-consumers.ts
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { asRuntimeValue, bool, float } from '../../dist/src/runtime/value.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUTPUT_PATH = process.argv[2] ?? '/tmp/shared-nested-output-ordinary-consumers.gia'
const GRAPH_ID = 1073742460
const INNER_FLOAT = 'SharedNestedOutputInnerFloat_GSTS'
const INNER_BOOL = 'SharedNestedOutputInnerBool_GSTS'
const OUTER = 'SharedNestedOutputConsumers_GSTS'

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const innerFloat = g.defineComposite(INNER_FLOAT, {
  inputs: { value: { type: 'float' } },
  outputs: { value: { type: 'float' } },
  build(inputs, f) {
    return { value: f.addition(inputs.value, new float(0)) }
  }
})

const innerBool = g.defineComposite(INNER_BOOL, {
  inputs: { value: { type: 'bool' } },
  outputs: { value: { type: 'bool' } },
  build(inputs, f) {
    return { value: f.logicalOrOperation(inputs.value, new bool(false)) }
  }
})

const outer = g.defineComposite(OUTER, {
  inputs: {},
  outputs: { vector: { type: 'vec3' }, difference: { type: 'float' }, result: { type: 'bool' } },
  build(_inputs, f) {
    const scalar = f.callComposite(innerFloat, { value: new float(3.5) }).value
    const booleanValue = f.callComposite(innerBool, { value: new bool(true) }).value
    return {
      vector: f.create3dVector(asRuntimeValue(scalar), new float(0), new float(0)),
      difference: f.subtraction(asRuntimeValue(scalar), new float(1)),
      result: f.logicalOrOperation(asRuntimeValue(booleanValue), new bool(false))
    }
  }
})

g.server({ name: 'shared-nested-output-ordinary-consumers', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    const result = f.callComposite(outer, {})
    f.printString(f.dataTypeConversion(result.difference, 'str'))
    f.printString(f.dataTypeConversion(result.result, 'str'))
    f.printString(f.dataTypeConversion(f.split3dVector(result.vector).xComponent, 'str'))
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'shared-nested-output-ordinary-consumers' })
const bytes = irToGia(docs.at(-1), { graphId: GRAPH_ID, name: OUTER, protoPath: PROTO_PATH })
await writeFile(OUTPUT_PATH, Buffer.from(bytes))

const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const definitionsByImplId = new Map(
  decoded.accessories
    ?.filter((accessory: any) => accessory.which === 12)
    .map((accessory: any) => [accessory.relatedIds?.[0]?.id, accessory.name]) ?? []
)
const definitionsById = new Map(
  decoded.accessories
    ?.filter((accessory: any) => accessory.which === 12)
    .map((accessory: any) => [accessory.id?.id, accessory.name]) ?? []
)
const outerImpl = decoded.accessories?.find(
  (accessory: any) => accessory.which === 9 && definitionsByImplId.get(accessory.id?.id) === OUTER
)?.graph?.inner?.graph
assert.ok(outerImpl, 'outer impl missing')

const calls = outerImpl.nodes?.filter((node: any) => node.genericId?.kind === 22001) ?? []
assert.equal(calls.length, 2, 'outer impl must retain both nested synthetic calls')
for (const call of calls) {
  assert.ok(
    call.pins?.some((pin: any) => pin.i1?.kind === 4 && pin.i1?.index === 0),
    'nested call must encode its physical OutParam[0]'
  )
}

const callByDefinition = new Map(
  calls.map((call: any) => [definitionsById.get(call.genericId?.nodeId), call])
)
const floatCall = callByDefinition.get(INNER_FLOAT)
const boolCall = callByDefinition.get(INNER_BOOL)
assert.ok(floatCall, 'float nested call missing')
assert.ok(boolCall, 'bool nested call missing')

for (const [nodeId, source, label] of [
  [225, floatCall, 'create3dVector'],
  [202, floatCall, 'subtraction'],
  [227, boolCall, 'logicalOrOperation']
]) {
  const target = outerImpl.nodes?.find((node: any) => node.genericId?.nodeId === nodeId)
  assert.ok(target, `${label} target missing`)
  const input = target.pins?.find((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === 0)
  assert.ok(input, `${label} InParam[0] missing`)
  assert.ok(
    input.connects?.some((edge: any) => edge.id === source.nodeIndex && edge.connect?.kind === 4),
    `${label} InParam[0] must connect to the nested Composite OutParam overlay`
  )
}

console.log(`PASS shared nested outputs -> ordinary consumers: ${OUTPUT_PATH}`)
