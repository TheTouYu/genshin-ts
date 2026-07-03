import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { NODE_PIN_RECORDS } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'
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

const compositeNameMap = new Map<number, string>()
for (const a of data.accessories ?? []) {
  const def = a.compositeDef?.inner?.def
  if (def?.name && a.id?.id != null) compositeNameMap.set(a.id.id, def.name)
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

// Collect all exec edges
const execEdges: { from: number; to: number; outflowIdx: number }[] = []
for (const n of nodes) {
  for (const pin of n.pins ?? []) {
    if (pin.i1?.kind !== 2) continue
    const idx = pin.i1?.index ?? -1
    for (const conn of pin.connects ?? []) {
      execEdges.push({ from: n.nodeIndex, to: conn.id, outflowIdx: idx })
    }
  }
}

// Find roots: nodes with incoming exec edges
const hasExecIn = new Set<number>()
const hasExecOut = new Set<number>()
for (const e of execEdges) {
  hasExecOut.add(e.from)
  hasExecIn.add(e.to)
}
const roots = nodes.filter(n => !hasExecIn.has(n.nodeIndex) && hasExecOut.has(n.nodeIndex))
  .map(n => n.nodeIndex)
  .sort((a, b) => nodeMap.get(a)!.y - nodeMap.get(b)!.y)

// Build children map
const children = new Map<number, { to: number; outflowIdx: number }[]>()
const outflowOf = new Map<number, number>()
for (const e of execEdges) {
  if (!children.has(e.from)) children.set(e.from, [])
  children.get(e.from)!.push({ to: e.to, outflowIdx: e.outflowIdx })
  outflowOf.set(e.to, e.outflowIdx)
}
// Sort children by outflowIdx
for (const [, list] of children) {
  list.sort((a, b) => a.outflowIdx - b.outflowIdx)
}

// Data connections
const inParamOf = new Map<string, { from: number; fromPinKind: number; fromPinIdx: number }>()
for (const n of nodes) {
  for (const pin of n.pins ?? []) {
    const kind = pin.i1?.kind ?? -1
    const idx = pin.i1?.index ?? -1
    if (kind !== 3 && kind !== 4) continue
    for (const conn of pin.connects ?? []) {
      // kind=3 InParam: data flows from conn.id to n
      // kind=4 OutParam: data flows from n to conn.id
      if (kind === 3) {
        const key = `${n.nodeIndex}:InParam[${idx}]`
        inParamOf.set(key, { from: conn.id, fromPinKind: 4, fromPinIdx: -1 })
      }
    }
  }
}

// Tree rendering with proper branching characters
function renderSubTree(idx: number, depth: number, prefix: string, isLast: boolean, isRoot: boolean, visited: Set<number>): string[] {
  const lines: string[] = []
  const node = nodeMap.get(idx)
  if (!node) return lines
  const nodeName = resolveName(node)
  const outIdx = outflowOf.get(idx)
  const connLabel = outIdx != null ? `  OutFlow=${outIdx}` : ''
  
  const bullet = isRoot ? '' : (isLast ? '└─ ' : '├─ ')
  const childPrefix = isRoot ? '' : (isLast ? '   ' : '│  ')
  
  lines.push(`${prefix}${bullet}n=${idx}  ${nodeName}${connLabel}   (${node.x.toFixed(0)}, ${node.y.toFixed(0)})`)

  // Data inputs
  for (const pin of node.pins ?? []) {
    if (pin.i1?.kind !== 3) continue
    const pIdx = pin.i1?.index ?? -1
    for (const conn of pin.connects ?? []) {
      const srcNode = nodeMap.get(conn.id)
      if (srcNode) {
        const srcName = resolveName(srcNode)
        lines.push(`${prefix}${childPrefix}  data: InParam[${pIdx}] ← n=${conn.id} ${srcName}`)
      }
    }
  }

  const kids = children.get(idx) || []
  const newPrefix = isRoot ? '' : prefix + childPrefix
  
  visited.add(idx)
  
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i]
    if (visited.has(k.to)) continue
    const subLines = renderSubTree(k.to, depth + 1, newPrefix, i === kids.length - 1, false, visited)
    lines.push(...subLines)
  }
  
  return lines
}

console.log('# 传球.gia — 三大 exec 链拓扑')
console.log()
console.log(`> 基于 ${file}`)
console.log(`> 主图共 ${nodes.length} 节点, ${execEdges.length} exec 边`)
console.log()

for (const rootIdx of roots) {
  const root = nodeMap.get(rootIdx)
  const rootName = resolveName(root)
  console.log(`## 链 ${rootIdx}: ${rootName}`)
  console.log()
  console.log(`坐标: (${root.x.toFixed(0)}, ${root.y.toFixed(0)})`)
  console.log(`nid=${root.genericId?.nodeId}, kind=${root.genericId?.kind}`)
  console.log()
  console.log('```')
  const visited = new Set<number>()
  const tree = renderSubTree(rootIdx, 0, '', false, true, visited)
  for (const line of tree) console.log(line)
  console.log('```')
  console.log()
}
