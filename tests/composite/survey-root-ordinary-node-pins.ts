// @ts-nocheck
/**
 * 对照实验：检查同类普通数据节点在主图中是否正常保留物理 InParam。
 * 直接使用现有 dist，不重新编译生产代码。
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'

import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { bool, float, int, vec3 } from '../../dist/src/runtime/value.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUT_DIR = 'tests/composite/output'
const OUT_PATH = `${OUT_DIR}/主图普通节点物理输入调查.gia`

const graph = g.server({
  name: '主图普通节点物理输入调查',
  id: 1073742012,
  variables: {
    floatLeft: new float(3.5),
    floatRight: new float(1.5),
    intLeft: new int(8),
    intRight: new int(2),
    boolFallback: new bool(false),
    vectorLeft: new vec3([1, 2, 3]),
    vectorRight: new vec3([4, 5, 6])
  }
})
graph.on('whenEntityIsCreated', (_event, f) => {
  // 从图变量读取连接值，确保普通节点参数是连接而不是可预计算字面量。
  const floatA = f.addition(f.get('floatLeft'), f.get('floatRight'))
  const floatB = f.subtraction(f.get('floatLeft'), f.get('floatRight'))
  const intA = f.addition(f.get('intLeft'), f.get('intRight'))
  const intB = f.subtraction(f.get('intLeft'), f.get('intRight'))
  const boolA = f.lessThan(intA, intB)
  const boolB = f.logicalAndOperation(boolA, f.get('boolFallback'))
  const vectorA = f._3dVectorAddition(f.get('vectorLeft'), f.get('vectorRight'))
  const vectorB = f._3dVectorSubtraction(f.get('vectorLeft'), f.get('vectorRight'))

  // 通过执行节点消费结果，确保这些数据节点保留在最终主图中。
  f.printString(f.dataTypeConversion(floatA, 'str'))
  f.printString(f.dataTypeConversion(floatB, 'str'))
  f.printString(f.dataTypeConversion(intA, 'str'))
  f.printString(f.dataTypeConversion(intB, 'str'))
  f.printString(f.dataTypeConversion(boolB, 'str'))
  f.printString(f.dataTypeConversion(vectorA, 'str'))
  f.printString(f.dataTypeConversion(vectorB, 'str'))
})

const doc = buildServerGraphRegistriesIRDocuments({
  defaultName: '主图普通节点物理输入调查'
}).at(-1)
assert.ok(doc)
mkdirSync(OUT_DIR, { recursive: true })
const bytes = irToGia(doc, {
  graphId: 1073742012,
  name: '主图普通节点物理输入调查',
  protoPath: PROTO_PATH
})
writeFileSync(OUT_PATH, Buffer.from(bytes))

const decoded = decode_gia_file(OUT_PATH, PROTO_PATH)
const root = decoded.graph?.graph?.inner?.graph
assert.ok(root)
assert.equal(root.compositePins?.length ?? 0, 0, '主图不应存在复合 compositePins')

const nodeNames = {
  200: 'addition',
  202: 'subtraction',
  230: 'less_than',
  226: 'logical_and_operation',
  10: '_3d_vector_addition',
  11: '_3d_vector_subtraction'
}
const targets = (root.nodes ?? []).filter((node) => nodeNames[node.genericId?.nodeId])
const report = targets.map((node) => ({
  type: nodeNames[node.genericId?.nodeId],
  genericNodeId: node.genericId?.nodeId,
  concreteNodeId: node.concreteId?.nodeId,
  physicalInputs: (node.pins ?? [])
    .filter((pin) => pin.i1?.kind === 3)
    .map((pin) => [pin.i1?.index, pin.type]),
  physicalOutputs: (node.pins ?? [])
    .filter((pin) => pin.i1?.kind === 4)
    .map((pin) => [pin.i1?.index, pin.type])
}))

console.log(`输出: ${OUT_PATH}`)
console.log(`大小: ${bytes.length} 字节`)
console.log(`主图节点数: ${root.nodes?.length ?? 0}`)
console.log(JSON.stringify(report, null, 2))

for (const item of report) {
  assert.ok(item.physicalInputs.length > 0, `${item.type}: 主图应存在物理 InParam`)
  assert.ok(item.physicalOutputs.length > 0, `${item.type}: 主图应存在物理 OutParam`)
}

assert.ok(report.some((item) => item.type === 'addition'))
assert.ok(report.some((item) => item.type === 'subtraction'))
assert.ok(report.some((item) => item.type === 'less_than'))
assert.ok(report.some((item) => item.type === 'logical_and_operation'))
assert.ok(report.some((item) => item.type === '_3d_vector_addition'))
assert.ok(report.some((item) => item.type === '_3d_vector_subtraction'))

console.log('PASS: 主图普通节点均保留物理输入/输出引脚')
