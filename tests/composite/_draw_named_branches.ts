import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { NODE_PIN_RECORDS } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'
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

const compositeNameMap = new Map<number, string>()
const compositeOutflowNames = new Map<number, string[]>()
const compositeDefMap = new Map<number, any>()
for (const a of data.accessories ?? []) {
  const id = a.id?.id
  const def = a.compositeDef?.inner?.def
  if (!def || !id) continue
  compositeNameMap.set(id, def.name)
  compositeDefMap.set(id, def)
  compositeOutflowNames.set(id, (def.outflows ?? []).map((o: any) => o.name ?? ''))
}

function resolveName(n: any): string {
  if (!n) return '?'
  const nid = n.genericId?.nodeId
  const kind = n.genericId?.kind
  if (nid == null) return `kind=${n.genericId?.kind}`
  if (kind === 22001) {
    const cname = compositeNameMap.get(nid)
    if (cname) return `复合:${cname}`
    return `compositeId=${nid}`
  }
  const name = nameMap.get(nid)
  return name ?? `nid=${nid}`
}

function outflowLabel(n: any, idx: number): string {
  const nid = n.genericId?.nodeId
  if (n.genericId?.kind === 22001) {
    const names = compositeOutflowNames.get(nid)
    if (names && names[idx]) return `"${names[idx]}" [${idx}]`
  }
  return `[${idx}]`
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

const children = new Map<number, { to: number; outflowIdx: number }[]>()
for (const e of execEdges) {
  if (!children.has(e.from)) children.set(e.from, [])
  children.get(e.from)!.push({ to: e.to, outflowIdx: e.outflowIdx })
}
for (const [, list] of children) list.sort((a, b) => a.outflowIdx - b.outflowIdx)

const hasIncoming = new Set<number>()
for (const e of execEdges) hasIncoming.add(e.to)
const rootIdxs = [...nodeMap.keys()].filter(idx => !hasIncoming.has(idx) && children.has(idx))
rootIdxs.sort((a, b) => nodeMap.get(a)!.y - nodeMap.get(b)!.y)

// ---- Draw subtree ----
function drawSubTree(idx: number, indent: string, prefix: string, visited: Set<number>): string[] {
  const lines: string[] = []
  const n = nodeMap.get(idx)
  if (!n || visited.has(idx)) {
    if (visited.has(idx) && idx !== 0) lines.push(`${indent}${prefix}(n=${idx} 已在上文展开)`)
    return lines
  }
  visited.add(idx)
  
  const nodeName = resolveName(n)
  const nidStr = n.genericId?.nodeId != null ? `nid=${n.genericId.nodeId}` : ''
  lines.push(`${indent}${prefix}n=${idx}  ${nodeName}  ${nidStr}  (${n.x.toFixed(0)}, ${n.y.toFixed(0)})`)
  
  const kids = children.get(idx) || []
  if (kids.length === 0) return lines

  for (let i = 0; i < kids.length; i++) {
    const k = kids[i]
    const last = i === kids.length - 1
    const connChar = last ? '└── ' : '├── '
    const childIndent = indent + (last ? '     ' : '│    ')
    const label = outflowLabel(n, k.outflowIdx)
    
    if (children.get(k.to) && children.get(k.to)!.length > 0) {
      lines.push(`${indent}${connChar}${label} →`)
      const sub = drawSubTree(k.to, childIndent, '', visited)
      lines.push(...sub)
    } else {
      const child = nodeMap.get(k.to)
      if (child) {
        const cn = resolveName(child)
        const cnid = child.genericId?.nodeId
        const nids = cnid != null ? `nid=${cnid}` : ''
        lines.push(`${indent}${connChar}${label} → n=${k.to}  ${cn}  ${nids}  (${child.x.toFixed(0)}, ${child.y.toFixed(0)})`)
      } else {
        lines.push(`${indent}${connChar}${label} → n=${k.to}  (?)`)
      }
    }
  }
  
  return lines
}

// ---- Draw chains ----
const chain1Roots = [3, 39]
const chain3Roots = [2]

console.log()
console.log('┌' + '═'.repeat(70))
console.log('║  传球.gia — 三大 exec 链完整拓扑')
console.log('║  (纯图，无说明)')
console.log('└' + '═'.repeat(70))
console.log()

// Chain 1+2: n=3 and n=39 both → n=40
console.log('┌─ 链 1+2 (合并): When Entity Is Created + When Player Class Changes')
console.log('│')
console.log('│  n=3  When Entity Is Created  nid=71  (-829, -1414)')
console.log('│  │')
console.log('│  OutFlow[0]')
console.log('│  │')
console.log('│  n=39  When Player Class Changes  nid=385  (-657, -1701)')
console.log('│  │')
console.log('│  OutFlow[0]')
console.log('│  │')
console.log('│  ┌────┘')
console.log('│  │')
console.log('│  v')
const visited40 = new Set<number>([3, 39])
const chain1lines = drawSubTree(40, '│  ', '', visited40)
chain1lines.forEach(l => console.log(l))

console.log()
console.log()

// Chain 3
console.log('┌─ 链 3: 复合:监听信号')
console.log('│')
const visited2 = new Set<number>()
const chain3lines = drawSubTree(2, '│  ', '', visited2)
chain3lines.forEach(l => console.log(l))

// Data-only nodes
console.log()
console.log('┌─ 孤立数据节点 (不在 exec 链中, 通过数据连线引用)')
console.log('│')
const dataNodes = [1, 4, 12, 19, 20, 23, 52]
for (const idx of dataNodes) {
  const n = nodeMap.get(idx)
  if (!n) continue
  console.log(`│  n=${idx}  ${resolveName(n)}  nid=${n.genericId?.nodeId}  (${n.x.toFixed(0)}, ${n.y.toFixed(0)})`)
}

// Data connections summary
console.log()
console.log('┌─ 数据连线')
console.log('│')
const dataEdges: { from: number; to: number; toPin: number }[] = []
for (const n of nodes) {
  for (const pin of n.pins ?? []) {
    if (pin.i1?.kind !== 3) continue
    const idx = pin.i1?.index ?? -1
    for (const conn of pin.connects ?? []) {
      dataEdges.push({ from: conn.id, to: n.nodeIndex, toPin: idx })
    }
  }
}
for (const d of dataEdges) {
  console.log(`│  n=${d.from}  →  n=${d.to}  InParam[${d.toPin}]`)
}

// Outflow names reference
console.log()
console.log('┌─ 复合分支命名')
console.log('│')
for (const [id, def] of compositeDefMap) {
  const names: string[] = []
  for (const oflow of (def.outflows ?? [])) {
    names.push(`"${oflow.name ?? ''}"`)
  }
  if (names.length > 0 && names.some(n => n !== '""')) {
    console.log(`│  ${compositeNameMap.get(id)}:  ${names.join(',  ')}`)
  }
}
