import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { NODE_PIN_RECORDS } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'
import { NODE_ID } from '../../dist/src/compiler/gia_vendor.js'

const file = process.argv[2]
const data = decode_gia_file(file)

// Build name map
const nameMap = new Map<number, string>()
for (const rec of NODE_PIN_RECORDS) {
  if (rec.name && !nameMap.has(rec.id)) nameMap.set(rec.id, rec.name)
}
for (const [key, id] of Object.entries(NODE_ID)) {
  if (typeof id !== 'number') continue
  if (!nameMap.has(id)) nameMap.set(id, key.replace(/__Generic$/, '').replace(/_/g, ' '))
}

// Build composite name map: compositeId → name
const compositeNameMap = new Map<number, string>()
for (const a of data.accessories ?? []) {
  const def = a.compositeDef?.inner?.def
  if (def?.name && a.id?.id != null) {
    compositeNameMap.set(a.id.id, def.name)
  }
}

function resolveName(n: any): string {
  const nid = n.genericId?.nodeId
  const kind = n.genericId?.kind
  if (nid != null) {
    if (kind === 22001) { // composite call
      const cname = compositeNameMap.get(nid)
      if (cname) return `复合:${cname}`
      return `nid=${nid}`
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

function bfsChain(startIdx: number, nodeMap: Map<number, any>): { from: number, to: number, outflowIdx: number }[] {
  const visited = new Set<number>()
  const edges: { from: number, to: number, outflowIdx: number }[] = []
  const queue = [startIdx]
  visited.add(startIdx)
  while (queue.length > 0) {
    const cur = queue.shift()!
    const n = nodeMap.get(cur)
    if (!n) continue
    for (const pin of n.pins ?? []) {
      if (pin.i1?.kind !== 2) continue
      const idx = pin.i1?.index ?? -1
      for (const conn of pin.connects ?? []) {
        edges.push({ from: cur, to: conn.id, outflowIdx: idx })
        if (!visited.has(conn.id)) {
          visited.add(conn.id)
          queue.push(conn.id)
        }
      }
    }
  }
  return edges
}

function renderTree(rootIdx: number, name: string, nodeMap: Map<number, any>): string[] {
  const lines: string[] = []
  const edges = bfsChain(rootIdx, nodeMap)
  const children = new Map<number, { to: number, outflowIdx: number }[]>()
  const outflowOf = new Map<number, number>()
  for (const e of edges) {
    if (!children.has(e.from)) children.set(e.from, [])
    children.get(e.from)!.push({ to: e.to, outflowIdx: e.outflowIdx })
    outflowOf.set(e.to, e.outflowIdx)
  }

  const seen = new Set<number>()
  const queue: { idx: number; depth: number; last: boolean; hasSibling: boolean }[] = []
  seen.add(rootIdx)
  queue.push({ idx: rootIdx, depth: 0, last: true, hasSibling: false })
  
  while (queue.length > 0) {
    const item = queue.shift()!
    const node = nodeMap.get(item.idx)!
    const nodeName = resolveName(node)
    const outIdx = outflowOf.get(item.idx)
    const connLabel = outIdx != null ? ` [OutFlow=${outIdx}]` : ''

    // Build indent
    let prefix = ''
    // We need to track branching structure properly
    // For now, use indent based on depth
    const indent = '  '.repeat(item.depth)
    const bullet = item.depth === 0 ? '' : (item.last && item.hasSibling ? '└─ ' : (item.hasSibling ? '├─ ' : '─ '))
    
    lines.push(`${indent}${bullet}n=${item.idx}  ${nodeName}${connLabel}`)

    const kids = children.get(item.idx) || []
    // push in reverse order so first child appears first
    for (let i = kids.length - 1; i >= 0; i--) {
      const k = kids[i]
      if (!seen.has(k.to)) {
        seen.add(k.to)
        queue.unshift({ idx: k.to, depth: item.depth + 1, last: i === 0, hasSibling: kids.length > 1 })
      }
    }
  }

  return lines
}

const roots = [
  { idx: 3, label: 'Chain 1 — When Entity Is Created (nid=71)' },
  { idx: 39, label: 'Chain 2 — When Player Class Changes (nid=385)' },
  { idx: 1, label: 'Chain 3 — Get Self Entity (nid=73, isolated start)' },
]

for (const r of roots) {
  const n = nodeMap.get(r.idx)
  if (!n) { console.log(`n=${r.idx}: NOT FOUND`); continue }
  const name = resolveName(n)
  console.log(`### ${r.label}`)
  console.log(`坐标: (${n.x}, ${n.y})`)
  const chainLines = renderTree(r.idx, name, nodeMap)
  for (const line of chainLines) {
    console.log(line)
  }
  console.log()
}
