// @ts-nocheck
// 回归测试：复合 impl 内列表反射节点的 concreteId 必须由列表元素类型特化
// （2026-08-17 编译器修复：此前 get_corresponding_value_from_list / set_list_value
//  在复合 impl 内回退泛型 id（128/160），输出类型与列表元素类型不匹配 → 游戏拒载，
//  且编辑器/编译器未拦截（回退静默发生）。）
//
// 断言：vec3_list 的 get_list → concrete 133（S<T:Vec>）、set_list → 165（Modify_Value_in_List__Vec）。
//
// Run:
//   npm run build
//   npx tsx tests/composite/test-list-reflective-concrete.ts
import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { int, vec3 } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

// 复现 bug 场景：复合内对 vec3_list 图变量做 get_list + set_list_value
const liComp = g.defineComposite('reg_list_reflective_concrete', {
  inputs: { i: { type: 'int' } },
  outputs: { v: { type: 'vec3' } },
  build: ({ i }, f) => {
    const v = f.getCorrespondingValueFromList(f.getNodeGraphVariable('vecs').asType('vec3_list'), i)
    f.registerExecNode('set_list_value', [
      f.getNodeGraphVariable('vecs2').asType('vec3_list'),
      i,
      v
    ])
    return { v }
  }
})

g.server({
  name: 'list_concrete',
  graphId: 1073741997,
  variables: {
    vecs: [new vec3([0, 0, 0]), new vec3([1, 0, 0]), new vec3([0, 1, 0])],
    vecs2: [new vec3([0, 0, 0]), new vec3([1, 0, 0]), new vec3([0, 1, 0])]
  }
}).on('whenEntityIsCreated', (_e: any, f: any) => {
  f.callComposite(liComp, { i: new int(0) })
})

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'list_concrete' })
const doc = docs[docs.length - 1]
const giaBytes = irToGia(doc, {
  graphId: 1073741997,
  name: 'list_reflective_concrete',
  protoPath: PROTO_PATH
})
const outDir = join(__dirname, '.out')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'list_reflective_concrete.gia')
writeFileSync(outPath, Buffer.from(giaBytes))

// 解码 GIA，找复合 impl（which=9）里的 get_list / set_list 节点
const gen = decode_gia_file(outPath, PROTO_PATH)
const accessories = gen.accessories ?? []
let getListCid = -1
let setListCid = -1
for (const acc of accessories) {
  if (acc.which !== 9) continue
  const nodes = acc.graph?.inner?.graph?.nodes ?? []
  for (const n of nodes) {
    if (n.genericId?.nodeId === 128) getListCid = n.concreteId?.nodeId ?? -1 // get_list
    if (n.genericId?.nodeId === 160) setListCid = n.concreteId?.nodeId ?? -1 // set_list
  }
}
// 断言：vec3_list → get_list 应为 133（S<T:Vec>），set_list 应为 165（Modify_Value_in_List__Vec）
assert.equal(
  getListCid,
  133,
  `复合 impl 内 get_corresponding_value_from_list(vec3_list) 的 concreteId 应为 133，实际 ${getListCid}（128=泛型回退，游戏拒载）`
)
assert.equal(
  setListCid,
  165,
  `复合 impl 内 set_list_value(vec3_list) 的 concreteId 应为 165，实际 ${setListCid}（160=泛型回退，游戏拒载）`
)
console.log(`PASS: 复合 impl 列表反射 concreteId 正确（get_list=133, set_list=165）`)
