import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const file = process.argv[2]
const data = decode_gia_file(file)

const mainGraph = data.graph?.graph?.inner?.graph
const nodes = mainGraph?.nodes ?? []
const nodeMap = new Map<number, any>()
for (const n of nodes) nodeMap.set(n.nodeIndex, n)

for (const idx of [41, 45, 46, 47, 48]) {
  const n = nodeMap.get(idx)
  if (!n) continue
  console.log(`n=${idx}:`)
  console.log(`  usingStruct: ${JSON.stringify(n.usingStruct)}`)
  console.log(`  extra fields: ${Object.keys(n).filter(k => !['nodeIndex','genericId','concreteId','x','y','pins','usingStruct'].includes(k)).join(', ')}`)
  // Full raw value for InParam[0]
  const pin0 = n.pins?.[0]
  if (pin0) {
    console.log(`  InParam[0] raw value: ${JSON.stringify(pin0.value, null, 2).substring(0, 500)}`)
  }
  const pin1 = n.pins?.[1]
  if (pin1) {
    console.log(`  InParam[1] raw value: ${JSON.stringify(pin1.value, null, 2).substring(0, 200)}`)
  }
  console.log()
}

// Also check: what is the variable map in graph values more clearly
console.log('=== GraphValues with full details ===')
for (const gv of mainGraph?.graphValues ?? []) {
  console.log(`name="${gv.name}" type=${gv.type} structId=${gv.structId} exposed=${gv.exposed} keyType=${gv.keyType} valueType=${gv.valueType}`)
}
