// @ts-nocheck
/**
 * 带参数版本：复合节点接收一个字符串参数，print 调用者传入的值
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { str } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { writeFileSync } from 'fs'

const PROTO_PATH = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname

// ── 定义复合节点（带字符串参数） ──
const handle = g.defineComposite('带参打印', {
  inputs: { 消息: { type: 'str' } },
  outputs: {},
  build(inputs: any, f: any) {
    f.printString(inputs.消息)
    return {}
  }
})

// ── 主图 ──
g.server({ name: 'main', graphId: 1073741829 })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    f.callComposite(handle, { 消息: new str('你好世界') })
  })

// ── 生成 GIA ──
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]

const bytes = irToGia(doc, { graphId: 1073741829, name: 'basic_call_param', protoPath: PROTO_PATH })

const OUT_DIR = './tests/composite/output'
const outPath = `${OUT_DIR}/basic_call_param.gia`
writeFileSync(outPath, Buffer.from(bytes))

console.log(`✅ 已生成: ${outPath}`)
console.log(`   大小: ${bytes.length} 字节`)
console.log(`   复合 ID: ${handle.id}`)
console.log(`   主图 graphId: 1073741829`)
