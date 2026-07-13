// @ts-nocheck
/**
 * P2-W17b: verify shared scalar arithmetic identity through executable data/control-flow graphs.
 *
 * Every arithmetic result feeds Data Type Conversion -> Print String. The root event and the
 * composite impl therefore each have a reachable control-flow chain, while literal, captured
 * composite input, and ordinary producer-connection data paths remain observable.
 *
 * Run:
 *   npx tsx tests/composite/test-stage3-p2w17a-scalar-arithmetic-observation.ts /tmp/P2W17b-legacy.gia
 *   GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 \
 *     npx tsx tests/composite/test-stage3-p2w17a-scalar-arithmetic-observation.ts /tmp/P2W17b-vendor.gia
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
const OUTPUT_PATH = process.argv[2] ?? '/tmp/P2W17b-scalar-arithmetic.gia'
const GRAPH_ID = 1073742417
const COMPOSITE_NAME = 'P2W17b_ScalarArithmeticFlow_GSTS'
const USE_VENDOR_IMPL_GRAPH = process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH === '1'

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const families = [
  { type: 'addition', genericId: 200, intConcreteId: 200, floatConcreteId: 201 },
  { type: 'subtraction', genericId: 202, intConcreteId: 202, floatConcreteId: 203 },
  { type: 'multiplication', genericId: 204, intConcreteId: 204, floatConcreteId: 205 },
  { type: 'division', genericId: 206, intConcreteId: 206, floatConcreteId: 207 }
]

function addExecutableScalarArithmetic(f: any, inputs?: any) {
  const prints: any[] = []
  for (const family of families) {
    const operation = f[family.type].bind(f)
    const intLiteral = operation(new int(8), new int(2))
    const floatLiteral = operation(new float(8.5), new float(2.5))
    const intProducer = f.addition(
      inputs ? asRuntimeValue(inputs.intLeft) : new int(3),
      inputs ? asRuntimeValue(inputs.intRight) : new int(4)
    )
    const floatProducer = f.addition(
      inputs ? asRuntimeValue(inputs.floatLeft) : new float(3.5),
      inputs ? asRuntimeValue(inputs.floatRight) : new float(4.5)
    )
    const intConnection = operation(asRuntimeValue(intProducer), new int(2))
    const floatConnection = operation(asRuntimeValue(floatProducer), new float(2.5))

    prints.push(...[intLiteral, floatLiteral, intConnection, floatConnection].map((result) =>
      f.node('print_string', [f.dataTypeConversion(asRuntimeValue(result), 'str')])
    ))
  }
  return prints
}

function linkPrintChain(f: any, source: any, prints: any[]) {
  let tail = source
  for (const print of prints) {
    f.link(tail, 0, print)
    tail = print
  }
  return tail
}

function linkPrintTail(f: any, prints: any[]) {
  let tail = prints[0]
  for (const print of prints.slice(1)) {
    f.link(tail, 0, print)
    tail = print
  }
  return tail
}

const arithmeticComposite = g.defineComposite(COMPOSITE_NAME, {
  inflows: [{ name: '执行' }],
  inputs: {
    intLeft: { type: 'int' },
    intRight: { type: 'int' },
    floatLeft: { type: 'float' },
    floatRight: { type: 'float' }
  },
  outputs: {},
  build(inputs: any, f: any) {
    const prints = addExecutableScalarArithmetic(f, inputs)
    f.inflow('执行', prints[0])
    linkPrintTail(f, prints)
    return {}
  }
})

g.server({ name: 'P2W17b-scalar-arithmetic-flow', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event: any, f: any) => {
    const prints = addExecutableScalarArithmetic(f)
    const compositeCall = f.declareDetached(arithmeticComposite, {
      intLeft: new int(3),
      intRight: new int(4),
      floatLeft: new float(3.5),
      floatRight: new float(4.5)
    })
    const tail = linkPrintChain(f, f.entry(), prints)
    f.link(tail, 0, compositeCall, 0)
  }
)

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'P2W17b-scalar-arithmetic-flow' })
const bytes = irToGia(docs.at(-1), {
  graphId: GRAPH_ID,
  name: 'P2W17b-scalar-arithmetic-flow',
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
  const nodes = graph.nodes ?? []
  assert.equal(
    nodes.filter((node: any) => node.genericId?.nodeId === 1).length,
    16,
    `${scope}: every arithmetic result must reach an executable Print String consumer`
  )
  const flowEdges = nodes.flatMap((node: any) => node.pins ?? []).filter(
    (pin: any) => pin.i1?.kind === 2 && pin.connects?.length
  )
  assert.ok(
    flowEdges.length >= (scope === 'impl' ? 15 : 16),
    `${scope}: arithmetic consumers must be reachable through control flow`
  )

  const arithmeticResultNodeIndexes = new Set(
    nodes
      .filter((node: any) => node.genericId?.nodeId === 180)
      .map((node: any) => dataInput(node, 0)?.connects?.[0]?.id)
      .filter((nodeIndex: number | undefined): nodeIndex is number => nodeIndex !== undefined)
  )
  for (const family of families) {
    const targets = nodes.filter(
      (node: any) =>
        node.genericId?.nodeId === family.genericId && arithmeticResultNodeIndexes.has(node.nodeIndex)
    )
    assert.equal(targets.length, 4, `${scope}/${family.type}: target count`)
    const intTargets = targets.filter((node: any) => node.concreteId?.nodeId === family.intConcreteId)
    const floatTargets = targets.filter((node: any) => node.concreteId?.nodeId === family.floatConcreteId)
    assert.ok(intTargets.length >= 2, `${scope}/${family.type}: int literal and connection targets`)
    assert.ok(floatTargets.length >= 2, `${scope}/${family.type}: float literal and connection targets`)

    for (const node of intTargets) {
      assert.equal(dataInput(node, 0)?.type, 3, `${scope}/${family.type}: int input 0 type`)
      assert.equal(dataInput(node, 1)?.type, 3, `${scope}/${family.type}: int input 1 type`)
      assert.equal(
        node.pins?.find((pin: any) => pin.i1?.kind === 4 && pin.i1?.index === 0)?.type,
        3,
        `${scope}/${family.type}: int output type`
      )
    }
    for (const node of floatTargets) {
      assert.equal(dataInput(node, 0)?.type, 5, `${scope}/${family.type}: float input 0 type`)
      assert.equal(dataInput(node, 1)?.type, 5, `${scope}/${family.type}: float input 1 type`)
      assert.equal(
        node.pins?.find((pin: any) => pin.i1?.kind === 4 && pin.i1?.index === 0)?.type,
        5,
        `${scope}/${family.type}: float output type`
      )
    }

    assert.ok(
      targets.some((node: any) => dataInput(node, 0)?.connects?.[0]?.connect?.kind === 4),
      `${scope}/${family.type}: ordinary producer connection must reach an arithmetic input`
    )
  }
}

const rootCall = rootGraph.nodes?.find((node: any) => node.genericId?.kind === 22001)
assert.ok(rootCall, 'root executable composite call missing')
assert.equal(
  rootCall.pins?.filter((pin: any) => pin.i1?.kind === 3).length,
  4,
  'root call must bind all four typed composite inputs'
)
assert.ok(
  implGraph.compositePins?.filter((pin: any) => pin.outerPin?.kind === 3).length >= 4,
  'composite inputs must route into the executable impl graph'
)

console.log(
  `PASS P2-W17b ${USE_VENDOR_IMPL_GRAPH ? 'vendor-Graph' : 'legacy'} executable shared-resolution: ${OUTPUT_PATH}`
)
console.log('PENDING EDITOR REVIEW: control flow reaches Print String through arithmetic data paths')
