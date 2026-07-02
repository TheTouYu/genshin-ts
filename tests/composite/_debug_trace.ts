#!/usr/bin/env npx tsx
/**
 * Debug: Show edge structure and trace specific chains
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

const compositeNames = new Map<number, string>()
const compositeDefs = new Map<number, any>()
const implGraphMap = new Map<number, any>()
const defToImpl = new Map<number, number>()

for (const a of data.accessories ?? []) {
  const id = a.id?.id
  const def = a.compositeDef?.inner?.def
  if (def && id != null) {
    compositeNames.set(id, def.name)
    compositeDefs.set(id, def)
  }
}
for (const a of data.accessories ?? []) {
  const id = a.id?.id
  const which = a.compositeDef?.inner?.which
  const related = a.relatedIds?.[0]?.id
  if (which === 9 && related != null && id != null) {
    defToImpl.set(related, id)
    implGraphMap.set(id, a)
  }
}

function nodeName(n: any): string {
  const nid = n.genericId?.nodeId
  const compId = n.compositeId?.id
  if (compId && compositeNames.has(compId))
    return `复合:${compositeNames.get(compId)}`
  if (nid != null && nameMap.has(nid))
    return nameMap.get(nid)!
  return `nid=${nid}`
}

// Check a specific composite: 计算分力 (acc index 76 or composite def id?)
// Let's find 计算分力's impl graph
for (const [compId, compName] of compositeNames) {
  if (compName !== '计算分力') continue
  const implId = defToImpl.get(compId)
  if (implId == null) { console.log(`计算分力: no impl graph found`); continue }
  const impl = implGraphMap.get(implId)
  if (!impl || !impl.graph) { console.log(`计算分力: impl graph missing`); continue }

  console.log(`\n=== 计算分力 (compId=${compId}, implId=${implId}) ===`)
  const graph = impl.graph
  const nodes = graph.nodes ?? []
  const edges = graph.edges ?? []

  console.log(`Nodes: ${nodes.length}, Edges: ${edges.length}`)

  // Show edge structure
  console.log(`\n--- Edges (first 10) ---`)
  for (let i = 0; i < Math.min(10, edges.length); i++) {
    const e = edges[i]
    console.log(`edge[${i}]: fromNode=${e.fromNodeIndex} fromPin=${e.fromPinIndex} → toNode=${e.toNodeIndex} toPin=${e.toPinIndex}`)
  }

  // Show node names
  console.log(`\n--- Nodes ---`)
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    const nid = n.nodeIndex ?? i
    const pins = n.pins ?? []
    const inParams = pins.filter((p: any) => p.kind === 3).map((p: any) => `InParam[${p.index}]`)
    const outParams = pins.filter((p: any) => p.kind === 4).map((p: any) => `OutParam[${p.index}]`)
    console.log(`n[${nid}] ${nodeName(n)} ${inParams.join(',')} ${outParams.join(',')}`)
  }

  // Show full connections
  console.log(`\n--- All Connections ---`)
  const inputSources = new Map<string, { fromNode: number, fromPin: number }>()
  for (const e of edges) {
    const key = `${e.toNodeIndex}:${e.toPinIndex}`
    inputSources.set(key, { fromNode: e.fromNodeIndex, fromPin: e.fromPinIndex })
    console.log(`  n[${e.fromNodeIndex}](OutParam[${e.fromPinIndex}]) → n[${e.toNodeIndex}](InParam[${e.toPinIndex}])`)
  }

  // Now trace from node 6 (计算合力) all inputs
  console.log(`\n--- Trace from n=6 (计算合力) ---`)
  const targetNode = nodes.find((n: any) => (n.nodeIndex ?? nodes.indexOf(n)) === 6)
  if (targetNode) {
    const pins = targetNode.pins ?? []
    for (const pin of pins) {
      if (pin.kind !== 3) continue
      const key = `6:${pin.index}`
      console.log(`\nInParam[${pin.index}]:`)
      if (inputSources.has(key)) {
        let cur = inputSources.get(key)!
        let depth = 0
        while (cur) {
          depth++
          const srcName = nodeName(nodes[cur.fromNode] ?? {})
          console.log(`  depth${depth}: n[${cur.fromNode}] ${srcName} OutParam[${cur.fromPin}]`)
          // Follow this node's inputs
          const srcPins = (nodes[cur.fromNode]?.pins ?? []).filter((p: any) => p.kind === 3)
          let found = false
          for (const sp of srcPins) {
            const srcKey = `${cur.fromNode}:${sp.index}`
            if (inputSources.has(srcKey)) {
              cur = inputSources.get(srcKey)!
              found = true
              break
            }
          }
          if (!found) {
            console.log(`  → terminal (no more inputs)`)
            break
          }
        }
      } else {
        console.log(`  → unconnected or parent_input`)
      }
    }
  }
}

// Also check 物理运动控制器's impl graph
for (const [compId, compName] of compositeNames) {
  if (compName !== '物理运动控制器') continue
  const implId = defToImpl.get(compId)
  if (implId == null) continue
  const impl = implGraphMap.get(implId)
  if (!impl || !impl.graph) continue

  console.log(`\n\n=== 物理运动控制器 (compId=${compId}, implId=${implId}) ===`)
  const graph = impl.graph
  const nodes = graph.nodes ?? []
  const edges = graph.edges ?? []
  console.log(`Nodes: ${nodes.length}, Edges: ${edges.length}`)

  // Show all composite nodes and their names
  for (const n of nodes) {
    const nid = n.nodeIndex ?? nodes.indexOf(n)
    const compIdNode = n.compositeId?.id
    if (compIdNode && compositeNames.has(compIdNode)) {
      console.log(`n[${nid}] 复合:${compositeNames.get(compIdNode)}`)
    } else {
      const nm = nodeName(n)
      if (nm !== `nid=${n.genericId?.nodeId}`)
        console.log(`n[${nid}] ${nm}`)
    }
  }
}
