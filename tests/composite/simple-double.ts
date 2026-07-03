// @ts-nocheck
/**
 * 验证：预捕获复合，让 handler 执行时 def.captured 已存在
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { int } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { writeFileSync } from 'fs'
import { compositeRegistry } from '../../dist/src/runtime/composite_registry.js'
import { getRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

// 第 1 步：定义复合
const Doubler = g.defineComposite('加倍', {
  inputs: { x: { type: 'int' } },
  outputs: { result: { type: 'int' } },
  build: (args, f) => {
    const doubled = f.addition(args.x, args.x)
    return { result: doubled }
  }
})

// === 🔑 关键：在 handler 之前强制捕获复合 ===
// 调用 buildServerGraphRegistriesIRDocuments 触发 Phase A 捕获
// 但先保存并重置 server registries，避免过早构建主图
const dummyDocs = buildServerGraphRegistriesIRDocuments({ defaultName: '__precapture__' })

// 验证预捕获成功
const def = compositeRegistry.getAll()[0]
console.log(`预捕获: execNodes=${def.captured?.execNodes?.length} dataNodes=${def.captured?.dataNodes?.length} isPureData=${def.captured?.isPureData}`)

// 第 2 步：定义主图（handler 执行时 def.captured 已存在）
g.server({ name: 'demo', graphId: 1073741828 })
  .on('whenEntityIsCreated', (_e, f) => {
    const { result } = f.callComposite(Doubler, { x: new int(7) })
    const resultStr = f.dataTypeConversion(result, 'str')
    f.printString(resultStr)
  })

// 第 3 步：构建 IR
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'demo' })
const doc = docs[docs.length - 1]

console.log('\n=== IR 节点 ===')
doc.nodes.forEach(n => {
  console.log(`n[${n.id}] type=${n.type} next=${JSON.stringify(n.next)}`)
})

// 输出完整 IR JSON
const OUT_DIR = './tests/composite/output'
const irJson = JSON.stringify(docs, (_k, val) =>
  typeof val === 'bigint' ? val.toString() : val, 2)
writeFileSync(`${OUT_DIR}/simple-double.ir.json`, irJson, 'utf8')

// 生成 GIA
const giaBytes = irToGia(doc, {
  graphId: 1073741828, name: 'simple_double', protoPath: PROTO_PATH
})
const outPath = `${OUT_DIR}/simple_double.gia`
writeFileSync(outPath, Buffer.from(giaBytes))
console.log(`\n✅ GIA: ${outPath} (${giaBytes.length} bytes)`)
