// @ts-nocheck — 精确复刻参考文件 user_edit/嵌套.gia
/**
 * 参考结构：
 *   加法(2in,1out) — pure data, impl: 1 addition
 *   创建复合节点(3in,1out) — exec, impl: 1 double_branch + 2x callComposite(加法)
 *   主图: event → callComposite(创建复合节点) → printString
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { defineComposite } from '../../dist/src/index.js'
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { int, bool } from '../../dist/src/runtime/value.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

const OUT_DIR = './tests/composite/output'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

// ═══════════════════════════════════════════
// Level 1: 加法 — pure data (类比 加法)
// ═══════════════════════════════════════════
const add = defineComposite('加法', {
  inputs: { a: { type: 'int' }, b: { type: 'int' } },
  outputs: { result: { type: 'int' } },
  build: ({ a, b }, f) => ({ result: f.addition(a, b) })
})

// ═══════════════════════════════════════════
// Level 2: 创建复合节点 — exec, 调加法两次
// ═══════════════════════════════════════════
const createComposite = defineComposite('创建复合节点', {
  inputs: { x: { type: 'int' }, y: { type: 'int' }, z: { type: 'int' } },
  outputs: { result: { type: 'int' } },
  build: ({ x, y, z }, f) => {
    const r1 = f.callComposite(add, { a: x, b: y })
    const r2 = f.callComposite(add, { a: r1.result, b: z })
    // doubleBranch 创建 nid=2 节点，提供 2 个 OutFlow
    f.doubleBranch(new bool(true), () => {}, () => {})
    return { result: r2.result }
  }
})

// ═══════════════════════════════════════════
// 主图: event → callComposite(创建复合节点)
// ═══════════════════════════════════════════
g.server({ name: 'main', graphId: 1073741899 })
  .on('whenEntityIsCreated', (_e, f) => {
    const r = f.callComposite(createComposite, { x: new int(1), y: new int(2), z: new int(3) })
    const str = f.dataTypeConversion(r.result, 'str')
    f.printString(str)
  })

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]

// 编码为 GIA
const bytes = irToGia(doc, { graphId: 1073741899, name: 'nested_exact', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/nested_exact.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`📦 nested_exact.gia — ${bytes.length} 字节`)

// 解码验证
const decoded = decode_gia_file(outPath, PROTO_PATH)
const acc = decoded.accessories ?? []
console.log(`accessories: ${acc.length}`)

// 打印结构
for (let i = 0; i < acc.length; i++) {
  const a = acc[i]
  if (a.which === 12) {
    const cd = a.compositeDef?.inner?.def ?? {}
    console.log(`\n▸ ${cd.name}: id=${cd.id?.genericId?.id} type=${cd.type?.kind} inflows=${cd.inflows?.length} outflows=${cd.outflows?.length} inputs=${cd.inputs?.length} outputs=${cd.outputs?.length}`)
    if (i+1 < acc.length && acc[i+1].which === 9) {
      const g = acc[i+1].graph?.inner?.graph ?? {}
      console.log(`  impl: ${g.nodes?.length} nodes, ${g.compositePins?.length} cps`)
      for (const n of g.nodes ?? []) {
        const pinDesc = (n.pins ?? []).map(p => {
          const k = p.i1?.kind; const idx = p.i1?.index
          const kindName = k === 1?'InFlow':k===2?'OutFlow':k===3?'InParam':k===4?'OutParam':'?'
          const hasC = (p.connects?.length ?? 0) > 0
          return `${kindName}[${idx}]${hasC?'*':''}`
        }).join(', ')
        const typeLabel = n.genericId?.kind === 22001 ? '🏷️' : ''
        console.log(`    n${n.nodeIndex} ${typeLabel} nid=${n.genericId?.nodeId} pins=[${pinDesc}]`)
      }
      for (const cp of g.compositePins ?? []) {
        console.log(`    CP: outer(${cp.outerPin?.kind},${cp.outerPin?.index}) → n${cp.innerNodeId} inner(${cp.innerPin?.kind},${cp.innerPin?.index})`)
      }
    }
  }
}

// 主图节点
const mg = decoded.graph?.graph?.inner?.graph ?? {}
console.log(`\n▸ 主图 (${mg.nodes?.length} 节点)`)
for (const n of mg.nodes ?? []) {
  const pinDesc = (n.pins ?? []).map(p => {
    const k = p.i1?.kind; const idx = p.i1?.index
    const cpi = p.compositePinIndex !== undefined ? ` cpi=${p.compositePinIndex}` : ''
    const hasC = (p.connects?.length ?? 0) > 0
    const val = p.value?.bString?.val ? `='${p.value.bString.val}'` : p.value?.bInt?.val !== undefined ? `=${p.value.bInt.val}` : ''
    return `${k}:${idx}${cpi}${hasC?'*':''}${val}`
  }).join(', ')
  const typeLabel = n.genericId?.kind === 22001 ? '🏷️' : ''
  console.log(`  n${n.nodeIndex} ${typeLabel} nid=${n.genericId?.nodeId} [${pinDesc}]`)
}

// 复制到导出目录
const EXPORT_DIR = '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
writeFileSync(`${EXPORT_DIR}/nested_exact.gia`, Buffer.from(bytes))
console.log(`\n📦 已复制到 ${EXPORT_DIR}/nested_exact.gia`)
