import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { NODE_PIN_RECORDS } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'
import { NODE_ID } from '../../dist/src/compiler/gia_vendor.js'

const file = process.argv[2]
const data = decode_gia_file(file)

// Name maps
const nameMap = new Map<number, string>()
for (const rec of NODE_PIN_RECORDS) {
  if (rec.name && !nameMap.has(rec.id)) nameMap.set(rec.id, rec.name)
  // Also store inputs/outputs for type info
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

function getInputTypes(nid: number): string[] {
  for (const rec of NODE_PIN_RECORDS) {
    if (rec.id === nid) return rec.inputs ?? []
  }
  return []
}

function getOutputTypes(nid: number): string[] {
  for (const rec of NODE_PIN_RECORDS) {
    if (rec.id === nid) return rec.outputs ?? []
  }
  return []
}

const mainGraph = data.graph?.graph?.inner?.graph
const nodes = mainGraph?.nodes ?? []
const nodeMap = new Map<number, any>()
for (const n of nodes) nodeMap.set(n.nodeIndex, n)

console.log('=== 全节点数据流追溯 ===')
console.log()

for (const [idx, n] of [...nodeMap].sort(([a], [b]) => a - b)) {
  const nodeName = resolveName(n)
  const nid = n.genericId?.nodeId
  const inputTypes = nid != null ? getInputTypes(nid) : []
  const outputTypes = nid != null ? getOutputTypes(nid) : []

  // Find all InParam pins (kind=3)
  const inParams: { idx: number; connected: boolean; from: number | null; value: any }[] = []
  for (const pin of n.pins ?? []) {
    if (pin.i1?.kind !== 3) continue
    const pIdx = pin.i1?.index ?? -1
    const conns = pin.connects ?? []
    if (conns.length > 0) {
      inParams.push({ idx: pIdx, connected: true, from: conns[0].id, value: null })
    } else {
      inParams.push({ idx: pIdx, connected: false, from: null, value: pin.value })
    }
  }

  if (inParams.length === 0) continue // skip nodes with no data inputs

  console.log(`n=${idx}  ${nodeName}  nid=${nid}`)
  if (inputTypes.length > 0) console.log(`  inputs: [${inputTypes.join(', ')}]`)
  
  for (const p of inParams) {
    const typeStr = inputTypes[p.idx] ?? '?'
    if (p.connected && p.from != null) {
      const srcNode = nodeMap.get(p.from)
      if (srcNode) {
        const srcName = resolveName(srcNode)
        // Try to find which OutParam of the source
        const srcNid = srcNode.genericId?.nodeId
        const srcOutputTypes = srcNid != null ? getOutputTypes(srcNid) : []
        const outTypeStr = srcOutputTypes[0] ?? '?'

        // For composite sources, look up the composite def output names
        let srcOutInfo = ''
        if (srcNode.genericId?.kind === 22001 && srcNid != null) {
          const def = compositeDefs.get(srcNid)
          if (def) {
            // Try to find which OutParam by matching type
            // Actually we can't know for sure from protobuf alone
            // But we know the target InParam index and we know the types
            // For now, show all output names
            const outNames = (def.outputs ?? []).map((o: any, i: number) => `[${i}]"${o.name ?? ''}"`)
            // We need to figure out which output maps to this input
            // For now show the most likely one
          }
        }
        
        console.log(`  InParam[${p.idx}] (${typeStr}) <- n=${p.from}  ${srcName}`)
      } else {
        console.log(`  InParam[${p.idx}] (${typeStr}) <- n=${p.from}  (?)`)
      }
    } else {
      // Unconnected - try to extract literal value
      let valStr = '?'
      const v = p.value
      if (v) {
        if (v.bEnum?.val != null) valStr = `enum=${v.bEnum.val}`
        else if (v.bConcreteValue?.value?.bString?.val != null) valStr = `"${v.bConcreteValue.value.bString.val}"`
        else if (v.bConcreteValue?.value?.bArray?.entries != null) {
          const entries = v.bConcreteValue.value.bArray.entries
          valStr = `[${entries.length} entries]`
        }
        else if (v.bConcreteValue?.indexOfConcrete != null) valStr = `concreteIndex=${v.bConcreteValue.indexOfConcrete}`
        else valStr = '(预设值)'
      }
      console.log(`  InParam[${p.idx}] (${typeStr}) = ${valStr}`)
    }
  }
  console.log()
}
