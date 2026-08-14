// @ts-nocheck
/**
 * S17 getNodeGraphVariable 字面量变量名限制回归（2026-08-14 #18）：
 * getNodeGraphVariable 的变量名参数必须是字面量 str 才能静态推断变量类型；
 * 传 str pin（capture 输入）时编码阶段类型不匹配（orbit_store 拆分尝试：
 * "ordinary data edge pin type mismatch"——2688 后 #18 登记）。
 *
 * 断言：字面量名正常构建+编码；str pin 名在 GIA 编码阶段抛错。
 */
import assert from 'node:assert/strict'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { dictLiteral, str, vec3 } from '../../dist/src/runtime/value.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { fileURLToPath } from 'node:url'

const PROTO_PATH = fileURLToPath(new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
))
setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

// 字面量变量名：正常构建 + 编码
const NAME_LIT = 'S17_GraphVarLiteral_GSTS'
const compLit = g.defineComposite(NAME_LIT, {
  inputs: { i: { type: 'int' } },
  outputs: {},
  build: ({ i }: any, f: any) => {
    f.registerExecNode('set_or_add_key_value_pairs_to_dictionary', [
      f.getNodeGraphVariable('vels1').asDict('int', 'vec3'), i, f.create3dVector(1, 2, 3)
    ])
    return {}
  }
})
g.server({ id: 1073742445, variables: { vels1: new dictLiteral([{ k: 0, v: new vec3([0, 0, 0]) }]) } }).on('whenTabIsSelected', (_e: any, f: any) => {
  f.callComposite(compLit, { i: 0 })
})
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: NAME_LIT })
assert.ok(docs.length > 0, 'literal-name composite must build')
const bytesLit = irToGia(docs.at(-1), { graphId: 1073742445, name: NAME_LIT, protoPath: PROTO_PATH })
assert.ok(bytesLit.length > 0, 'literal-name must encode')

// str pin 变量名：GIA 编码阶段应抛类型不匹配
const NAME_PIN = NAME_LIT + '_pin'
const compPin = g.defineComposite(NAME_PIN, {
  inputs: { i: { type: 'int' }, name: { type: 'str' } },
  outputs: {},
  build: ({ i, name }: any, f: any) => {
    f.registerExecNode('set_or_add_key_value_pairs_to_dictionary', [
      f.getNodeGraphVariable(name).asDict('int', 'vec3'), i, f.create3dVector(1, 2, 3)
    ])
    return {}
  }
})
g.server({ id: 1073742446, variables: { vels1: new dictLiteral([{ k: 0, v: new vec3([0, 0, 0]) }]) } }).on('whenTabIsSelected', (_e: any, f: any) => {
  f.callComposite(compPin, { i: 0, name: new str('vels1') })
})
const docs2 = buildServerGraphRegistriesIRDocuments({ defaultName: NAME_PIN })
let threw = false
let errMsg = ''
try {
  irToGia(docs2.at(-1), { graphId: 1073742446, name: NAME_PIN, protoPath: PROTO_PATH })
} catch (e: any) {
  threw = true
  errMsg = e?.message ?? String(e)
}
assert.ok(threw, 'str-pin variable name must fail at GIA encode (documented limitation)')
console.log('PASS S17 getNodeGraphVariable literal-name limitation: ' + errMsg.slice(0, 90))
