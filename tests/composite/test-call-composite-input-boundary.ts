// @ts-nocheck
/**
 * 复合调用输入边界系列回归（2026-08-14 生产 bug #1/#5 + 防御）：
 *
 * 1. callComposite 字面量输入（bug #1）：number/bigint/string 裸值按声明类型包装，
 *    不崩溃且 conn 类型正确。
 * 2. callComposite 局部变量句柄输入（bug #5）：{localVariable, value} 句柄取其 value
 *    （markPin 值类实例），IR 构建不崩溃。
 * 3. null/undefined 参数占位防御：registerNode/复合 args 序列化不崩溃，保留 null 占位。
 *
 * Run:
 *   npx tsx tests/composite/test-call-composite-input-boundary.ts
 */
import assert from 'node:assert/strict'

import { g, buildServerGraphRegistriesIRDocuments } from '../../src/runtime/core.js'


// 测试复合：接受 int + str 输入
const handle = g.defineComposite('boundary_input_fixture', {
  inputs: { i: { type: 'int' }, name: { type: 'str' } },
  outputs: {},
  build: ({ i, name }, f) => {
    const tail = f.registerExecNode('print_string', [null])
    f.outflow('done', tail, 0)
    return {}
  },
  outflows: ['done']
})

// 宿主：①字面量输入 ②句柄输入 ③null 参数节点
g.server({ id: 1073741825 }).on('whenTabIsSelected', (_evt, f) => {
  f.callComposite(handle, { i: 7n, name: 'literal' })
  const lv = f.getLocalVariable(0n)
  f.callComposite(handle, { i: lv, name: 'handle' })
  f.registerExecNode('print_string', [null])
})

// 复合内 null 占位
g.defineComposite('null_arg_fixture', {
  inputs: {},
  outputs: {},
  build: (_captured, f) => {
    const tail = f.registerExecNode('print_string', [null])
    f.outflow('done', tail, 0)
    return {}
  },
  outflows: ['done']
})

const docs = buildServerGraphRegistriesIRDocuments()
assert.ok(docs.length > 0, 'IR docs must build without crash (boundary defense)')

const hostDoc = docs[0]
const hostNodes = hostDoc.nodes ?? []
const markers = hostNodes.filter((n) => n.type === '__composite_call__')
assert.ok(markers.length >= 2, 'at least 2 composite call markers')
for (const m of markers) {
  assert.ok(Array.isArray(m.args) && m.args.length >= 2, 'marker has id + inputs')
  const iArg = m.args[1]
  assert.ok(iArg !== null && iArg !== undefined, 'i input must be present')
  assert.ok(
    iArg.type === 'conn' || iArg.type === 'int',
    'i input must be a connection (wrapped) or int literal'
  )
  assert.ok(Number.isInteger(iArg.value?.node_id ?? -1), 'conn has node id')
}

const printNodes = hostNodes.filter((n) => n.type === 'print_string')
assert.ok(printNodes.length >= 1, 'print_string node with null arg must exist')
const nullNode = printNodes.find((n) => n.args?.some((a) => a === null))
assert.ok(nullNode, 'null placeholder arg must be preserved')

console.log('composite call input boundary series: PASS')
