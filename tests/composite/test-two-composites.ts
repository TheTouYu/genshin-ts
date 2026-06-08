// @ts-nocheck
/**
 * 两个复合节点：带参打印 + o-to-string (entity→str 纯数据复合)
 * 主图连线: event.entity → o-to-string → str → 带参打印 → print
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { str } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { writeFileSync, mkdirSync, existsSync } from 'fs'

const PROTO_PATH = new URL('../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname

const OUT_DIR = '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

// ── 复合1: 带参打印 (exec + str 输入) ──
const printHandle = g.defineComposite('带参打印', {
  inputs: { '消息': { type: 'str' } },
  outputs: {},
  build(inputs: any, f: any) {
    f.printString(inputs.消息)
    return {}
  }
})
console.log('带参打印 id:', printHandle.id)

// ── 复合2: o-to-string (纯数据: entity → str) ──
const toStringHandle = g.defineComposite('o-to-string', {
  inputs: { '输入': { type: 'entity' } },
  outputs: { '输出': { type: 'str' } },
  build(inputs: any, f: any) {
    return { '输出': f.dataTypeConversion(inputs.输入, 'str') }
  }
})
console.log('o-to-string id:', toStringHandle.id)

// ── 主图 ──
g.server({ name: 'main', graphId: 1073741836 })
  .on('whenEntityIsCreated', (e: any, f: any) => {
    // 参考匹配：data 复合先产生值，exec 复合后消费（同时建立 exec flow）
    const strResult = f.callComposite(toStringHandle, { '输入': e.eventSourceEntity })
    f.callComposite(printHandle, { '消息': strResult.输出 })
  })

// ── 生成 GIA ──
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]
console.log('IR nodes:', doc.nodes?.length)
doc.nodes?.forEach((n: any) => console.log('  type=' + n.type + ' id=' + n.id))

const bytes = irToGia(doc, { graphId: 1073741836, name: 'basic_call_param', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/两个复合节点_gen.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)
