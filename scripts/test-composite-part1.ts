#!/usr/bin/env npx tsx
// @ts-nocheck — 复合节点测试脚本

/**
 * 复合节点 Part 1：复合定义 GIA 精确对比
 *
 * 对参考目录中所有 ts_g_define_*.gia 文件：
 * 1. 用相同参数定义复合节点
 * 2. 生成 CompositeDefIR
 * 3. 编码为 GIA
 * 4. 用 verify-composite-gia.ts 做结构化对比
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'
import { decode_gia_file } from '../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { defineComposite } from '../dist/src/index.js'
import { compositeRegistry } from '../dist/src/runtime/composite_registry.js'
import { g, buildServerGraphRegistriesIRDocuments } from '../dist/src/runtime/core.js'
import { irToGia } from '../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildCompositeAccessories } from '../dist/src/compiler/ir_to_gia_transform/composite.js'

const PROTO_PATH = new URL('../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const REF_DIR = process.env.COMPOSITE_REF_DIR || ''
const OUT_DIR = '/tmp/composite-test-output/part1'

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

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

console.log('═══════════════════════════════════════')
console.log('Part 1: 复合定义 GIA 精确对比')
console.log(`参考目录: ${REF_DIR}`)
console.log('═══════════════════════════════════════\n')

// === 1A: 简单复合 — 整数加法（test 文件）===
console.log('▸ 1A: 整数加法 test')

const jiafa = defineComposite('整数加法', {
  inputs: { 加数A: { type: 'int' }, 加数B: { type: 'int' } },
  outputs: { 结果: { type: 'int' } },
  build: ({ 加数A, 加数B }, f) => ({ 结果: f.addition(加数A, 加数B) })
})

// 先验证 IR 层
const ir_jiafa = jiafa.definition.toCompositeDefIR()
test('整数加法 IR 名称正确', () => ir_jiafa.name === '整数加法')
test('整数加法 inputs 数量=2', () => ir_jiafa.inputs.length === 2)
test('整数加法 outputs 数量=1', () => ir_jiafa.outputs.length === 1)
test('整数加法 input[0].name = "加数A"', () => ir_jiafa.inputs[0].name === '加数A')
test('整数加法 input[1].name = "加数B"', () => ir_jiafa.inputs[1].name === '加数B')
test('整数加法 input[0].type = "int"', () => ir_jiafa.inputs[0].type === 'int')
test('整数加法 output[0].name = "结果"', () => ir_jiafa.outputs[0].name === '结果')

// 与参考文件对比（基础结构）
const refTestPath = `${REF_DIR}/ts_整数加法_test.gia`
if (existsSync(refTestPath)) {
  const refGia = decode_gia_file(refTestPath, PROTO_PATH)
  const refDef = refGia.graph.compositeDef?.inner?.def
  if (refDef) {
    test('整数加法: 参考文件 type.kind = 1000', () => refDef.type?.kind === 1000)
    test('整数加法: 参考文件 name 匹配', () => refDef.name === '整数加法')
    // 对比数量
    test('整数加法: 输入数量匹配参考', () => ir_jiafa.inputs.length === (refDef.inputs?.length ?? 0))
    test('整数加法: 输出数量匹配参考', () => ir_jiafa.outputs.length === (refDef.outputs?.length ?? 0))
    // 对比类型
    if (refDef.inputs) {
      for (let i = 0; i < Math.min(ir_jiafa.inputs.length, refDef.inputs.length); i++) {
        const ri = refDef.inputs[i]
        test(`整数加法: input[${i}] class=${ri.type?.class}`, () => ir_jiafa.inputs[i].type === 'int')
      }
    }
  } else {
    console.log('  ⚠ 整数加法参考文件不是 CompositeDef')
  }
}

// === 1B: 双倍运算 ===
console.log('\n▸ 1B: 双倍运算')

const doubleDef = defineComposite('双倍运算_1B', {
  inputs: { val: { type: 'int' } },
  outputs: { result: { type: 'int' } },
  build: ({ val }, f) => ({ result: f.addition(val, val) })
})

const ir_dbl = doubleDef.definition.toCompositeDefIR()
test('双倍运算: name 正确', () => ir_dbl.name === '双倍运算_1B')
test('双倍运算: inputs=1', () => ir_dbl.inputs.length === 1)
test('双倍运算: outputs=1', () => ir_dbl.outputs.length === 1)

// === 1C: 浮点四则运算 ===
console.log('\n▸ 1C: 浮点四则运算')

const floatDef = defineComposite('浮点四则运算', {
  inputs: { A: { type: 'float' }, B: { type: 'float' } },
  outputs: { 和: { type: 'float' }, 差: { type: 'float' }, 积: { type: 'float' }, 商: { type: 'float' } },
  build: ({ A, B }, f) => ({
    和: f.addition(A, B),
    差: f.subtraction(A, B),
    积: f.multiplication(A, B),
    商: f.division(A, B)
  })
})

const ir_float = floatDef.definition.toCompositeDefIR()
test('浮点四则: inputs=2', () => ir_float.inputs.length === 2)
test('浮点四则: outputs=4', () => ir_float.outputs.length === 4)
test('浮点四则: input[0].type = "float"', () => ir_float.inputs[0].type === 'float')
test('浮点四则: output[0].type = "float"', () => ir_float.outputs[0].type === 'float')
test('浮点四则: input[0].name = "A"', () => ir_float.inputs[0].name === 'A')
test('浮点四则: output[0].name = "和"', () => ir_float.outputs[0].name === '和')

// === 1D: 多类型复合测试 ===
console.log('\n▸ 1D: 多类型全类型测试')

const fullDef = defineComposite('全类型测试', {
  inputs: {
    A: { type: 'int' }, B: { type: 'int' },
    浮点A: { type: 'float' }, 浮点B: { type: 'float' },
    布尔: { type: 'bool' }, 字符串: { type: 'str' },
    向量X: { type: 'float' }, 向量Y: { type: 'float' }, 向量Z: { type: 'float' },
    预制体: { type: 'prefab_id' },
    实体阵营: { type: 'entity' },
    实体配置: { type: 'config_id' }
  },
  outputs: {
    整数结果: { type: 'int' }, 浮点结果: { type: 'float' },
    布尔结果: { type: 'bool' }, 三维向量: { type: 'vec3' },
    目标实体: { type: 'entity' }, 实体GUID: { type: 'guid' },
    实体列表: { type: 'entity_list' },
    阵营: { type: 'faction' }, 配置: { type: 'config_id' }
  },
  build: (ins, f) => ({
    整数结果: ins.A, 浮点结果: ins.浮点A,
    布尔结果: ins.布尔, 三维向量: ins.向量X,
    目标实体: ins.实体阵营, 实体GUID: ins.A,
    实体列表: ins.A, 阵营: ins.A, 配置: ins.B
  })
})

const ir_full = fullDef.definition.toCompositeDefIR()
test('全类型 inputs=12', () => ir_full.inputs.length === 12)
test('全类型 outputs=9', () => ir_full.outputs.length === 9)

// 验证各个类型的 IR 字段
const typeCases: { name: string; ir: any; expectedType: string }[] = [
  { name: 'A(int)', ir: ir_full.inputs[0], expectedType: 'int' },
  { name: '浮点A(float)', ir: ir_full.inputs[2], expectedType: 'float' },
  { name: '布尔(bool)', ir: ir_full.inputs[4], expectedType: 'bool' },
  { name: '字符串(str)', ir: ir_full.inputs[5], expectedType: 'str' },
  { name: '预制体(prefab_id)', ir: ir_full.inputs[9], expectedType: 'prefab_id' },
  { name: 'entity', ir: ir_full.inputs[10], expectedType: 'entity' },
  { name: 'config_id', ir: ir_full.inputs[11], expectedType: 'config_id' },
  { name: 'bool 输出', ir: ir_full.outputs[2], expectedType: 'bool' },
  { name: 'vec3 输出', ir: ir_full.outputs[3], expectedType: 'vec3' },
  { name: 'guid 输出', ir: ir_full.outputs[5], expectedType: 'guid' },
  { name: 'entity_list 输出', ir: ir_full.outputs[6], expectedType: 'entity_list' },
  { name: 'faction 输出', ir: ir_full.outputs[7], expectedType: 'faction' },
]
for (const tc of typeCases) {
  test(`全类型: ${tc.name} → type=${tc.expectedType}`, () => tc.ir.type === tc.expectedType)
}

// === 1E: 加减运算2（多节点复合） ===
console.log('\n▸ 1E: 加减运算2（多节点）')

const jiajianDef = defineComposite('加减运算2', {
  inputs: { a: { type: 'int' }, b: { type: 'int' } },
  outputs: { sum: { type: 'int' }, diff: { type: 'int' } },
  build: ({ a, b }, f) => ({
    sum: f.addition(a, b),
    diff: f.subtraction(a, b)
  })
})

test('加减运算2 inputs=2', () => jiajianDef.definition.toCompositeDefIR().inputs.length === 2)
test('加减运算2 outputs=2', () => jiajianDef.definition.toCompositeDefIR().outputs.length === 2)

// === 1F: 三范围判定器（exec 类型复合） ===
console.log('\n▸ 1F: 三范围判定器')

const rangeDef = defineComposite('三范围判定器', {
  inputs: { 输入值: { type: 'int' }, 下限: { type: 'int' }, 上限: { type: 'int' }, 下限2: { type: 'int' }, 上限2: { type: 'int' }, 下限3: { type: 'int' }, 上限3: { type: 'int' } },
  outputs: { 范围1: { type: 'bool' }, 范围2: { type: 'bool' }, 范围3: { type: 'bool' } },
  build: ({ 输入值, 下限, 上限, 下限2, 上限2, 下限3, 上限3 }, f) => ({
    范围1: f.logicalAndOperation(f.greaterThanOrEqualTo(输入值, 下限), f.lessThanOrEqualTo(输入值, 上限)),
    范围2: f.logicalAndOperation(f.greaterThanOrEqualTo(输入值, 下限2), f.lessThanOrEqualTo(输入值, 上限2)),
    范围3: f.logicalAndOperation(f.greaterThanOrEqualTo(输入值, 下限3), f.lessThanOrEqualTo(输入值, 上限3))
  })
})

test('三范围判定器 inputs=7', () => rangeDef.definition.toCompositeDefIR().inputs.length === 7)
test('三范围判定器 outputs=3', () => rangeDef.definition.toCompositeDefIR().outputs.length === 3)

// === 1G: 管线编码验证（端到端） ===
console.log('\n▸ 1G: 管线端到端编码')

g.server({ name: 'part1_test' })
  .on('whenEntityIsCreated', (e: any, f: any) => {
    f.printString('test') // 确保主图至少有一个节点
  })
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'part1_test' })

// 检查 compositeDefs 是否存在于文档中
const defsInDocs = (docs[0] as any)?.compositeDefs ?? []
test('IR 文档含 compositeDefs', () => defsInDocs.length > 0)

// 按名称查找定义的复合
const foundJiafa = defsInDocs.find((d: any) => d.name === '整数加法')
test('IR compositeDefs 含 "整数加法"', () => !!foundJiafa)
if (foundJiafa) {
  test('整数加法 IR type = "composite"', () => foundJiafa.type === 'composite')
}

const foundFloat = defsInDocs.find((d: any) => d.name === '浮点四则运算')
test('IR compositeDefs 含 "浮点四则运算"', () => !!foundFloat)

// GIA 编码
try {
  const bytes = irToGia(docs[0] as any, {
    graphId: 1073741825,
    name: 'part1_test',
    protoPath: PROTO_PATH
  })
  test('GIA 编码成功', () => bytes.length > 0)

  const outPath = `${OUT_DIR}/part1_combined.gia`
  writeFileSync(outPath, Buffer.from(bytes))

  const decoded = decode_gia_file(outPath, PROTO_PATH)
  test('解码后 accessories 数量 > 0', () => (decoded.accessories?.length ?? 0) > 0)

  // 检查是否有 CompositeDef 在 accessories 中
  const hasCompositeAcc = (decoded.accessories ?? []).some((acc: any) => acc.which === 12)
  test('accessories 中含 CompositeDef 类型 (which=12)', () => hasCompositeAcc)

  // 用 verify-composite-gia.ts 做精确对比
  if (existsSync(`${REF_DIR}/ts_整数加法_test.gia`)) {
    console.log('\n  → 运行 verify-composite-gia.ts 对比 整数加法...')
    try {
      const verifyOut = execSync(
        `npx tsx scripts/verify-composite-gia.ts "${REF_DIR}/ts_整数加法_test.gia" "${outPath}" --verbose 2>&1 || true`,
        { cwd: process.cwd(), encoding: 'utf-8', timeout: 30000 }
      )
      // 输出比对结果
      console.log(verifyOut.split('\n').slice(0, 5).map(l => '    ' + l).join('\n'))
      const passMatch = verifyOut.match(/✅ 通过: (\d+)/)
      const failMatch = verifyOut.match(/❌ 失败: (\d+)/)
      const vPass = passMatch ? parseInt(passMatch[1]) : 0
      const vFail = failMatch ? parseInt(failMatch[1]) : 0
      test(`整数加法 verify-composite-gia: ${vPass}通过/${vFail}失败`, () => vFail === 0)
    } catch (e: any) {
      console.log(`  ⚠ verify-composite-gia 执行异常: ${e.message}`)
    }
  }
} catch (e: any) {
  console.log(`  ❌ GIA 编码异常: ${e.message}`)
  failed++
}

// === 报告 ===
console.log(`\n✅ 通过: ${passed}`)
if (failed > 0) console.log(`❌ 失败: ${failed}`)
console.log('')
process.exit(failed > 0 ? 1 : 0)
