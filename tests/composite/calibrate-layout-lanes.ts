// @ts-nocheck
/**
 * Calibrate lane spacing against real/editor GIA files.
 *
 * Usage:
 *   npx tsx tests/composite/calibrate-layout-lanes.ts <file.gia> [files...]
 */

import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Usage: npx tsx tests/composite/calibrate-layout-lanes.ts <file.gia> [files...]')
  process.exit(1)
}

type NodeInfo = {
  nodeIndex: number
  x: number
  y: number
  pins?: Array<any>
  genericId?: any
}

type GraphInfo = {
  label: string
  nodes: NodeInfo[]
}

type Range = {
  minY: number
  maxY: number
}

type ChildInfo = {
  id: number
  outIndex: number
  node: NodeInfo
  execRange: Range
  execCount: number
  dataRange: Range | null
  dataCount: number
  blockBottom: number
}

const NODE_HEIGHT = 350

function shortName(path: string): string {
  return path.split('/').pop() ?? path
}

function extractGraphs(data: any): GraphInfo[] {
  const graphs: GraphInfo[] = []
  const main = data.graph?.graph?.inner?.graph
  if (main?.nodes?.length) graphs.push({ label: '<main>', nodes: main.nodes })

  for (let i = 0; i < (data.accessories?.length ?? 0); i++) {
    const accessory = data.accessories[i]
    const graph = accessory.graph?.inner?.graph ?? accessory.implGraph?.inner?.graph
    if (!graph?.nodes?.length) continue
    const name = accessory.compositeDef?.inner?.def?.name
    graphs.push({ label: name ? `acc[${i}] ${name}` : `acc[${i}]`, nodes: graph.nodes })
  }

  return graphs
}

function getExecChildren(node: NodeInfo): Array<{ id: number; outIndex: number }> {
  const children: Array<{ id: number; outIndex: number }> = []
  for (const pin of node.pins ?? []) {
    if (pin.i1?.kind !== 2) continue
    for (const conn of pin.connects ?? []) {
      children.push({ id: conn.id, outIndex: pin.i1.index ?? 0 })
    }
  }
  return children
}

function buildExecChildrenMap(nodes: NodeInfo[]): Map<number, number[]> {
  const result = new Map<number, number[]>()
  for (const node of nodes) {
    const children = getExecChildren(node).map((child) => child.id)
    if (children.length > 0) result.set(node.nodeIndex, children)
  }
  return result
}

function buildDataParentsMap(nodes: NodeInfo[]): Map<number, number[]> {
  const result = new Map<number, number[]>()
  for (const node of nodes) {
    for (const pin of node.pins ?? []) {
      if (pin.i1?.kind !== 3) continue
      for (const conn of pin.connects ?? []) {
        const parents = result.get(node.nodeIndex) ?? []
        parents.push(conn.id)
        result.set(node.nodeIndex, parents)
      }
    }
  }
  return result
}

function rangeOf(nodes: NodeInfo[]): Range {
  return {
    minY: Math.min(...nodes.map((node) => node.y)),
    maxY: Math.max(...nodes.map((node) => node.y))
  }
}

function collectExecSubtree(
  nodeId: number,
  execChildrenMap: Map<number, number[]>,
  result = new Set<number>()
): Set<number> {
  if (result.has(nodeId)) return result
  result.add(nodeId)
  for (const child of execChildrenMap.get(nodeId) ?? []) {
    collectExecSubtree(child, execChildrenMap, result)
  }
  return result
}

function collectDataAncestors(
  nodeId: number,
  dataParentsMap: Map<number, number[]>,
  result = new Set<number>()
): Set<number> {
  for (const parent of dataParentsMap.get(nodeId) ?? []) {
    if (result.has(parent)) continue
    result.add(parent)
    collectDataAncestors(parent, dataParentsMap, result)
  }
  return result
}

function collectAttachedDataForExecSubtree(
  execIds: Set<number>,
  dataParentsMap: Map<number, number[]>
): Set<number> {
  const result = new Set<number>()
  for (const execId of execIds) {
    collectDataAncestors(execId, dataParentsMap, result)
  }
  return result
}

function fmtRange(range: Range | null): string {
  if (!range) return '-'
  return `${Math.round(range.minY)}..${Math.round(range.maxY)} h=${Math.round(range.maxY - range.minY)}`
}

function analyzeGraph(graph: GraphInfo) {
  const byId = new Map(graph.nodes.map((node) => [node.nodeIndex, node]))
  const execChildrenMap = buildExecChildrenMap(graph.nodes)
  const dataParentsMap = buildDataParentsMap(graph.nodes)
  let printed = false

  for (const parent of graph.nodes) {
    const children = getExecChildren(parent)
      .map((child) => ({ ...child, node: byId.get(child.id) }))
      .filter((child) => child.node)
      .sort((a, b) => a.outIndex - b.outIndex || a.node.y - b.node.y || a.id - b.id)

    if (children.length < 2) continue

    const childInfos: ChildInfo[] = children
      .map((child) => {
        const execIds = collectExecSubtree(child.id, execChildrenMap)
        const execNodes = [...execIds].map((id) => byId.get(id)).filter(Boolean)
        const dataIds = collectAttachedDataForExecSubtree(execIds, dataParentsMap)
        const dataNodes = [...dataIds].map((id) => byId.get(id)).filter(Boolean)
        const execRange = rangeOf(execNodes)
        const dataRange = dataNodes.length > 0 ? rangeOf(dataNodes) : null
        const blockBottom = Math.max(
          execRange.maxY + NODE_HEIGHT,
          dataRange ? dataRange.maxY + NODE_HEIGHT : Number.NEGATIVE_INFINITY
        )
        return {
          id: child.id,
          outIndex: child.outIndex,
          node: child.node,
          execRange,
          execCount: execNodes.length,
          dataRange,
          dataCount: dataNodes.length,
          blockBottom
        }
      })
      .sort((a, b) => a.node.y - b.node.y || a.id - b.id)

    if (!printed) {
      console.log(`\n=== ${graph.label} ===`)
      printed = true
    }

    console.log(
      `parent n${parent.nodeIndex} @ (${Math.round(parent.x)}, ${Math.round(parent.y)}) children=${childInfos.length}`
    )

    for (let i = 0; i < childInfos.length; i++) {
      const child = childInfos[i]
      const prev = i > 0 ? childInfos[i - 1] : null
      const dy = Math.round(child.node.y - parent.y)
      const stepFromPrev = prev ? Math.round(child.node.y - prev.node.y) : 0
      const gapAfterPrevBlock = prev ? Math.round(child.node.y - prev.blockBottom) : 0
      console.log(
        `  out${child.outIndex} -> n${child.id} @ (${Math.round(child.node.x)}, ${Math.round(
          child.node.y
        )}) dy=${dy} step=${stepFromPrev} gapAfterPrevBlock=${gapAfterPrevBlock}`
      )
      console.log(
        `    exec n=${child.execCount} y=${fmtRange(child.execRange)} data n=${child.dataCount} y=${fmtRange(
          child.dataRange
        )} blockBottom=${Math.round(child.blockBottom)}`
      )
    }
  }
}

for (const file of files) {
  const data = decode_gia_file(file)
  console.log(`\n## ${shortName(file)}`)
  for (const graph of extractGraphs(data)) {
    analyzeGraph(graph)
  }
}
