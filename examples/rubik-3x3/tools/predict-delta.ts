// 用“调用代价2 + 内部递归”规则计算两个地图的规则计数差值
// 用法：npx tsx examples/rubik-3x3/tools/predict-delta.ts <baseline.gil> <new.gil> <baselineActual>
import { readFileSync } from 'node:fs'
import { listGraphs, locateGraphField, parseGraphNodes, listCompositeDefs, compositeImplGraphId } from '../../../src/cli/static_assembly/graph_edit.js'

function ruleCount(gil: string, rootId: number): { mainExpanded: number; totalInst: number; rule: number } {
  const b = readFileSync(gil)
  const p = b.slice(20, -4)
  const defs = listCompositeDefs(b)
  const defImpl = new Map<number, number>()
  for (const d of defs) { try { defImpl.set(d.id, compositeImplGraphId(p, d.id)) } catch {} }
  const graphNodes = new Map<number, any[]>()
  for (const g of listGraphs(b)) { const { field } = locateGraphField(p, g.id); graphNodes.set(g.id, parseGraphNodes(p.subarray(field.dataStart, field.dataEnd))) }
  const memoM = new Map<number, number>()
  const memoI = new Map<number, number>()
  function count(gid: number): number {
    if (memoM.has(gid)) return memoM.get(gid)!
    const nodes = graphNodes.get(gid) ?? []
    let total = 0
    for (const n of nodes) { total += 1; const iid = defImpl.get(n.genericId); if (iid !== undefined) total += count(iid) }
    memoM.set(gid, total); return total
  }
  function totalInst(gid: number): number {
    if (memoI.has(gid)) return memoI.get(gid)!
    const nodes = graphNodes.get(gid) ?? []
    let total = 0
    for (const n of nodes) { const iid = defImpl.get(n.genericId); if (iid !== undefined) { total += 1; total += totalInst(iid) } }
    memoI.set(gid, total); return total
  }
  const M = count(rootId)
  const I = totalInst(rootId)
  return { mainExpanded: M, totalInst: I, rule: M + I }
}

const [baseGil, newGil, baseActualStr] = process.argv.slice(2)
if (!baseGil || !newGil || !baseActualStr) {
  console.error('用法: npx tsx examples/rubik-3x3/tools/predict-delta.ts <baseline.gil> <new.gil> <baselineActual>')
  process.exit(1)
}
const baseActual = Number(baseActualStr)
const a = ruleCount(baseGil, 1073741827)
const b = ruleCount(newGil, 1073741827)
const delta = b.rule - a.rule
console.log(JSON.stringify({ baselineRule: a.rule, newRule: b.rule, predictedDelta: delta, predictedNewActual: baseActual + delta, baselineActual: baseActual }, null, 2))
