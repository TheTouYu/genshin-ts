// @ts-nocheck
/**
 * 简单参考 case 对比测试
 * 对比 user_ref_basic_call.gia（游戏导出的 exec-only 复合）与生成 GIA 的结构差异
 */
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { str } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { writeFileSync } from 'fs'

const PROTO_PATH = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
const REF_PATH = '/tmp/composite-game-demo/user_ref_basic_call.gia'
const OUT_DIR = '/tmp/composite-test-output/simple-ref'

import { mkdirSync } from 'fs'
try { mkdirSync(OUT_DIR, { recursive: true }) } catch {}

// ── 定义简单 exec-only 复合（模拟参考结构） ──
const simpleHandle = g.defineComposite('简单复合', {
  inputs: {},
  outputs: {},
  build(_inputs: any, f: any) {
    f.printString('测试')
    return {}
  }
})
console.log('composite id:', simpleHandle.id)

// ── 主图 ──
g.server({ name: 'main', graphId: 1073741828 })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    f.callComposite(simpleHandle, {})
  })

// ── 生成 GIA ──
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'main' })
const doc = docs[docs.length - 1]
console.log('IR nodes:', doc.nodes?.length)
console.log('compositeDefs:', (doc as any).compositeDefs?.length ?? 0)

const genBytes = irToGia(doc, { graphId: 1073741828, name: 'basic_call', protoPath: PROTO_PATH })
const genPath = `${OUT_DIR}/basic_call.gia`
writeFileSync(genPath, Buffer.from(genBytes))
console.log('Generated:', genPath, `(${genBytes.length} bytes)`)

// ── 解码对比 ──
const ref = decode_gia_file(REF_PATH, PROTO_PATH)
const gen = decode_gia_file(genPath, PROTO_PATH)

console.log('\n══════ 结构对比 ══════\n')

// Main graph
console.log('── 主图 ──')
console.log('  graph.which:', ref.graph?.which, 'vs', gen.graph?.which, ref.graph?.which === gen.graph?.which ? '✅' : '❌')
console.log('  graph.name:', JSON.stringify(ref.graph?.name), 'vs', JSON.stringify(gen.graph?.name))
console.log('  relatedIds:', ref.graph?.relatedIds?.length ?? 0, 'vs', gen.graph?.relatedIds?.length ?? 0)
const refNodes = ref.graph?.graph?.inner?.graph?.nodes ?? []
const genNodes = gen.graph?.graph?.inner?.graph?.nodes ?? []
console.log('  主图节点数:', refNodes.length, 'vs', genNodes.length)

for (let i = 0; i < Math.max(refNodes.length, genNodes.length); i++) {
  const rn = refNodes[i]
  const gn = genNodes[i]
  console.log(`\n  节点[${i}]:`)
  if (rn && gn) {
    console.log(`    genericId.kind: ${rn.genericId?.kind} vs ${gn.genericId?.kind} ${rn.genericId?.kind === gn.genericId?.kind ? '✅' : '❌'}`)
    console.log(`    genericId.nodeId: ${rn.genericId?.nodeId} vs ${gn.genericId?.nodeId}`)
    console.log(`    pins count: ${rn.pins?.length ?? 0} vs ${gn.pins?.length ?? 0}`)
    if (rn.pins?.length > 0 && gn.pins?.length > 0) {
      const rp0 = rn.pins[0]
      const gp0 = gn.pins[0]
      console.log(`    pin[0].kind: ${rp0.i1?.kind} vs ${gp0.i1?.kind} ${rp0.i1?.kind === gp0.i1?.kind ? '✅' : '❌'}`)
      console.log(`    pin[0].connects: ${rp0.connects?.length ?? 0} vs ${gp0.connects?.length ?? 0}`)
    }
  } else {
    console.log('    ❌ missing node')
  }
}

// Accessories
console.log('\n── Accessories ──')
const refAccs = ref.accessories ?? []
const genAccs = gen.accessories ?? []
console.log('  count:', refAccs.length, 'vs', genAccs.length)

