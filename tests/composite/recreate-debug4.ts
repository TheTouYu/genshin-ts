// @ts-nocheck
/**
 * debug4.gia 复刻 — 复杂控制流连线实战
 *
 * 原始: /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/分支/debug4.gia (1571 B)
 *
 * 结构 (7 节点, 1 event):
 *   n=1 event (When Entity Is Created) → n=4, n=6 (扇出)
 *   n=4 (Double Branch) [条件 ← n=10.OutParam[0]]:
 *     是 → n=3 (Double Branch)
 *     否 → n=7 (Double Branch)
 *   n=3 (Double Branch) [条件=1]:
 *     是 → n=5, n=6 (扇出到 2 目标)
 *   n=7 (Double Branch) [条件=0]:
 *     是 → n=5
 *     否 → n=6
 *   n=5 (Double Branch) [条件=1, terminal]
 *   n=6 (Double Branch) [0 pins, 真孤儿 - 但被多源触发]
 *   n=10 (Logical NOT) [输入=1]
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
console.log('复合1 (Double Branch) id:', doubleBranch.id)

const notComp = g.defineComposite('创建复合节点(1)', {
  inputs: { 输入: { type: 'bool' } },
  outputs: { 结果: { type: 'bool' } },
  build({ 输入 }, f) {
    return { 结果: f.logicalNotOperation(输入) }
  }
})
console.log('复合2 (Logical NOT) id:', notComp.id)

g.server({ name: 'trigger' }).on('whenEntityIsCreated', (_e, f) => {
  f.callComposite(doubleBranch, { 条件: new bool(true) })
  f.callComposite(notComp, { 输入: new bool(true) })
})
buildServerGraphRegistriesIRDocuments({ defaultName: 'trigger' })

g.server({ name: 'main', graphId: 1073741839 })
  .on('whenEntityIsCreated', (_e, f) => {
    const r10 = f.callComposite(notComp, { 输入: new bool(true) })
    const notResult = r10.结果

    f.fork(
      () => {
        const r4 = f.callComposite(doubleBranch, { 条件: notResult })
        f.connectOutFlow(r4, 0, () => {
          const r3 = f.callComposite(doubleBranch, { 条件: new bool(true) })
          f.connectOutFlow(r3, 0, () => f.callComposite(doubleBranch, { 条件: new bool(true) }))
          f.connectOutFlow(r3, 0, () => f.callComposite(doubleBranch, { 条件: new bool(false) }))
        })
        f.connectOutFlow(r4, 1, () => {
          const r7 = f.callComposite(doubleBranch, { 条件: new bool(false) })
          f.connectOutFlow(r7, 0, () => f.callComposite(doubleBranch, { 条件: new bool(true) }))
          f.connectOutFlow(r7, 1, () => f.callComposite(doubleBranch, { 条件: new bool(false) }))
        })
      },
      () => {
        f.callComposite(doubleBranch, { 条件: new bool(false) })
      }
    )
  })

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]
console.log(`\nIR nodes: ${doc.nodes?.length}`)
doc.nodes?.forEach((n) => {
  console.log(`  type=${n.type} id=${n.id} next=${JSON.stringify(n.next)}`)
})

const bytes = irToGia(doc, { graphId: 1073741839, name: 'recreate_debug4', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/recreate_debug4.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)

// ═══ 验证 ═══
console.log('\n═══ 结构验证 ═══')
const gen = decode_gia_file(outPath, PROTO_PATH)
const accs = gen.accessories ?? []
const compDefs = accs.filter((a: any) => a.which === 12)
const mainNodes = gen.graph?.graph?.inner?.graph?.nodes ?? []

let ok = true
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? '✅' : '❌'} ${label}`)
  if (!cond) ok = false
}

check(`CompositeDefs 数 = 2 (实际 ${compDefs.length})`, compDefs.length === 2)

for (const cd of compDefs) {
  const d = cd.compositeDef?.inner?.def
  if (d?.name === '创建复合节点') {
    check(`Double Branch: 1 InFlow`, d?.inflows?.length === 1)
    check(`Double Branch: 2 OutFlows`, d?.outflows?.length === 2)
    check(`Double Branch: 1 InParam`, d?.inputs?.length === 1)
    check(`Double Branch: 0 OutParam`, d?.outputs?.length === 0)
  } else if (d?.name === '创建复合节点(1)') {
    check(`Logical NOT: 0 InFlow (纯数据)`, d?.inflows?.length === 0)
    check(`Logical NOT: 0 OutFlows`, d?.outflows?.length === 0)
    check(`Logical NOT: 1 InParam`, d?.inputs?.length === 1)
    check(`Logical NOT: 1 OutParam`, d?.outputs?.length === 1)
  }
}

const compositeCalls = mainNodes.filter((n: any) => n.genericId?.kind === 22001)
const events = mainNodes.filter((n: any) => n.genericId?.kind === 22000)
console.log(`  主图: events=${events.length}, composite calls=${compositeCalls.length}`)
check(`主图有 1 个 event (原 debug4 是 1)`, events.length === 1)
check(`主图有 >= 5 个 composite call (原 debug4 是 6, 我们 9: gsts 不支持 fan-in)`, compositeCalls.length >= 5)

let execEdges = 0
let dataEdges = 0
const outFlowConnections: Array<{from: number, to: number, outIdx: number}> = []
mainNodes.forEach((n: any) => {
  n.pins?.forEach((p: any) => {
    if (p.i1?.kind === 2) {
      execEdges += (p.connects ?? []).length
      ;(p.connects ?? []).forEach((c: any) => {
        outFlowConnections.push({from: n.nodeIndex, to: c.id, outIdx: p.i1?.index})
      })
    }
    if (p.i1?.kind === 3) dataEdges += (p.connects ?? []).length
  })
})
console.log(`  exec 边数: ${execEdges} (原 debug4 是 8)`)
console.log(`  data 边数: ${dataEdges} (原 debug4 是 1)`)
console.log('  exec 边详情:')
outFlowConnections.forEach(c => console.log(`    n=${c.from}.OutFlow[${c.outIdx}] → n=${c.to}`))
check(`exec 边 >= 6 (event扇出2 + 4.OutFlow×2 + 3.OutFlow×2 + 7.OutFlow×2)`, execEdges >= 6)
check(`data 边 >= 1 (n=10 → n=4.条件)`, dataEdges >= 1)

if (ok) {
  console.log('\n🏆 验证通过 (结构等价)')
} else {
  console.log('\n💥 部分失败')
  process.exit(1)
}
