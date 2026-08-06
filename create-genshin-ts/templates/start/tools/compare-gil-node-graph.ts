import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { readGilPayloadFields } from 'genshin-ts/cli/gil_extract_utils.js'
import { parseMessage, readVarint } from 'genshin-ts/injector/binary.js'
import { loadGiaProto } from 'genshin-ts/injector/proto.js'
import type { LenField } from 'genshin-ts/injector/types.js'

type GraphNode = Record<string, unknown> & {
  nodeIndex?: number
  genericId?: { nodeId?: number }
  concreteId?: { nodeId?: number }
  pins?: unknown[]
}

type NodeGraph = Record<string, unknown> & {
  id?: { id?: number; type?: number }
  name?: string
  nodes?: GraphNode[]
}

type NodeChange = {
  nodeIndex: number
  before?: unknown
  after?: unknown
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

// wire 层记录遍历（与 scripts/extract-node-raw.ts 同构）：pinCount 口径 = 节点记录内
// field=4 wire=2 的 pin 记录数，不依赖 protobufjs decode（decode 遇畸形字段会跳过/抛错）
function topFields(buf: Uint8Array): { field: number; wire: number; data: Uint8Array; value: number | null }[] {
  const out: { field: number; wire: number; data: Uint8Array; value: number | null }[] = []
  let pos = 0
  while (pos < buf.length) {
    const k = readVarint(buf, pos)
    if (!k) break
    pos = k.next
    const field = k.value >> 3
    const wire = k.value & 7
    if (wire === 0) {
      const v = readVarint(buf, pos)
      if (!v) break
      pos = v.next
      out.push({ field, wire, data: new Uint8Array(), value: v.value })
    } else if (wire === 2) {
      const lv = readVarint(buf, pos)
      if (!lv) break
      pos = lv.next
      const len = Number(lv.value)
      out.push({ field, wire, data: buf.subarray(pos, pos + len), value: null })
      pos += len
    } else if (wire === 1) {
      out.push({ field, wire, data: buf.subarray(pos, pos + 8), value: null })
      pos += 8
    } else if (wire === 5) {
      out.push({ field, wire, data: buf.subarray(pos, pos + 4), value: null })
      pos += 4
    } else throw new Error(`unhandled wire ${wire}`)
  }
  return out
}

function readNodeGraph(gilPath: string, graphId: number): { graph: NodeGraph; wirePinCounts: Map<number, number> } {
  const { payload, fields } = readGilPayloadFields(gilPath)
  const blobs: LenField[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields, {
    nodeGraphBlobFields: blobs
  })
  const { nodeGraphMessage } = loadGiaProto()
  for (const field of blobs) {
    const graph = nodeGraphMessage.decode(
      payload.subarray(field.dataStart, field.dataEnd)
    ) as unknown as NodeGraph
    if (Number(graph.id?.id) !== graphId) continue
    const wirePinCounts = new Map<number, number>()
    for (const nf of topFields(payload.subarray(field.dataStart, field.dataEnd)).filter((f) => f.field === 3 && f.wire === 2)) {
      const m = topFields(nf.data)
      const idx = m.find((f) => f.field === 1 && f.wire === 0)
      if (idx) wirePinCounts.set(Number(idx.value), m.filter((f) => f.field === 4 && f.wire === 2).length)
    }
    return { graph, wirePinCounts }
  }
  throw new Error(`NodeGraph ${graphId} not found in ${gilPath}`)
}

function nodeSummary(node: GraphNode, pinCount: number): unknown {
  const genericId = Number(node.genericId?.nodeId)
  const concreteId = Number(node.concreteId?.nodeId)
  return {
    nodeIndex: Number(node.nodeIndex),
    ...(genericId ? { genericId } : {}),
    ...(concreteId ? { concreteId } : {}),
    pinCount
  }
}

function withoutNodes(graph: NodeGraph): Record<string, unknown> {
  const { nodes: _nodes, ...rest } = graph
  return rest
}

export function compareGilNodeGraph(
  beforePath: string,
  afterPath: string,
  graphId: number,
  full = false
): unknown {
  const beforeBytes = readFileSync(beforePath)
  const afterBytes = readFileSync(afterPath)
  const before = readNodeGraph(beforePath, graphId)
  const after = readNodeGraph(afterPath, graphId)
  const beforeNodes = new Map((before.graph.nodes ?? []).map((node) => [Number(node.nodeIndex), node]))
  const afterNodes = new Map((after.graph.nodes ?? []).map((node) => [Number(node.nodeIndex), node]))
  const pinCount = (side: typeof before, node: GraphNode) =>
    side.wirePinCounts.get(Number(node.nodeIndex)) ?? node.pins?.length ?? 0
  const render = full
    ? (node: GraphNode) => node
    : (node: GraphNode, side: typeof before) => nodeSummary(node, pinCount(side, node))
  const added: NodeChange[] = []
  const removed: NodeChange[] = []
  const changed: NodeChange[] = []

  for (const [nodeIndex, node] of afterNodes) {
    const old = beforeNodes.get(nodeIndex)
    if (!old) added.push({ nodeIndex, after: render(node, after) })
    else if (JSON.stringify(old) !== JSON.stringify(node)) {
      changed.push({ nodeIndex, before: render(old, before), after: render(node, after) })
    }
  }
  for (const [nodeIndex, node] of beforeNodes) {
    if (!afterNodes.has(nodeIndex)) removed.push({ nodeIndex, before: render(node, before) })
  }

  const beforeMetadata = withoutNodes(before.graph)
  const afterMetadata = withoutNodes(after.graph)
  return {
    graphId,
    files: {
      before: { path: beforePath, bytes: beforeBytes.length, sha256: sha256(beforeBytes) },
      after: { path: afterPath, bytes: afterBytes.length, sha256: sha256(afterBytes) }
    },
    graph: {
      name: after.graph.name,
      type: Number(after.graph.id?.type),
      beforeNodeCount: before.graph.nodes?.length ?? 0,
      afterNodeCount: after.graph.nodes?.length ?? 0,
      metadataChanged: JSON.stringify(beforeMetadata) !== JSON.stringify(afterMetadata),
      ...(full ? { beforeMetadata, afterMetadata } : {})
    },
    nodes: { added, removed, changed }
  }
}

function usage(): never {
  console.error(
    'Usage: npx tsx tools/compare-gil-node-graph.ts <before.gil> <after.gil> <graphId> [--full]'
  )
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [beforePath, afterPath, graphIdText, ...flags] = process.argv.slice(2)
  const graphId = Number(graphIdText)
  if (!beforePath || !afterPath || !Number.isFinite(graphId) || flags.some((f) => f !== '--full')) {
    usage()
  }
  console.log(
    JSON.stringify(
      compareGilNodeGraph(beforePath, afterPath, graphId, flags.includes('--full')),
      null,
      2
    )
  )
}
