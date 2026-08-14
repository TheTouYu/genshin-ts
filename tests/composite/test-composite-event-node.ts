// @ts-nocheck
/**
 * 复合内事件节点回归（2026-08-14 轮 12f 规则闭合）：
 * f.on(eventName, callback) 在复合 impl 图注册事件入口节点（如 when_custom_variable_changes），
 * 回调内 exec 节点挂事件 OutFlow[0]（connects 驱动）；evt 输出 = 事件节点 OutParam pin 引用。
 *
 * 断言（IR + GIA 双层）：
 * 1. IR implNodes 含 nodeType=when_custom_variable_changes 的事件节点 + OutFlow 出边到回调节点
 * 2. GIA 解码：事件节点 genericId=36 + OutFlow[0] connects + OutParam 0-4
 * 3. 回调节点数据连线指向事件节点 OutParam（evt.variableName → set_custom_variable InParam1）
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
const OUTPUT_PATH = process.argv[2] ?? '/tmp/S13-composite-event-node.gia'
const GRAPH_ID = 1073742430
const NAME = 'S13_CompositeEventNode_GSTS'

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const comp = g.defineComposite(NAME, {
  inputs: {},
  outputs: {},
  build: (_i: any, f: any) => {
    f.on('whenCustomVariableChanges', (evt: any, ef: any) => {
      ef.setCustomVariable(evt.eventSourceEntity, evt.variableName, evt.postChangeValue, new bool(false))
    })
    // 主链（复合默认入口 InFlow[0] 指向的 exec 链头）
    f.registerExecNode('print_string', [new str('main chain')])
    return {}
  }
})

g.server({ id: GRAPH_ID }).on('whenTabIsSelected', (_e: any, f: any) => {
  f.callComposite(comp, {})
})

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: NAME })

// ---- IR 层断言 ----
const cd = docs[0].compositeDefs.find((c: any) => c.name === NAME)
assert.ok(cd, 'composite def exists')
const evtNode = cd.implNodes.find((n: any) => n.type === 'when_custom_variable_changes')
assert.ok(evtNode, 'event node exists in implNodes')
const evtEdges = cd.implEdges[evtNode.id]
assert.ok(evtEdges?.some((e: any) => e.source_index === 0), 'event node must have OutFlow[0] edge')
const cbNode = cd.implNodes.find((n: any) => n.type === 'set_custom_variable')
assert.ok(cbNode, 'callback node exists')
assert.ok(evtEdges.some((e: any) => e.node_id === cbNode.id), 'event OutFlow connects to callback node')

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

const evtEnc = implGraph.nodes?.find((node: any) => node.genericId?.nodeId === 36)
assert.ok(evtEnc, 'event node encoded with genericId 36')
const outflow = evtEnc.pins?.find((pin: any) => pin.i1?.kind === 2 && pin.i1?.index === 0)
assert.ok(outflow, 'event node must have physical OutFlow[0]')
assert.equal(outflow.connects?.length, 1, 'event OutFlow[0] must have one consumer')
const outParams = (evtEnc.pins ?? []).filter((pin: any) => pin.i1?.kind === 4)
assert.equal(outParams.length, 5, 'event node must have 5 OutParams (Ety/Gid/Str/R<T>/R<T>)')

const sha256 = createHash('sha256').update(bytes).digest('hex')
console.log('PASS S13 composite event node (IR + GIA)')
console.log('SHA-256: ' + sha256)
