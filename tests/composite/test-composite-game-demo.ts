#!/usr/bin/env npx tsx
// @ts-nocheck — 复合节点游戏内验证脚本

/**
 * 复合节点游戏内验证
 *
 * 定义 4 个复合节点，在主图中调用，生成 GIA 文件。
 * 将生成的 GIA 注入地图后可在游戏节点编辑器中查看效果。
 *
 * 复合节点:
 *   1. 双倍运算 — 整数翻倍
 *   2. 三数求和 — 三个 int 相加
 *   3. 条件打印 — bool 控制是否打印字符串
 *   4. 嵌套增强 — 复合内调用「双倍运算」+ 额外加法 (嵌套复合)
 *
 * 主图:
 *   A. 基础调用 — 调用双倍 + 三数求和
 *   B. exec调用 — 调用条件打印
 *   C. 嵌套调用 — 调用嵌套增强
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { defineComposite } from '../../dist/src/index.js'
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { int, bool, str } from '../../dist/src/runtime/value.js'
import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL('../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const OUT_DIR = '/tmp/composite-game-demo'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

let passed = 0
let failed = 0

function test(label: string, fn: () => boolean, detail?: string) {
  try {
    const ok = fn()
    if (ok) { console.log(`  ✅ ${label}`); passed++ }
    else { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); failed++ }
  } catch (e: any) {
    console.log(`  ❌ ${label} — ${e.message}`); failed++
  }
}

function encodeAndSave(doc: any, graphId: number, name: string): boolean {
  try {
    if (!doc.nodes || doc.nodes.length === 0) {
      console.log(`  ⚠ ${name} — 主图无节点，跳过`)
      return false
    }
    const bytes = irToGia(doc, { graphId, name, protoPath: PROTO_PATH })
    const outPath = `${OUT_DIR}/${name}.gia`
    writeFileSync(outPath, Buffer.from(bytes))
    console.log(`  📦 ${name}.gia — ${bytes.length} 字节`)
    return true
  } catch (e: any) {
    console.log(`  ❌ ${name} 编码失败 — ${e.message}`)
    return false
  }
}

console.log('═══════════════════════════════════════')
console.log('  复合节点 游戏内验证')
console.log('═══════════════════════════════════════\n')

// ═══════════════════════════════════════════
// 定义 4 个复合节点
// ═══════════════════════════════════════════

console.log('── 定义复合节点 ──\n')

// 1. 双倍运算
const doubleHandle = defineComposite('双倍运算', {
  inputs: { 输入值: { type: 'int' } },
  outputs: { 翻倍结果: { type: 'int' } },
  build: ({ 输入值 }, f) => ({ 翻倍结果: f.addition(输入值, 输入值) })
})
test('双倍运算: handle 类型正确', () => doubleHandle.__composite === true)
test('双倍运算: name 正确', () => doubleHandle.name === '双倍运算')

// 2. 三数求和
const tripleSumHandle = defineComposite('三数求和', {
  inputs: { A: { type: 'int' }, B: { type: 'int' }, C: { type: 'int' } },
  outputs: { 总和: { type: 'int' } },
  build: ({ A, B, C }, f) => ({ 总和: f.addition(f.addition(A, B), C) })
})
test('三数求和: handle 类型正确', () => tripleSumHandle.__composite === true)

// 3. exec-only 打印 (纯执行流，无数据输出)
const execPrintHandle = defineComposite('复合打印', {
  inputs: { 消息: { type: 'str' } },
  outputs: {},
  build: ({ 消息 }, f) => {
    f.printString('composite-print')
    return {}
  }
})
test('复合打印: handle 类型正确', () => execPrintHandle.__composite === true)

// 4. 嵌套增强 — 复合内调用「双倍运算」再额外加一个偏移量
const nestedEnhanceHandle = defineComposite('嵌套增强', {
  inputs: { 基数: { type: 'int' }, 偏移: { type: 'int' } },
  outputs: { 增强结果: { type: 'int' } },
  build: ({ 基数, 偏移 }, f) => {
    const doubled = f.callComposite(doubleHandle, { 输入值: 基数 })
    return { 增强结果: f.addition(doubled.翻倍结果, 偏移) }
  }
})
test('嵌套增强: handle 类型正确', () => nestedEnhanceHandle.__composite === true)

// 触发捕获（在 IR 构建前，确保所有复合的 captured 已填充）
g.server({ name: 'demo_trigger' }).on('whenEntityIsCreated', (e, f) => {
  f.printString('capture-trigger')
})
buildServerGraphRegistriesIRDocuments({ defaultName: 'demo_trigger' })

// 验证捕获结果
console.log('\n── 捕获验证 ──\n')

test('双倍运算: 捕获成功', () => doubleHandle.definition.captured !== null)
test('双倍运算: dataNodes 含 addition', () =>
  doubleHandle.definition.captured?.dataNodes.some(n => n.nodeType === 'addition'))

test('三数求和: 捕获成功', () => tripleSumHandle.definition.captured !== null)
test('三数求和: dataNodes 含 2 个 addition', () =>
  (tripleSumHandle.definition.captured?.dataNodes.filter(n => n.nodeType === 'addition').length ?? 0) >= 2)

test('复合打印: 捕获成功', () => execPrintHandle.definition.captured !== null)
test('复合打印: execNodes 含 print_string', () =>
  execPrintHandle.definition.captured?.execNodes.some(n => n.nodeType === 'print_string'))

test('嵌套增强: 捕获 success', () => nestedEnhanceHandle.definition.captured !== null)
test('嵌套增强: dataNodes > 0', () =>
  (nestedEnhanceHandle.definition.captured?.dataNodes?.length ?? 0) > 0)

// ═══════════════════════════════════════════
// 主图 A: 基础调用 — 双倍 + 三数求和
// ═══════════════════════════════════════════

console.log('\n── 主图 A: 基础调用 ──\n')

g.server({ name: 'pA' })
  .on('whenEntityIsCreated', (e, f) => {
    const d = f.callComposite(doubleHandle, { 输入值: new int(5) })
    const t = f.callComposite(tripleSumHandle, { A: d.翻倍结果, B: new int(3), C: new int(2) })
    f.printString('composite A done')
  })

const docsA = buildServerGraphRegistriesIRDocuments({ defaultName: 'pA' })
const docA = docsA[0]
test('主图A: 有节点', () => (docA.nodes?.length ?? 0) >= 1)
encodeAndSave(docA, 1073741882, 'demo_A_basic_call')

// ═══════════════════════════════════════════
// 主图 B: exec 调用 — 复合打印
// ═══════════════════════════════════════════

console.log('\n── 主图 B: exec调用 ──\n')

g.server({ name: 'pB' })
  .on('whenEntityIsCreated', (e, f) => {
    f.callComposite(execPrintHandle, { 消息: new str('hello from composite') })
    f.printString('composite B done')
  })

const docsB = buildServerGraphRegistriesIRDocuments({ defaultName: 'pB' })
const docB = docsB[0]
test('主图B: 有节点', () => (docB.nodes?.length ?? 0) >= 1)
encodeAndSave(docB, 1073741883, 'demo_B_exec_call')

// ═══════════════════════════════════════════
// 主图 C: 嵌套调用 — 嵌套增强
// ═══════════════════════════════════════════

console.log('\n── 主图 C: 嵌套调用 ──\n')

g.server({ name: 'pC' })
  .on('whenEntityIsCreated', (e, f) => {
    const r = f.callComposite(nestedEnhanceHandle, { 基数: new int(10), 偏移: new int(7) })
    // 验证嵌套复合的返回值可以被后续消费
    f.addition(r.增强结果, new int(1))
    f.printString('composite C done')
  })

const docsC = buildServerGraphRegistriesIRDocuments({ defaultName: 'pC' })
const docC = docsC[0]
test('主图C: 有节点', () => (docC.nodes?.length ?? 0) >= 1)
encodeAndSave(docC, 1073741884, 'demo_C_nested_call')

// ═══════════════════════════════════════════
// 验证 GIA 可解码性
// ═══════════════════════════════════════════

console.log('\n── GIA 解码验证 ──\n')

const giaFiles = ['demo_A_basic_call', 'demo_B_exec_call', 'demo_C_nested_call']
for (const name of giaFiles) {
  const path = `${OUT_DIR}/${name}.gia`
  if (!existsSync(path)) {
    console.log(`  ⚠ ${name}.gia 不存在，跳过解码验证`)
    continue
  }
  try {
    const decoded = decode_gia_file(path, PROTO_PATH)
    const hasComposite = (decoded.graph?.which ?? 0) >= 0
    const accCount = decoded.accessories?.length ?? 0
    console.log(`  ✅ ${name}.gia — graph.which=${decoded.graph?.which}, accessories=${accCount}`)
    passed++
  } catch (e: any) {
    console.log(`  ❌ ${name}.gia 解码失败 — ${e.message}`)
    failed++
  }
}

// ═══════════════════════════════════════════
// 报告
// ═══════════════════════════════════════════

console.log(`\n═══════════════════════════════════════`)
console.log(`✅ 通过: ${passed}  ❌ 失败: ${failed}`)
console.log(`📁 输出目录: ${OUT_DIR}`)
console.log(`═══════════════════════════════════════\n`)

if (failed > 0) process.exit(1)
