// @ts-nocheck
/**
 * 最简单版本：exec-only 复合 + 主图调用
 * 对应游戏导出的 基本调用节点.gia
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { str } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { writeFileSync } from 'fs'

const PROTO_PATH = new URL('../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname

// ── 定义复合节点 ──
const handle = g.defineComposite('简单复合', {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    f.printString('测试')
    return {}
  }
})

// ── 主图：whenEntityIsCreated → callComposite ──
g.server({ name: 'main', graphId: 1073741828 })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    f.callComposite(handle, {})
  })

// ── 生成 GIA ──
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]

const bytes = irToGia(doc, { graphId: 1073741828, name: 'basic_call', protoPath: PROTO_PATH })

const OUT_DIR = './tests/composite/output'
const outPath = `${OUT_DIR}/basic_call.gia`
writeFileSync(outPath, Buffer.from(bytes))

console.log(`✅ 已生成: ${outPath}`)
console.log(`   大小: ${bytes.length} 字节`)
console.log(`   复合 ID: ${handle.id}`)
console.log(`   主图 graphId: 1073741828`)
console.log(`   结构: event(kind=22000,nodeId=71) → compositeCall(kind=22001,nodeId=${handle.id})`)
