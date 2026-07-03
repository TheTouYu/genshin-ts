// @ts-nocheck
/**
 * gameVersion 验证脚本
 *
 * 功能：
 * 1. 使用 test-simple-basic-call.ts 的流程生成一个 GIA 文件
 * 2. 解码该文件并检查 gameVersion 字段
 * 3. 输出 PASS/FAIL 并设置对应的 exit code
 *
 * 用法：
 *   npm run build && npx tsx tests/composite/verify-game-version.ts
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { str } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { writeFileSync, existsSync, mkdirSync } from 'fs'

const PROTO_PATH = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const OUT_DIR = './tests/composite/output'
const OUT_PATH = `${OUT_DIR}/verify_gv.gia`

// ── 定义复合节点 ──
const handle = g.defineComposite('简单复合', {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    f.printString('测试')
    return {}
  }
})

// ── 主图 ──
g.server({ name: 'main', graphId: 1073741828 })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    f.callComposite(handle, {})
  })

// ── 生成 GIA ──
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]

const bytes = irToGia(doc, { graphId: 1073741828, name: 'verify_gv', protoPath: PROTO_PATH })

// ── 写入磁盘（decode_gia_file 需要按文件读取） ──
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT_PATH, Buffer.from(bytes))
console.log(`✅ 已生成: ${OUT_PATH}`)
console.log(`   大小: ${bytes.length} 字节`)

// ── 解码并验证 gameVersion ──
const data = decode_gia_file(OUT_PATH, PROTO_PATH)

const expected = '6.6.0'
const actual = data.gameVersion

if (actual === expected) {
  console.log(`✅ gameVersion = "${actual}" (PASS)`)
  process.exit(0)
} else {
  console.log(`❌ gameVersion = "${actual}" (FAIL — expected "${expected}")`)
  process.exit(1)
}
