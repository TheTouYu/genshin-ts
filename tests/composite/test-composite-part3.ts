// @ts-nocheck — 复合节点测试脚本

/**
 * 复合节点 Part 3：单元级行为验证
 *
 * 验证 defineComposite API、CompositeDefIR 生成、供应商层函数。
 * 不依赖 GIA 管线，快速反馈。
 */

import { defineComposite } from '../../dist/src/index.js'
import { compositeRegistry } from '../../dist/src/runtime/composite_registry.js'
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import {
  composite_pin_body,
  graph_affiliation_body
} from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/basic.js'

let passed = 0
let failed = 0

function test(label: string, fn: () => boolean, detail?: string) {
  try {
    const ok = fn()
    if (ok) {
      console.log(`  ✅ ${label}`)
      passed++
    } else {
      console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`)
      failed++
    }
  } catch (e: any) {
    console.log(`  ❌ ${label} — EXCEPTION: ${e.message}`)
    failed++
  }
}

console.log('═══════════════════════════════════════')
console.log('Part 3: 单元级行为验证')
console.log('═══════════════════════════════════════\n')

// === 3A: defineComposite API 基础行为 ===
console.log('▸ 3A: defineComposite API')

const h = defineComposite('单元测试', {
  inputs: { x: { type: 'int' } },
  outputs: { y: { type: 'int' } },
  build: ({ x }, f) => ({ y: f.addition(x, 1) })
})

test('handle.__composite = true', () => (h as any).__composite === true)
test('handle.name = "单元测试"', () => h.name === '单元测试')
test('handle.id >= 1610700000', () => h.id >= 1610700000)
test('inputs 里 "x" 存在且 type=int', () => h.definition.inputs.x?.type === 'int')
test('outputs 里 "y" 存在且 type=int', () => h.definition.outputs.y?.type === 'int')

// === 3B: 错误处理 ===
console.log('\n▸ 3B: 错误处理')

test('重复定义抛 Error', () => {
  try {
    defineComposite('单元测试', { inputs: {}, outputs: {}, build: () => ({}) })
    return false
  } catch (e: any) {
    return e.message.includes('already defined')
  }
})

// === 3C: ID 单调递增 ===
console.log('\n▸ 3C: ID 单调递增')

const id1 = defineComposite('ID测试A', { inputs: {}, outputs: {}, build: () => ({}) })
const id2 = defineComposite('ID测试B', { inputs: {}, outputs: {}, build: () => ({}) })
test('ID1 < ID2', () => id2.id > id1.id)

// === 3D: toCompositeDefIR 完整性 ===
console.log('\n▸ 3D: toCompositeDefIR')

const simple = defineComposite('IR测试', {
  inputs: { a: { type: 'int' }, b: { type: 'float' }, c: { type: 'bool' } },
  outputs: { r: { type: 'str' } },
  build: () => ({ r: 'hello' as any }) // dummy
})

const ir = simple.definition.toCompositeDefIR()
test('type = "composite"', () => ir.type === 'composite')
test('name 非空', () => ir.name.length > 0)
test('id > 0', () => ir.id > 0)
test('inputs 长度 = 3', () => ir.inputs.length === 3)
test('outputs 长度 = 1', () => ir.outputs.length === 1)
test('inflows 是数组', () => Array.isArray(ir.inflows))
test('outflows 是数组', () => Array.isArray(ir.outflows))
test('implNodes 是数组', () => Array.isArray(ir.implNodes))
test('implEdges 是对象', () => typeof ir.implEdges === 'object')
test('compositePins 是数组', () => Array.isArray(ir.compositePins))

// pinIndex 验证
test('input[0].pinIndex = 100', () => ir.inputs[0].pinIndex === 100)
test('input[1].pinIndex = 101', () => ir.inputs[1].pinIndex === 101)
test('input[2].pinIndex = 102', () => ir.inputs[2].pinIndex === 102)
test('output[0].pinIndex = 200', () => ir.outputs[0].pinIndex === 200)

// 类型验证
test('input[0].type = "int"', () => ir.inputs[0].type === 'int')
test('input[1].type = "float"', () => ir.inputs[1].type === 'float')
test('input[2].type = "bool"', () => ir.inputs[2].type === 'bool')
test('output[0].type = "str"', () => ir.outputs[0].type === 'str')

// 捕获前 implNodes 为空
test('捕获前 implNodes 为空', () => ir.implNodes.length === 0)
test('捕获前 implEdges 为空', () => Object.keys(ir.implEdges).length === 0)

// === 3E: 供应商层函数 ===
console.log('\n▸ 3E: 供应商层函数')

const pin = composite_pin_body({
  outerPinKind: 3, outerPinIndex: 0,
  innerNodeId: 1, innerPinKind: 3, innerPinIndex: 0
})
test('composite_pin_body 非 null', () => pin != null)
test('composite_pin_body.outerPin.kind = 3', () => (pin as any)?.outerPin?.kind === 3)
test('composite_pin_body.innerNodeId = 1', () => (pin as any)?.innerNodeId === 1)

const aff = graph_affiliation_body(12345)
test('graph_affiliation_body 非 null', () => aff != null)

// 检查 affiliation 结构（含有节点 ID 12345）
const affStr = JSON.stringify(aff)
test('affiliation 包含 12345', () => affStr.includes('12345'))

// === 3F: 捕获行为 ===
console.log('\n▸ 3F: 捕获行为')

const capDef = defineComposite('捕获测试', {
  inputs: { val: { type: 'int' } },
  outputs: { res: { type: 'int' } },
  build: ({ val }, f) => ({ res: f.addition(val, val) })
})

// 捕获前
test('捕获前 captured = null', () => capDef.definition.captured === null)

// 捕获后
g.server({ name: 'unit_capture' }).on('whenEntityIsCreated', () => {})
buildServerGraphRegistriesIRDocuments({ defaultName: 'unit_capture' })

test('捕获后 captured != null', () => capDef.definition.captured !== null)
if (capDef.definition.captured) {
  const c = capDef.definition.captured!
  test('dataNodes 含 addition', () => c.dataNodes.some(n => n.nodeType === 'addition'))
  test('execNodes 为空（纯数据）', () => c.execNodes.length === 0)
  test('isPureData = true', () => c.isPureData === true)
  test('outputValues 包含 "res"', () => 'res' in c.outputValues)
}

// === 3G: exec-only 复合捕获 ===
console.log('\n▸ 3G: exec-only 复合捕获')

const execDef = defineComposite('执行捕获测试', {
  inputs: {}, outputs: {},
  build: (_, f) => { f.printString('world'); return {} }
})

g.server({ name: 'unit_exec' }).on('whenEntityIsCreated', () => {})
buildServerGraphRegistriesIRDocuments({ defaultName: 'unit_exec' })

test('exec-only 捕获成功', () => execDef.definition.captured !== null)
if (execDef.definition.captured) {
  const c = execDef.definition.captured!
  test('execNodes 含 print_string', () => c.execNodes.some(n => n.nodeType === 'print_string'))
  test('isPureData = false', () => c.isPureData === false)
}

// === 3H: 第二次调用不重复捕获 ===
console.log('\n▸ 3H: 缓存行为（已捕获的不重复执行）')

const alreadyCaptured = capDef.definition.captured
g.server({ name: 'unit_capture2' }).on('whenEntityIsCreated', () => {})
buildServerGraphRegistriesIRDocuments({ defaultName: 'unit_capture2' })

test('已捕获的复合不被重新捕获', () => {
  // captured 对象引用应和之前相同（因为捕获后在 registry 中标记了 cached）
  return capDef.definition.captured === alreadyCaptured
})

// === 报告 ===
console.log(`\n✅ 通过: ${passed}`)
if (failed > 0) console.log(`❌ 失败: ${failed}`)
console.log('')
process.exit(failed > 0 ? 1 : 0)
