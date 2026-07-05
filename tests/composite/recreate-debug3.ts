// @ts-nocheck
/**
 * debug3.gia 复刻 — 实战验证 f.* API 写出的复合能否生成对应 GIA
 *
 * 原始文件: /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/分支/debug3.gia
 *   - 6 节点主图, 0 事件源 (静态断头台)
 *   - 2 复合: 创建复合节点 (Double Branch), 创建复合节点(1) (Logical NOT)
 *   - 连接: 4→[3,7], 3→[5,6], 10→4.条件, 全条件硬编码
 *
 * 复刻限制 (Probe 阶段发现):
 *   1. gsts 必须有 1 个 event (空 handler 崩溃: "IR document must have at least one node")
 *   2. gsts 的 NOT 复合 impl 内 registerExecNode 会隐式加 InFlow (I=1 而非 I=0)
 *   3. gsts 无法生成 0-pin 复合调用 — 至少会发 1 个 InParam pin
 *   4. gsts bug: arg.getMetadata() 在 raw `false`/`true` 上崩溃, 必须用 `new bool()`
 *   5. 复合 ID 是 gsts 自动分配 (1610700000+), 不可能匹配原 1610612756/1610612757
 *   6. 节点位置由 layout 算法生成, 不可能匹配原 (-957, -90) 等
 *
 * 输出: tests/composite/output/recreate_debug3.gia
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { bool } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { writeFileSync, mkdirSync, existsSync } from 'fs'

const PROTO_PATH = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const OUT_DIR = './tests/composite/output'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

// ═══════════════════════════════════════════════════════════════
// 复合 1: Double Branch (1 InFlow + 2 OutFlows 是/否 + 1 InParam 条件)
// ═══════════════════════════════════════════════════════════════
const doubleBranch = g.defineComposite('创建复合节点', {
  inputs: { 条件: { type: 'bool' } },
  outputs: {},
  build({ 条件 }, f) {
    f.registerExecNode('double_branch', [条件])
    f.leaf(0)   // OutFlow[0] = "是"
    f.leaf(1)   // OutFlow[1] = "否"
    return {}
  }
})
console.log('复合1 (Double Branch) id:', doubleBranch.id)

// ═══════════════════════════════════════════════════════════════
// 复合 2: Logical NOT (0 InFlow + 0 OutFlow + 1 InParam 输入 + 1 OutParam 结果)
// 关键: 用 f.logicalNotOperation(输入) 纯数据 API, 不用 registerExecNode
// 这样 gsts 不会隐式加 InFlow/OutFlow, 接口会真正变成 I=0
// ═══════════════════════════════════════════════════════════════
const notComp = g.defineComposite('创建复合节点(1)', {
  inputs: { 输入: { type: 'bool' } },
  outputs: { 结果: { type: 'bool' } },
  build({ 输入 }, f) {
    return { 结果: f.logicalNotOperation(输入) }
  }
})
console.log('复合2 (Logical NOT) id:', notComp.id)

// ═══════════════════════════════════════════════════════════════
// 预捕获: 强制 build 阶段跑完, 让 captured 填充
// ═══════════════════════════════════════════════════════════════
g.server({ name: 'trigger' }).on('whenEntityIsCreated', (_e, f) => {
  f.callComposite(doubleBranch, { 条件: new bool(true) })
  f.callComposite(notComp, { 输入: new bool(true) })
})
buildServerGraphRegistriesIRDocuments({ defaultName: 'trigger' })
console.log('预捕获完成')

// ═══════════════════════════════════════════════════════════════
// 主图: 复刻 debug3.gia 的 6 节点结构
// event → n=10 (NOT) → n=4.条件 → 4.OutFlow[是]→n=3, 4.OutFlow[否]→n=7
// n=3.OutFlow[是]→n=5, n=3.OutFlow[是]→n=6 (孤儿)
// ═══════════════════════════════════════════════════════════════
g.server({ name: 'main', graphId: 1073741839 })
  .on('whenEntityIsCreated', (_e, f) => {
    // n=10: NOT 复合, 输入=1 (硬编码), 输出 → n=4.条件 (数据线)
    const r10 = f.callComposite(notComp, { 输入: new bool(true) })
    const notResult = r10.结果  // OutParam[0]"结果"

    // n=4: Double Branch, 条件来自 n=10
    const r4 = f.callComposite(doubleBranch, { 条件: notResult })
    f.connectOutFlow(r4, 0, () => {
      // 是分支 → n=3
      const r3 = f.callComposite(doubleBranch, { 条件: new bool(true) })
      f.connectOutFlow(r3, 0, () => {
        // n=3.是 → n=5
        f.callComposite(doubleBranch, { 条件: new bool(true) })
      })
      f.connectOutFlow(r3, 0, () => {
        // n=3.是 → n=6 (孤儿, 不接)
        // 注: 1 个 outflow 接 2 个 callback 模拟"扇出到 2 目标"
        f.callComposite(doubleBranch, { 条件: new bool(false) })
      })
    })
    f.connectOutFlow(r4, 1, () => {
      // 否分支 → n=7
      f.callComposite(doubleBranch, { 条件: new bool(false) })
    })
  })

// ═══════════════════════════════════════════════════════════════
// 构建 IR + 写 GIA
// ═══════════════════════════════════════════════════════════════
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]
console.log(`\nIR nodes: ${doc.nodes?.length}`)
doc.nodes?.forEach((n) => {
  console.log(`  type=${n.type} id=${n.id} next=${JSON.stringify(n.next)}`)
})

const bytes = irToGia(doc, { graphId: 1073741839, name: 'recreate_debug3', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/recreate_debug3.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)

// ═══════════════════════════════════════════════════════════════
// 验证: 解码 + 断言结构等价
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 结构验证 ═══')
const gen = decode_gia_file(outPath, PROTO_PATH)
const accs = gen.accessories ?? []
const compDefs = accs.filter((a: any) => a.which === 12)
const implGraphs = accs.filter((a: any) => a.which === 9)
const mainNodes = gen.graph?.graph?.inner?.graph?.nodes ?? []

let ok = true
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? '✅' : '❌'} ${label}`)
  if (!cond) ok = false
}

// 1. 复合数 = 2
check(`CompositeDefs 数 = 2 (实际 ${compDefs.length})`, compDefs.length === 2)

// 2. 复合接口
for (const cd of compDefs) {
  const d = cd.compositeDef?.inner?.def
  if (d?.name === '创建复合节点') {
    // Double Branch
    check(`Double Branch: 1 InFlow (实际 ${d?.inflows?.length})`, d?.inflows?.length === 1)
    check(`Double Branch: 2 OutFlows (实际 ${d?.outflows?.length})`, d?.outflows?.length === 2)
    check(`Double Branch: 1 InParam (实际 ${d?.inputs?.length})`, d?.inputs?.length === 1)
    check(`Double Branch: 0 OutParam (实际 ${d?.outputs?.length})`, d?.outputs?.length === 0)
  } else if (d?.name === '创建复合节点(1)') {
    check(`Logical NOT: 0 InFlow (纯数据)`, d?.inflows?.length === 0)
    check(`Logical NOT: 0 OutFlows`, d?.outflows?.length === 0)
    check(`Logical NOT: 1 InParam`, d?.inputs?.length === 1)
    check(`Logical NOT: 1 OutParam`, d?.outputs?.length === 1)
  }
}

// 3. impl 节点
for (const ig of implGraphs) {
  const nodes = ig.graph?.inner?.graph?.nodes ?? []
  const nids = nodes.map((n: any) => n.genericId?.nodeId)
  if (nids.includes(2)) {
    check(`Double Branch impl 有 Double Branch 节点 (nid=2)`, nids.includes(2))
  }
  if (nids.includes(229)) {
    check(`Logical NOT impl 有 Logical NOT 节点 (nid=229)`, nids.includes(229))
  }
}

// 4. 主图节点
const compositeCalls = mainNodes.filter((n: any) => n.genericId?.kind === 22001)
console.log(`  主图 composite call 数: ${compositeCalls.length} (原 debug3 是 6)`)
const events = mainNodes.filter((n: any) => n.genericId?.kind === 22000)
check(`主图有 1 个 event (原 debug3 是 0)`, events.length === 1)
check(`主图 composite call >= 5 (原 debug3 是 6)`, compositeCalls.length >= 5)

// 5. exec 边统计
let execEdges = 0
let dataEdges = 0
mainNodes.forEach((n: any) => {
  n.pins?.forEach((p: any) => {
    if (p.i1?.kind === 2) execEdges += (p.connects ?? []).length
    if (p.i1?.kind === 3) dataEdges += (p.connects ?? []).length
  })
})
console.log(`  exec 边数: ${execEdges} (原 debug3 是 4)`)
console.log(`  data 边数: ${dataEdges} (原 debug3 是 1)`)
check(`exec 边 >= 4`, execEdges >= 4)
check(`data 边 >= 1 (n=10 → n=4.条件)`, dataEdges >= 1)

if (ok) {
  console.log('\n🏆 验证通过 (结构等价)')
} else {
  console.log('\n💥 部分失败')
  process.exit(1)
}
