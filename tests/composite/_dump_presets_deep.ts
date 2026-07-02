import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const file = process.argv[2]
const data = decode_gia_file(file)
const mainGraph = data.graph?.graph?.inner?.graph
const nodes = mainGraph?.nodes ?? []

for (const idx of [11, 12, 29]) {
  const n = nodes.find((nn: any) => nn.nodeIndex === idx)
  if (!n) continue
  console.log(`n=${idx} pins (${n.pins?.length ?? 0}):`)
  for (const pin of n.pins ?? []) {
    const kind = pin.i1?.kind ?? -1
    const pIdx = pin.i1?.index ?? -1
    const kindName = ['?','InFlow','OutFlow','InParam','OutParam','InSignal'][kind] ?? `k=${kind}`
    const conns = (pin.connects ?? []).map((c: any) => c.id)
    
    console.log(`  ${kindName}[${pIdx}] conns=[${conns}]`)
    
    if (pin.value) {
      const full = JSON.stringify(pin.value, null, 2)
      console.log(full)
    }
    console.log()
  }
  console.log('---')
}
