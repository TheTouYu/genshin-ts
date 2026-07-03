import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const file = process.argv[2]
const data = decode_gia_file(file)
const mainGraph = data.graph?.graph?.inner?.graph
const nodes = mainGraph?.nodes ?? []

// Show ALL pins for nodes 41,45,46,47,48
for (const idx of [41, 45, 46, 47, 48]) {
  const n = nodes.find((nn: any) => nn.nodeIndex === idx)
  if (!n) continue
  console.log(`n=${idx}  (x=${n.x.toFixed(0)}, y=${n.y.toFixed(0)})`)
  console.log(`  genericId: ${JSON.stringify(n.genericId)}`)
  
  for (const pin of n.pins ?? []) {
    const kind = pin.i1?.kind ?? -1
    const pIdx = pin.i1?.index ?? -1
    const kindName = ['?','InFlow','OutFlow','InParam','OutParam','InSignal'][kind] ?? `k=${kind}`
    const conns = (pin.connects ?? []).map((c: any) => c.id)
    
    console.log(`  ${kindName}[${pIdx}]  conns=[${conns}]`)
    
    if (pin.value) {
      // Find the actual float value in the nested structure
      const search = (obj: any, depth = 0): string => {
        if (!obj || depth > 5) return ''
        if (obj.bFloat?.val != null) return `bFloat=${obj.bFloat.val}`
        if (obj.bInt?.val != null) return `bInt=${obj.bInt.val}`
        if (obj.bString?.val != null) return `bString="${obj.bString.val}"`
        if (obj.bBool?.val != null) return `bBool=${obj.bBool.val}`
        if (obj.bEnum?.val != null) return `bEnum=${obj.bEnum.val}`
        if (Array.isArray(obj.entries)) return `entries[${obj.entries.length}]`
        // recurse into first child
        for (const key of Object.keys(obj)) {
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            const r = search(obj[key], depth + 1)
            if (r) return r
          }
        }
        return ''
      }
      const found = search(pin.value)
      const fullStr = JSON.stringify(pin.value).substring(0, 300)
      console.log(`    value: ${found || fullStr}`)
    }
  }
  console.log()
}

// Also check if the graph has a concrete values table
console.log('=== graph graphValues ===')
for (const gv of mainGraph?.graphValues ?? []) {
  console.log(`  "${gv.name}" type=${gv.type}  values=${JSON.stringify(gv.values).substring(0, 100)}`)
}
