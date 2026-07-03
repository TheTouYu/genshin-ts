import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { NODE_PIN_RECORDS } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'
import { NODE_ID } from '../../dist/src/compiler/gia_vendor.js'

const file = process.argv[2]
const data = decode_gia_file(file)

const nameMap = new Map<number, string>()
for (const rec of NODE_PIN_RECORDS) {
  if (rec.name && !nameMap.has(rec.id)) nameMap.set(rec.id, rec.name)
}
for (const [key, id] of Object.entries(NODE_ID)) {
  if (typeof id !== 'number') continue
  if (!nameMap.has(id)) nameMap.set(id, key.replace(/__Generic$/, '').replace(/_/g, ' '))
}

const compositeNames = new Map<number, string>()
const compositeDefs = new Map<number, any>()
for (const a of data.accessories ?? []) {
  const id = a.id?.id
  const def = a.compositeDef?.inner?.def
  if (def && id != null) {
    compositeNames.set(id, def.name)
    compositeDefs.set(id, def)
  }
}

function resolveName(n: any): string {
  if (!n) return '?'
  const nid = n.genericId?.nodeId
  const kind = n.genericId?.kind
  if (nid == null) return `kind=${n.genericId?.kind}`
  if (kind === 22001) {
    const cname = compositeNames.get(nid)
    if (cname) return `复合:${cname}`
    return `compositeId=${nid}`
  }
  return nameMap.get(nid) ?? `nid=${nid}`
}

const mainGraph = data.graph?.graph?.inner?.graph
const nodes = mainGraph?.nodes ?? []
const nodeMap = new Map<number, any>()
for (const n of nodes) nodeMap.set(n.nodeIndex, n)

// Dump all pins of n=9
const n9 = nodeMap.get(9)
console.log('n=9  Set Character Skill CD')
console.log('nid =', n9.genericId?.nodeId)
console.log('pins count:', n9.pins?.length ?? 0)
console.log()

for (let i = 0; i < (n9.pins?.length ?? 0); i++) {
  const pin = n9.pins[i]
  const kind = pin.i1?.kind ?? -1
  const idx = pin.i1?.index ?? -1
  const conns = (pin.connects ?? []).map((c: any) => c.id)
  const kindName = ['?','InFlow','OutFlow','InParam','OutParam','InSignal'][kind] ?? `k=${kind}`
  
  console.log(`Pin[${i}]: ${kindName}[${idx}]`)
  if (conns.length > 0) {
    for (const c of pin.connects ?? []) {
      const srcNode = nodeMap.get(c.id)
      const srcName = srcNode ? resolveName(srcNode) : '?'
      // Check connect2 for source OutParam index
      const srcKind = c.connect2?.kind ?? c.connect?.kind ?? -1
      const srcIdx = c.connect2?.index ?? c.connect?.index ?? -1
      console.log(`  ← n=${c.id}  ${srcName}  (srcPin: kind=${srcKind} idx=${srcIdx})`)
    }
  } else {
    const v = pin.value
    if (v) console.log(`  (未连接, 有预设值: ${JSON.stringify(v).substring(0, 100)})`)
    else console.log(`  (未连接)`)
  }
  console.log()
}

// Also trace n=9's connections from the perspective of data sources
console.log('=== 数据流追溯 ===')
console.log()

// For InParam[0] ← n=1
console.log('InParam[0] "自身实体":')
console.log('  n=1  Get Self Entity')
console.log('  │  OutParam → Entity (技能所有者)')
console.log('  │')
console.log('  └──→ n=9 InParam[0]')
console.log()

// For InParam[2] ← n=12
console.log('InParam[2] "CD 参数":')
console.log('  n=12  复合:标记e技能释放')
console.log('  │  OutParam[0] "获取cd" → Int')
console.log('  │')
console.log('  └──→ n=9 InParam[2]')
console.log()

// Check n=12's impl graph data connections
console.log('  n=12 impl 图数据流:')
// Find impl graph for 标记e技能释放 (id=1610612909)
const implId = 1610612876 // from accessories data: acc[12] id=1610612876
const implAcc = data.accessories?.find((a: any) => a.id?.id === implId)
const implGraph = implAcc?.graph?.inner?.graph
if (implGraph) {
  // Find data connections in impl graph
  console.log('  Impl 节点:')
  for (const n of implGraph.nodes) {
    const nn = resolveName(n)
    const nid = n.genericId?.nodeId ?? '?'
    console.log(`    n=${n.nodeIndex}  ${nn}  nid=${nid}  (${n.x.toFixed(0)}, ${n.y.toFixed(0)})`)
    // Check data inputs
    for (const pin of n.pins ?? []) {
      if (pin.i1?.kind === 3) {
        const idx = pin.i1?.index ?? -1
        for (const conn of pin.connects ?? []) {
          const src = implGraph.nodes.find((nn: any) => nn.nodeIndex === conn.id)
          const sn = src ? resolveName(src) : '?'
          console.log(`      InParam[${idx}] ← n=${conn.id} ${sn}`)
        }
      }
    }
  }
}
