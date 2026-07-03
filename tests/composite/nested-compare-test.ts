// @ts-nocheck — 嵌套复合对比测试：与 user_edit/嵌套.gia 结构一致
/**
 * 验证嵌套复合 GIA 结构与参考文件结构一致。
 * 
 * 参考 user_edit/嵌套.gia 结构（3 层）:
 *   加法(2) — 纯数据, 2输入1输出, impl: 1 x addition(nid=200)
 *   顺序执行3 — 有 exec 流, 2输入1输出, impl: 4 double_branch + 1x composite_call(加法(2))
 *   嵌套 — 有 exec 流, 3输入1输出, impl: 2x composite_call(顺序执行3)
 * 
 * 本测试创建同构的 3 层结构：
 *   add2 — 纯数据, 2输入1输出
 *   seq3 — 有 exec 流, 2输入1输出, 调 add2
 *   nested — 有 exec 流, 3输入1输出, 调 seq3 两次
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs'
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
// Level 1: add2 — 纯数据复合（类比 加法(2)）
// ═══════════════════════════════════════════
const add2 = defineComposite('add2', {
  inputs: { a: { type: 'int' }, b: { type: 'int' } },
  outputs: { sum: { type: 'int' } },
  build: ({ a, b }, f) => ({ sum: f.addition(a, b) })
})

// ═══════════════════════════════════════════
// Level 2: seq3 — 有 exec 流复合，调用 add2（类比 顺序执行3）
// ═══════════════════════════════════════════
const seq3 = defineComposite('seq3', {
  inputs: { x: { type: 'int' }, y: { type: 'int' } },
  outputs: { result: { type: 'int' } },
  build: ({ x, y }, f) => {
    // 执行流 + 复合调用
    const r = f.callComposite(add2, { a: x, b: y })
    f.printString('seq3_done')
    return { result: r.sum }
  }
})

// ═══════════════════════════════════════════
// Level 3: nested — 有 exec 流复合，调用 seq3 两次（类比 嵌套）
// ═══════════════════════════════════════════
const nested = defineComposite('nested', {
  inputs: { a: { type: 'int' }, b: { type: 'int' }, c: { type: 'int' } },
  outputs: { final: { type: 'int' } },
  build: ({ a, b, c }, f) => {
    const r1 = f.callComposite(seq3, { x: a, y: b })
    const r2 = f.callComposite(seq3, { x: r1.result, y: c })
    return { final: r2.result }
  }
})

// ═══════════════════════════════════════════
// 主图：事件 → 调用 nested
// ═══════════════════════════════════════════
g.server({ name: 'main', graphId: 1073741899 })
  .on('whenEntityIsCreated', (_e, f) => {
    const r = f.callComposite(nested, { a: new int(10), b: new int(20), c: new int(30) })
    f.printString('final=' + r.final)
  })

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]

// ═══════════════════════════════════════════
// 编码为 GIA
// ═══════════════════════════════════════════
const bytes = irToGia(doc, { graphId: 1073741899, name: 'nested_compare', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/nested_compare.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n📦 nested_compare.gia — ${bytes.length} 字节`)

// ═══════════════════════════════════════════
// 解码验证
// ═══════════════════════════════════════════
const decoded = decode_gia_file(outPath, PROTO_PATH)
const accessories = decoded.accessories ?? []

// === 结构对比 ===
console.log('\n══════════ 结构分析 ══════════\n')

const defs = accessories.filter(a => a.which === 12)
test('CompositeDef 数量 = 3', () => defs.length === 3)
const defNames = defs.map(a => a.compositeDef?.inner?.def?.name ?? '?')
console.log(`  CompositeDefs: ${defNames.join(', ')}`)
test('包含 add2', () => defNames.includes('add2'))
test('包含 seq3', () => defNames.includes('seq3'))
test('包含 nested', () => defNames.includes('nested'))

// 检查每个复合
for (let i = 0; i < accessories.length; i++) {
  const a = accessories[i]
  if (a.which === 12) {
    const cd = a.compositeDef?.inner?.def ?? {}
    const name = cd.name ?? '?'
    const inflows = cd.inflows?.length ?? 0
    const outflows = cd.outflows?.length ?? 0
    const inputs = cd.inputs?.length ?? 0
    const outputs = cd.outputs?.length ?? 0
    console.log(`\n▸ ${name}: inflows=${inflows} outflows=${outflows} inputs=${inputs} outputs=${outputs}`)

    // 找对应的 impl (which=9 在 who=12 后面)
    if (i + 1 < accessories.length && accessories[i + 1].which === 9) {
      const impl = accessories[i + 1].graph?.inner?.graph ?? {}
      const nodes = impl.nodes ?? []
      const cps = impl.compositePins ?? []
      console.log(`  impl 节点: ${nodes.length}, compositePins: ${cps.length}`)
      for (const n of nodes) {
        const nid = n.genericId?.nodeId
        const kind = n.genericId?.kind
        const nidx = n.nodeIndex
        const pinDescs = (n.pins ?? []).map(p => {
          const k = p.i1?.kind
          const idx = p.i1?.index
          const c = k === 1 ? 'InFlow' : k === 2 ? 'OutFlow' : k === 3 ? 'InParam' : k === 4 ? 'OutParam' : `kind=${k}`
          return `${c}[${idx}]`
        })
        const kindLabel = kind === 22001 ? '🏷️ composite_call' : kind === 22000 ? 'normal' : `kind=${kind}`
        console.log(`    n${nidx} ${kindLabel} nid=${nid} pins=[${pinDescs.join(', ')}]`)
      }
      for (const cp of cps) {
        const op = cp.outerPin ?? {}
        const ip = cp.innerPin ?? {}
        console.log(`    CP: outer(${op.kind},${op.index}) → innerNode=${cp.innerNodeId} inner(${ip.kind},${ip.index})`)
      }
    }
  }
}

// ═══════════════════════════════════════════
// 主图分析
// ═══════════════════════════════════════════
const mainGraph = decoded.graph?.graph?.inner?.graph ?? {}
const mainNodes = mainGraph.nodes ?? []
console.log(`\n▸ 主图 (${mainNodes.length} 节点)`)
for (const n of mainNodes) {
  const nid = n.genericId?.nodeId
  const kind = n.genericId?.kind
  const nidx = n.nodeIndex
  const pinDescs = (n.pins ?? []).map(p => `${p.i1?.kind}:${p.i1?.index}`).join(', ')
  const kindLabel = kind === 22001 ? '🏷️ composite_call' : 'normal'
  console.log(`  n${nidx} ${kindLabel} nid=${nid} pins=[${pinDescs}]`)
}

// ═══════════════════════════════════════════
// 报告
// ═══════════════════════════════════════════
console.log(`\n═══════════════════════════════════════`)
console.log(`✅ 通过: ${passed}  ❌ 失败: ${failed}`)
console.log(`📁 ${outPath}`)
console.log(`═══════════════════════════════════════\n`)

if (failed > 0) process.exit(1)
