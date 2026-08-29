// 对比两个快照中指定节点图的节点集合差异（按 index / genericId / 名称 / 出边数）
// 用法：npx tsx examples/rubik-3x3-client/tools/diff-graph-nodes.ts <a.gil> <b.gil> [graphId]
import { readFileSync } from 'node:fs'
import { listGraphs, locateGraphField, parseGraphNodes, nodeName } from '../../../src/cli/static_assembly/graph_edit.js'

const [aPath, bPath, gidStr] = process.argv.slice(2)
const gid = gidStr ? Number(gidStr) : 1073741827

function load(path: string) {
  const b = readFileSync(path)
  const p = b.slice(20, -4)
  const graph = listGraphs(b).find((g) => g.id === gid)
  if (!graph) throw new Error(`graph ${gid} not found in ${path}`)
  const { field } = locateGraphField(p, gid)
  return parseGraphNodes(p.subarray(field.dataStart, field.dataEnd))
}

function summarize(nodes: ReturnType<typeof load>) {
  const byName = new Map<string, number>()
  for (const n of nodes) {
    const name = nodeName(n.genericId) ?? `#${n.genericId}`
    byName.set(name, (byName.get(name) ?? 0) + 1)
  }
  return Object.fromEntries([...byName.entries()].sort((a, b) => b[1] - a[1]))
}

function edges(n: ReturnType<typeof load>[number]) {
  return n.pins.reduce((s, p) => s + p.connects.length, 0)
}

const a = load(aPath)
const b = load(bPath)
const aIdx = new Map(a.map((n) => [n.index, n]))
const bIdx = new Map(b.map((n) => [n.index, n]))

console.log(`graph ${gid}: A=${a.length} B=${b.length} Δ=${b.length - a.length}`)
console.log('\nA by name:')
console.log(JSON.stringify(summarize(a), null, 2))
console.log('\nB by name:')
console.log(JSON.stringify(summarize(b), null, 2))

const added = b.filter((n) => !aIdx.has(n.index))
const removed = a.filter((n) => !bIdx.has(n.index))
const changed = b.filter((n) => {
  const old = aIdx.get(n.index)
  return old && (old.genericId !== n.genericId || old.x !== n.x || old.y !== n.y || edges(old) !== edges(n))
})
function pinDump(n: ReturnType<typeof load>[number]) {
  return n.pins.map((p, i) => {
    const conns = p.connects.map((c) => `n${c.id}:${c.kind}:${c.index}`).join(',') || '-'
    return `    pin${i} k=${p.kind} idx=${p.index} type=${p.type} val=${p.valueText} -> ${conns}`
  }).join('\n')
}

console.log('\nadded nodes:')
for (const n of added) {
  console.log(`  n=${n.index} ${nodeName(n.genericId) ?? n.genericId} pos=(${n.x},${n.y}) outEdges=${edges(n)} pins=${n.pins.length}`)
  console.log(pinDump(n))
}
console.log('\nremoved nodes:')
for (const n of removed) console.log(`  n=${n.index} ${nodeName(n.genericId) ?? n.genericId} pos=(${n.x},${n.y}) outEdges=${edges(n)}`)
console.log('\nchanged nodes:')
for (const n of changed) {
  const old = aIdx.get(n.index)!
  console.log(`  n=${n.index} ${nodeName(old.genericId) ?? old.genericId} -> ${nodeName(n.genericId) ?? n.genericId} outEdges ${edges(old)}->${edges(n)} pos (${old.x},${old.y})->(${n.x},${n.y})`)
  console.log('  A pins:')
  console.log(pinDump(old))
  console.log('  B pins:')
  console.log(pinDump(n))
}
