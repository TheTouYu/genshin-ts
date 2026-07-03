#!/usr/bin/env npx tsx
/**
 * Debug: dump graph structure keys and values
 */
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const file = process.argv[2]
const data = decode_gia_file(file)

// Check acc[77] (impl graph for 计算分力)
const acc = data.accessories[77]
console.log(`acc[77] id=${acc.id?.id}`)
console.log(`Acc keys: ${Object.keys(acc)}`)
console.log(`Has graph: ${!!acc.graph}`)

if (acc.graph) {
  console.log(`Graph keys: ${Object.keys(acc.graph)}`)
  console.log(`graph:`, JSON.stringify(acc.graph, null, 2).substring(0, 2000))
}

// Also check acc[1] which is the impl graph for Update
const acc1 = data.accessories[1]
console.log(`\n\nacc[1] id=${acc1.id?.id}`)
console.log(`Has graph: ${!!acc1.graph}`)
if (acc1.graph) {
  console.log(`Graph keys: ${Object.keys(acc1.graph)}`)
  console.log(`graph:`, JSON.stringify(acc1.graph, null, 2).substring(0, 2000))
}
