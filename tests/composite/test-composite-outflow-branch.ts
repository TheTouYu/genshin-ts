// @ts-nocheck
/**
 * S15 outflow 分支语义回归（2026-08-14 #15）：
 * 条件动作复合用 outflow 分支表达——done 只在真分支触发，宿主调用后无条件续链；
 * 避免 OutParam 惰性求值陷阱（复合输出在宿主消费时重算，读→写同一变量再输出必错）。
 *
 * 断言（IR + GIA）：
 * 1. IR：复合 outflows=[done]，内部 double_branch 存在
 * 2. GIA：double_branch OutFlow[0] -> set 节点；compositePins OutFlow done 路由
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { bool, str } from '../../dist/src/runtime/value.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUTPUT_PATH = process.argv[2] ?? '/tmp/S15-outflow-branch.gia'
const GRAPH_ID = 1073742442
const NAME = 'S15_OutflowBranch_GSTS'

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const comp = g.defineComposite(NAME, {
  inputs: { gate: { type: 'bool' } },
  outputs: {},
  outflows: ['done'],
  build: ({ gate }, f) => {
    // done 只在真分支触发（锁门模式：#15 教训——不用数据输出判断）
    const br = f.node('double_branch', [gate])
    f.link(f.entry(), 0, br, 0)
    f.connectOutFlow(br, 0, () => {
      const set = f.node('set_node_graph_variable', [new str('lock'), new bool(true), new bool(false)])
      f.link(br, 0, set, 0)
      f.outflow('done', set, 0)
    })
    f.connectOutFlow(br, 1, () => {})
    return {}
  }
})

g.server({ id: GRAPH_ID }).on('whenTabIsSelected', (_e: any, f: any) => {
  f.callComposite(comp, { gate: true })
})

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: NAME })

// ---- IR 层断言 ----
const cd = docs[0].compositeDefs.find((c: any) => c.name === NAME)
assert.ok(cd, 'composite def exists')
assert.equal(cd.outflows?.length, 1, 'must declare outflow done')
assert.ok(cd.implNodes.find((n: any) => n.type === 'double_branch'), 'double_branch node exists')

// ---- GIA 层断言 ----
const bytes = irToGia(docs.at(-1), { graphId: GRAPH_ID, name: NAME, protoPath: PROTO_PATH })
await writeFile(OUTPUT_PATH, Buffer.from(bytes))

const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const definition = decoded.accessories?.find(
  (accessory: any) => accessory.which === 12 && accessory.name === NAME
)?.compositeDef?.inner?.def
assert.ok(definition, 'definition missing')
assert.equal(definition.outflows?.length, 1, 'def must retain outflow done')
const implGraph = decoded.accessories?.find(
  (accessory: any) => accessory.which === 9 && accessory.name === '' && accessory.id?.id === definition?.id?.graphId?.id
)?.graph?.inner?.graph
assert.ok(implGraph, 'impl graph missing')

// double_branch 真分支 OutFlow[0] 必须连到 set 节点
const br = implGraph.nodes?.find((n: any) => n.genericId?.nodeId === 2)
assert.ok(br, 'double_branch node exists')
const trueOut = br.pins?.find((p: any) => p.i1?.kind === 2 && p.i1?.index === 0)
assert.ok(trueOut, 'double_branch OutFlow[0] exists')
assert.equal(trueOut.connects?.length, 1, 'true branch must connect to set node')
// outflow done 必须映射到 set 节点（compositePins OutFlow）
const outflowPin = (implGraph.compositePins ?? []).find((cp: any) => cp.outerPin?.kind === 2)
assert.ok(outflowPin, 'compositePins must route OutFlow done')

const sha256 = createHash('sha256').update(bytes).digest('hex')
console.log('PASS S15 outflow branch semantics (IR + GIA)')
console.log('SHA-256: ' + sha256)
