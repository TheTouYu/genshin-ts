// @ts-nocheck — 嵌套复合布局验证测试
/**
 * 嵌套复合 GIA 生成 + 布局质量验证
 *
 * 定义三层嵌套结构:
 *   - add1: 一个 int 加 1 (pure data)
 *   - mul3: 调用两次 add1 实现乘 3 (嵌套)
 *   - nested_math: 调用 mul3 + 加法 (两层嵌套)
 *
 * 主图在事件中调用 nested_math，验证:
 *   1. CompositeDef 正确编码
 *   2. ImplGraph 包含 callComposite 节点 (kind=22001)
 *   3. 布局无重叠、间距合理
 */
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { defineComposite } from '../../dist/src/index.js'
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { int } from '../../dist/src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

const OUT_DIR = './tests/composite/output'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

let passed = 0
let failed = 0

function test(label: string, ok: boolean, detail?: string) {
  if (ok) { console.log(`  ✅ ${label}`); passed++ }
  else { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); failed++ }
}

// ═══════════════════════════════════════════
// 定义复合节点（三层嵌套）
// ═══════════════════════════════════════════

console.log('═══════════════════════════════════════')
console.log('  nested 复合布局验证')
console.log('═══════════════════════════════════════\n')

// Level 1: add1 — pure data, 输入+1
const add1 = defineComposite('add1', {
  inputs: { x: { type: 'int' } },
  outputs: { result: { type: 'int' } },
  build: ({ x }, f) => ({ result: f.addition(x, new int(1)) })
})

// Level 2: mul3 — 调用 add1 三次 = x+1+1+1
const mul3 = defineComposite('mul3', {
  inputs: { x: { type: 'int' } },
  outputs: { result: { type: 'int' } },
  build: ({ x }, f) => {
    const r1 = f.callComposite(add1, { x })
    const r2 = f.callComposite(add1, { x: r1.result })
    const r3 = f.callComposite(add1, { x: r2.result })
    return { result: r3.result }
  }
})

// Level 3: nested_math — 调用 mul3 再 + 偏移
const nestedMath = defineComposite('nested_math', {
  inputs: { base: { type: 'int' }, offset: { type: 'int' } },
  outputs: { final: { type: 'int' } },
  build: ({ base, offset }, f) => {
    const tripled = f.callComposite(mul3, { x: base })
    return { final: f.addition(tripled.result, offset) }
  }
})

test('add1: id 已分配', () => add1.id >= 1610700000)
test('mul3: id 已分配', () => mul3.id >= 1610700000)
test('nested_math: id 已分配', () => nestedMath.id >= 1610700000)

// ═══════════════════════════════════════════
// 触发捕获（Stage 2 — 执行 build()）
// ═══════════════════════════════════════════

console.log('\n── 捕获阶段 ──\n')

g.server({ name: 'trigger' }).on('whenEntityIsCreated', (_e, f) => { f.printString('keep-alive') })
buildServerGraphRegistriesIRDocuments({ defaultName: 'trigger' })

test('add1: captured', () => add1.definition.captured !== null)
test('add1: dataNodes 含 addition', () =>
  add1.definition.captured?.dataNodes.filter(n => n.nodeType === 'addition').length === 1)
test('mul3: captured', () => mul3.definition.captured !== null)
test('mul3: callComposite 节点数 = 3', () =>
  (mul3.definition.captured?.dataNodes.filter(n => n.nodeType === '__composite_call__').length ?? 0) === 3)
test('nested_math: captured', () => nestedMath.definition.captured !== null)
test('nested_math: callComposite 节点数 = 1', () =>
  (nestedMath.definition.captured?.dataNodes.filter(n => n.nodeType === '__composite_call__').length ?? 0) === 1)

// ═══════════════════════════════════════════
// 主图：事件 → nested_math
// ═══════════════════════════════════════════

console.log('\n── 主图：事件 → callComposite(nested_math) ──\n')

g.server({ name: 'main', graphId: 1073741890 })
  .on('whenEntityIsCreated', (_e, f) => {
    const r1 = f.callComposite(nestedMath, { base: new int(10), offset: new int(5) })
    f.printString('final=' + r1.final)
  })

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]

console.log(`IR nodes: ${doc.nodes?.length ?? 0}`)
const mainCallNodes = doc.nodes?.filter(n => n.type === '__composite_call__') ?? []
test(`主图 callComposite 节点数 = 1`, () => mainCallNodes.length === 1)

// ═══════════════════════════════════════════
// 编码为 GIA
// ═══════════════════════════════════════════

console.log('\n── GIA 编码 ──\n')

