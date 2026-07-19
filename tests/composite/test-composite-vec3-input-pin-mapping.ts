// @ts-nocheck
/**
 * GSTS-COMPOSITE-INPUT-PIN-MAPPING 最小回归与候选 GIA 生成。
 *
 * 覆盖两个 vec3 输入、同一输入多处消费、主图两个输入连接，以及纯数据 Composite 输出回主图。
 * 运行：npx tsx tests/composite/test-composite-vec3-input-pin-mapping.ts [output.gia]
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'

import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { vec3 } from '../../dist/src/runtime/value.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUTPUT_PATH = process.argv[2] ?? '/tmp/GSTS-COMPOSITE-INPUT-PIN-MAPPING.gia'
const GRAPH_ID = 1073742421
const COMPOSITE_NAME = 'GSTS最小复现-双Vec3输入映射'

const repro = g.defineComposite(COMPOSITE_NAME, {
  inputs: {
    inputLease: { type: 'vec3' },
    axis: { type: 'vec3' }
  },
  outputs: { result: { type: 'vec3' } },
  build(args, f) {
    const dot = f._3dVectorDotProduct(args.inputLease, args.axis)
    const scaled = f._3dVectorZoom(args.axis, dot)
    return { result: f._3dVectorSubtraction(args.inputLease, scaled) }
  }
})

g.server({ name: 'GSTS最小复现-双Vec3输入映射', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    const result = f.callComposite(repro, {
      inputLease: new vec3([1, 2, 0]),
      axis: new vec3([0, 1, 0])
    })
    f.printString(f.dataTypeConversion(result.result, 'str'))
  }
)

const doc = buildServerGraphRegistriesIRDocuments({
  defaultName: 'GSTS最小复现-双Vec3输入映射'
}).at(-1)
assert.ok(doc)
const bytes = irToGia(doc, {
  graphId: GRAPH_ID,
  name: 'GSTS最小复现-双Vec3输入映射',
  protoPath: PROTO_PATH
})
writeFileSync(OUTPUT_PATH, Buffer.from(bytes))

const decoded = decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const definition = decoded.accessories?.find(
  (item) => item.which === 12 && item.name === COMPOSITE_NAME
)?.compositeDef?.inner?.def
const impl = decoded.accessories?.find(
  (item) => item.which === 9 && item.id?.id === repro.id + 10000
)?.graph?.inner?.graph
const root = decoded.graph?.graph?.inner?.graph
assert.ok(definition, 'CompositeDef missing')
assert.ok(impl, 'Composite impl graph missing')
assert.ok(root, 'root graph missing')

assert.deepEqual(
  definition.inputs?.map((input) => [input.name, input.index?.index, input.pinIndex, input.type?.type1]),
  [
    ['inputLease', 0, 100, 12],
    ['axis', 1, 101, 12]
  ],
  'CompositeDef must preserve logical indexes, physical pinIndex, and vec3 types'
)

const implDataNode = (impl.nodes ?? []).find((node) => node.genericId?.kind === 22000)
assert.ok(implDataNode, 'impl data node missing')
assert.deepEqual(
  (implDataNode.pins ?? [])
    .filter((pin) => pin.i1?.kind === 3)
    .map((pin) => [pin.i1.index, pin.type]),
  [
    [0, 12],
    [1, 12]
  ],
  'impl boundary consumers must retain typed physical vec3 InParam[0]/[1]'
)

const boundaryRoutes = (impl.compositePins ?? []).filter(
  (pin) => pin.innerNodeId === implDataNode.nodeIndex && pin.outerPin?.kind === 3
)
assert.deepEqual(
  boundaryRoutes.map((pin) => [pin.outerPin.index, pin.innerPin.index]),
  [
    [0, 0],
    [1, 1]
  ],
  'compositePins must use logical boundary indexes and physical inner indexes'
)

const call = (root.nodes ?? []).find((node) => node.genericId?.kind === 22001)
assert.ok(call, 'root Composite call missing')
assert.deepEqual(
  (call.pins ?? [])
    .filter((pin) => pin.i1?.kind === 3)
    .map((pin) => [pin.i1.index, pin.compositePinIndex, pin.connects?.length ?? 0]),
  [
    [0, 100, 0],
    [1, 101, 0]
  ],
  'root call inputs must expose physical Composite pin indexes'
)

const sha256 = createHash('sha256').update(bytes).digest('hex')
console.log(`PASS GSTS-COMPOSITE-INPUT-PIN-MAPPING: ${OUTPUT_PATH}`)
console.log(`SIZE: ${bytes.length}`)
console.log(`SHA-256: ${sha256}`)
console.log('PENDING EDITOR/GAME REVIEW: inspect both input wires and run the output path')
