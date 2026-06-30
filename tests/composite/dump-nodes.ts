// @ts-nocheck 临时调试脚本
import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const FILE = process.argv[2] ?? './tests/composite/output/basic_call.gia'

const data = decode_gia_file(FILE)
const mainGraph = data.graph?.graph?.inner?.graph
console.log("=== Main graph nodes ===")
for (const n of mainGraph?.nodes ?? []) {
  const gk = n.genericId?.kind
  const gn = n.genericId?.nodeId
  console.log(`  nodeIndex=${n.nodeIndex} genericId: kind=${gk} nodeId=${gn} pins=${n.pins?.length}`)
}

console.log()
for (let i = 0; i < (data.accessories?.length ?? 0); i++) {
  const acc = data.accessories[i]
  const def = acc.compositeDef?.inner?.def
  const implGraph = acc.implGraph?.inner?.graph ?? acc.graph?.inner?.graph
  if (implGraph?.nodes) {
    console.log(`=== Accessory[${i}] "${def?.name}" impl graph nodes ===`)
    for (const n of implGraph.nodes) {
      const gk = n.genericId?.kind
      const gn = n.genericId?.nodeId
      console.log(`  nodeIndex=${n.nodeIndex} genericId: kind=${gk} nodeId=${gn} pins=${n.pins?.length}`)
    }
  }
}
