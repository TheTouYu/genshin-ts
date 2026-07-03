// @ts-nocheck
/**
 * 精确分析编辑器 GIA 布局：基于 OutFlow pin connections 推算执行链间距。
 *
 * 用法: npx tsx tests/composite/analyze-editor-layout.ts <file.gia> [files...]
 */
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const FILES = process.argv.slice(2)
if (FILES.length === 0) { console.error('用法: ... <file.gia> ...'); process.exit(1) }

function shortName(p) { const m = p.match(/\/([^/]+)\.gia$/); return m ? m[1] : p }

function analyze(nodes) {
  if (!nodes?.length) return null

  // OutFlow pin (kind=2) connects → exec edges
  const edges = [] // [{ from, to }]
  for (const n of nodes) {
    for (const pin of (n.pins ?? [])) {
      if (pin.i1?.kind !== 2) continue
      for (const conn of (pin.connects ?? [])) {
        edges.push({ from: n.nodeIndex, to: conn.id })
      }
    }
  }
  if (edges.length === 0) return null

  const xSteps = []
  const ySteps = []
  const branchYDiffs = []

  // 统计每个父节点的子节点数量
  const childCount = {}
  for (const e of edges) {
    childCount[e.from] = (childCount[e.from] ?? 0) + 1
  }

  for (const e of edges) {
    const from = nodes.find(n => n.nodeIndex === e.from)
    const to = nodes.find(n => n.nodeIndex === e.to)
    if (!from || !to) continue

    const dx = Math.abs(to.x - from.x)
    const dy = Math.abs(to.y - from.y)

    if (dx >= 1) xSteps.push(dx)
    if (dy >= 1) {
      if ((childCount[e.from] ?? 0) > 1) {
        branchYDiffs.push(dy)
      } else {
        ySteps.push(dy)
      }
    }
  }

  const stat = arr => {
    if (!arr.length) return null
    const s = [...arr].sort((a, b) => a - b)
    return {
      avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
      med: s[Math.floor(s.length / 2)],
      min: Math.round(s[0]),
      max: Math.round(s[s.length - 1]),
      n: s.length
    }
  }

  return { x: stat(xSteps), y: stat(ySteps), branchY: stat(branchYDiffs) }
}

// 从 GIA 提取所有 graph（主图 + accessories）
function extractGraphs(data) {
  const gs = []
  const mainG = data.graph?.graph?.inner?.graph
  if (mainG?.nodes?.length) gs.push({ nodes: mainG.nodes, label: '<主图>' })
  for (let i = 0; i < (data.accessories?.length ?? 0); i++) {
    const a = data.accessories[i]
    const g = a.graph?.inner?.graph ?? a.implGraph?.inner?.graph
    if (g?.nodes?.length) gs.push({ nodes: g.nodes, label: `acc[${i}]` })
  }
  return gs
}

// ==== 统计所有文件的 X 步进频率 ====
console.log('=== 全量 X 步进频率分布（所有 graph、所有边） ===\n')
const allXFreq = {}
const allYFreq = {}
const allBranchFreq = {}

for (const file of FILES) {
  const data = decode_gia_file(file)
  const graphs = extractGraphs(data)
  for (const g of graphs) {
    for (const n of g.nodes) {
      for (const pin of (n.pins ?? [])) {
        if (pin.i1?.kind !== 2) continue
        if (!pin.connects) continue
        // 统计子节点数量
        for (const conn of pin.connects) {
          const to = g.nodes.find(x => x.nodeIndex === conn.id)
          if (!to) continue
          const dx = Math.round(Math.abs(to.x - n.x) / 50) * 50
          const dy = Math.round(Math.abs(to.y - n.y) / 50) * 50
          if (dx > 0) allXFreq[dx] = (allXFreq[dx] ?? 0) + 1
          if (dy > 0) {
            // 判断单子还是多子
            const siblings = pin.connects.length
            if (siblings > 1) {
              allBranchFreq[dy] = (allBranchFreq[dy] ?? 0) + 1
            } else {
              allYFreq[dy] = (allYFreq[dy] ?? 0) + 1
            }
          }
        }
      }
    }
  }
}

console.log('X 步进 (exec 链水平间距):')
Object.entries(allXFreq)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`  ${k}: ${v}次 (${Math.round(v * 100 / Object.values(allXFreq).reduce((a, b) => a + b, 0))}%)`))

console.log('\nY 步进 (单链垂直间距):')
const totalY = Object.values(allYFreq).reduce((a, b) => a + b, 0)
Object.entries(allYFreq)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .forEach(([k, v]) => console.log(`  ${k}: ${v}次 (${Math.round(v * 100 / totalY)}%)`))

console.log('\nY 步进 (分支偏移):')
const totalBr = Object.values(allBranchFreq).reduce((a, b) => a + b, 0)
Object.entries(allBranchFreq)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .forEach(([k, v]) => console.log(`  ${k}: ${v}次 (${Math.round(v * 100 / totalBr)}%)`))

// ==== 每个文件的详细分析 ====
console.log('\n\n=== 每个文件详细分析 ===')
for (const file of FILES) {
  const label = shortName(file)
  const data = decode_gia_file(file)
  const graphs = extractGraphs(data)
  console.log(`\n--- ${label} (${graphs.length} graphs) ---`)
  for (const g of graphs) {
    const r = analyze(g.nodes)
    if (!r) continue
    const x = r.x ? `X: avg=${r.x.avg} med=${r.x.med} [${r.x.min},${r.x.max}] n=${r.x.n}` : 'X: -'
    const y = r.y ? `Y(单链): avg=${r.y.avg} med=${r.y.med}` : ''
    const br = r.branchY ? `Y(分支): avg=${r.branchY.avg} med=${r.branchY.med}` : ''
    console.log(`  ${g.label} (${g.nodes.length}节点 ${r.x?.n ?? 0}边): ${x} ${y} ${br}`)
  }
}
