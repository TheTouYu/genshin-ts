// @ts-nocheck
/**
 * Composite 边界影响调查：标量算术、比较、逻辑和转换。
 * 直接使用现有 dist，不重新编译生产代码。
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'

import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { bool, float, int } from '../../dist/src/runtime/value.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUT_DIR = 'tests/composite/output'
const OUT_PATH = `${OUT_DIR}/复合节点-标量族影响调查.gia`

const cases = [
  ['加法-float', 'float', 'float', (f, a, b) => f.addition(a, b), new float(3.5), new float(1.5)],
  ['减法-int', 'int', 'int', (f, a, b) => f.subtraction(a, b), new int(8), new int(2)],
  ['乘法-float', 'float', 'float', (f, a, b) => f.multiplication(a, b), new float(3.5), new float(2)],
  ['除法-int', 'int', 'int', (f, a, b) => f.division(a, b), new int(8), new int(2)],
  ['模运算-int', 'int', 'int', (f, a, b) => f.moduloOperation(a, b), new int(8), new int(3)],
  ['幂运算-int', 'int', 'int', (f, a, b) => f.exponentiation(a, b), new int(2), new int(3)],
  ['等于-float', 'float', 'bool', (f, a, b) => f.equal(a, b), new float(3.5), new float(1.5)],
  ['小于-int', 'int', 'bool', (f, a, b) => f.lessThan(a, b), new int(2), new int(8)],
  ['大于等于-float', 'float', 'bool', (f, a, b) => f.greaterThanOrEqualTo(a, b), new float(3.5), new float(1.5)],
  ['逻辑与-bool', 'bool', 'bool', (f, a, b) => f.logicalAndOperation(a, b), new bool(true), new bool(false)],
  ['逻辑或-bool', 'bool', 'bool', (f, a, b) => f.logicalOrOperation(a, b), new bool(true), new bool(false)],
  ['逻辑异或-bool', 'bool', 'bool', (f, a, b) => f.logicalXorOperation(a, b), new bool(true), new bool(false)]
]

const handles = cases.map(([name, inputType, outputType, operation]) => {
  return g.defineComposite(`调查-${name}`, {
    inputs: {
      左值: { type: inputType },
      右值: { type: inputType }
    },
    outputs: { 结果: { type: outputType } },
    build({ 左值, 右值 }, f) {
      return { 结果: operation(f, 左值, 右值) }
    }
  })
})

g.server({ name: '复合节点-标量族影响调查', id: 1073742010 }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    cases.forEach(([, , , , left, right], index) => {
      f.callComposite(handles[index], { 左值: left, 右值: right })
    })
  }
)

const doc = buildServerGraphRegistriesIRDocuments({
  defaultName: '复合节点-标量族影响调查'
}).at(-1)
assert.ok(doc)
mkdirSync(OUT_DIR, { recursive: true })
const bytes = irToGia(doc, {
  graphId: 1073742010,
  name: '复合节点-标量族影响调查',
  protoPath: PROTO_PATH
})
writeFileSync(OUT_PATH, Buffer.from(bytes))

const decoded = decode_gia_file(OUT_PATH, PROTO_PATH)
const report = handles.map((handle) => {
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
  const pin = (kind, index) => node.pins?.find(
    (candidate) => candidate.i1?.kind === kind && candidate.i1?.index === index
  )
  const boundaryInputs = (impl.compositePins ?? []).filter(
    (candidate) => candidate.innerNodeId === node.nodeIndex && candidate.innerPin?.kind === 3
  )
  const physicalInputs = (node.pins ?? []).filter((candidate) => candidate.i1?.kind === 3)
  const physicalOutputs = (node.pins ?? []).filter((candidate) => candidate.i1?.kind === 4)
  return {
    name: handle.name,
    genericNodeId: node.genericId?.nodeId,
    concreteNodeId: node.concreteId?.nodeId,
    definitionInputTypes: definition.inputs?.map((item) => [item.type?.class, item.type?.type1]),
    definitionOutputTypes: definition.outputs?.map((item) => [item.type?.class, item.type?.type1]),
    boundaryInputIndexes: boundaryInputs.map((item) => item.innerPin?.index),
    physicalInputIndexes: physicalInputs.map((item) => [item.i1?.index, item.type]),
    physicalOutputIndexes: physicalOutputs.map((item) => [item.i1?.index, item.type]),
    outputPin0Exists: !!pin(4, 0)
  }
})

console.log(`输出: ${OUT_PATH}`)
console.log(`大小: ${bytes.length} 字节`)
console.log(JSON.stringify(report, null, 2))

for (const item of report) {
  assert.equal(item.boundaryInputIndexes.length, 2, `${item.name}: boundary input routes`)
  assert.equal(item.outputPin0Exists, true, `${item.name}: output pin`)
}

console.log('PASS: 标量节点族影响调查完成')
