// @ts-nocheck
/**
 * debug5.gia 结构复刻 — DSL raw 系统节点版，0 CompositeDefs
 *
 * 原始: /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/分支/debug5.gia (517 B)
 *
 * 目标结构 (5 个系统节点, 8 exec 边, 1 data 边, 0 CompositeDefs):
 *   n=1 When Custom Variable Changes → n=2, n=3, n=5
 *   n=2 Forwarding Event → n=4
 *   n=3 Finite Loop: body → n=4, complete → n=2, n=5
 *   n=4 Set Local Variable → n=5
 *   data: n=1.OutParam[0] → n=2.InParam[0]
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

g.server({ mode: 'beyond', type: 'entity', id: 1073741840, name: 'main', prefix: false }).on(
  'whenCustomVariableChanges',
  (e, f) => {
    const entry = f.entry()
    const forward = f.node('forwarding_event', [e.eventSourceEntity])
    const loop = f.node('finite_loop')
    const setLocal = f.node('set_local_variable')
    const print = f.node('print_string')

    f.link(entry, 0, forward)
    f.link(entry, 0, loop)
    f.link(entry, 0, print)
    f.link(forward, 0, setLocal)
    f.link(loop, 0, setLocal)
    f.link(loop, 1, forward)
    f.link(loop, 1, print)
    f.link(setLocal, 0, print)
  }
)

const doc = buildServerGraphRegistriesIRDocuments()[0]
const bytes = irToGia(doc, { graphId: 1073741840, name: 'recreate_debug5', protoPath: PROTO_PATH })
const outPath = `${OUT_DIR}/recreate_debug5.gia`
writeFileSync(outPath, Buffer.from(bytes))
console.log(`\n✅ 已生成: ${outPath}  (${bytes.length} 字节)`)

const gen = decode_gia_file(outPath, PROTO_PATH)
const accs = gen.accessories ?? []
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
        outFlowConnections.push({ from: n.nodeIndex, to: c.id, outIdx: p.i1?.index })
      })
    }
    if (p.i1?.kind === 3) dataEdges += (p.connects ?? []).length
  })
})

const nodeIds = mainNodes.map((n) => n.genericId?.nodeId)

console.log('\n═══ 结构验证 ═══')
console.log('  exec 边详情:')
outFlowConnections.forEach((c) => console.log(`    n=${c.from}.OutFlow[${c.outIdx}] → n=${c.to}`))
check(
  `CompositeDefs = 0 (实际 ${accs.filter((a) => a.which === 12).length})`,
  accs.filter((a) => a.which === 12).length === 0
)
check(`主图节点 = 5 (实际 ${mainNodes.length})`, mainNodes.length === 5)
check(
  `系统节点 nid = [36,190,5,19,1] (实际 ${JSON.stringify(nodeIds)})`,
  JSON.stringify(nodeIds) === JSON.stringify([36, 190, 5, 19, 1])
)
check(`exec 边 = 8 (实际 ${execEdges})`, execEdges === 8)
check(`data 边 = 1 (实际 ${dataEdges})`, dataEdges === 1)

if (ok) {
  console.log('\n🏆 验证通过 (系统节点结构复刻)')
} else {
  console.log('\n💥 部分失败')
  process.exit(1)
}
