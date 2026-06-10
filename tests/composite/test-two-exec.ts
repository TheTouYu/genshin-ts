// @ts-nocheck
/**
 * 双 exec 复合串行测试
 * 定义两个 exec-only 复合，在主图中依次调用，验证 event 的 OutFlow fork 到两个复合
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { writeFileSync } from 'fs'

const PROTO_PATH = new URL('../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const OUT_DIR = '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'

// ── 复合1: exec-only ──
const comp1 = g.defineComposite('第一个执行', {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    f.printString('第一个')
    return {}
  }
})

// ── 复合2: exec-only ──
const comp2 = g.defineComposite('第二个执行', {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    f.printString('第二个')
    return {}
  }
})

console.log('comp1 id:', comp1.id, 'comp2 id:', comp2.id)

// ── 捕获预处理 ──
g.server({ name: 'trigger' }).on('whenEntityIsCreated', (_e: any, f: any) => {})
buildServerGraphRegistriesIRDocuments({ defaultName: 'trigger' })

// ── 主图：依次调用两个 exec 复合 ──
g.server({ name: 'main', graphId: 1073741870 })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    f.callComposite(comp1, {})
    f.callComposite(comp2, {})
  })

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]
console.log('IR nodes:', doc.nodes?.length)
doc.nodes?.forEach((n: any) => console.log('  type=' + n.type + ' id=' + n.id + ' next=' + JSON.stringify(n.next)))

const bytes = irToGia(doc, { graphId: 1073741870, name: 'two_exec', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/two_exec.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)

// ── 结构验证 ──
const gen = decode_gia_file(outPath, PROTO_PATH)
const mainNodes = gen.graph?.graph?.inner?.graph?.nodes ?? []
console.log('\n主图节点:')
let eventNode: any = null
const execNodes: any[] = []
mainNodes.forEach((n: any) => {
  console.log(`  node[${n.nodeIndex}]: kind=${n.genericId?.kind} nodeId=${n.genericId?.nodeId} pins=${n.pins?.length ?? 0}`)
  n.pins?.forEach((p: any, j: number) => {
    const conns = (p.connects ?? []).map((c: any) => `→node${c.id}(${c.connect?.kind}:${c.connect?.index})`)
    const kname = {1:'InFlow',2:'OutFlow',3:'InParam',4:'OutParam'}[p.i1?.kind] ?? '?'
    console.log(`    pin[${j}] ${kname}: idx=${p.i1?.index} connects=${JSON.stringify(conns)}`)
  })
  if (n.genericId?.kind === 22000) eventNode = n
  if (n.genericId?.kind === 22001) execNodes.push(n)
})

// 验证非终端复合链: event → comp1 → comp2
console.log('\n验证:')
let ok = true

// event 只连到第一个节点 (comp1)
if (eventNode) {
  const outFlowPin = eventNode.pins?.find((p: any) => p.i1?.kind === 2)
  const targets = outFlowPin?.connects?.map((c: any) => c.id) ?? []
  if (targets.length === 1 && targets[0] === execNodes[0]?.nodeIndex) {
    console.log(`  ✅ event OutFlow → [${targets.join(',')}] (仅第一个复合)`)
  } else {
    console.log(`  ❌ event OutFlow → [${targets.join(',')}]  期望 → [${execNodes[0]?.nodeIndex}]`)
    ok = false
  }
}

// comp1 非终端：有 OutFlow → comp2
const gComp1 = execNodes[0]
const comp1OutFlow = gComp1?.pins?.find((p: any) => p.i1?.kind === 2)
if (comp1OutFlow) {
  const cfwd = comp1OutFlow.connects?.map((c: any) => c.id) ?? []
  if (cfwd.includes(execNodes[1]?.nodeIndex)) {
    console.log(`  ✅ comp1[${gComp1.nodeIndex}] OutFlow → [${cfwd.join(',')}] (非终端转发)`)
  } else {
    console.log(`  ❌ comp1[${gComp1.nodeIndex}] OutFlow 未连到 comp2`)
    ok = false
  }
}

// comp2 终端：无 OutFlow
const gComp2 = execNodes[1]
const hasOutFlow2 = gComp2?.pins?.some((p: any) => p.i1?.kind === 2)
if (!hasOutFlow2) {
  console.log(`  ✅ comp2[${gComp2.nodeIndex}] 无 OutFlow (终端)`)
} else {
  console.log(`  ❌ comp2[${gComp2.nodeIndex}] 有 OutFlow (应为终端)`)
  ok = false
}

// 验证 accessories 结构
const accs = gen.accessories ?? []
console.log(`\naccessories: ${accs.length}`)
accs.forEach((a: any, i: number) => {
  if (a.which === 12) {
    const d = a.compositeDef?.inner?.def
    console.log(`  [${i}] CompositeDef: name=${d?.name} inflows=${d?.inflows?.length} outflows=${d?.outflows?.length}`)
    if (d?.outflows?.length !== 1) { console.log(`  ❌ ${d?.name} outflows 应为 1`); ok = false }
  }
  if (a.which === 9 && a.graph) {
    const g = a.graph?.inner?.graph
    console.log(`  [${i}] impl: nodes=${g?.nodes?.length} compositePins=${g?.compositePins?.length}`)
    if (g?.compositePins?.length !== 2) { console.log(`  ❌ compositePins 应为 2`); ok = false }
  }
})

if (ok) {
  console.log('\n🏆 全部验证通过')
} else {
  console.log('\n💥 存在失败项')
  process.exit(1)
}
