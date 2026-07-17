// @ts-nocheck
/**
 * 检查复合节点公共边界处理是否会影响加法/减法等普通运算节点。
 * 不重新编译编译器，直接使用当前 dist 运行。
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'

import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { float, int } from '../../dist/src/runtime/value.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUT_DIR = 'tests/composite/output'
const OUT_PATH = `${OUT_DIR}/数字参数-其他运算复现.gia`

const floatAddition = g.defineComposite('数字参数-浮点加法', {
  inputs: {
    左值: { type: 'float' },
    右值: { type: 'float' }
  },
  outputs: {
    结果: { type: 'float' }
  },
  build({ 左值, 右值 }, f) {
    return { 结果: f.addition(左值, 右值) }
  }
})

const intSubtraction = g.defineComposite('数字参数-整数减法', {
  inputs: {
    左值: { type: 'int' },
    右值: { type: 'int' }
  },
  outputs: {
    结果: { type: 'int' }
  },
  build({ 左值, 右值 }, f) {
    return { 结果: f.subtraction(左值, 右值) }
  }
})

const intAddition = g.defineComposite('数字参数-整数加法', {
  inputs: {
    左值: { type: 'int' },
    右值: { type: 'int' }
  },
  outputs: {
    结果: { type: 'int' }
  },
  build({ 左值, 右值 }, f) {
    return { 结果: f.addition(左值, 右值) }
  }
})

g.server({ name: '数字参数-其他运算复现', id: 1073741995 }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    f.callComposite(floatAddition, { 左值: new float(3.5), 右值: new float(1.5) })
    f.callComposite(intSubtraction, { 左值: new int(8), 右值: new int(2) })
    f.callComposite(intAddition, { 左值: new int(8), 右值: new int(2) })
  }
)

const doc = buildServerGraphRegistriesIRDocuments({
  defaultName: '数字参数-其他运算复现'
}).at(-1)
assert.ok(doc)

mkdirSync(OUT_DIR, { recursive: true })
const bytes = irToGia(doc, {
  graphId: 1073741995,
  name: '数字参数-其他运算复现',
  protoPath: PROTO_PATH
})
writeFileSync(OUT_PATH, Buffer.from(bytes))

const decoded = decode_gia_file(OUT_PATH, PROTO_PATH)
const report = [floatAddition, intSubtraction, intAddition].map((handle) => {
  const definition = decoded.accessories?.find(
    (item) => item.which === 12 && item.name === handle.name
  )?.compositeDef?.inner?.def
  const impl = decoded.accessories?.find(
    (item) => item.which === 9 && item.id?.id === handle.id + 10000
  )?.graph?.inner?.graph
  assert.ok(definition)
  assert.ok(impl)

  const node = impl.nodes?.find((candidate) => candidate.genericId?.kind === 22000)
  assert.ok(node)
  const inputPins = (node.pins ?? [])
    .filter((pin) => pin.i1?.kind === 3)
    .map((pin) => ({ index: pin.i1.index, type: pin.type }))
  const outputPins = (node.pins ?? [])
    .filter((pin) => pin.i1?.kind === 4)
    .map((pin) => ({ index: pin.i1.index, type: pin.type }))
  const boundaryPins = (impl.compositePins ?? [])
    .filter((pin) => pin.innerNodeId === node.nodeIndex)
    .map((pin) => ({
      outerKind: pin.outerPin?.kind,
      outerIndex: pin.outerPin?.index,
      innerKind: pin.innerPin?.kind,
      innerIndex: pin.innerPin?.index
    }))

  return {
    name: handle.name,
    nodeId: node.genericId?.nodeId,
    concreteNodeId: node.concreteId?.nodeId,
    definitionInputs: definition.inputs?.map((input) => [
      input.type?.class,
      input.type?.type1,
      input.type?.type2
    ]),
    definitionOutputs: definition.outputs?.map((output) => [
      output.type?.class,
      output.type?.type1,
      output.type?.type2
    ]),
    inputPins,
    outputPins,
    boundaryPins
  }
})

console.log(`输出: ${OUT_PATH}`)
console.log(`大小: ${bytes.length} 字节`)
console.log(JSON.stringify(report, null, 2))

for (const item of report) {
  assert.equal(
    item.boundaryPins.filter((pin) => pin.outerKind === 3).length,
    2,
    `${item.name}: should have two input compositePins`
  )
  assert.equal(item.inputPins.length, 2, `${item.name}: boundary inputs need physical InParam pins`)
  assert.deepEqual(
    item.inputPins.map((pin) => pin.type),
    item.definitionInputs.map((type) => type[1]),
    `${item.name}: physical input pin types must match definition types`
  )
}

console.log('PASS: 加法/减法均保留了复合边界所需的物理输入 pin')
