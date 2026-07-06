// @ts-nocheck
/**
 * debug6.gia 结构复刻 — DSL raw 系统节点 + 多 InFlow「复杂分支」复合版
 *
 * 原始: /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/分支/debug6.gia (1607 B)
 *
 * 目标结构:
 *   - 主图 6 节点：5 个系统节点 + 1 个复杂分支复合调用
 *   - CompositeDefs = 1
 *   - 「复杂分支」接口：4 InFlow / 5 OutFlow / 0 InParam / 1 OutParam
 *   - 复合调用的不同入边连接到 InFlow[0..2]，不再合并成单入口
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUT_DIR = './tests/composite/output'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const complexBranch = g.defineComposite('复杂分支', {
  inflows: [
    { name: '有限循环', pinIndex: 67 },
    { name: '开始转化事件', pinIndex: 76 },
    { name: '开始设置局部变量', pinIndex: 77 },
    { name: '开始打印字符串', pinIndex: 78 }
  ],
  outflows: [
    { name: '循环体', pinIndex: 68 },
    { name: '循环完成', pinIndex: 69 },
    { name: '打印字符串', pinIndex: 73 },
    { name: '设置局部变量', pinIndex: 74 },
    { name: '事件转发完成', pinIndex: 75 }
  ],
  outputs: { 当前循环值: { type: 'int', pinIndex: 72 } },
  build(_args, f) {
    const forward = f.node('forwarding_event')
    const loop = f.node('finite_loop', [], {
      outParams: { 当前循环值: { type: 'int', index: 0 } }
    })
    const setLocal = f.node('set_local_variable')
    const print = f.node('print_string')

    f.inflow('有限循环', loop)
    f.inflow('开始转化事件', forward)
    f.inflow('开始设置局部变量', setLocal)
    f.inflow('开始打印字符串', print)

    f.link(loop, 0, setLocal)
    f.link(loop, 1, forward)
    f.link(loop, 1, print)
    f.link(forward, 0, setLocal)
    f.link(setLocal, 0, print)

    f.outflow('循环体', loop, 0)
    f.outflow('循环完成', loop, 1)
    f.outflow('打印字符串', print, 0)
    f.outflow('设置局部变量', setLocal, 0)
    f.outflow('事件转发完成', forward, 0)

    return { 当前循环值: loop.当前循环值 }
  }
})

g.server({ mode: 'beyond', type: 'entity', id: 1073741841, name: 'main', prefix: false }).on(
  'whenCustomVariableChanges',
  (e, f) => {
    const entry = f.entry()
    const forward = f.node('forwarding_event', [e.eventSourceEntity])
    const loop = f.node('finite_loop')
    const setLocal = f.node('set_local_variable')
    const print = f.node('print_string')
    const branch = f.declareDetached(complexBranch, {})

    f.link(entry, 0, forward)
    f.link(entry, 0, loop)
    f.link(entry, 0, print)
    f.link(entry, 0, branch, 0)

    f.link(forward, 0, setLocal)
    f.link(forward, 0, branch, 2)

    f.link(loop, 0, setLocal)
    f.link(loop, 0, branch, 1)
    f.link(loop, 1, forward)
    f.link(loop, 1, print)
    f.link(loop, 1, branch, 1)

    f.link(setLocal, 0, print)
    f.link(setLocal, 0, branch, 2)
  }
)

const doc = buildServerGraphRegistriesIRDocuments()[0]
const complexBranchId = complexBranch.id
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
const nodeIds = mainNodes.map((n) => n.genericId?.nodeId)
const compositeNode = mainNodes.find((n) => n.genericId?.nodeId === complexBranchId)
const compositeNodeIndex = compositeNode?.nodeIndex
const toComplexInFlowIndexes = outFlowConnections
  .filter((c) => c.to === compositeNodeIndex)
  .map((c) => c.targetInIdx)
  .sort((a, b) => a - b)

check(`CompositeDefs = 1 (实际 ${compDefs.length})`, compDefs.length === 1)
check(`复杂分支: 4 InFlows`, (complex?.inflows?.length ?? 0) === 4)
check(`复杂分支: 5 OutFlows`, (complex?.outflows?.length ?? 0) === 5)
check(`复杂分支: 0 InParam`, (complex?.inputs?.length ?? 0) === 0)
check(`复杂分支: 1 OutParam`, (complex?.outputs?.length ?? 0) === 1)
check(`主图节点 = 6 (实际 ${mainNodes.length})`, mainNodes.length === 6)
check(
  `主图 nodeId = [36,190,5,19,1,${complexBranchId}] (实际 ${JSON.stringify(nodeIds)})`,
  JSON.stringify(nodeIds) === JSON.stringify([36, 190, 5, 19, 1, complexBranchId])
)
check(
  `复合调用入边使用多个 InFlow (实际 ${JSON.stringify(toComplexInFlowIndexes)})`,
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
