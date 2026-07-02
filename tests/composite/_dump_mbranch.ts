import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const file = process.argv[2]
const data = decode_gia_file(file)

const mainGraph = data.graph?.graph?.inner?.graph
const n7 = mainGraph?.nodes?.find((n: any) => n.nodeIndex === 7)
if (!n7) { console.log('n=7 not found'); process.exit(1) }

console.log('n=7  Multiple Branches')
console.log('pins count:', n7.pins?.length ?? 0)
console.log()

for (let i = 0; i < (n7.pins?.length ?? 0); i++) {
  const pin = n7.pins[i]
  const kind = pin.i1?.kind ?? -1
  const idx = pin.i1?.index ?? -1
  const conns = (pin.connects ?? []).map((c: any) => c.id)
  const kindName = ['?','InFlow','OutFlow','InParam','OutParam','InSignal'][kind] ?? `k=${kind}`

  console.log(`Pin[${i}]: ${kindName}[${idx}]`)
  console.log(`   connects: [${conns.join(', ')}]`)

  // Full value dump
  const v = pin.value
  if (v) {
    console.log(`   value: ${JSON.stringify(v, null, 2)}`)
  }
  console.log()
}

// Also check n=7's inputs/outputs from pin records
console.log('---')
console.log('Also check: does the graph have concretes/values?')
console.log('graphValues count:', mainGraph?.graphValues?.length ?? 0)

// Check if concretes are referenced somewhere in graph
const gv = mainGraph?.graphValues ?? []
for (const v of gv) {
  console.log(`  graphValue: name="${v.name}" type=${v.type} values=${JSON.stringify(v.values).substring(0, 60)}`)
}
