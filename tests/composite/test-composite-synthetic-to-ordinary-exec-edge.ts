// @ts-nocheck
/**
 * #12 回归（2026-08-14）：合成→普通 exec 边（synthetic→ordinary）
 *
 * 复合内 f.connect(compositeCallResult, 0, registerExecNode, 0) 的 IR 边源必须
 * 是真实 composite call node id。此前 core.ts connect 的 addEdge 使用 sourceRef.id，
 * 而 composite call 返回对象只有 __markerNodeId（无 id 属性）→ IR 边源写成 "undefined"
 * → materialize 静默丢弃 → 目标普通 exec 节点零帧（日志 13-55-55：turn_block 内 m1
 * 运动器零帧，done outflow 不触发宿主链，游戏无响应）。
 *
 * 断言：
 * 1. IR implEdges 源是真实 node id（无 "undefined"）
 * 2. GIA 解码后：合成调用节点有物理 OutFlow[0] 且 connects → 普通 exec 节点 InFlow[0]
 * 3. 普通 exec 节点有物理 InFlow[0] pin
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
const OUTPUT_PATH = process.argv[2] ?? '/tmp/S12-synthetic-to-ordinary-exec-edge.gia'
const GRAPH_ID = 1073742423
const NAME = 'S12_SyntheticToOrdinaryExecEdge_GSTS'

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const child = g.defineComposite(NAME + '_child', {
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build(_inputs: any, f: any) {
    const tail = f.registerExecNode('print_string', [new str('child tail')])
    f.outflow('done', tail, 0)
    return {}
  }
})

// 被测复合：build 内合成调用 → f.connect → 普通 exec 节点
const parent = g.defineComposite(NAME, {
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build(_inputs: any, f: any) {
    const call = f.callComposite(child, {})
    const consumer = f.registerExecNode('print_string', [new str('consumer')])
    f.connect(call, 0, consumer, 0)
    return {}
  }
})

g.server({ id: GRAPH_ID }).on('whenTabIsSelected', (_event: any, f: any) => {
  f.callComposite(parent, {})
})

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: NAME })

// ---- IR 层断言：implEdges 源必须是真实 node id ----
const cd = docs[0].compositeDefs.find((c: any) => c.name === NAME)
assert.ok(cd, 'parent composite def exists')
const undefinedSourceEdges = Object.keys(cd.implEdges ?? {}).filter((k) => k === 'undefined')
assert.equal(undefinedSourceEdges.length, 0, 'implEdges must not contain "undefined" source')
const callNode = cd.implNodes.find((n: any) => n.type === '__composite_call__')
assert.ok(callNode, 'synthetic call node exists')
const callEdges = cd.implEdges[callNode.id]
assert.ok(callEdges?.some((e: any) => e.source_index === 0), 'synthetic call must have OutFlow[0] edge')
const explicitEdge = Object.values(cd.implEdges)
  .flat()
  .find((e: any) => typeof e === 'object' && e !== null && 'target_index' in e)
assert.ok(explicitEdge, 'implEdges must carry target_index for explicit InFlow')

// ---- GIA 层断言 ----
const bytes = irToGia(docs.at(-1), {
  graphId: GRAPH_ID,
  name: NAME,
  protoPath: PROTO_PATH
})
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

const callNodeEnc = implGraph.nodes?.find((node: any) => node.genericId?.kind === 22001)
assert.ok(callNodeEnc, 'synthetic call node in impl graph')
const outflow = callNodeEnc.pins?.find((pin: any) => pin.i1?.kind === 2 && pin.i1?.index === 0)
assert.ok(outflow, 'synthetic call must have physical OutFlow[0]')
assert.ok(
  outflow.connects?.some(
    (connect: any) => connect.connect?.kind === 1 && connect.connect?.index === 0
  ),
  'synthetic OutFlow[0] must connect to ordinary InFlow[0]'
)
const targetId = outflow.connects[0].id
const consumerNode = implGraph.nodes?.find((node: any) => node.nodeIndex === targetId)
assert.ok(consumerNode, 'consumer node exists')
assert.ok(
  consumerNode.pins?.some((pin: any) => pin.i1?.kind === 1 && pin.i1?.index === 0),
  'ordinary exec node must have physical InFlow[0]'
)

const sha256 = createHash('sha256').update(bytes).digest('hex')
console.log('PASS S12 synthetic→ordinary exec edge (IR + GIA)')
console.log('SHA-256: ' + sha256)
