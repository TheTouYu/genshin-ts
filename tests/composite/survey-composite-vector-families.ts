// @ts-nocheck
/**
 * Composite 边界影响调查：向量运算、向量拆分和 DTC 对照。
 * 直接使用现有 dist，不重新编译生产代码。
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'

import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { float, int, vec3 } from '../../dist/src/runtime/value.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUT_DIR = 'tests/composite/output'
const OUT_PATH = `${OUT_DIR}/复合节点-向量族影响调查.gia`

const cases = [
  ['向量加法', ['vec3', 'vec3'], 'vec3', (f, a, b) => f._3dVectorAddition(a, b), [new vec3([1, 2, 3]), new vec3([4, 5, 6])]],
  ['向量减法', ['vec3', 'vec3'], 'vec3', (f, a, b) => f._3dVectorSubtraction(a, b), [new vec3([1, 2, 3]), new vec3([4, 5, 6])]],
  ['向量缩放', ['vec3', 'float'], 'vec3', (f, a, b) => f._3dVectorZoom(a, b), [new vec3([1, 2, 3]), new float(2)]],
  ['向量点乘', ['vec3', 'vec3'], 'float', (f, a, b) => f._3dVectorDotProduct(a, b), [new vec3([1, 2, 3]), new vec3([4, 5, 6])]],
  ['向量夹角', ['vec3', 'vec3'], 'float', (f, a, b) => f._3dVectorAngle(a, b), [new vec3([1, 2, 3]), new vec3([4, 5, 6])]],
  ['向量转字符串', ['vec3'], 'str', (f, a) => f.dataTypeConversion(a, 'str'), [new vec3([1, 2, 3])]],
  ['整数转浮点', ['int'], 'float', (f, a) => f.dataTypeConversion(a, 'float'), [new int(3)]]
]

const handles = cases.map(([name, inputTypes, outputType, operation]) => {
  const inputs = Object.fromEntries(inputTypes.map((type, index) => [`输入${index}`, { type }]))
  return g.defineComposite(`调查-${name}`, {
    inputs,
    outputs: { 结果: { type: outputType } },
    build(args, f) {
      return { 结果: operation(f, ...inputTypes.map((_, index) => args[`输入${index}`])) }
    }
  })
})

g.server({ name: '复合节点-向量族影响调查', id: 1073742011 }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    cases.forEach(([, , , , values], index) => {
      const args = Object.fromEntries(values.map((value, valueIndex) => [`输入${valueIndex}`, value]))
      f.callComposite(handles[index], args)
    })
  }
)

const doc = buildServerGraphRegistriesIRDocuments({
  defaultName: '复合节点-向量族影响调查'
}).at(-1)
assert.ok(doc)
mkdirSync(OUT_DIR, { recursive: true })
const bytes = irToGia(doc, {
  graphId: 1073742011,
  name: '复合节点-向量族影响调查',
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
  const boundaryInputs = (impl.compositePins ?? []).filter(
    (candidate) => candidate.innerNodeId === node.nodeIndex && candidate.innerPin?.kind === 3
  )
  return {
    name: handle.name,
    genericNodeId: node.genericId?.nodeId,
    concreteNodeId: node.concreteId?.nodeId,
    definitionInputTypes: definition.inputs?.map((item) => [item.type?.class, item.type?.type1]),
    definitionOutputTypes: definition.outputs?.map((item) => [item.type?.class, item.type?.type1]),
    boundaryInputIndexes: boundaryInputs.map((item) => item.innerPin?.index),
    physicalInputs: (node.pins ?? [])
      .filter((item) => item.i1?.kind === 3)
      .map((item) => [item.i1?.index, item.type]),
    physicalOutputs: (node.pins ?? [])
      .filter((item) => item.i1?.kind === 4)
      .map((item) => [item.i1?.index, item.type])
  }
})

console.log(`输出: ${OUT_PATH}`)
console.log(`大小: ${bytes.length} 字节`)
console.log(JSON.stringify(report, null, 2))

for (const item of report) {
  assert.equal(item.boundaryInputIndexes.length, item.definitionInputTypes.length)
  assert.ok(item.physicalOutputs.length > 0, `${item.name}: output pin`)
}

console.log('PASS: 向量节点族影响调查完成')
