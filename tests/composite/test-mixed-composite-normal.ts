// @ts-nocheck
/**
 * 混合图测试：双 exec 复合 + 普通节点连线
 * 验证 event fork 到复合节点，同时普通节点的串行 exec flow 不受影响
 *
 * 图结构:
 *   event ─┬→ composite1 (打印"第一步")
 *           ├→ composite2 (打印"第二步")
 *           └→ printString("普通起点") → printString("普通终点")
 *
 * 验证点:
 *   1. event OutFlow fork 到两个 exec 复合 + 第一个普通 exec 节点
 *   2. 普通 exec 节点之间的串行连线正常 (printString → printString)
 *   3. 复合节点无 OutFlow，普通节点正常保留 OutFlow
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { writeFileSync } from 'fs'

const PROTO_PATH = new URL('../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const OUT_DIR = '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'

// ── 复合1: exec-only ──
const comp1 = g.defineComposite('复合第一步', {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    f.printString('复合内-第一步')
    return {}
  }
})

// ── 复合2: exec-only ──
const comp2 = g.defineComposite('复合第二步', {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    f.printString('复合内-第二步')
    return {}
  }
})

console.log('comp1 id:', comp1.id, 'comp2 id:', comp2.id)

// ── 捕获预处理 ──
g.server({ name: 'trigger' }).on('whenEntityIsCreated', (_e: any, f: any) => {})
buildServerGraphRegistriesIRDocuments({ defaultName: 'trigger' })

// ── 主图：复合 + 普通节点混合 ──
g.server({ name: 'main', graphId: 1073741872 })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    f.callComposite(comp1, {})
    f.callComposite(comp2, {})
    f.printString('普通起点')
    f.printString('普通终点')
  })

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]
console.log('IR nodes:', doc.nodes?.length)
doc.nodes?.forEach((n: any) => console.log('  type=' + n.type + ' id=' + n.id + ' next=' + JSON.stringify(n.next)))

const bytes = irToGia(doc, { graphId: 1073741872, name: 'mixed_composite_and_normal', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/mixed_composite_and_normal.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)

// ── 结构验证 ──
const gen = decode_gia_file(outPath, PROTO_PATH)
const mainNodes = gen.graph?.graph?.inner?.graph?.nodes ?? []
console.log('\n══════ 主图结构 ══════')
let eventNode: any = null
const compNodes: any[] = []
const normalNodes: any[] = []
mainNodes.forEach((n: any) => {
  const k = n.genericId?.kind
  const tag = k === 22000 ? 'event' : k === 22001 ? 'composite' : 'normal'
  console.log(`  node[${n.nodeIndex}] ${tag}: kind=${k} nodeId=${n.genericId?.nodeId} pins=${n.pins?.length ?? 0}`)
  n.pins?.forEach((p: any, j: number) => {
    const conns = (p.connects ?? []).map((c: any) => `→node${c.id}(${c.connect?.kind}:${c.connect?.index})`)
    const kname = {1:'InFlow',2:'OutFlow',3:'InParam',4:'OutParam'}[p.i1?.kind] ?? '?'
    console.log(`    pin[${j}] ${kname}: idx=${p.i1?.index} connects=${JSON.stringify(conns)}`)
  })
  if (k === 22000 && n.genericId?.nodeId === 71) eventNode = n
  else if (k === 22001) compNodes.push(n)
  else normalNodes.push(n)
})

let ok = true

// 验证 1: 非终端复合链 — event → comp1 → comp2 → printString_1 → printString_2
console.log('\n── 验证 ──')
const outFlowPin = eventNode?.pins?.find((p: any) => p.i1?.kind === 2)
const targets = outFlowPin?.connects?.map((c: any) => c.id) ?? []
if (targets.length === 1 && targets[0] === compNodes[0]?.nodeIndex) {
  console.log(`  ✅ event OutFlow → [${targets.join(',')}] (仅链头复合)`)
} else {
  console.log(`  ❌ event OutFlow → [${targets.join(',')}]  期望 → [${compNodes[0]?.nodeIndex}]`)
  ok = false
}

// 验证 2: comp1 非终端 → comp2
const c1Out = compNodes[0]?.pins?.find((p: any) => p.i1?.kind === 2)
if (c1Out?.connects?.[0]?.id === compNodes[1]?.nodeIndex) {
  console.log(`  ✅ comp1[${compNodes[0].nodeIndex}] OutFlow → comp2[${compNodes[1].nodeIndex}]`)
} else {
  console.log(`  ❌ comp1 OutFlow 未连到 comp2`)
  ok = false
}

// 验证 3: comp2 非终端 → printString_1
const c2Out = compNodes[1]?.pins?.find((p: any) => p.i1?.kind === 2)
if (c2Out?.connects?.[0]?.id === normalNodes[0]?.nodeIndex) {
  console.log(`  ✅ comp2[${compNodes[1].nodeIndex}] OutFlow → printString[${normalNodes[0].nodeIndex}]`)
} else {
  console.log(`  ❌ comp2 OutFlow 未连到 printString`)
  ok = false
}

// 验证 4: 普通节点串行连线正常
let normalFlowOk = true
for (let i = 0; i < normalNodes.length - 1; i++) {
  const curr = normalNodes[i]
  const next = normalNodes[i + 1]
  const outFlow = curr.pins?.find((p: any) => p.i1?.kind === 2)
  const nextTarget = outFlow?.connects?.[0]?.id
  if (nextTarget === next.nodeIndex) {
    console.log(`  ✅ printString[${curr.nodeIndex}] → printString[${next.nodeIndex}]`)
  } else {
    console.log(`  ❌ printString[${curr.nodeIndex}] 未连到 printString[${next.nodeIndex}] (实际: →${nextTarget})`)
    normalFlowOk = false
    ok = false
  }
}
if (normalFlowOk) console.log('  ✅ 普通节点串行连线正常')

// 验证 5: accessories
const accs = gen.accessories ?? []
console.log(`\n  accessories: ${accs.length}`)
accs.forEach((a: any) => {
  if (a.which === 12) {
    const d = a.compositeDef?.inner?.def
    console.log(`  CompositeDef: ${d?.name} inflows=${d?.inflows?.length} outflows=${d?.outflows?.length}`)
    if (d?.outflows?.length !== 1) { console.log(`  ❌ outflows!=1`); ok = false }
  }
  if (a.which === 9 && a.graph) {
    const g = a.graph?.inner?.graph
    if (g?.compositePins?.length !== 2) { console.log(`  ❌ compositePins!=2`); ok = false }
  }
})

if (ok) {
  console.log('\n🏆 全部验证通过')
} else {
  console.log('\n💥 存在失败项')
  process.exit(1)
}
