import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const file = process.argv[2]
const data = decode_gia_file(file)

// Check n=9's unconnected pins values
const mainGraph = data.graph?.graph?.inner?.graph
const n9 = mainGraph?.nodes?.find((n: any) => n.nodeIndex === 9)
if (!n9) { console.log('n=9 not found'); process.exit(1) }

for (const pin of (n9.pins ?? [])) {
  if (pin.i1?.kind !== 3) continue
  const idx = pin.i1?.index ?? -1
  const conns = (pin.connects ?? []).length
  
  if (conns === 0 && pin.value) {
    const v = pin.value
    // Try to extract literal value
    // enum values might be in bEnum
    if (v.bEnum) {
      console.log(`n=9 InParam[${idx}]: enum = ${JSON.stringify(v.bEnum)}`)
    }
    // Try bConcreteValue
    if (v.bConcreteValue) {
      const cv = v.bConcreteValue
      console.log(`n=9 InParam[${idx}]: concrete = ${JSON.stringify(cv).substring(0, 200)}`)
    }
    const it = v.itemType
    if (it) {
      console.log(`  type = ${JSON.stringify(it).substring(0, 100)}`)
    }
    // Full dump
    console.log(`  full = ${JSON.stringify(v).substring(0, 300)}`)
    console.log()
  }
}

// Also check n=20's pins
const n20 = mainGraph?.nodes?.find((n: any) => n.nodeIndex === 20)
if (n20) {
  console.log('n=20 pins:')
  for (const pin of (n20.pins ?? [])) {
    const kind = pin.i1?.kind ?? -1
    const idx = pin.i1?.index ?? -1
    const conns = (pin.connects ?? []).map((c: any) => c.id)
    console.log(`  kind=${kind} idx=${idx} conns=[${conns}]`)
    if (conns.length === 0 && pin.value) {
      console.log(`    value = ${JSON.stringify(pin.value).substring(0, 200)}`)
    }
  }
}

// n=7 InParam[1] - the condition list - check it again
const n7 = mainGraph?.nodes?.find((n: any) => n.nodeIndex === 7)
if (n7) {
  for (const pin of (n7.pins ?? [])) {
    if (pin.i1?.kind === 3 && pin.i1?.index === 1) {
      const v = pin.value?.bConcreteValue?.value
      if (v?.bArray?.entries) {
        console.log('\nn=7 InParam[1] condition values:')
        for (let i = 0; i < v.bArray.entries.length; i++) {
          const entry = v.bArray.entries[i]
          const val = entry.bString?.val ?? entry.bInt?.val ?? entry.bFlt?.val ?? '?'
          console.log(`  [${i}] ${JSON.stringify(val)}`)
        }
      }
    }
  }
}
