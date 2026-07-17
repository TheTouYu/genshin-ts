// @ts-nocheck
/**
 * A Composite bool boundary routed into Data Type Conversion must materialize the
 * physical bool input and int output pins used by compositePins and downstream data edges.
 *
 * Real-game evidence: `bool参数-导出版本.gia` runs after the editor restored these pins;
 * the gsts candidate with an empty first-node pin list did not run correctly.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-bool-boundary-dtc-physical-pins.ts
 */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import protobuf from 'protobufjs'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { bool } from '../../dist/src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

const composite = g.defineComposite('bool边界DTC物理引脚回归', {
  inputs: { 输入: { type: 'bool' } },
  outputs: { 输出: { type: 'str' } },
  build({ 输入 }, f) {
    const integer = f.dataTypeConversion(输入, 'int')
    const float = f.dataTypeConversion(integer, 'float')
    return { 输出: f.dataTypeConversion(float, 'str') }
  }
})

g.server({ name: 'bool-boundary-dtc-physical-pins', id: 1073741994 }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    f.callComposite(composite, { 输入: new bool(true) })
  }
)

const document = buildServerGraphRegistriesIRDocuments({
  defaultName: 'bool-boundary-dtc-physical-pins'
}).at(-1)
assert.ok(document)

const bytes = irToGia(document, {
  graphId: 1073741994,
  name: 'bool-boundary-dtc-physical-pins',
  protoPath: PROTO_PATH
})
const outputPath = join(tmpdir(), 'gsts-bool-boundary-dtc-physical-pins.gia')
writeFileSync(outputPath, Buffer.from(bytes))

const decoded = decode_gia_file(outputPath, PROTO_PATH)
const impl = decoded.accessories?.find((accessory) => accessory.which === 9)?.graph?.inner?.graph
assert.ok(impl)

const inputBoundary = impl.compositePins?.find(
  (pin) => pin.outerPin?.kind === 3 && pin.outerPin?.index === 0
)
assert.ok(inputBoundary)
const firstConversion = impl.nodes?.find(
  (node) => node.nodeIndex === inputBoundary.innerNodeId
)
assert.ok(firstConversion)
assert.equal(firstConversion.genericId?.nodeId, 180)
assert.equal(firstConversion.concreteId?.nodeId, 185)

const boolInput = firstConversion.pins?.find(
  (pin) => pin.i1?.kind === 3 && pin.i1?.index === 0
)
assert.ok(boolInput, 'boundary DTC must materialize the InParam targeted by compositePins')
assert.equal(boolInput.type, 4)
assert.equal(boolInput.value?.class, 10000)
assert.equal(boolInput.value?.bConcreteValue?.indexOfConcrete, 3)
assert.equal(boolInput.value?.bConcreteValue?.value?.class, 6)
assert.deepEqual(boolInput.value?.bConcreteValue?.value?.bEnum, { val: 0 })

const intOutput = firstConversion.pins?.find(
  (pin) => pin.i1?.kind === 4 && pin.i1?.index === 0
)
assert.ok(intOutput, 'boundary DTC must materialize the OutParam consumed downstream')
assert.equal(intOutput.type, 3)
assert.equal(intOutput.value?.class, 10000)
assert.equal(intOutput.value?.bConcreteValue?.indexOfConcrete, 3)
assert.equal(intOutput.value?.bConcreteValue?.value?.class, 2)
assert.deepEqual(intOutput.value?.bConcreteValue?.value?.bInt, { val: 0 })

const protoRoot = new protobuf.Root().loadSync(PROTO_PATH, { keepCase: true })
const rootMessage = protoRoot.lookupType('Root')
const rawRoot = rootMessage.decode(new Uint8Array(bytes).slice(20, -4)) as any
const rawImpl = rawRoot.accessories.find((accessory) => accessory.graph)?.graph?.inner?.graph
const rawFirst = rawImpl.nodes.find((node) => Number(node.nodeIndex) === firstConversion.nodeIndex)
const rawInput = rawFirst.pins.find(
  (pin) => Number(pin.i1?.kind) === 3 && Number(pin.i1?.index) === 0
)
const rawOutput = rawFirst.pins.find(
  (pin) => Number(pin.i1?.kind) === 4 && Number(pin.i1?.index) === 0
)
assert.ok(rawInput)
assert.ok(rawOutput)
assert.equal(Object.hasOwn(rawInput.value?.bConcreteValue?.value ?? {}, 'bEnum'), true)
assert.equal(Object.hasOwn(rawOutput.value?.bConcreteValue?.value ?? {}, 'bInt'), true)

console.log('PASS composite bool boundary DTC materializes real-game physical pins')
