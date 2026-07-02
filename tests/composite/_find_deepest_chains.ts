#!/usr/bin/env npx tsx
/**
 * Find deepest dataflow chains — CORRECT graph access pattern
 *
 * graph: data.graph.inner.graph OR acc.graph.inner.graph
 * connections: pin.connects[0].id = source node index
 *              pin.connects[0].connect = {kind, index} = source output pin
 *              pin.i1 = {kind, index} = THIS pin's type/id
 */
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

// Build composite index: def id → { name, implGraphAcc }
const compositeDefs = new Map<number, { name: string }>()
const defToImpl = new Map<number, number>() // def id → impl graph acc id
const implGraphs = new Map<number, any>() // acc id → accessory with graph

for (let i = 0; i < (data.accessories?.length ?? 0); i++) {
  const a = data.accessories[i]
  const id = a.id?.id
  const def = a.compositeDef?.inner?.def
  const hasGraph = !!(a.graph?.inner?.graph?.nodes?.length || a.graph?.inner?.graph?.compositePins?.length)

  if (def && id != null) {
    compositeDefs.set(id, { name: def.name })
    const implId = a.relatedIds?.[0]?.id
    if (implId != null) defToImpl.set(id, implId)
  }

  if (hasGraph && id != null) {
    implGraphs.set(id, a)
  }
}

function nodeName(n: any): string {
  const nid = n.genericId?.nodeId
  const compId = n.compositeId?.id
  if (compId && compositeDefs.has(compId)) return `复合:${compositeDefs.get(compId)!.name}`
  if (nid != null && nameMap.has(nid)) return nameMap.get(nid)!
  return `nid=${nid}`
}

interface ChainInfo {
  compositeName: string
  startNode: number
  startNodeName: string
  depth: number
  inPin: number
  path: string[]
}

const allChains: ChainInfo[] = []

for (const [defId, info] of compositeDefs) {
  const implId = defToImpl.get(defId)
  if (implId == null) continue
  const implAcc = implGraphs.get(implId)
  if (!implAcc) continue

  const g = implAcc.graph?.inner?.graph
  if (!g) continue

  const nodes = g.nodes ?? []
  if (!nodes.length) continue

  // Build node index map
  const nodeMap = new Map<number, any>()
  for (const n of nodes) nodeMap.set(n.nodeIndex, n)

  // For each node, trace each InParam backward
  for (const n of nodes) {
    const nidx = n.nodeIndex

    for (const pin of n.pins ?? []) {
      if (pin.i1?.kind !== 3) continue // Not an InParam
      const pinIdx = pin.i1.index
      if (!pin.connects?.length) continue // Unconnected

      // Trace backward
      const pathNames: string[] = [nodeName(n)]
      let depth = 0
      let curNode: any = n
      let curPinIdx = pinIdx

      while (true) {
        // Find the InParam pin on curNode
        const curPin = (curNode.pins ?? []).find((p: any) => p.i1?.kind === 3 && p.i1?.index === curPinIdx)
        if (!curPin || !curPin.connects?.length) break

        const conn = curPin.connects[0]
        const srcNode = nodeMap.get(conn.id)
        if (!srcNode) {
          pathNames.push(`→ n${conn.id} (NOT FOUND)`)
          break
        }

        depth++
        const srcOutIdx = conn.connect?.index ?? conn.connect2?.index ?? 0
        pathNames.push(`← n${conn.id}:${nodeName(srcNode)}.Out${srcOutIdx}`)

        // Now check if srcNode has any InParam that is itself connected
        const srcInParams = (srcNode.pins ?? []).filter((p: any) => p.i1?.kind === 3)
        let foundNext = false
        for (const sp of srcInParams) {
          if (sp.connects?.length) {
            curNode = srcNode
            curPinIdx = sp.i1.index
            foundNext = true
            break
          }
        }
        if (!foundNext) break
      }

      if (depth >= 2) {
        allChains.push({
          compositeName: info.name,
          startNode: nidx,
          startNodeName: nodeName(n),
          depth,
          inPin: pinIdx,
          path: pathNames
        })
      }
    }
  }
}

// Sort by depth descending
allChains.sort((a, b) => b.depth - a.depth)

console.log(`\n=== TOP 30 DEEPEST DATAFLOW CHAINS ===`)
console.log(`Total chains (depth≥2): ${allChains.length}\n`)

for (let i = 0; i < Math.min(30, allChains.length); i++) {
  const c = allChains[i]
  console.log(`#${i+1} [depth=${c.depth}] "${c.compositeName}" :: n${c.startNode}(${c.startNodeName}).InParam[${c.inPin}]`)
  console.log(`     ${c.path.join(' ')}`)
  console.log()
}

// Per-composite summary
console.log(`\n=== COMPOSITES WITH DEEPEST CHAINS ===`)
const perComp = new Map<string, { maxDepth: number, chains: number }>()
for (const c of allChains) {
  const cur = perComp.get(c.compositeName) ?? { maxDepth: 0, chains: 0 }
  cur.maxDepth = Math.max(cur.maxDepth, c.depth)
  cur.chains++
  perComp.set(c.compositeName, cur)
}

const sorted = [...perComp.entries()].sort((a, b) => b[1].maxDepth - a[1].maxDepth)
for (const [name, stats] of sorted.slice(0, 15)) {
  console.log(`${name}: maxDepth=${stats.maxDepth}, chains≥2=${stats.chains}`)
}

// Trace tool commands for the deepest chains
console.log(`\n=== RECOMMENDED TRACE COMMANDS (deepest chains) ===`)
const shown = new Set<string>()
for (const c of allChains) {
  const key = `${c.compositeName}:${c.startNode}`
  if (shown.has(key)) continue
  shown.add(key)
  console.log(`npx tsx tests/composite/trace-dataflow.ts "复杂gia/物理运动.gia" ${c.startNode} -c "${c.compositeName}"`)
  if (shown.size >= 10) break
}

// Also show chains by depth distribution
console.log(`\n=== DEPTH DISTRIBUTION ===`)
const depthDist = new Map<number, number>()
for (const c of allChains) depthDist.set(c.depth, (depthDist.get(c.depth) ?? 0) + 1)
for (const [d, cnt] of [...depthDist.entries()].sort((a, b) => b[0] - a[0])) {
  console.log(`  depth=${d}: ${cnt} chains`)
}
