import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const file = process.argv[2]
const data = decode_gia_file(file)

// Build composite info
const compositeNameMap = new Map<number, string>()
const compositeDefMap = new Map<number, any>()
for (const a of data.accessories ?? []) {
  const id = a.id?.id
  const def = a.compositeDef?.inner?.def
  if (!def || !id) continue
  compositeNameMap.set(id, def.name)
  compositeDefMap.set(id, def)
  console.log(`accessory id=${id} → "${def.name}"  (outputs=${def.outputs?.length ?? 0})`)
}

console.log()
console.log('=== Composite "监听信号" 接口定义 ===')

const targetId = 1610612902
const def = compositeDefMap.get(targetId)
if (def) {
  console.log(`名称: ${def.name}`)
  console.log()

  console.log('  OutFlow (exec 出口):')
  for (let i = 0; i < (def.outflows ?? []).length; i++) {
    const item = def.outflows[i]
    console.log(`    [${i}] "${item.name ?? '(unnamed)'}"`)
  }
  console.log()

  console.log('  OutParam (数据输出):')
  for (let i = 0; i < (def.outputs ?? []).length; i++) {
    const item = def.outputs[i]
    const typeStr = `type=${item.type}` + (item.type === 5 ? ' (Entity)' : item.type === 7 ? ' (GUID)' : item.type === 6 ? ' (Vector)' : '')
    console.log(`    [${i}] "${item.name ?? '(unnamed)'}"  ${typeStr}`)
  }
  console.log()
  
  console.log('  InParam (数据输入):')
  for (let i = 0; i < (def.inputs ?? []).length; i++) {
    const item = def.inputs[i]
    console.log(`    [${i}] "${item.name ?? '(unnamed)'}"  type=${item.type}`)
  }
  console.log()

  console.log('  InFlow (exec 入口):')
  for (let i = 0; i < (def.inflows ?? []).length; i++) {
    const item = def.inflows[i]
    console.log(`    [${i}] "${item.name ?? '(unnamed)'}"`)
  }
}

// Also check: in the main graph, what data outputs does n=2 actually have connected?
// Wait - n=2 has no OutParam pins on the node. The OutParam connections from a composite
// call node actually connect from n=2's pins (which are defined by the composite def's outputs)
// Let me double check by looking at what connects TO n=2 as data source
console.log()
console.log('=== All connections where n=2 is the data source ===')
const mainGraph = data.graph?.graph?.inner?.graph
for (const n of mainGraph?.nodes ?? []) {
  for (const pin of n.pins ?? []) {
    if (pin.i1?.kind !== 3) continue
    const idx = pin.i1?.index ?? -1
    for (const conn of pin.connects ?? []) {
      if (conn.id === 2) {
        console.log(`n=${n.nodeIndex} InParam[${idx}] ← n=2 (监听信号)`)
      }
    }
  }
}
