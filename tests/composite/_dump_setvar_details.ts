import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const file = process.argv[2]
const data = decode_gia_file(file)

const mainGraph = data.graph?.graph?.inner?.graph
const nodes = mainGraph?.nodes ?? []
const nodeMap = new Map<number, any>()
for (const n of nodes) nodeMap.set(n.nodeIndex, n)

// Dump FULL pin data for Set Node Graph Variable nodes
console.log('=== Full pin dump for Set Node Graph Variable nodes ===')
for (const idx of [41, 45, 46, 47, 48]) {
  const n = nodeMap.get(idx)
  if (!n) continue
  console.log(`n=${idx}:`)
  for (let pi = 0; pi < (n.pins ?? []).length; pi++) {
    const pin = n.pins[pi]
    const i1 = pin.i1 ? `i1={kind:${pin.i1.kind}, idx:${pin.i1.index}}` : ''
    const i2 = pin.i2 ? `i2={kind:${pin.i2.kind}, idx:${pin.i2.index}}` : ''
    const rawConns = JSON.stringify(pin.connects ?? []).substring(0, 200)
    const rawVal = JSON.stringify(pin.value ?? '').substring(0, 100)
    console.log(`  pin[${pi}] ${i1} ${i2}`)
    console.log(`    connects=${rawConns}`)
    console.log(`    value=${rawVal}`)
  }
  console.log()
}

// Also check graphValues for variable definitions
console.log()
console.log('=== GraphValues (variable definitions) ===')
for (const gv of mainGraph?.graphValues ?? []) {
  const name = gv.name ?? '(unnamed)'
  const type = gv.type ?? '?'
  console.log(`  name="${name}"  type=${type}  structId=${gv.structId ?? 0}`)
}

// And check what variable names the Set Node Graph Variable nodes reference
// InParam[0] could be connected to a constant node that defines the variable name/ID
console.log()
console.log('=== All connections to/from Set Node Graph Variable nodes ===')
for (const n of nodes) {
  if (![41, 45, 46, 47, 48].includes(n.nodeIndex)) continue
  for (const pin of n.pins ?? []) {
    const kind = pin.i1?.kind ?? -1
    const idx = pin.i1?.index ?? -1
    for (const conn of pin.connects ?? []) {
      if (kind === 3) { // InParam — data flows TO this node
        console.log(`n=${n.nodeIndex} InParam[${idx}] ← n=${conn.id}`)
      }
    }
  }
}
