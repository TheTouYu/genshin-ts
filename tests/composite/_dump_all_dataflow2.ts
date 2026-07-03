import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { NODE_PIN_RECORDS } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'
const file = process.argv[2]
const data = decode_gia_file(file)
const g = data.graph?.graph?.inner?.graph
if (!g) process.exit(1)

// Check if any node has more than 1 data input (multiple hops would need chained consumers)
const withIn = g.nodes.filter((n: any) => n.pins?.some((p: any) => p.i1?.kind === 3 && p.connects?.length > 0))
const alsoProducer = new Set<number>()
for (const n of g.nodes) {
  for (const pin of n.pins ?? []) {
    if (pin.i1?.kind !== 3) continue
    for (const c of pin.connects ?? []) alsoProducer.add(c.id)
  }
}
// Nodes that consume data AND have their data consumed by others
for (const n of withIn) {
  if (alsoProducer.has(n.nodeIndex)) {
    // Check what they consume
    for (const pin of n.pins ?? []) {
      if (pin.i1?.kind !== 3) continue
      for (const c of pin.connects ?? []) {
        const src = g.nodes.find((nn: any) => nn.nodeIndex === c.id)
        const srcName = src ? (nameMap.get(src.genericId?.nodeId) ?? `nid=${src.genericId?.nodeId}`) : '?'
        console.log(`  n=${n.nodeIndex} ${nameMap.get(n.genericId?.nodeId) ?? ''} ← n=${c.id} ${srcName}`)
      }
    }
  }
}
