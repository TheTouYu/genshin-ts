import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { NODE_PIN_RECORDS } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'
import { NODE_ID } from '../../dist/src/compiler/gia_vendor.js'

const file = process.argv[2]
const data = decode_gia_file(file)

const mainGraph = data.graph?.graph?.inner?.graph
const nodes = mainGraph?.nodes ?? []
const nodeMap = new Map<number, any>()
for (const n of nodes) nodeMap.set(n.nodeIndex, n)

// Dump all pins of a specific node
function dumpPins(n: any): void {
  console.log(`Node n=${n.nodeIndex} pins (${n.pins?.length ?? 0} total):`)
  for (const pin of n.pins ?? []) {
    const i1 = pin.i1 ? `i1={kind=${pin.i1.kind}, idx=${pin.i1.index}}` : 'i1=null'
    const i2 = pin.i2 ? `i2={kind=${pin.i2.kind}, idx=${pin.i2.index}}` : 'i2=null'
    const conns = (pin.connects ?? []).map((c: any) => `→${c.id}`).join(', ')
    const valStr = pin.value ? JSON.stringify(pin.value).substring(0, 80) : ''
    console.log(`  ${i1} ${i2}  conns=[${conns}]  val=${valStr}`)
  }
}

// Check nodes: 1, 2, 7, 8
for (const idx of [1, 2, 7, 8]) {
  const n = nodeMap.get(idx)
  if (!n) continue
  dumpPins(n)
  console.log('---')
}
