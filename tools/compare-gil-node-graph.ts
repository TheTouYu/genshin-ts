import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { readGilPayloadFields } from '../src/cli/gil_extract_utils.js'
import { parseMessage } from '../src/injector/binary.js'
import { loadGiaProto } from '../src/injector/proto.js'
import type { LenField } from '../src/injector/types.js'

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

function readNodeGraph(gilPath: string, graphId: number): NodeGraph {
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
    if (Number(graph.id?.id) === graphId) return graph
  }
  throw new Error(`NodeGraph ${graphId} not found in ${gilPath}`)
}

function nodeSummary(node: GraphNode): unknown {
  const genericId = Number(node.genericId?.nodeId)
  const concreteId = Number(node.concreteId?.nodeId)
  return {
    nodeIndex: Number(node.nodeIndex),
    ...(genericId ? { genericId } : {}),
    ...(concreteId ? { concreteId } : {}),
    pinCount: node.pins?.length ?? 0
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
  const beforeNodes = new Map((before.nodes ?? []).map((node) => [Number(node.nodeIndex), node]))
  const afterNodes = new Map((after.nodes ?? []).map((node) => [Number(node.nodeIndex), node]))
  const render = full ? (node: GraphNode) => node : nodeSummary
  const added: NodeChange[] = []
  const removed: NodeChange[] = []
  const changed: NodeChange[] = []

  for (const [nodeIndex, node] of afterNodes) {
    const old = beforeNodes.get(nodeIndex)
    if (!old) added.push({ nodeIndex, after: render(node) })
    else if (JSON.stringify(old) !== JSON.stringify(node)) {
      changed.push({ nodeIndex, before: render(old), after: render(node) })
    }
  }
  for (const [nodeIndex, node] of beforeNodes) {
    if (!afterNodes.has(nodeIndex)) removed.push({ nodeIndex, before: render(node) })
  }

  const beforeMetadata = withoutNodes(before)
  const afterMetadata = withoutNodes(after)
  return {
    graphId,
    files: {
      before: { path: beforePath, bytes: beforeBytes.length, sha256: sha256(beforeBytes) },
      after: { path: afterPath, bytes: afterBytes.length, sha256: sha256(afterBytes) }
    },
    graph: {
      name: after.name,
      type: Number(after.id?.type),
      beforeNodeCount: before.nodes?.length ?? 0,
      afterNodeCount: after.nodes?.length ?? 0,
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
