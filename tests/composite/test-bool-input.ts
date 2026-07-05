// @ts-nocheck
/**
 * 布尔输入复合节点测试
 *
 * 结构复刻 user_edit/bool.gia：
 * - 复合节点：1 个 bool 输入 → doubleBranch → printString
 * - 主图：相同的 doubleBranch + printString（方便对比）
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { bool, str } from '../../dist/src/runtime/value.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUT_DIR = './tests/composite/output'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

// ═══════════════════════════════════════════════════════════════
// 复合节点：bool 输入 → doubleBranch → printString
// ═══════════════════════════════════════════════════════════════
const BoolComposite = g.defineComposite('bool复合测试', {
  inputs: {
    条件: { type: 'bool' }
  },
  outputs: {},
  build({ 条件 }, f) {
    const db = f.registerExecNode('double_branch', [条件])
    const ps = f.registerExecNode('print_string', [new str('是')])
    f.connect(db, 0, ps)
    f.outflow('是', ps, 0)
    f.outflow('否', db, 1)
    return {}
  }
})
console.log('✅ 复合 id:', BoolComposite.id)

// ═══════════════════════════════════════════════════════════════
// 预处理
// ═══════════════════════════════════════════════════════════════
g.server({ name: 'prep' }).on('whenEntityIsCreated', () => {})
buildServerGraphRegistriesIRDocuments({ defaultName: 'prep' })

// ═══════════════════════════════════════════════════════════════
// 主图：调用复合 + 相同的 doubleBranch（方便对比）
// ═══════════════════════════════════════════════════════════════
g.server({
  name: 'main',
  graphId: 1073741840
}).on('whenEntityIsCreated', (_e, f) => {
  f.fork(
    () => {
      f.callComposite(BoolComposite, {
        条件: new bool(true)
      })
    },
    () => {
      f.doubleBranch(
        new bool(true),
        () => {
          f.printString('是-来自主图')
        },
        () => {}
      )
    }
  )
})

// ═══════════════════════════════════════════════════════════════
// 构建 IR + 生成 GIA
// ═══════════════════════════════════════════════════════════════
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]

console.log('\n═══ IR 节点 ═══')
doc.nodes?.forEach((n) => {
  console.log(`  type=${n.type} id=${n.id} next=${JSON.stringify(n.next)}`)
})

const bytes = irToGia(doc, { graphId: 1073741840, name: 'bool复合测试', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/bool复合测试.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)
