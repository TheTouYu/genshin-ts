import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { NODE_PIN_RECORDS } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'
import { NODE_ID } from '../../dist/src/compiler/gia_vendor.js'

const file = process.argv[2]
const data = decode_gia_file(file)

// Build name maps
const nameMap = new Map<number, string>()
for (const rec of NODE_PIN_RECORDS) {
  if (rec.name && !nameMap.has(rec.id)) nameMap.set(rec.id, rec.name)
}
for (const [key, id] of Object.entries(NODE_ID)) {
  if (typeof id !== 'number') continue
  if (!nameMap.has(id)) nameMap.set(id, key.replace(/__Generic$/, '').replace(/_/g, ' '))
}

const compositeNameMap = new Map<number, string>()
const compositeDefMap = new Map<number, any>() // compositeId → def object
for (const a of data.accessories ?? []) {
  const def = a.compositeDef?.inner?.def
  if (def?.name && a.id?.id != null) {
    compositeNameMap.set(a.id.id, def.name)
    compositeDefMap.set(a.id.id, def)
  }
}

function typeName(protoVal: any): string {
  if (!protoVal) return '?'
  const it = protoVal.itemType
  if (!it) return '?'
  // type_server: type=1→int, type=2→float, type=3→bool, type=4→string, type=5→Entity, type=6→Vector
  const typeMap: Record<number, string> = {
    1: 'Int', 2: 'Float', 3: 'Bool', 4: 'String', 5: 'Entity', 6: 'Vector',
    7: 'GUID', 10: 'List', 11: 'Map',
  }
  const t = it.type_server?.type ?? it.type ?? -1
  return typeMap[t] ?? `type=${t}`
}

function resolveName(n: any): string {
  const nid = n.genericId?.nodeId
  const kind = n.genericId?.kind
  if (nid != null) {
    if (kind === 22001) {
      const cname = compositeNameMap.get(nid)
      if (cname) return `复合:${cname}`
      return `compositeId=${nid}`
    }
    const name = nameMap.get(nid)
    if (name) return name
    return `nid=${nid}`
  }
  return `kind=${kind}`
}

const mainGraph = data.graph?.graph?.inner?.graph
const nodes = mainGraph?.nodes ?? []
const nodeMap = new Map<number, any>()
for (const n of nodes) nodeMap.set(n.nodeIndex, n)

function dumpNodePins(idx: number, label: string): void {
  const n = nodeMap.get(idx)
  if (!n) { console.log(`n=${idx}: NOT FOUND`); return }

  console.log(`## n=${idx}  ${label}`)
  console.log()
  console.log(`genericId = ${JSON.stringify(n.genericId)}`)
  console.log(`坐标 = (${n.x.toFixed(1)}, ${n.y.toFixed(1)})`)
  console.log()

  // Group pins by kind
  const byKind = new Map<number, any[]>()
  for (const pin of n.pins ?? []) {
    const kind = pin.i1?.kind ?? -1
    if (!byKind.has(kind)) byKind.set(kind, [])
    byKind.get(kind)!.push(pin)
  }

  const kindNames: Record<number, string> = {
    1: 'InFlow', 2: 'OutFlow', 3: 'InParam', 4: 'OutParam',
    5: 'InSignal', 6: 'OutSignal', 7: 'InEvent', 8: 'OutEvent',
  }

  for (const [kind, pins] of byKind) {
    const kn = kindNames[kind] ?? `kind=${kind}`
    console.log(`### ${kn} (kind=${kind}) — ${pins.length} 个`)
    console.log()
    for (const pin of pins) {
      const idx = pin.i1?.index ?? pin.i2?.index ?? -1
      const conns = (pin.connects ?? []).map((c: any) => `→n=${c.id}`).join(', ')

      // value field
      let valInfo = ''
      const v = pin.value
      if (v) {
        if (v.bConcreteValue) {
          const cv = v.bConcreteValue
          if (cv.indexOflist != null) {
            valInfo = ` (预设值索引=${cv.indexOflist})`
          } else if (cv.value != null) {
            valInfo = ` = ${JSON.stringify(cv.value)}`
          }
        }
        valInfo += ` 类型:${typeName(v)}`
      }

      const connStr = conns ? `  连接: ${conns}` : '  (未连接)'
      console.log(`  [${idx}]${valInfo}`)
      console.log(connStr)
      console.log()
    }
  }
  console.log('---')
  console.log()
}

// n=3 When Entity Is Created
dumpNodePins(3, resolveName(nodeMap.get(3)))

// n=39 When Player Class Changes
dumpNodePins(39, resolveName(nodeMap.get(39)))

// n=2 复合:监听信号
dumpNodePins(2, resolveName(nodeMap.get(2)))
