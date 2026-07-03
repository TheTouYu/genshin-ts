import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const file = process.argv[2]
const data = decode_gia_file(file)

function describeType(v: any): string {
  if (!v) return '?'
  if (typeof v === 'number') {
    const t: Record<number, string> = {1:'Int',2:'Float',3:'Bool',4:'String',5:'Entity',6:'Vector',7:'GUID',10:'List',11:'Map'}
    return t[v] ?? `type=${v}`
  }
  if (typeof v === 'object') {
    // Try to extract from the itemType wrapper
    const it = v.itemType ?? v
    const typeMap: Record<number, string> = {1:'Int',2:'Float',3:'Bool',4:'String',5:'Entity',6:'Vector',7:'GUID',8:'Dynamic',10:'List',11:'Map'}
    
    // Check various paths
    let t: number | undefined
    if (it.type_server?.type != null) t = it.type_server.type
    else if (it.type != null) t = it.type
    else if (it.kind != null) t = it.kind
    
    if (t != null) return typeMap[t] ?? `type=${t}`
    return JSON.stringify(v).substring(0, 60)
  }
  return String(v)
}

// Build composite data
const compositeDefs = new Map<number, any>()
const compositeNames = new Map<number, string>()
for (const a of data.accessories ?? []) {
  const id = a.id?.id
  const def = a.compositeDef?.inner?.def
  if (!def || !id) continue
  compositeNames.set(id, def.name)
  compositeDefs.set(id, def)
}

for (const [id, def] of compositeDefs) {
  if (def.name === '监听信号' || id === 1610612902) {
    console.log(`## ${def.name} (id=${id})`)
    console.log()
    
    console.log('### OutParam (数据输出)')
    console.log()
    for (let i = 0; i < (def.outputs ?? []).length; i++) {
      const o = def.outputs[i]
      const t = describeType(o.type ?? o.valueType ?? o)
      console.log(`| [${i}] | ${o.name ?? '(unnamed)'} | ${t} |`)
    }
    console.log()

    // Also dump raw output object for type detail
    console.log('### Raw output types')
    console.log()
    for (let i = 0; i < (def.outputs ?? []).length; i++) {
      const o = def.outputs[i]
      console.log(`[${i}] "${o.name}" raw type = ${JSON.stringify(o.type ?? o.valueType)}`)
    }
    console.log()

    console.log('### OutFlow (exec出口)')
    for (let i = 0; i < (def.outflows ?? []).length; i++) {
      console.log(`[${i}] "${def.outflows[i].name ?? ''}"`)
    }
    console.log()
  }
}
