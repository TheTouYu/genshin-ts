// @ts-nocheck
/**
 * debug6.gia 结构复刻 — debug5 主图系统节点 + 1 个多 InFlow「复杂分支」复合
 *
 * 原始: /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/分支/debug6.gia (1607 B)
 *
 * 目标结构:
 *   - 主图 6 节点：5 个系统节点 + n=11 复杂分支复合调用
 *   - CompositeDefs = 1
 *   - 「复杂分支」接口：4 InFlow / 5 OutFlow / 0 InParam / 1 OutParam
 *   - n=11 的不同入边连接到 InFlow[0..2]，不再合并成单入口
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import type { CompositeDefIR, IRDocument } from '../../dist/src/runtime/IR.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUT_DIR = './tests/composite/output'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const COMPLEX_BRANCH_ID = 1610612743

const complexBranch: CompositeDefIR = {
  name: '复杂分支',
  id: COMPLEX_BRANCH_ID,
  type: 'composite',
  inflows: [
    { name: '有限循环', visible: true, index: 0, pinIndex: 67 },
    { name: '开始转化事件', visible: true, index: 1, pinIndex: 76 },
    { name: '开始设置局部变量', visible: true, index: 2, pinIndex: 77 },
    { name: '开始打印字符串', visible: true, index: 3, pinIndex: 78 }
  ],
  outflows: [
    { name: '循环体', visible: true, index: 0, pinIndex: 68 },
    { name: '循环完成', visible: true, index: 1, pinIndex: 69 },
    { name: '打印字符串', visible: true, index: 2, pinIndex: 73 },
    { name: '设置局部变量', visible: true, index: 3, pinIndex: 74 },
    { name: '事件转发完成', visible: true, index: 4, pinIndex: 75 }
  ],
  inputs: [],
  outputs: [{ name: '当前循环值', visible: true, index: 0, type: 'int', pinIndex: 72 }],
  implNodes: [
    { id: 6, type: 'forwarding_event', args: [] },
    { id: 7, type: 'finite_loop', args: [] },
    { id: 8, type: 'set_local_variable', args: [] },
    { id: 9, type: 'print_string', args: [] }
  ],
  implEdges: {
    6: [8],
    7: [
      { node_id: 8, source_index: 0 },
      { node_id: 6, source_index: 1 },
      { node_id: 9, source_index: 1 }
    ],
    8: [9]
  },
  compositePins: [
    { outerPinKind: 1, outerPinIndex: 0, innerNodeId: 7, innerPinKind: 1, innerPinIndex: 0 },
    { outerPinKind: 1, outerPinIndex: 1, innerNodeId: 6, innerPinKind: 1, innerPinIndex: 0 },
    { outerPinKind: 1, outerPinIndex: 2, innerNodeId: 8, innerPinKind: 1, innerPinIndex: 0 },
    { outerPinKind: 1, outerPinIndex: 3, innerNodeId: 9, innerPinKind: 1, innerPinIndex: 0 },
    { outerPinKind: 2, outerPinIndex: 0, innerNodeId: 7, innerPinKind: 2, innerPinIndex: 0 },
    { outerPinKind: 2, outerPinIndex: 1, innerNodeId: 7, innerPinKind: 2, innerPinIndex: 1 },
    { outerPinKind: 2, outerPinIndex: 2, innerNodeId: 9, innerPinKind: 2, innerPinIndex: 0 },
    { outerPinKind: 2, outerPinIndex: 3, innerNodeId: 8, innerPinKind: 2, innerPinIndex: 0 },
    { outerPinKind: 2, outerPinIndex: 4, innerNodeId: 6, innerPinKind: 2, innerPinIndex: 0 },
    { outerPinKind: 4, outerPinIndex: 0, innerNodeId: 7, innerPinKind: 4, innerPinIndex: 0 }
  ]
}

const doc: IRDocument & { compositeDefs: CompositeDefIR[] } = {
  ir_version: 1,
  ir_type: 'node_graph',
  graph: {
    type: 'server',
    mode: 'beyond',
    sub_type: 'entity',
    id: 1073741841,
    name: 'main'
  },
  variables: [],
  nodes: [
    { id: 1, type: 'when_custom_variable_changes', next: [2, 3, 5, 11] },
    {
      id: 2,
      type: 'forwarding_event',
      args: [{ type: 'conn', value: { node_id: 1, index: 0, type: 'entity' } }],
      next: [4, { node_id: 11, target_index: 2 }]
    },
    {
      id: 3,
      type: 'finite_loop',
      args: [],
      next: [
        { node_id: 4, source_index: 0 },
        { node_id: 11, source_index: 0, target_index: 1 },
        { node_id: 2, source_index: 1 },
        { node_id: 5, source_index: 1 },
        { node_id: 11, source_index: 1, target_index: 1 }
      ]
    },
    { id: 4, type: 'set_local_variable', args: [], next: [5, { node_id: 11, target_index: 2 }] },
    { id: 5, type: 'print_string', args: [] },
    { id: 11, type: '__composite_call__', args: [{ type: 'int', value: COMPLEX_BRANCH_ID }] }
  ],
  compositeDefs: [complexBranch]
}

const bytes = irToGia(doc, { graphId: 1073741841, name: 'recreate_debug6', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/recreate_debug6.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)

const gen = decode_gia_file(outPath, PROTO_PATH)
const accs = gen.accessories ?? []
const compDefs = accs.filter((a) => a.which === 12)
const mainNodes = gen.graph?.graph?.inner?.graph?.nodes ?? []

let ok = true
const check = (label, cond) => {
  console.log(`  ${cond ? '✅' : '❌'} ${label}`)
  if (!cond) ok = false
}

let execEdges = 0
let dataEdges = 0
const outFlowConnections = []
mainNodes.forEach((n) => {
  n.pins?.forEach((p) => {
    if (p.i1?.kind === 2) {
      execEdges += (p.connects ?? []).length
      ;(p.connects ?? []).forEach((c) => {
        outFlowConnections.push({
          from: n.nodeIndex,
          to: c.id,
          outIdx: p.i1?.index,
          targetInIdx: c.connect?.index
        })
      })
    }
    if (p.i1?.kind === 3) dataEdges += (p.connects ?? []).length
  })
})

console.log('\n═══ 结构验证 ═══')
console.log('  exec 边详情:')
outFlowConnections.forEach((c) =>
  console.log(`    n=${c.from}.OutFlow[${c.outIdx}] → n=${c.to}.InFlow[${c.targetInIdx}]`)
)
const complexDef = compDefs.find((a) => a.compositeDef?.inner?.def?.name === '复杂分支')
const complex = complexDef?.compositeDef?.inner?.def
const nodeIds = mainNodes.map((n) =>
  n.genericId?.kind === 22001 ? n.genericId?.nodeId : n.genericId?.nodeId
)
const toComplexInFlowIndexes = outFlowConnections
  .filter((c) => c.to === 11)
  .map((c) => c.targetInIdx)
  .sort((a, b) => a - b)

check(`CompositeDefs = 1 (实际 ${compDefs.length})`, compDefs.length === 1)
check(`复杂分支: 4 InFlows`, (complex?.inflows?.length ?? 0) === 4)
check(`复杂分支: 5 OutFlows`, (complex?.outflows?.length ?? 0) === 5)
check(`复杂分支: 0 InParam`, (complex?.inputs?.length ?? 0) === 0)
check(`复杂分支: 1 OutParam`, (complex?.outputs?.length ?? 0) === 1)
check(`主图节点 = 6 (实际 ${mainNodes.length})`, mainNodes.length === 6)
check(
  `主图 nodeId = [36,190,5,19,1,${COMPLEX_BRANCH_ID}] (实际 ${JSON.stringify(nodeIds)})`,
  JSON.stringify(nodeIds) === JSON.stringify([36, 190, 5, 19, 1, COMPLEX_BRANCH_ID])
)
check(
  `n=11 入边使用多个 InFlow (实际 ${JSON.stringify(toComplexInFlowIndexes)})`,
  JSON.stringify(toComplexInFlowIndexes) === JSON.stringify([0, 1, 1, 2, 2])
)
check(`exec 边 = 13 (实际 ${execEdges})`, execEdges === 13)
check(`data 边 = 1 (实际 ${dataEdges})`, dataEdges === 1)

if (ok) {
  console.log('\n🏆 验证通过 (多 InFlow 复杂分支结构复刻)')
} else {
  console.log('\n💥 部分失败')
  process.exit(1)
}
