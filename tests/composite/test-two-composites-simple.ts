// @ts-nocheck
/**
 * 两个复合节点：纯数据(int加法) + exec(printString)
 * 数据流: add1(int×2→int)→add2(int+1→int)
 * 执行流: event→exec(printString)
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { int, str } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { writeFileSync } from 'fs'

const PROTO_PATH = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const OUT_DIR = './tests/composite/output'

// ── 复合1: 纯数据 — int 翻倍 ──
const add1 = g.defineComposite('翻倍', {
  inputs: { '输入值': { type: 'int' } },
  outputs: { '结果': { type: 'int' } },
  build(inputs: any, f: any) {
    return { '结果': f.addition(inputs.输入值, inputs.输入值) }
  }
})

// ── 复合2: 纯数据 — int 加一 ──
const add2 = g.defineComposite('加一', {
  inputs: { '输入值': { type: 'int' } },
  outputs: { '结果': { type: 'int' } },
  build(inputs: any, f: any) {
    return { '结果': f.addition(inputs.输入值, new int(1n)) }
  }
})

// ── 复合3: exec-only ──
const execComp = g.defineComposite('完成打印', {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    f.printString('done')
    return {}
  }
})

console.log('翻倍 id:', add1.id, '加一 id:', add2.id, 'exec id:', execComp.id)

// ── Capture ──
g.server({ name: 'trigger' }).on('whenEntityIsCreated', (_e: any, f: any) => {})
buildServerGraphRegistriesIRDocuments({ defaultName: 'trigger' })

// ── 主图 ──
g.server({ name: 'main', graphId: 1073741860 })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    const r1 = f.callComposite(add1, { '输入值': new int(5n) })
    const r2 = f.callComposite(add2, { '输入值': r1.结果 })
    f.callComposite(execComp, {})
  })

// ── 生成 ──
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]
console.log('IR nodes:', doc.nodes?.length)
doc.nodes?.forEach((n: any) => console.log('  type=' + n.type + ' id=' + n.id + ' next=' + JSON.stringify(n.next)))

const bytes = irToGia(doc, { graphId: 1073741860, name: 'two_simple', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/two_simple.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)
