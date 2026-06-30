// @ts-nocheck
/**
 * 全面布局质量检查：重叠检测 + 边交叉分析 + 分支视图 + ASCII 拓扑
 *
 * 用法:
 *   npx tsx tests/composite/audit-layout.ts <file.gia> [file2.gia ...]
 *   npx tsx tests/composite/audit-layout.ts tests/composite/output/*.gia
 */
import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { readFileSync } from 'fs'

const FILES = process.argv.slice(2)
if (!FILES.length) { console.error('用法: ... <file.gia> ...'); process.exit(1) }

function shortName(p) { const m = p.match(/\/([^/]+)\.gia$/); return m ? m[1] : p }

function analyzeFile(path) {
  const name = shortName(path)
  const proto = new URL('../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto', import.meta.url).pathname
  const data = decode_gia_file(path, proto)
  const results = []

  // 提取所有 graph（主图 + accessories）
  const graphs = []
  const mainG = data.graph?.graph?.inner?.graph
  if (mainG?.nodes?.length) graphs.push({ label: '<主图>', nodes: mainG.nodes, isMain: true })
  for (let i = 0; i < (data.accessories?.length ?? 0); i++) {
    const a = data.accessories[i]
    const g = a.graph?.inner?.graph ?? a.implGraph?.inner?.graph
    if (g?.nodes?.length) graphs.push({ label: `acc[${i}]`, nodes: g.nodes, isMain: false })
  }

  for (const g of graphs) {
    const issues = []
    const nodes = g.nodes

    // ---- 1. 节点重叠检测 ----
    const posMap = new Map()
    for (const n of nodes) {
      const key = `${Math.round(n.x)},${Math.round(n.y)}`
      if (posMap.has(key)) {
        issues.push(`OVERLAP: nIdx=${posMap.get(key)} 和 nIdx=${n.nodeIndex} 都在 (${Math.round(n.x)}, ${Math.round(n.y)})`)
      }
      posMap.set(key, n.nodeIndex)
    }

    // ---- 2. 间距过近检测（绝对距离 < 20 像素的节点对）----
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = Math.abs(nodes[i].x - nodes[j].x)
        const dy = Math.abs(nodes[i].y - nodes[j].y)
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 0 && dist < 20) {
          issues.push(`TOO_CLOSE: nIdx=${nodes[i].nodeIndex} 和 nIdx=${nodes[j].nodeIndex} 距离 ${dist.toFixed(0)}px`)
        }
      }
    }

    // ---- 3. OutFlow pin 连接分析 ----
    const outgoing = new Map() // nodeIndex -> [{to, pinIndex, x, y, toX, toY}]
    for (const n of nodes) {
      for (const pin of (n.pins ?? [])) {
        if (pin.i1?.kind !== 2) continue // not OutFlow
        for (const conn of (pin.connects ?? [])) {
          const to = nodes.find(x => x.nodeIndex === conn.id)
          if (to) {
            if (!outgoing.has(n.nodeIndex)) outgoing.set(n.nodeIndex, [])
            outgoing.get(n.nodeIndex).push({
              to: conn.id,
              pinIndex: pin.i1.index,
              fromX: n.x, fromY: n.y,
              toX: to.x, toY: to.y,
              dx: to.x - n.x,
              dy: to.y - n.y
            })
          }
        }
      }
    }

    // ---- 3a. 回溯边（leftward edge）检测 ----
    for (const [from, edges] of outgoing) {
      for (const e of edges) {
        if (e.dx < -50) {
          issues.push(`BACKWARD_EDGE: nIdx=${from} -> nIdx=${e.to} dx=${Math.round(e.dx)}（向左连接）`)
        }
      }
    }

    // ---- 3b. 分支重叠检测 ----
    const nodesWithBranch = [...outgoing.entries()].filter(([_, edges]) => edges.length > 1)
    for (const [from, edges] of nodesWithBranch) {
      // 检查是否有两个子节点在同一 Y 位置
      const ySet = new Set()
      for (const e of edges) {
        const yKey = Math.round(e.toY)
        if (ySet.has(yKey)) {
          issues.push(`BRANCH_OVERLAP: nIdx=${from} 的两个子节点在同一 Y=${Math.round(e.toY)}`)
        }
        ySet.add(yKey)
      }
    }

    // ---- 3c. 边交叉检测（简化版：检查两对 (a->b) 和 (c->d) 是否交叉）----
    const allEdges = [...outgoing.entries()].flatMap(([from, edges]) =>
      edges.map(e => ({ from: nodes.find(n => n.nodeIndex === from), to: nodes.find(n => n.nodeIndex === e.to) }))
    ).filter(e => e.from && e.to)

    let crossCount = 0
    for (let i = 0; i < allEdges.length; i++) {
      for (let j = i + 1; j < allEdges.length; j++) {
        const a = allEdges[i], b = allEdges[j]
        // 共享节点不算交叉
        if (a.from.nodeIndex === b.from.nodeIndex || a.from.nodeIndex === b.to.nodeIndex ||
            a.to.nodeIndex === b.from.nodeIndex || a.to.nodeIndex === b.to.nodeIndex) continue
        // 用矩形交叉检测：两条线段 (a.from→a.to) 和 (b.from→b.to)
        const aMinX = Math.min(a.from.x, a.to.x), aMaxX = Math.max(a.from.x, a.to.x)
        const aMinY = Math.min(a.from.y, a.to.y), aMaxY = Math.max(a.from.y, a.to.y)
        const bMinX = Math.min(b.from.x, b.to.x), bMaxX = Math.max(b.from.x, b.to.x)
        const bMinY = Math.min(b.from.y, b.to.y), bMaxY = Math.max(b.from.y, b.to.y)
        const overlapX = !(aMaxX < bMinX || bMaxX < aMinX)
        const overlapY = !(aMaxY < bMinY || bMaxY < aMinY)
        if (overlapX && overlapY) crossCount++
      }
    }
    if (crossCount > 0) {
      issues.push(`EDGE_CROSS: ${crossCount} 对边可能交叉`)
    }

    // ---- 4. 游离节点（无 exec 连接） ----
    const hasOutEdge = new Set([...outgoing.keys()])
    const hasInEdge = new Set([...outgoing.values()].flat().map(e => e.to))
    const connectedNodes = new Set([...hasOutEdge, ...hasInEdge])
    const orphans = nodes.filter(n => !connectedNodes.has(n.nodeIndex))
    if (orphans.length > 0) {
      const orphanInfo = orphans.map(n => `nIdx=${n.nodeIndex}`).join(', ')
      issues.push(`ORPHAN: ${orphans.length} 个节点无 exec 连接: ${orphanInfo}`)
    }

    // ---- 5. ASCII 拓扑（只有节点数 <= 15 的 graph）----
    let ascii = ''
    if (nodes.length <= 15 && outgoing.size > 0) {
      ascii = '\n  拓扑:\n'
      const visited = new Set()
      const stack = [...outgoing.keys()].filter(k => !hasInEdge.has(k)).sort((a, b) => a - b)
      while (stack.length) {
        const id = stack.shift()
        if (visited.has(id)) continue
        visited.add(id)
        const edges = outgoing.get(id) || []
        const n = nodes.find(x => x.nodeIndex === id)
        const coord = n ? `(${Math.round(n.x)},${Math.round(n.y)})` : ''
        ascii += `  ${String(id).padStart(2)} ${coord}`
        if (edges.length > 1) {
          ascii += ` → [${edges.map(e => e.to).join(', ')}]`
          edges.forEach(e => { if (!visited.has(e.to) && !stack.includes(e.to)) stack.push(e.to) })
        } else if (edges.length === 1) {
          ascii += ` → ${edges[0].to}`
          if (!visited.has(edges[0].to) && !stack.includes(edges[0].to)) stack.push(edges[0].to)
        }
        ascii += '\n'
      }
    }

    results.push({
      label: `${g.label}${g.isMain ? ' (主图)' : ''}`,
      nodeCount: nodes.length,
      edgeCount: [...outgoing.values()].reduce((s, e) => s + e.length, 0),
      branchCount: [...outgoing.values()].filter(e => e.length > 1).length,
      orphans: orphans.length,
      crossCount,
      issues,
      ascii
    })
  }

  return { name, results }
}

console.log('='.repeat(80))
for (const file of FILES) {
  const { name, results } = analyzeFile(file)
  console.log(`\n## ${name}`)
  let totalIssues = 0
  for (const r of results) {
    const icon = r.issues.length === 0 ? '✅' : '⚠️'
    console.log(`\n${icon} ${r.label}: ${r.nodeCount}节点 ${r.edgeCount}边 ${r.branchCount}分支 ${r.orphans}游离 ${r.crossCount}交叉`)
    if (r.issues.length > 0) {
      r.issues.forEach(issue => console.log(`  🔴 ${issue}`))
      totalIssues += r.issues.length
    } else {
      console.log(`  无异常`)
    }
    if (r.ascii) console.log(r.ascii)
  }
  if (totalIssues === 0) {
    console.log(`\n✅ ${name} 布局质量检查全部通过`)
  } else {
    console.log(`\n⚠️ ${name} 有 ${totalIssues} 个问题`)
  }
}
console.log('\n' + '='.repeat(80))
