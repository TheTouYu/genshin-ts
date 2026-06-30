// @ts-nocheck
/**
 * 复现 类型转化.gia：event → data_type_conversion(entity→str) → print_string
 * 不含复合节点，用于验证基础数据连线
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { writeFileSync } from 'fs'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const OUT_DIR = './tests/composite/output'
const REF_PATH = `${OUT_DIR}/类型转化.gia`

g.server({ name: 'type_conv', graphId: 1073741857 })
  .on('whenEntityIsCreated', (e: any, f: any) => {
    const strVal = f.dataTypeConversion(e.eventSourceEntity, 'str')
    f.printString(strVal)
  })

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'type_conv' })
const doc = docs[docs.length - 1]
console.log('IR nodes:', doc.nodes?.length)
doc.nodes?.forEach((n: any) => {
  console.log('  type=' + n.type + ' id=' + n.id + ' next=' + JSON.stringify(n.next))
  n.args?.forEach((a: any, i: number) => {
    console.log('    arg[' + i + ']: type=' + a?.type + ' val=' + JSON.stringify(a?.value)?.substring(0, 40))
  })
})

const bytes = irToGia(doc, { graphId: 1073741857, name: '类型转化', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/类型转化_gen.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)

// 对比
const ref = decode_gia_file(REF_PATH, PROTO_PATH)
const gen = decode_gia_file(outPath, PROTO_PATH)
const rn = ref.graph?.graph?.inner?.graph?.nodes ?? []
const gn = gen.graph?.graph?.inner?.graph?.nodes ?? []

function dp(p: any) {
  let s = 'k=' + p.i1?.kind + ' i=' + p.i1?.index + ' t=' + p.type
  if (p.connects?.length > 0) s += ' →' + p.connects[0].id + '(k=' + p.connects[0].connect?.kind + ')'
  if (p.compositePinIndex !== undefined) s += ' CPI=' + p.compositePinIndex
  return s
}

console.log('\n═══ 对比 ═══')
for (let i = 0; i < Math.max(rn.length, gn.length); i++) {
  console.log(`REF[${i}]: idx=${rn[i]?.nodeIndex} k=${rn[i]?.genericId?.kind} id=${rn[i]?.genericId?.nodeId}`)
  rn[i]?.pins?.forEach((p: any) => console.log('  REF ' + dp(p)))
  console.log(`GEN[${i}]: idx=${gn[i]?.nodeIndex} k=${gn[i]?.genericId?.kind} id=${gn[i]?.genericId?.nodeId}`)
  gn[i]?.pins?.forEach((p: any) => console.log('  GEN ' + dp(p)))
}