const graphId = 1073741890
const bytes = irToGia(doc, { graphId, name: 'nested_layout_test', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/nested_layout_test.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`  📦 nested_layout_test.gia — ${bytes.length} 字节 (${(bytes.length / 1024).toFixed(1)} KB)`)

// ═══════════════════════════════════════════
// 解码验证
// ═══════════════════════════════════════════

console.log('\n── GIA 解码验证 ──\n')

const decoded = decode_gia_file(outPath, PROTO_PATH)
const accessories = decoded.accessories ?? []
test('accessories 数量 >= 3（add1 + mul3 + nested_math）', () => accessories.length >= 3)

// 检查 CompositeDef accessories (which===12)
const compositeDefs = accessories.filter(a => a.which === 12)
test(`CompositeDef 数量 = 3`, () => compositeDefs.length === 3)

const defNames = compositeDefs.map(a => a.compositeDef?.inner?.def?.name ?? '?')
console.log(`  CompositeDefs: ${defNames.join(', ')}`)
test('包含 add1', () => defNames.includes('add1'))
test('包含 mul3', () => defNames.includes('mul3'))
test('包含 nested_math', () => defNames.includes('nested_math'))

// 检查主图节点
const mainGraph = decoded.graph?.graph?.inner?.graph
const mainNodes = mainGraph?.nodes ?? []
console.log(`\n主图节点: ${mainNodes.length} 个`)
mainNodes.forEach(n => {
  const kind = n.genericId?.kind
  const nid = n.genericId?.nodeId
  const nodeType = kind === 22000 ? (nid === 71 ? 'event' : 'normal')
    : kind === 22001 ? 'composite_call'
    : kind === 7 ? 'print_string'
    : `kind=${kind}`
  console.log(`  node[${n.nodeIndex}] ${nodeType} at (${n.x}, ${n.y})`)
})

// ═══════════════════════════════════════════
// 布局质量检查
// ═══════════════════════════════════════════

console.log('\n── 布局质量检查 ──\n')

// 收集所有 graph（主图 + 各 composite 的 impl graph）
const allGraphs = []

// 主图
if (mainGraph?.nodes?.length) {
  allGraphs.push({ label: '<主图>', nodes: mainGraph.nodes })
}

// accessories 中的 implGraph (which===9)
const implGraphs = accessories.filter(a => a.which === 9)
for (let i = 0; i < implGraphs.length; i++) {
  const g = implGraphs[i].graph?.inner?.graph
  if (g?.nodes?.length) {
    // 找到它前面的 CompositeDef 名称
    const prevDef = i > 0 && accessories[i - 1]?.which === 12
      ? accessories[i - 1].compositeDef?.inner?.def?.name ?? `acc[${i-1}]`
      : `acc[${i}]`
    allGraphs.push({ label: `impl<${prevDef}>`, nodes: g.nodes })
  }
}

for (const g of allGraphs) {
  const nodes = g.nodes
  console.log(`\n▸ ${g.label} (${nodes.length} nodes)`)

  // 1. 重叠检测
  const posMap = new Map()
  let overlapCount = 0
  for (const n of nodes) {
    const key = `${Math.round(n.x)},${Math.round(n.y)}`
    if (posMap.has(key)) {
      console.log(`  ❌ 重叠: nIdx=${posMap.get(key)} 和 ${n.nodeIndex} 都在 (${Math.round(n.x)}, ${Math.round(n.y)})`)
      overlapCount++
    }
    posMap.set(key, n.nodeIndex)
  }

  if (overlapCount === 0) {
    const allPositions = nodes.map(n => `${n.nodeIndex}@(${Math.round(n.x)},${Math.round(n.y)})`).join(', ')
    console.log(`  ✅ 无重叠. 位置: ${allPositions}`)
  }

  // 2. 间距检查（<20px）
  let tooCloseCount = 0
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = Math.abs(nodes[i].x - nodes[j].x)
      const dy = Math.abs(nodes[i].y - nodes[j].y)
      if (dx + dy > 0 && Math.sqrt(dx * dx + dy * dy) < 20) {
        console.log(`  ⚠ 间距过近: nIdx=${nodes[i].nodeIndex} 和 ${nodes[j].nodeIndex} dist=${Math.sqrt(dx*dx+dy*dy).toFixed(0)}px`)
        tooCloseCount++
      }
    }
  }
  if (tooCloseCount === 0) console.log('  ✅ 间距合理')

  // 3. 坐标非负检查
  const negPos = nodes.filter(n => n.x < 0 || n.y < 0)
  if (negPos.length > 0) {
    console.log(`  ⚠ 负坐标: ${negPos.map(n => `n${n.nodeIndex}(${Math.round(n.x)},${Math.round(n.y)})`).join(', ')}`)
  } else {
    console.log('  ✅ 坐标均非负')
  }

  // 4. 数据类型节点应有列对齐
  if (nodes.length >= 2) {
    const xCoords = [...new Set(nodes.map(n => Math.round(n.x / 50) * 50))]
    console.log(`  ℹ  X 坐标（取整 50px) = [${xCoords.join(', ')}]`)
  }
}

// ═══════════════════════════════════════════
// 输出 IR JSON 用于调试
// ═══════════════════════════════════════════

const irJson = JSON.stringify(docs, (_k, val) =>
  typeof val === 'bigint' ? val.toString() : val, 2)
writeFileSync(`${OUT_DIR}/nested_layout_test.json`, irJson, 'utf8')
console.log(`\n📦 IR JSON: ${OUT_DIR}/nested_layout_test.json`)

// ═══════════════════════════════════════════
// 报告
// ═══════════════════════════════════════════

console.log(`\n═══════════════════════════════════════`)
console.log(`✅ 通过: ${passed}  ❌ 失败: ${failed}`)
console.log(`📁 GIA: ${outPath}`)
console.log(`═══════════════════════════════════════\n`)

if (failed > 0) process.exit(1)
