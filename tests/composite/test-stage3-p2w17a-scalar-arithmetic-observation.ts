// @ts-nocheck
/**
 * P2-W17a: observe the current scalar arithmetic identity and vendor pin schemas.
 *
 * This fixture intentionally changes no production lowering. It records the baseline for the
 * four same-type scalar arithmetic families before any shared-resolution migration:
 * int/float literal inputs and int/float ordinary connection inputs, in root and one impl.
 *
 * Run:
 *   npx tsx tests/composite/test-stage3-p2w17a-scalar-arithmetic-observation.ts /tmp/P2W17a-legacy.gia
 *   GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 \
 *     npx tsx tests/composite/test-stage3-p2w17a-scalar-arithmetic-observation.ts /tmp/P2W17a-vendor.gia
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { asRuntimeValue, float, int } from '../../dist/src/runtime/value.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUTPUT_PATH = process.argv[2] ?? '/tmp/P2W17a-scalar-arithmetic-observation.gia'
const GRAPH_ID = 1073742417
const COMPOSITE_NAME = 'P2W17a_ScalarArithmeticObservation_GSTS'
const USE_VENDOR_IMPL_GRAPH = process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH === '1'

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const families = [
  { type: 'addition', genericId: 200, intConcreteId: 200, floatConcreteId: 201 },
  { type: 'subtraction', genericId: 202, intConcreteId: 202, floatConcreteId: 203 },
  { type: 'multiplication', genericId: 204, intConcreteId: 204, floatConcreteId: 205 },
  { type: 'division', genericId: 206, intConcreteId: 206, floatConcreteId: 207 }
]

function addScalarArithmetic(f: any) {
  for (const family of families) {
    const operation = f[family.type].bind(f)
    operation(new int(8), new int(2))
    operation(new float(8.5), new float(2.5))

    const intProducer = f.addition(new int(3), new int(4))
    const floatProducer = f.addition(new float(3.5), new float(4.5))
    operation(asRuntimeValue(intProducer), new int(2))
    operation(asRuntimeValue(floatProducer), new float(2.5))
  }
}

const arithmeticComposite = g.defineComposite(COMPOSITE_NAME, {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    addScalarArithmetic(f)
    return {}
  }
})

g.server({ name: 'P2W17a-scalar-arithmetic-observation', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event: any, f: any) => {
    addScalarArithmetic(f)
    f.declareDetached(arithmeticComposite, {})
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'P2W17a-scalar-arithmetic-observation' })
const bytes = irToGia(docs.at(-1), {
  graphId: GRAPH_ID,
  name: 'P2W17a-scalar-arithmetic-observation',
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
const rootGraph = decoded.graph?.graph?.inner?.graph
assert.ok(rootGraph, 'root graph missing')
assert.ok(implGraph, `composite impl missing: ${COMPOSITE_NAME}`)

function dataInput(node: any, index: number) {
  return node.pins?.find((pin: any) => pin.i1?.kind === 3 && pin.i1?.index === index)
}

for (const [scope, graph] of [
  ['root', rootGraph],
  ['impl', implGraph]
]) {
  const nodesByIndex = new Map((graph.nodes ?? []).map((node: any) => [node.nodeIndex, node]))
  for (const [familyIndex, family] of families.entries()) {
    // addScalarArithmetic emits two literal targets, two Addition producers, then two connection
    // targets. Fixed positions make the currently divergent float target observable without
    // relying on its incorrect concrete ID or schema to find it.
    const firstNodeIndex = 2 + familyIndex * 6
    const targets = [
      ['int', 3, family.intConcreteId, nodesByIndex.get(firstNodeIndex)],
      ['float', 5, family.floatConcreteId, nodesByIndex.get(firstNodeIndex + 1)],
      ['int', 3, family.intConcreteId, nodesByIndex.get(firstNodeIndex + 4)],
      ['float', 5, family.floatConcreteId, nodesByIndex.get(firstNodeIndex + 5)]
    ]
    for (const [typeName, expectedType, expectedConcreteId, node] of targets) {
      assert.ok(node, `${scope}/${family.type}/${typeName}: target node must remain indexed`)
      const isConnection = node.nodeIndex === firstNodeIndex + 4 || node.nodeIndex === firstNodeIndex + 5
      const expectedImplFloatType = scope === 'impl' && USE_VENDOR_IMPL_GRAPH ? 3 : expectedType
      assert.equal(node.genericId?.nodeId, family.genericId, `${scope}/${family.type}/${typeName}: generic ID`)
      assert.equal(
        node.concreteId?.nodeId,
        scope === 'impl' && typeName === 'float' ? family.intConcreteId : expectedConcreteId,
        `${scope}/${family.type}/${typeName}: current concrete identity baseline`
      )
      assert.equal(dataInput(node, 0)?.type, expectedImplFloatType, `${scope}/${family.type}/${typeName}: input 0 type`)
      assert.equal(dataInput(node, 1)?.type, expectedImplFloatType, `${scope}/${family.type}/${typeName}: input 1 type`)
      assert.equal(
        node.pins?.find((pin: any) => pin.i1?.kind === 4 && pin.i1?.index === 0)?.type,
        expectedImplFloatType,
        `${scope}/${family.type}/${typeName}: output type`
      )
      if (isConnection) {
        assert.equal(dataInput(node, 0)?.connects?.[0]?.connect?.kind, 4, `${scope}/${family.type}/${typeName}: source kind`)
        assert.equal(dataInput(node, 0)?.connects?.[0]?.connect?.index, 0, `${scope}/${family.type}/${typeName}: source index`)
      } else {
        assert.equal(dataInput(node, 0)?.connects?.length ?? 0, 0, `${scope}/${family.type}/${typeName}: literal source`)
      }
    }
  }
}

console.log(
  `PASS P2-W17a ${USE_VENDOR_IMPL_GRAPH ? 'vendor-Graph observation' : 'legacy observation'}: ${OUTPUT_PATH}`
)
console.log('Observed only: scalar arithmetic remains outside shared resolveNodeIdentity() in this work package')
