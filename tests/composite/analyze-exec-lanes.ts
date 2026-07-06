// @ts-nocheck
/**
 * Analyze execution fan-out lanes in a GIA graph.
 *
 * Usage:
 *   npx tsx tests/composite/analyze-exec-lanes.ts <file.gia> [files...]
 */

import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Usage: npx tsx tests/composite/analyze-exec-lanes.ts <file.gia> [files...]')
  process.exit(1)
}

function shortName(path: string): string {
  return path.split('/').pop() ?? path
}

function extractGraphs(data: any) {
  const graphs: Array<{ label: string; nodes: any[] }> = []
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

function execChildren(node: any) {
  const children: Array<{ id: number; outIndex: number }> = []
  for (const pin of node.pins ?? []) {
    if (pin.i1?.kind !== 2) continue
    for (const conn of pin.connects ?? []) {
      children.push({ id: conn.id, outIndex: pin.i1.index ?? 0 })
    }
  }
  return children
}

function analyzeGraph(label: string, nodes: any[]) {
  const byId = new Map(nodes.map((node) => [node.nodeIndex, node]))
  let printed = false

  for (const node of nodes) {
    const children = execChildren(node)
      .map((child) => ({ ...child, node: byId.get(child.id) }))
      .filter((child) => child.node)
      .sort((a, b) => a.outIndex - b.outIndex || a.node.y - b.node.y || a.id - b.id)

    if (children.length < 2) continue

    if (!printed) {
      console.log(`\n=== ${label} ===`)
      printed = true
    }

    console.log(
      `parent n${node.nodeIndex} @ (${Math.round(node.x)}, ${Math.round(node.y)}) children=${children.length}`
    )

    const byY = [...children].sort((a, b) => a.node.y - b.node.y || a.id - b.id)
    for (let i = 0; i < byY.length; i++) {
      const child = byY[i]
      const prev = i > 0 ? byY[i - 1].node : null
      const dx = Math.round(child.node.x - node.x)
      const dy = Math.round(child.node.y - node.y)
      const step = prev ? Math.round(child.node.y - prev.y) : 0
      console.log(
        `  out${child.outIndex} -> n${child.id} @ (${Math.round(child.node.x)}, ${Math.round(
          child.node.y
        )}) dx=${dx} dy=${dy} stepFromPrev=${step}`
      )
    }
  }
}

for (const file of files) {
  const data = decode_gia_file(file)
  console.log(`\n## ${shortName(file)}`)
  for (const graph of extractGraphs(data)) {
    analyzeGraph(graph.label, graph.nodes)
  }
}
