// 按用户规则计算单个节点图的游戏数量：
// 普通节点权重 1；复合节点调用权重 = 2 + 内部递归权重；定义本身不计。
// 输出 mainExpanded（1+内部）和 totalCompositeInstances（递归展开中复合调用总数），
// 预测值 = mainExpanded + totalCompositeInstances。
// 用法：npx tsx examples/rubik-3x3-client/tools/recursive-count.ts <map.gil> [graphId]
import { readFileSync } from 'node:fs'
import { listGraphs, locateGraphField, parseGraphNodes, listCompositeDefs, compositeImplGraphId } from '../../../src/cli/static_assembly/graph_edit.js'

const gil = process.argv[2]
const rootId = process.argv[3] ? Number(process.argv[3]) : 1073741827
const b = readFileSync(gil)
const p = b.slice(20, -4)
const defs = listCompositeDefs(b)
const defImpl = new Map<number, number>()
for (const d of defs) { try { defImpl.set(d.id, compositeImplGraphId(p, d.id)) } catch {} }
const graphNodes = new Map<number, any[]>()
for (const g of listGraphs(b)) {
  const { field } = locateGraphField(p, g.id)
  graphNodes.set(g.id, parseGraphNodes(p.subarray(field.dataStart, field.dataEnd)))
}
const memoM = new Map<number, number>()
const memoI = new Map<number, number>()
function count(gid: number): number {
  if (memoM.has(gid)) return memoM.get(gid)!
  const nodes = graphNodes.get(gid) ?? []
  let total = 0
  for (const n of nodes) {
    total += 1
    const iid = defImpl.get(n.genericId)
    if (iid !== undefined) total += count(iid)
  }
  memoM.set(gid, total)
  return total
}
function totalInst(gid: number): number {
  if (memoI.has(gid)) return memoI.get(gid)!
  const nodes = graphNodes.get(gid) ?? []
  let total = 0
  for (const n of nodes) {
    const iid = defImpl.get(n.genericId)
    if (iid !== undefined) {
      total += 1
      total += totalInst(iid)
    }
  }
  memoI.set(gid, total)
  return total
}
const M = count(rootId)
const I = totalInst(rootId)
console.log(JSON.stringify({ graphId: rootId, mainExpanded: M, totalCompositeInstances: I, predicted: M + I }, null, 2))
