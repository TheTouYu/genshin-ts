// @ts-nocheck
/**
 * S16 f.node detached 链尾语义回归（2026-08-14 #15）：
 * f.node 注册的 exec 节点是 detached（不自动连 tail）——链尾必须显式 f.link；
 * 否则链断（spawn 的 setB7 未 link → blocks 永不设置，2685 日志实证）。
 *
 * 断言（IR）：f.node 无 link 时不自动连 capture；f.link 后入边存在。
 */
import assert from 'node:assert/strict'

import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { str } from '../../dist/src/runtime/value.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const NAME = 'S16_DetachedChainTail_GSTS'
const NAME2 = NAME + '_linked'

const comp = g.defineComposite(NAME, {
  inputs: {},
  outputs: {},
  build: (_i: any, f: any) => {
    f.node('print_string', [new str('orphan')])
    return {}
  }
})
const comp2 = g.defineComposite(NAME2, {
  inputs: {},
  outputs: {},
  build: (_i: any, f: any) => {
    const p = f.node('print_string', [new str('linked')])
    f.link(f.entry(), 0, p, 0)
    return {}
  }
})
g.server({ id: 1073742443 }).on('whenTabIsSelected', (_e: any, f: any) => {
  f.callComposite(comp, {})
})
g.server({ id: 1073742444 }).on('whenTabIsSelected', (_e: any, f: any) => {
  f.callComposite(comp2, {})
})
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: NAME })

// 无 link：capture 不应连到 print_string（detached）
const cd = docs[0].compositeDefs.find((c: any) => c.name === NAME)
assert.ok(cd, 'composite def exists')
const captureId = cd.implNodes.find((n: any) => n.type === '__composite_capture__')?.id
assert.ok(captureId, 'capture node exists')
const printNode = cd.implNodes.find((n: any) => n.type === 'print_string')
assert.ok(printNode, 'print_string node exists')
const toPrint = (cd.implEdges[captureId] ?? []).filter((e: any) => (typeof e === 'number' ? e : e.node_id) === printNode.id)
assert.equal(toPrint.length, 0, 'f.node without link must NOT auto-connect to capture')

// 显式 link：入边存在
const cd2 = (docs[1] ?? docs[0]).compositeDefs.find((c: any) => c.name === NAME2)
assert.ok(cd2, 'def2 exists')
const capture2 = cd2.implNodes.find((n: any) => n.type === '__composite_capture__')?.id
const print2 = cd2.implNodes.find((n: any) => n.type === 'print_string')
assert.ok(print2, 'print2 exists')
const linkedEdges = (cd2.implEdges[capture2] ?? []).filter((e: any) => (typeof e === 'number' ? e : e.node_id) === print2.id)
assert.equal(linkedEdges.length, 1, 'f.link must create edge')

console.log('PASS S16 f.node detached chain-tail semantics (IR)')
