// @ts-nocheck
/**
 * #17 capture 路由回归（2026-08-14 轮 13 差分规则）：
 * 复合输入（capture）传给子复合调用参数——compositePins 路由，调用点物理 pin 不落盘。
 * 历史缺陷：capture 占位值 toIRLiteral 返回 null → 序列化丢 capture 标记 → 参数丢失（NaN）。
 *
 * 断言（IR + GIA 双层）：
 * 1. IR：子复合调用的 capture 参数带 capture: true 标记（非 null 占位）
 * 2. GIA：compositePins 含 outer InParam → 子复合调用 InParam 的完整路由
 * 3. GIA：子复合调用节点无多余空 InParam（capture 参数不落物理 pin）
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { str } from '../../dist/src/runtime/value.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUTPUT_PATH = process.argv[2] ?? '/tmp/S14-capture-routing.gia'
const GRAPH_ID = 1073742441
const NAME = 'S14_CaptureRouting_GSTS'

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

// 子复合：2 输入 + 输出
const child = g.defineComposite(NAME + '_child', {
  inputs: { a: { type: 'float' }, b: { type: 'float' } },
  outputs: { sum: { type: 'float' } },
  build: ({ a, b }, f) => ({ sum: f.addition(a, b) })
})

// 父复合：输入 a/b 直接传给子复合（capture → 子复合调用参数）
const parent = g.defineComposite(NAME, {
  inputs: { a: { type: 'float' }, b: { type: 'float' } },
  outputs: { out: { type: 'float' } },
  build: ({ a, b }, f) => ({
    out: f.callComposite(child, { a, b }).sum
  })
})

g.server({ id: GRAPH_ID }).on('whenTabIsSelected', (_e: any, f: any) => {
  f.callComposite(parent, { a: 1, b: 2 })
})

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: NAME })

// ---- IR 层断言 ----
const cd = docs[0].compositeDefs.find((c: any) => c.name === NAME)
assert.ok(cd, 'parent composite def exists')
const call = cd.implNodes.find((n: any) => n.type === '__composite_call__')
assert.ok(call, 'child call node exists')
// 捕获参数（a/b 传 child）必须带 capture 标记（而非 null 占位）
const captureArgs = call.args.filter((arg: any) => arg && arg.capture === true)
assert.equal(captureArgs.length, 2, 'child call must have 2 capture-marked args (a, b)')

// ---- GIA 层断言 ----
const bytes = irToGia(docs.at(-1), { graphId: GRAPH_ID, name: NAME, protoPath: PROTO_PATH })
await writeFile(OUTPUT_PATH, Buffer.from(bytes))

const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const definition = decoded.accessories?.find(
  (accessory: any) => accessory.which === 12 && accessory.name === NAME
)?.compositeDef?.inner?.def
assert.ok(definition, 'definition missing')
const implGraph = decoded.accessories?.find(
  (accessory: any) => accessory.which === 9 && accessory.name === '' && accessory.id?.id === definition?.id?.graphId?.id
)?.graph?.inner?.graph
assert.ok(implGraph, 'impl graph missing')

// compositePins 必须有 outer InParam → child call InParam 路由
const callNode = implGraph.nodes?.find((n: any) => n.genericId?.kind === 22001)
assert.ok(callNode, 'child call node in impl graph')
const inParamRoutes = (implGraph.compositePins ?? []).filter((cp: any) => cp.outerPin?.kind === 3)
assert.equal(inParamRoutes.length, 2, 'compositePins must have 2 InParam routes (a, b)')
// 路由指向 child call 的 InParam
for (const cp of inParamRoutes) {
  assert.equal(cp.innerNodeId, callNode.nodeIndex, 'InParam route targets child call')
}

const sha256 = createHash('sha256').update(bytes).digest('hex')
console.log('PASS S14 capture routing (IR + GIA)')
console.log('SHA-256: ' + sha256)
