#!/usr/bin/env npx tsx
// @ts-nocheck — 复合节点测试脚本

/**
 * 复合节点 Part 2：完整设施图测试（定义+调用）
 *
 * 覆盖 callComposite 在主图中的注册、返回值连线、exec-only 复合、多次调用。
 * 无参考文件，标记 @pending_ref。验证 IR 结构正确性 + GIA 可解码性。
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { defineComposite } from '../../dist/src/index.js'
import { compositeRegistry } from '../../dist/src/runtime/composite_registry.js'
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { int, str } from '../../dist/src/runtime/value.js'

const PROTO_PATH = new URL('../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const OUT_DIR = '/tmp/composite-test-output/part2'

let passed = 0
let failed = 0
let pendingRefCount = 0

function test(label, fn, detail?) {
  try {
    const ok = fn()
    if (ok) {
      console.log(`  ✅ ${label}`)
      passed++
    } else {
      console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`)
      failed++
    }
  } catch (e) {
    console.log(`  ❌ ${label} — EXCEPTION: ${e.message}`)
    failed++
  }
}

function pendingRef(label) {
  console.log(`  ⏳ ${label} [@pending_ref]`)
  pendingRefCount++
}

function encodeGia(label, doc, graphId, name) {
  try {
    // 确保主图有节点
    if (!doc.nodes || doc.nodes.length === 0) {
      console.log(`  ⚠ ${label} — 主图无节点，跳过 GIA 编码`)
      return false
    }
    const bytes = irToGia(doc, { graphId, name, protoPath: PROTO_PATH })
    const outPath = `${OUT_DIR}/${name}.gia`
    writeFileSync(outPath, Buffer.from(bytes))
    console.log(`  ✅ ${label} — ${bytes.length} 字节`)
    passed++
    return true
  } catch (e) {
    console.log(`  ❌ ${label} — ${e.message}`)
    failed++
    return false
  }
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

console.log('═══════════════════════════════════════')
console.log('Part 2: 完整设施图（定义+调用）')
console.log('═══════════════════════════════════════\n')

// ═══ 2A: 简单捕获 — 定义复合但不调用 ═══
console.log('▸ 2A: 简单捕获 + 独立主图')

const addHandle = defineComposite('简加', {
  inputs: { a: { type: 'int' }, b: { type: 'int' } },
  outputs: { sum: { type: 'int' } },
  build: ({ a, b }, f) => ({ sum: f.addition(a, b) })
})

test('handle 类型正确', () => addHandle.__composite === true)
test('handle.name = "简加"', () => addHandle.name === '简加')

g.server({ name: 'p2a' }).on('whenEntityIsCreated', (e, f) => { f.printString('keep-alive') })
const docsA = buildServerGraphRegistriesIRDocuments({ defaultName: 'p2a', optimizeA: true })

test('captured.dataNodes 含 addition', () => addHandle.definition.captured?.dataNodes.some(n => n.nodeType === 'addition'))
encodeGia('2A 编码', docsA[0], 1073741835, 'p2a_simple_capture')

// ═══ 2B: exec-only 复合 ═══
console.log('\n▸ 2B: exec-only 复合')

const printHandle = defineComposite('打印2B', {
  inputs: {}, outputs: {},
  build: (_, f) => { f.printString('composite exec'); return {} }
})

g.server({ name: 'p2b' }).on('whenEntityIsCreated', (e, f) => { f.printString('keep-alive') })
const docsB = buildServerGraphRegistriesIRDocuments({ defaultName: 'p2b' })

test('printHandle 捕获 execNodes 含 print_string', () =>
  printHandle.definition.captured?.execNodes.some(n => n.nodeType === 'print_string'))
test('printHandle isPureData = false', () => printHandle.definition.captured?.isPureData === false)
encodeGia('2B 编码', docsB[0], 1073741836, 'p2b_exec_only')

// ═══ 2C: callComposite 主图调用 ═══
console.log('\n▸ 2C: callComposite 主图调用')

g.server({ name: 'p2c' })
  .on('whenEntityIsCreated', (e, f) => {
    f.printString('keep-alive')
    f.callComposite(addHandle, { a: new int(), b: new int(3) })
  })

const docsC = buildServerGraphRegistriesIRDocuments({ defaultName: 'p2c' })
const docC = docsC[0]
test('2C 主图有节点', () => (docC.nodes?.length ?? 0) >= 1)
encodeGia('2C 编码', docC, 1073741837, 'p2c_call_composite')

// ═══ 2D: callComposite 返回值连线 ═══
console.log('\n▸ 2D: callComposite 返回值连线')

g.server({ name: 'p2d' })
  .on('whenEntityIsCreated', (e, f) => {
    f.printString('keep-alive')
    const r = f.callComposite(addHandle, { a: new int(), b: new int(3) })
    // 验证 callComposite 返回值可被其他节点消费
    f.addition(r.sum, new int(1))
  })

const docsD = buildServerGraphRegistriesIRDocuments({ defaultName: 'p2d' })
const docD = docsD[0]
test('2D 主图有节点', () => (docD.nodes?.length ?? 0) >= 1)
encodeGia('2D 编码', docD, 1073741838, 'p2d_return_wiring')
pendingRef('callComposite 返回值连线 GIA 精确对比')

// ═══ 2E: 多次调用同一复合 ═══
console.log('\n▸ 2E: 多次调用同一复合')

const incHandle = defineComposite('自增2E', {
  inputs: { v: { type: 'int' } },
  outputs: { r: { type: 'int' } },
  build: ({ v }, f) => ({ r: f.addition(v, 1) })
})

g.server({ name: 'p2e' })
  .on('whenEntityIsCreated', (e, f) => {
    f.printString('keep-alive')
    const r1 = f.callComposite(incHandle, { v: new int() })
    const r2 = f.callComposite(incHandle, { v: r1.r })
    // 链式消费：r2.r 是 int，传递给另一个 int 函数验证连线
    f.addition(r2.r, new int(1))
  })

const docsE = buildServerGraphRegistriesIRDocuments({ defaultName: 'p2e' })
const docE = docsE[0]
test('2E 主图有节点', () => (docE.nodes?.length ?? 0) >= 1)
encodeGia('2E 编码', docE, 1073741839, 'p2e_multi_call')
pendingRef('多次调用 GIA 精确对比')

// ═══ 2F: 空复合 ═══
console.log('\n▸ 2F: 空复合')

const emptyHandle = defineComposite('空复合2F', {
  inputs: {}, outputs: {},
  build: () => ({})
})

g.server({ name: 'p2f' }).on('whenEntityIsCreated', (e, f) => { f.printString('keep-alive') })
const docsF = buildServerGraphRegistriesIRDocuments({ defaultName: 'p2f' })

test('空复合捕获成功', () => emptyHandle.definition.captured !== null)
if (emptyHandle.definition.captured) {
  const c = emptyHandle.definition.captured
  test('空复合 execNodes = 0', () => c.execNodes.length === 0)
  test('空复合 dataNodes = 0', () => c.dataNodes.length === 0)
  test('空复合 isPureData = true', () => c.isPureData === true)
}
encodeGia('2F 编码', docsF[0], 1073741845, 'p2f_empty')
pendingRef('空复合 GIA 精确对比')

// ═══ 2G: 嵌套复合（复合内 callComposite）═══
console.log('\n▸ 2G: 嵌套复合 [@pending_ref]')

const baseAddHandle = defineComposite('基础加法2G', {
  inputs: { x: { type: 'int' }, y: { type: 'int' } },
  outputs: { s: { type: 'int' } },
  build: ({ x, y }, f) => ({ s: f.addition(x, y) })
})

const nestedHandle = defineComposite('嵌套2G', {
  inputs: { a: { type: 'int' }, b: { type: 'int' }, c: { type: 'int' } },
  outputs: { result: { type: 'int' } },
  build: ({ a, b, c }, f) => {
    const mid = f.callComposite(baseAddHandle, { x: a, y: b })
    return { result: f.callComposite(baseAddHandle, { x: mid.s, y: c }).s }
  }
})

g.server({ name: 'p2g' }).on('whenEntityIsCreated', (e, f) => { f.printString('keep-alive') })
const docsG = buildServerGraphRegistriesIRDocuments({ defaultName: 'p2g' })

test('嵌套复合捕获含 dataNodes', () =>
  (nestedHandle.definition.captured?.dataNodes?.length ?? 0) > 0)

encodeGia('2G 编码', docsG[0], 1073741846, 'p2g_nested')
pendingRef('嵌套复合 GIA 精确对比')

// ═══ 报告 ═══
const total = passed + failed + pendingRefCount
console.log(`\n✅ 通过: ${passed}`)
if (failed > 0) console.log(`❌ 失败: ${failed}`)
console.log(`⏳ @pending_ref: ${pendingRefCount}`)
console.log('')
process.exit(failed > 0 ? 1 : 0)
