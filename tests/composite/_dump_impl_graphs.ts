import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { NODE_PIN_RECORDS } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'
import { NODE_ID } from '../../dist/src/compiler/gia_vendor.js'

const file = process.argv[2]
const data = decode_gia_file(file)

// Name maps
const nameMap = new Map<number, string>()
for (const rec of NODE_PIN_RECORDS) {
  if (rec.name && !nameMap.has(rec.id)) nameMap.set(rec.id, rec.name)
}
for (const [key, id] of Object.entries(NODE_ID)) {
  if (typeof id !== 'number') continue
  if (!nameMap.has(id)) nameMap.set(id, key.replace(/__Generic$/, '').replace(/_/g, ' '))
}

// Build composite index
const compositeNames = new Map<number, string>()
const compositeDefs = new Map<number, any>()
const implGraphMap = new Map<number, any>() // compositeId → impl graph (accessory with which=9)
const defToImpl = new Map<number, number>() // compositeDef id → impl graph id (from relatedIds)

for (const a of data.accessories ?? []) {
  const id = a.id?.id
  const def = a.compositeDef?.inner?.def
  if (def && id != null) {
    compositeNames.set(id, def.name)
    compositeDefs.set(id, def)
    // relatedIds[0].id points to impl graph id
    const implId = a.relatedIds?.[0]?.id
    if (implId != null) defToImpl.set(id, implId)
  }
}

// Find impl graphs (accessories with which=9 or that have node graphs)
for (const a of data.accessories ?? []) {
  const g = a.graph?.inner?.graph
  if (g?.nodes?.length) {
    const accId = a.id?.id
    // Find which composite def this impl belongs to
    let compId: number | null = null
    for (const [cid, iid] of defToImpl) {
      if (iid === accId) { compId = cid; break }
    }
    if (compId != null) {
      implGraphMap.set(compId, g)
    }
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
  const name = nameMap.get(nid)
  return name ?? `nid=${nid}`
}

// Main graph composite refs
console.log('=== 主图引用的复合节点 ===')
const mainGraph = data.graph?.graph?.inner?.graph
for (const n of mainGraph?.nodes ?? []) {
  if (n.genericId?.kind === 22001) {
    const name = compositeNames.get(n.genericId.nodeId) ?? `?`
    console.log(`  n=${n.nodeIndex} → 复合:${name} (id=${n.genericId.nodeId})`)
  }
}

console.log()

// For each composite used in main graph, dump its impl graph topology
const mainGraphRefs = new Set<number>()
for (const n of mainGraph?.nodes ?? []) {
  if (n.genericId?.kind === 22001) mainGraphRefs.add(n.genericId.nodeId)
}

for (const [compId, implGraph] of implGraphMap) {
  if (!mainGraphRefs.has(compId) && compId !== 1610612902) continue
  
  const name = compositeNames.get(compId) ?? '?'
  const def = compositeDefs.get(compId)
  
  console.log(`╔═ ${name} (id=${compId}) ═╗`)
  console.log()
  
  // Interface
  if (def) {
    console.log(`  接口:`)
    if ((def.inflows ?? []).length) console.log(`    InFlow[0]: "${def.inflows[0]?.name ?? ''}"`)
    for (let i = 0; i < (def.outflows ?? []).length; i++) {
      console.log(`    OutFlow[${i}]: "${def.outflows[i]?.name ?? ''}"`)
    }
    for (let i = 0; i < (def.inputs ?? []).length; i++) {
      console.log(`    InParam[${i}]: "${def.inputs[i]?.name ?? ''}"`)
    }
    for (let i = 0; i < (def.outputs ?? []).length; i++) {
      console.log(`    OutParam[${i}]: "${def.outputs[i]?.name ?? ''}"`)
    }
    console.log()
  }
  
  console.log(`  impl 图: ${implGraph.nodes.length} 节点`)
  
  // Extract exec edges
  const execEdges: { from: number; to: number; outflowIdx: number }[] = []
  for (const n of implGraph.nodes) {
    for (const pin of n.pins ?? []) {
      if (pin.i1?.kind !== 2) continue
      const idx = pin.i1?.index ?? -1
      for (const conn of pin.connects ?? []) {
        execEdges.push({ from: n.nodeIndex, to: conn.id, outflowIdx: idx })
      }
    }
  }
  
  console.log(`  exec 边: ${execEdges.length}`)
  
  // Build tree
  const children = new Map<number, { to: number; outflowIdx: number }[]>()
  const hasIn = new Set<number>()
  for (const e of execEdges) {
    if (!children.has(e.from)) children.set(e.from, [])
    children.get(e.from)!.push({ to: e.to, outflowIdx: e.outflowIdx })
    hasIn.add(e.to)
  }
  for (const [, list] of children) list.sort((a, b) => a.outflowIdx - b.outflowIdx)
  
  const roots = implGraph.nodes
    .filter((n: any) => !hasIn.has(n.nodeIndex) && children.has(n.nodeIndex))
    .map((n: any) => n.nodeIndex)
  
  if (roots.length === 0 && implGraph.nodes.length > 0) {
    // No exec edges - pure data graph
    console.log(`  (纯数据图，无 exec 连接)`)
    for (const n of implGraph.nodes) {
      const name = resolveName(n)
      console.log(`    n=${n.nodeIndex}  ${name}  nid=${n.genericId?.nodeId}  (${n.x.toFixed(0)}, ${n.y.toFixed(0)})`)
    }
  }
  
  function drawTree(idx: number, indent: string): string[] {
    const lines: string[] = []
    const n = implGraph.nodes.find((nn: any) => nn.nodeIndex === idx)
    if (!n) return lines
    const nn = resolveName(n)
    lines.push(`${indent}n=${idx}  ${nn}  nid=${n.genericId?.nodeId}  (${n.x.toFixed(0)}, ${n.y.toFixed(0)})`)
    
    const kids = children.get(idx) || []
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i]
      const last = i === kids.length - 1
      const connChar = last ? ' └── ' : ' ├── '
      const nextIndent = indent + (last ? '      ' : ' │    ')
      const outflowLabel = k.outflowIdx !== 0 ? ` OutFlow[${k.outflowIdx}]` : ''
      
      const child = implGraph.nodes.find((nn: any) => nn.nodeIndex === k.to)
      if (!child) { lines.push(`${indent}${connChar}→ n=${k.to}  (?)`); continue }
      
      const cn = resolveName(child)
      lines.push(`${indent}${connChar}OutFlow[${k.outflowIdx}] → n=${k.to}  ${cn}  nid=${child.genericId?.nodeId}`)
      
      if (children.has(k.to)) {
        const sub = drawTree(k.to, nextIndent)
        lines.push(...sub)
      }
    }
    return lines
  }
  
  for (const r of roots) {
    const tree = drawTree(r, '    ')
    tree.forEach(l => console.log(l))
  }
  
  console.log()
  console.log('  (impl 图中复合节点 → 可继续展开)')
  for (const n of implGraph.nodes) {
    if (n.genericId?.kind === 22001) {
      const cname = compositeNames.get(n.genericId.nodeId) ?? '?'
      if (cname !== name) { // avoid self-reference
        console.log(`    n=${n.nodeIndex}  复合:${cname} (id=${n.genericId.nodeId}) — 嵌套复合`)
      }
    }
  }
  
  console.log()
}
