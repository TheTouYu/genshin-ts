#!/usr/bin/env npx tsx
/**
 * Ultra debug: dump raw node/pin/edge structure for one composite
 */
import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const file = process.argv[2]
const data = decode_gia_file(file)

// Find 计算分力 (acc[76])
const targetIdx = 76
const acc = data.accessories[targetIdx]
console.log(`acc[${targetIdx}] id=${acc.id?.id}`)
console.log(`def name: ${acc.compositeDef?.inner?.def?.name}`)
console.log(`relatedIds: ${JSON.stringify(acc.relatedIds?.map((r: any) => r.id))}`)

// Impl graph should be relatedIds[0]
const implId = acc.relatedIds?.[0]?.id
console.log(`\nLooking for impl graph with id=${implId}`)

let implAcc = null
for (let i = 0; i < (data.accessories?.length ?? 0); i++) {
  if (data.accessories[i].id?.id === implId) {
    implAcc = data.accessories[i]
    console.log(`Found at acc[${i}]`)
    break
  }
}

if (!implAcc) {
  console.log(`Impl graph not found!`)
  process.exit(1)
}

const graph = implAcc.graph
if (!graph) {
  console.log(`No graph field!`)
  console.log(`Keys: ${Object.keys(implAcc)}`)
  process.exit(1)
}

console.log(`\nGraph nodes: ${graph.nodes?.length ?? 0}`)
console.log(`Graph edges: ${graph.edges?.length ?? 0}`)
console.log(`Graph compositePins: ${graph.compositePins?.length ?? 0}`)

// Show all edges raw
console.log(`\nRAW EDGES:`)
for (let i = 0; i < (graph.edges?.length ?? 0); i++) {
  const e = graph.edges[i]
  console.log(`  edge[${i}]: ${JSON.stringify(e)}`)
}

// Show one node with pins
console.log(`\nSAMPLE NODE STRUCTURE:`)
const n = graph.nodes[0]
console.log(`  Keys: ${Object.keys(n)}`)
console.log(`  nodeIndex: ${n.nodeIndex}`)
console.log(`  genericId: ${JSON.stringify(n.genericId)}`)
console.log(`  pins: ${JSON.stringify(n.pins?.length ?? 0)}`)

if (n.pins?.length > 0) {
  console.log(`  first pin: ${JSON.stringify(n.pins[0])}`)
  console.log(`  pin keys: ${Object.keys(n.pins[0])}`)
}

// Check edge connection keys
console.log(`\nCONNECTION CHECK:`)
const e = graph.edges[0]
const key = `${e.toNodeIndex}:${e.toPinIndex}`
console.log(`First edge key: "${key}"`)

// Check if any node has matching pin
const tgtNode = graph.nodes.find((node: any) => (node.nodeIndex ?? graph.nodes.indexOf(node)) === e.toNodeIndex)
if (tgtNode) {
  const hasPin = tgtNode.pins?.some((p: any) => {
    const kind = p.kind ?? p.pinKind ?? p.pin_type
    const idx = p.index ?? p.pinIndex ?? p.pin_index
    const match = (idx === e.toPinIndex)
    if (match) console.log(`  Pin kind=${kind} index=${idx} matches edge toPinIndex`)
    return match
  })
  console.log(`  Pin found: ${hasPin}`)
}
