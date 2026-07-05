// @ts-nocheck
/**
 * debug4.gia 复刻 v2 — 使用 linkTo / declareDetached / eventMarker
 *
 * 原始: /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/分支/debug4.gia (1571 B)
 *
 * 目标: 精确复刻原 debug4.gia 的拓扑 (包括 fan-in).
 * v1 用 f.fork + connectOutFlow callback 无法表达 n=5/n=6 被多源共享 (fan-in).
 * v2 用 f.declareDetached + f.linkTo + f.eventMarker 可以表达.
 *
 * 期望结构 (7 节点, 1 event, 8 exec 边, 1 data 边):
 *   n=1 event → n=4, n=6 (扇出)
 *   n=4 [条件 ← n=10.OutParam[0]]: 是 → n=3, 否 → n=7
 *   n=3 [条件=1]: 是 → n=5, n=6 (扇出)
 *   n=7 [条件=0]: 是 → n=5, 否 → n=6
 *   n=5 [条件=1, 被 r3.是 + r7.是 共享, fan-in]
 *   n=6 [条件=0, 被 event + r3.是 + r7.否 共享, fan-in]
 *   n=10 [输入=1, 纯数据 → n=4.条件]
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { bool } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { writeFileSync, mkdirSync, existsSync } from 'fs'

const PROTO_PATH = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const OUT_DIR = './tests/composite/output'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const doubleBranch = g.defineComposite('创建复合节点', {
  inputs: { 条件: { type: 'bool' } },
  outputs: {},
  build({ 条件 }, f) {
    f.registerExecNode('double_branch', [条件])
    f.leaf(0)
    f.leaf(1)
    return {}
  }
})

const notComp = g.defineComposite('创建复合节点(1)', {
  inputs: { 输入: { type: 'bool' } },
  outputs: { 结果: { type: 'bool' } },
  build({ 输入 }, f) {
    return { 结果: f.logicalNotOperation(输入) }
  }
})

g.server({ name: 'trigger' }).on('whenEntityIsCreated', (_e, f) => {
  f.callComposite(doubleBranch, { 条件: new bool(true) })
  f.callComposite(notComp, { 输入: new bool(true) })
})
buildServerGraphRegistriesIRDocuments({ defaultName: 'trigger' })

g.server({ name: 'main', graphId: 1073741839 })
  .on('whenEntityIsCreated', (_e, f) => {
    const r10 = f.callComposite(notComp, { 输入: new bool(true) })
    const r4 = f.declareDetached(doubleBranch, { 条件: r10.结果 })
    const r3 = f.declareDetached(doubleBranch, { 条件: new bool(true) })
    const r7 = f.declareDetached(doubleBranch, { 条件: new bool(false) })
    const r5 = f.declareDetached(doubleBranch, { 条件: new bool(true) })
    const r6 = f.declareDetached(doubleBranch, { 条件: new bool(false) })

    const ev = f.eventMarker()

    f.linkTo(ev, 0, r4)
    f.linkTo(ev, 0, r6)

    f.linkTo(r4, 0, r3)
    f.linkTo(r4, 1, r7)

    f.linkTo(r3, 0, r5)
    f.linkTo(r3, 0, r6)

    f.linkTo(r7, 0, r5)
    f.linkTo(r7, 1, r6)
  })

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]
console.log(`IR nodes: ${doc.nodes?.length}`)
doc.nodes?.forEach((n) => {
  const nextStr = Array.isArray(n.next)
    ? '[' + n.next.map((x) => typeof x === 'number' ? x : '{n:' + x.node_id + ',s:' + x.source_index + '}').join(',') + ']'
    : n.next
  console.log(`  id=${n.id} type=${n.type} next=${nextStr}`)
})

const bytes = irToGia(doc, { graphId: 1073741839, name: 'recreate_debug4_v2', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/recreate_debug4_v2.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)

console.log('\n═══ 结构验证 ═══')
const gen = decode_gia_file(outPath, PROTO_PATH)
const accs = gen.accessories ?? []
const compDefs = accs.filter((a) => a.which === 12)
const mainNodes = gen.graph?.graph?.inner?.graph?.nodes ?? []

let ok = true
const check = (label, cond) => {
  console.log(`  ${cond ? '✅' : '❌'} ${label}`)
  if (!cond) ok = false
}

check(`CompositeDefs = 2 (实际 ${compDefs.length})`, compDefs.length === 2)

for (const cd of compDefs) {
  const d = cd.compositeDef?.inner?.def
  if (d?.name === '创建复合节点') {
    check(`Double Branch: 1 InFlow + 2 OutFlows + 1 InParam + 0 OutParam`, d?.inflows?.length === 1 && d?.outflows?.length === 2 && d?.inputs?.length === 1 && d?.outputs?.length === 0)
  } else if (d?.name === '创建复合节点(1)') {
    check(`Logical NOT: 0 InFlow + 0 OutFlow + 1 InParam + 1 OutParam`, d?.inflows?.length === 0 && d?.outflows?.length === 0 && d?.inputs?.length === 1 && d?.outputs?.length === 1)
  }
}

const compositeCalls = mainNodes.filter((n) => n.genericId?.kind === 22001)
const events = mainNodes.filter((n) => n.genericId?.kind === 22000)
console.log(`  主图: events=${events.length}, composite calls=${compositeCalls.length}`)
check(`主图 1 event`, events.length === 1)
check(`主图 6 composite call (原 debug4 是 6)`, compositeCalls.length === 6)

let execEdges = 0
let dataEdges = 0
const outFlowConnections = []
mainNodes.forEach((n) => {
  n.pins?.forEach((p) => {
    if (p.i1?.kind === 2) {
      execEdges += (p.connects ?? []).length
      ;(p.connects ?? []).forEach((c) => {
        outFlowConnections.push({ from: n.nodeIndex, to: c.id, outIdx: p.i1?.index })
      })
    }
    if (p.i1?.kind === 3) dataEdges += (p.connects ?? []).length
  })
})
console.log(`  exec 边数: ${execEdges} (原 debug4 是 8)`)
console.log(`  data 边数: ${dataEdges} (原 debug4 是 1)`)
console.log('  exec 边详情:')
outFlowConnections.forEach(c => console.log(`    n=${c.from}.OutFlow[${c.outIdx}] → n=${c.to}`))
check(`exec 边 = 8`, execEdges === 8)
check(`data 边 = 1`, dataEdges === 1)

if (ok) {
  console.log('\n🏆 验证通过 (结构等价)')
} else {
  console.log('\n💥 部分失败')
  process.exit(1)
}
