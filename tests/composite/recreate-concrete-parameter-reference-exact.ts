// @ts-nocheck
/**
 * 从参考 GIA 解码结果建立同构 IR：节点 ID、pin index、边和 compositePins
 * 均按参考文件固定，用于隔离“构造差异”和“编码差异”。
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUT_PATH = 'tests/composite/output/复合节点需要具体参数类型-精确复刻.gia'
const COMPOSITE_ID = 1610612737
const MAIN_GRAPH_ID = 1073741829

const conn = (node_id: number, index: number, type: string) => ({
  type: 'conn',
  value: { node_id, index, type }
})
const capture = (name: string, type: string, value = 0) => ({
  type,
  value,
  capture: true,
  __captureInputName: name
})
const literal = (type: string, value: unknown) => ({ type, value })

const compositeDef = {
  name: '复合节点需要具体类型参数',
  id: COMPOSITE_ID,
  type: 'composite',
  inflows: [{ name: '', visible: true, index: 0, pinIndex: 1 }],
  outflows: [],
  inputs: [
    { name: '目标实体', visible: true, index: 0, type: 'entity', pinIndex: 2 },
    { name: '', visible: true, index: 1, type: 'int', pinIndex: 3 },
    { name: '', visible: true, index: 2, type: 'int', pinIndex: 5 },
    { name: '右值', visible: true, index: 3, type: 'int', pinIndex: 6 }
  ],
  outputs: [],
  implNodes: [
    {
      id: 3,
      type: 'set_custom_variable',
      args: [
        capture('目标实体', 'entity'),
        literal('str', '测试'),
        conn(7, 0, 'bool')
      ]
    },
    {
      id: 6,
      type: 'addition',
      args: [capture('', 'int'), capture('', 'int')]
    },
    {
      id: 7,
      type: 'greater_than_or_equal_to',
      args: [conn(6, 0, 'int'), capture('右值', 'int')]
    }
  ],
  implEdges: {},
  compositePins: [
    { outerPinKind: 1, outerPinIndex: 0, innerNodeId: 3, innerPinKind: 1, innerPinIndex: 0 },
    { outerPinKind: 3, outerPinIndex: 0, innerNodeId: 3, innerPinKind: 3, innerPinIndex: 0 },
    { outerPinKind: 3, outerPinIndex: 1, innerNodeId: 6, innerPinKind: 3, innerPinIndex: 0 },
    { outerPinKind: 3, outerPinIndex: 2, innerNodeId: 6, innerPinKind: 3, innerPinIndex: 1 },
    { outerPinKind: 3, outerPinIndex: 3, innerNodeId: 7, innerPinKind: 3, innerPinIndex: 1 }
  ]
}

const ir = {
  ir_version: 1,
  ir_type: 'node_graph',
  graph: { name: '新建节点图', id: MAIN_GRAPH_ID, type: 'server' },
  compositeDefs: [compositeDef],
  nodes: [
    {
      id: 2,
      type: 'when_entity_is_created',
      args: [],
      next: [{ node_id: 11 }, { node_id: 10 }]
    },
    {
      id: 10,
      type: '__composite_call__',
      args: [
        literal('int', COMPOSITE_ID),
        conn(2, 0, 'entity'),
        literal('int', 10),
        literal('int', 20),
        literal('int', 30)
      ]
    },
    {
      id: 11,
      type: 'set_custom_variable',
      args: [conn(2, 0, 'entity'), literal('str', '测试'), conn(13, 0, 'bool')]
    },
    {
      id: 12,
      type: 'addition',
      args: [literal('int', 1), literal('int', 2)]
    },
    {
      id: 13,
      type: 'greater_than_or_equal_to',
      args: [conn(12, 0, 'int'), literal('int', 3)]
    }
  ]
}

mkdirSync('tests/composite/output', { recursive: true })
const bytes = irToGia(ir, { graphId: MAIN_GRAPH_ID, name: '新建节点图', protoPath: PROTO_PATH })
writeFileSync(OUT_PATH, Buffer.from(bytes))
const decoded = decode_gia_file(OUT_PATH, PROTO_PATH)

function graphNodes(graph: any) {
  return (graph?.nodes ?? []).map((n: any) => ({
    nodeIndex: n.nodeIndex,
    genericId: n.genericId?.nodeId,
    concreteId: n.concreteId?.nodeId,
    pins: (n.pins ?? []).map((p: any) => ({
      kind: p.i1?.kind,
      index: p.i1?.index,
      type: p.type,
      valueClass: p.value?.class,
      concreteIndex: p.value?.bConcreteValue?.indexOfConcrete,
      connects: p.connects
    }))
  }))
}

const impl = decoded.accessories?.find((x: any) => x.which === 9)?.graph?.inner?.graph
const main = decoded.graph?.graph?.inner?.graph
assert.ok(impl)
assert.ok(main)

const def = decoded.accessories?.find((x: any) => x.which === 12)?.compositeDef?.inner?.def
assert.equal(def?.inputs?.[0]?.type?.class, 0, 'entity CompositeDef class must match reference')
assert.equal(def?.inputs?.[0]?.type?.type1, 1, 'entity CompositeDef type1 must be Entity')

const implNodeById = new Map(
  (impl.nodes ?? []).map((node: any) => [node.genericId?.nodeId, node])
)
const addition = implNodeById.get(200)
const comparison = implNodeById.get(233)
assert.deepEqual(
  (addition?.pins ?? [])
    .filter((pin: any) => pin.i1?.kind === 3)
    .map((pin: any) => [pin.i1.index, pin.type]),
  [[0, 3], [1, 3]],
  'addition must keep concrete int boundary InParams'
)
assert.deepEqual(
  (comparison?.pins ?? [])
    .filter((pin: any) => pin.i1?.kind === 3)
    .map((pin: any) => [pin.i1.index, pin.type]),
  [[0, 3], [1, 3]],
  'comparison must keep concrete int boundary InParams'
)
for (const pin of impl.compositePins ?? []) {
  if (pin.outerPin?.kind !== 3 || pin.innerPin?.kind !== 3) continue
  const node = (impl.nodes ?? []).find((candidate: any) => candidate.nodeIndex === pin.innerNodeId)
  assert.ok(
    node?.pins?.some(
      (candidate: any) =>
        candidate.i1?.kind === 3 && candidate.i1?.index === pin.innerPin.index
    ),
    `compositePin must target a physical InParam: ${pin.innerNodeId}.${pin.innerPin.index}`
  )
}

console.log(`输出: ${OUT_PATH}`)
console.log(`大小: ${bytes.length} 字节`)
console.log(JSON.stringify({
  def: decoded.accessories?.find((x: any) => x.which === 12)?.compositeDef?.inner?.def,
  main: graphNodes(main),
  impl: graphNodes(impl),
  compositePins: impl.compositePins
}, null, 2))
