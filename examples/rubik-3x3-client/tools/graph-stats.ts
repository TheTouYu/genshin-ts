// 统计单个节点图的节点分类、被消费状态与边类型，用于校准游戏“节点图数量”公式。
// 用法：npx tsx examples/rubik-3x3-client/tools/graph-stats.ts <map.gil> [graphId]
import { readFileSync } from 'node:fs'
import {
  listGraphs,
  locateGraphField,
  parseGraphNodes,
  nodeName,
  listCompositeDefs
} from '../../../src/cli/static_assembly/graph_edit.js'

const gil = process.argv[2]
const gid = process.argv[3] ? Number(process.argv[3]) : 1073741827
const b = readFileSync(gil)
const p = b.slice(20, -4)
const graph = listGraphs(b).find((g) => g.id === gid)
if (!graph) throw new Error(`graph ${gid} not found`)
const { field } = locateGraphField(p, gid)
const nodes = parseGraphNodes(p.subarray(field.dataStart, field.dataEnd))
const defIds = new Set(listCompositeDefs(b).map((d) => d.id))
const defName = new Map(listCompositeDefs(b).map((d) => [d.id, d.name]))

const CONTROL = new Set(['Double Branch', 'Multiple Branches', 'Start Timer', 'When Timer Is Triggered'])
const COMPOSITE_MARK = 0x7fffffff

function label(n: (typeof nodes)[number]): string {
  if (defIds.has(n.genericId)) return `复合:${defName.get(n.genericId) ?? n.genericId}`
  return nodeName(n.genericId) ?? `#${n.genericId}`
}

type Edge = { from: number; fromKind: number; to: number; toKind: number; kind: 'flow' | 'data' | 'other' }
const edges: Edge[] = []
for (const n of nodes) {
  for (const pin of n.pins) {
    if (pin.kind === 2) {
      // 控制流：记录在源 OutFlow pin 上
      for (const c of pin.connects) {
        edges.push({ from: n.index, fromKind: 2, to: c.id, toKind: 1, kind: 'flow' })
      }
    } else if (pin.kind === 3) {
      // 数据流：记录在目标 InParam pin 上
      for (const c of pin.connects) {
        edges.push({ from: c.id, fromKind: c.kind, to: n.index, toKind: 3, kind: c.kind === 4 ? 'data' : 'other' })
      }
    }
  }
}
const outCount = new Map<number, number>()
for (const e of edges) outCount.set(e.from, (outCount.get(e.from) ?? 0) + 1)
const dataOutRefs = new Map<number, number>()
for (const e of edges) {
  if (e.kind === 'data') dataOutRefs.set(e.from, (dataOutRefs.get(e.from) ?? 0) + 1)
}
const flowOutCount = new Map<number, number>()
for (const e of edges) {
  if (e.kind === 'flow') flowOutCount.set(e.from, (flowOutCount.get(e.from) ?? 0) + 1)
}
const inCount = new Map<number, number>()
for (const e of edges) inCount.set(e.to, (inCount.get(e.to) ?? 0) + 1)

const byName = new Map<string, { total: number; consumed: number; unconsumed: number }>()
let composite = 0
let control = 0
let data = 0
let dataConsumed = 0
let dataUnconsumed = 0
let controlConsumed = 0
let controlUnconsumed = 0
let flowEdges = 0
let dataEdges = 0
for (const n of nodes) {
  const l = label(n)
  const dataConsumedFlag = (dataOutRefs.get(n.index) ?? 0) > 0
  const flowConsumedFlag = (flowOutCount.get(n.index) ?? 0) > 0
  const rec = byName.get(l) ?? { total: 0, consumed: 0, unconsumed: 0 }
  rec.total++
  if (dataConsumedFlag || flowConsumedFlag) rec.consumed++
  else rec.unconsumed++
  byName.set(l, rec)
  if (defIds.has(n.genericId)) {
    composite++
  } else if (CONTROL.has(nodeName(n.genericId) ?? '')) {
    control++
    if (flowConsumedFlag) controlConsumed++
    else controlUnconsumed++
  } else {
    data++
    if (dataConsumedFlag) dataConsumed++
    else dataUnconsumed++
  }
}
for (const e of edges) {
  if (e.kind === 'flow') flowEdges++
  else if (e.kind === 'data') dataEdges++
}

console.log(`graph ${gid} ${graph.name ?? ''} nodes=${nodes.length}`)
console.log(JSON.stringify({
  graphId: gid,
  totalNodes: nodes.length,
  composite,
  control,
  data,
  dataConsumed,
  dataUnconsumed,
  controlConsumed,
  controlUnconsumed,
  flowEdges,
  dataEdges,
  totalEdges: edges.length,
  byName: Object.fromEntries([...byName.entries()].sort((a, b) => b[1].total - a[1].total))
}, null, 2))
