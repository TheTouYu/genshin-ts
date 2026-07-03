// @ts-nocheck 调试：dump 所有 GIA 节点坐标
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const FILE = process.argv[2] ?? './tests/composite/output/basic_call.gia'
const data = decode_gia_file(FILE)
const mainGraph = data.graph?.graph?.inner?.graph
console.log("=== Main graph nodes ===")
for (const n of mainGraph?.nodes ?? []) {
  const gk = n.genericId?.kind; const gn = n.genericId?.nodeId
  const x = String(Math.round(n.x ?? 0)).padStart(6, ' '); const y = String(Math.round(n.y ?? 0)).padStart(6, ' ')
  console.log(`  nIdx=${String(n.nodeIndex).padStart(2, ' ')} kind=${gk} nid=${String(gn).padStart(11, ' ')} (${x}, ${y})`)
}
for (let i = 0; i < (data.accessories?.length ?? 0); i++) {
  const acc = data.accessories[i]
  const def = acc.compositeDef?.inner?.def
  const implGraph = acc.implGraph?.inner?.graph ?? acc.graph?.inner?.graph
  if (implGraph?.nodes?.length) {
    console.log(`\n=== Acc[${i}] "${def?.name ?? '?'}" (${implGraph.nodes.length} nodes) ===`)
    for (const n of implGraph.nodes) {
      const gk = n.genericId?.kind; const gn = n.genericId?.nodeId
      const x = String(Math.round(n.x ?? 0)).padStart(6, ' '); const y = String(Math.round(n.y ?? 0)).padStart(6, ' ')
      console.log(`  nIdx=${String(n.nodeIndex).padStart(2, ' ')} kind=${gk} nid=${String(gn).padStart(11, ' ')} (${x}, ${y})`)
    }
  }
}