for (let i = 0; i < Math.max(refAccs.length, genAccs.length); i++) {
  const ra = refAccs[i]
  const ga = genAccs[i]
  console.log(`\n  acc[${i}]:`)
  if (ra && ga) {
    console.log(`    which: ${ra.which} vs ${ga.which} ${ra.which === ga.which ? '✅' : '❌'}`)
    console.log(`    id.class: ${ra.id?.class} vs ${ga.id?.class} ${ra.id?.class === ga.id?.class ? '✅' : '❌'}`)
    console.log(`    relatedIds: ${ra.relatedIds?.length ?? 0} vs ${ga.relatedIds?.length ?? 0}`)

    if (ra.which === 12) { // CompositeDef
      const rd = ra.compositeDef?.inner?.def
      const gd = ga.compositeDef?.inner?.def
      if (rd && gd) {
        console.log(`    xxx: ${rd.xxx} vs ${gd.xxx} ${rd.xxx === gd.xxx ? '✅' : '❌'}`)
        console.log(`    inflows: ${rd.inflows?.length ?? 0} vs ${gd.inflows?.length ?? 0}`)
        if (rd.inflows?.[0] && gd.inflows?.[0]) {
          console.log(`    inflows[0].pinIndex: ${rd.inflows[0].pinIndex} vs ${gd.inflows[0].pinIndex}`)
        }
        console.log(`    graphId.class: ${rd.id?.graphId?.class} vs ${gd.id?.graphId?.class} ${rd.id?.graphId?.class === gd.id?.graphId?.class ? '✅' : '❌'}`)
        console.log(`    graphId.kind: ${rd.id?.graphId?.kind} vs ${gd.id?.graphId?.kind} ${rd.id?.graphId?.kind === gd.id?.graphId?.kind ? '✅' : '❌'}`)
      }
    }

    if (ra.which === 9 && ra.graph) { // impl graph
      const rn = ra.graph?.inner?.graph?.nodes ?? []
      const gn = ga.graph?.inner?.graph?.nodes ?? []
      console.log(`    impl nodes: ${rn.length} vs ${gn.length}`)
      console.log(`    compositePins: ${ra.graph?.inner?.graph?.compositePins?.length ?? 0} vs ${ga.graph?.inner?.graph?.compositePins?.length ?? 0}`)
      console.log(`    inner graph kind: ${ra.graph?.inner?.graph?.id?.kind} vs ${ga.graph?.inner?.graph?.id?.kind} ${ra.graph?.inner?.graph?.id?.kind === ga.graph?.inner?.graph?.id?.kind ? '✅' : '❌'}`)

      if (rn.length > 0 && gn.length > 0) {
        const rn0 = rn[0]
        const gn0 = gn[0]
        console.log(`    node[0].genericId.kind: ${rn0.genericId?.kind} vs ${gn0.genericId?.kind}`)
        console.log(`    node[0].genericId.nodeId: ${rn0.genericId?.nodeId} vs ${gn0.genericId?.nodeId}`)
        console.log(`    node[0].concreteId: ${rn0.concreteId ? 'YES' : 'NO'} vs ${gn0.concreteId ? 'YES' : 'NO'}`)
        console.log(`    node[0].pins count: ${rn0.pins?.length ?? 0} vs ${gn0.pins?.length ?? 0}`)
        if (rn0.pins?.[0] && gn0.pins?.[0]) {
          console.log(`    node[0].pin[0].kind: ${rn0.pins[0].i1?.kind} vs ${gn0.pins[0].i1?.kind} ${rn0.pins[0].i1?.kind === gn0.pins[0].i1?.kind ? '✅' : '❌'}`)
          console.log(`    node[0].pin[0].type: ${rn0.pins[0].type} vs ${gn0.pins[0].type} ${rn0.pins[0].type === gn0.pins[0].type ? '✅' : '❌'}`)
        }
      }
    }
  } else {
    console.log('    ❌ missing accessory')
  }
}

// 连线检查
console.log('\n── 连线检查 ──')
const mainNodes = gen.graph?.graph?.inner?.graph?.nodes ?? []
for (const node of mainNodes) {
  if (node.genericId?.kind === 22001) {
    console.log('  ✅ 主图中有 SysGraph(kind=22001) 复合调用节点')
  }
  for (const pin of node.pins ?? []) {
    if (pin.i1?.kind === 2 && (pin.connects?.length ?? 0) > 0) { // OutFlow with connection
      for (const conn of pin.connects ?? []) {
        console.log(`  OutFlow: node${node.nodeIndex} → node${conn.id} (kind=${conn.connect?.kind}, index=${conn.connect?.index})`)
      }
    }
  }
}
