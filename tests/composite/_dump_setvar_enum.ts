import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

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
  const pin0 = n.pins?.[0]?.value
  const pin1 = n.pins?.[1]?.value
  const pin2 = n.pins?.[2]?.value
  
  // Variable name
  const varName = pin0?.bString?.val ?? '?'
  
  // Float value
  let floatVal = null
  if (pin1?.bConcreteValue?.value?.bFloat?.val != null) floatVal = pin1.bConcreteValue.value.bFloat.val
  else if (pin1?.bFloat?.val != null) floatVal = pin1.bFloat.val
  
  // Enum value (InParam[2])
  const enumStr = JSON.stringify(pin2?.bEnum ?? pin2?.bConcreteValue?.value?.bEnum).substring(0, 100)
  
  console.log(`  var="${varName}"  value=${floatVal}  enum_raw=${enumStr}`)
  console.log()
}
