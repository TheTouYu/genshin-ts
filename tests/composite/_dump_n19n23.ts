import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const file = process.argv[2]
const data = decode_gia_file(file)

const mainGraph = data.graph?.graph?.inner?.graph
const nodes = mainGraph?.nodes ?? []

for (const idx of [19, 23]) {
  const n = nodes.find((nn: any) => nn.nodeIndex === idx)
  if (!n) continue
  console.log(`n=${idx} pins (${n.pins?.length ?? 0}):`)
  for (const pin of n.pins ?? []) {
    const kind = pin.i1?.kind ?? pin.i2?.kind ?? -1
    const idx2 = pin.i1?.index ?? pin.i2?.index ?? -1
    const conns = (pin.connects ?? []).map((c: any) => `id=${c.id}`).join(', ')
    const kindName = ['?','InFlow','OutFlow','InParam','OutParam','InSignal'][kind] ?? `k=${kind}`
    let valStr = ''
    if (pin.value?.bConcreteValue?.value?.bString?.val) {
      valStr = `  val="${pin.value.bConcreteValue.value.bString.val}"`
    }
    console.log(`  ${kindName}[${idx2}]  conns=[${conns}]${valStr}`)
    // Full pin dump
    if (conns) {
      for (const c of pin.connects ?? []) {
        console.log(`    connect: ${JSON.stringify(c).substring(0, 150)}`)
      }
    }
  }
  console.log()
}

// Also check n=1's pins again (it showed 0 earlier, but maybe it connects somehow)
const n1 = nodes.find((nn: any) => nn.nodeIndex === 1)
if (n1) {
  console.log(`n=1 pins (${n1.pins?.length ?? 0}):`)
  for (const pin of n1.pins ?? []) {
    console.log(`  ${JSON.stringify(pin).substring(0, 200)}`)
  }
}
