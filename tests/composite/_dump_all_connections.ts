import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const file = process.argv[2]
const data = decode_gia_file(file)

const mainGraph = data.graph?.graph?.inner?.graph
const nodes = mainGraph?.nodes ?? []
const nodeMap = new Map<number, any>()
for (const n of nodes) nodeMap.set(n.nodeIndex, n)

// For each node, dump all outgoing connections
console.log('=== All OutFlow connections (kind=2) ===')
for (const n of nodes) {
  for (const pin of n.pins ?? []) {
    if (pin.i1?.kind !== 2) continue
    const idx = pin.i1?.index ?? -1
    for (const conn of pin.connects ?? []) {
      console.log(`n=${n.nodeIndex} OutFlow[${idx}] → n=${conn.id}`)
    }
  }
}

console.log()
console.log('=== All InParam connections (kind=3) ===')
for (const n of nodes) {
  for (const pin of n.pins ?? []) {
    if (pin.i1?.kind !== 3) continue
    const idx = pin.i1?.index ?? -1
    for (const conn of pin.connects ?? []) {
      console.log(`n=${n.nodeIndex} InParam[${idx}] ← n=${conn.id}`)
    }
  }
}

console.log()
console.log('=== OutParam connections (kind=4) ===')
for (const n of nodes) {
  for (const pin of n.pins ?? []) {
    if (pin.i1?.kind !== 4) continue
    const idx = pin.i1?.index ?? -1
    for (const conn of pin.connects ?? []) {
      console.log(`n=${n.nodeIndex} OutParam[${idx}] → n=${conn.id}`)
    }
  }
}

console.log()
console.log('=== Pins with kind not 2/3/4 ===')
for (const n of nodes) {
  for (const pin of n.pins ?? []) {
    const kind = pin.i1?.kind ?? pin.i2?.kind ?? -1
    if (kind >= 2 && kind <= 4) continue
    const idx = pin.i1?.index ?? pin.i2?.index ?? -1
    const connStr = (pin.connects ?? []).map((c: any) => `→${c.id}`).join(',')
    console.log(`n=${n.nodeIndex} kind=${kind}[${idx}] conns=[${connStr}]`)
  }
}
