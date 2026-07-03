import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const file = process.argv[2]
const data = decode_gia_file(file)

// 1. 职业branch composite definition outflow names
const compositeDefs = new Map<number, any>()
for (const a of data.accessories ?? []) {
  const id = a.id?.id
  const def = a.compositeDef?.inner?.def
  if (!def || !id) continue
  compositeDefs.set(id, def)
}

const zbId = 1610612908 // 职业branch
const zbDef = compositeDefs.get(zbId)
if (zbDef) {
  console.log('=== 职业branch composite definition ===')
  console.log('Name:', zbDef.name)
  console.log()
  console.log('OutFlows (命名为):')
  for (let i = 0; i < (zbDef.outflows ?? []).length; i++) {
    const o = zbDef.outflows[i]
    console.log(`  [${i}] "${o.name ?? '(unnamed)'}"`)
  }
  console.log()
  console.log('InParams:')
  for (let i = 0; i < (zbDef.inputs ?? []).length; i++) {
    const inp = zbDef.inputs[i]
    console.log(`  [${i}] "${inp.name ?? '(unnamed)'}"`)
  }
}

// 2. Set Node Graph Variable nodes - what variables do they set?
const mainGraph = data.graph?.graph?.inner?.graph
const nodes = mainGraph?.nodes ?? []
const nodeMap = new Map<number, any>()
for (const n of nodes) nodeMap.set(n.nodeIndex, n)

console.log()
console.log('=== Set Node Graph Variable nodes details ===')
for (const idx of [41, 45, 46, 47, 48]) {
  const n = nodeMap.get(idx)
  if (!n) continue
  console.log(`n=${idx} Set Node Graph Variable  (${n.x.toFixed(0)}, ${n.y.toFixed(0)})`)
  // Show pins (InParam + value)
  for (const pin of n.pins ?? []) {
    const kind = pin.i1?.kind ?? -1
    const pidx = pin.i1?.index ?? -1
    const kindNames: Record<number, string> = {1:'InFlow',2:'OutFlow',3:'InParam',4:'OutParam'}
    const kn = kindNames[kind] ?? `k=${kind}`
    
    let detail = `  ${kn}[${pidx}]`
    
    // Check value
    const v = pin.value
    if (v?.bConcreteValue) {
      const cv = v.bConcreteValue
      if (cv.value != null) detail += ` val=${JSON.stringify(cv.value)}`
      if (cv.indexOfConcrete != null) detail += ` preset_idx=${cv.indexOfConcrete}`
    }
    
    const conns = (pin.connects ?? []).map((c: any) => `→${c.id}`).join(',')
    if (conns) detail += ` conns=[${conns}]`
    
    console.log(detail)
  }
  console.log()
}

// 3. Also check the 职业branch composite def's outflows more carefully
// The outflows at the composite definition level are different from what's stored on the node
// Let me check the actual outflow names on ALL composite defs
console.log()
console.log('=== All composite definitions with their outflow names ===')
for (const [id, def] of compositeDefs) {
  const outNames = (def.outflows ?? []).map((o: any, i: number) => `[${i}]"${o.name ?? ''}"`).join(', ')
  console.log(`  ${def.name.padEnd(16)} outflows: ${outNames}`)
}
