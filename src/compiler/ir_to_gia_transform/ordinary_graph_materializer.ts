import { Graph, Node, NodePin_Index_Kind } from '../gia_vendor.js'

export type OrdinaryDataEdge = {
  fromId: number
  toId: number
  fromIndex: number
  toIndex: number
}

export type OrdinaryFlowEdge = OrdinaryDataEdge

/**
 * Apply real-editor wire rules to already-encoded GraphNode arrays (root and impl paths).
 *
 * Vendor `Connect.encode()` writes `node_connect_from(from_index)` / `node_connect_to(to_index)`,
 * which materializes connect2 = connect index and an explicit InFlow index. Real editor wire
 * omits the index field on default target InFlow[0] connects and the default OutFlow[0]
 * pin, but preserves explicit indexes on non-default OutFlow pins and non-default target
 * InFlow connects (target ShellIndex). It also applies the connect2 exception
 * for signal data consumption (str source OutParam[6] -> 3, entity source OutParam[9] -> 4).
 *
 * Must run after all index-based post-processing (compositePinIndex etc.), before serialization.
 */
export function applyEditorConnectionWireRules(nodes: any[]): void {
  for (const node of nodes) {
    for (const pin of node.pins ?? []) {
      const outflowIndex = pin.i1?.index ?? 0
      if (pin.i1?.kind === NodePin_Index_Kind.OutFlow && outflowIndex === 0) {
        delete pin.i1.index
        if (pin.i2) delete pin.i2.index
      }
      for (const conn of pin.connects ?? []) {
        if (conn.connect?.kind === NodePin_Index_Kind.InFlow) {
          // Real editor omits the index only on default target InFlow[0]; non-default
          // targets write the explicit ShellIndex on both connect/connect2 (case3: Break=1).
          if (conn.connect?.index === 0) delete conn.connect.index
          if (conn.connect2?.index === 0) delete conn.connect2.index
        } else if (conn.connect?.kind === NodePin_Index_Kind.OutParam && conn.connect2) {
          // ponytail: data connect2 = source OutParam index, except str(6)->3, entity(9)->4.
          conn.connect2.index =
            conn.connect.index === 6 ? 3 : conn.connect.index === 9 ? 4 : conn.connect.index
        }
      }
    }
  }
}

/**
 * Synthetic sources (currently Composite-call OutParam overlays) do not belong to a vendor
 * ordinary graph. Both root and impl paths split these edges before ordinary materialization,
 * then materialize the same logical edge through their scope-specific overlay.
 */
export function splitSyntheticSourceDataEdges<T extends OrdinaryDataEdge>(
  dataEdges: Iterable<T>,
  syntheticSourceIds: ReadonlySet<number>
): { ordinary: T[]; syntheticSource: T[] } {
  const ordinary: T[] = []
  const syntheticSource: T[] = []
  for (const edge of dataEdges) {
    ;(syntheticSourceIds.has(edge.fromId) ? syntheticSource : ordinary).push(edge)
  }
  return { ordinary, syntheticSource }
}

/**
 * Apply synthetic-source data edges after ordinary nodes have been materialized. The caller
 * owns its representation-specific connect operation: root uses Graph.connect(), whereas an
 * impl overlay writes connects onto already-encoded GraphNode pins.
 */
export function materializeSyntheticSourceDataEdges(input: {
  dataEdges: Iterable<OrdinaryDataEdge>
  syntheticSourceIds: ReadonlySet<number>
  mapOutputIndex?: (nodeId: number, pinIndex: number) => number
  mapInputIndex?: (nodeId: number, pinIndex: number) => number
  connect: (edge: OrdinaryDataEdge, fromIndex: number, toIndex: number) => void
}): void {
  for (const edge of input.dataEdges) {
    if (!input.syntheticSourceIds.has(edge.fromId)) continue
    input.connect(
      edge,
      physicalIndex(input.mapOutputIndex, edge.fromId, edge.fromIndex),
      physicalIndex(input.mapInputIndex, edge.toId, edge.toIndex)
    )
  }
}

export type OrdinaryGraphIntegrityContract = {
  /** Encoded node indexes, when IR ids are not themselves the final node indexes. */
  expectedNodeIndexes?: ReadonlyMap<number, number>
  /** Capture and synthetic boundary nodes must be handled by a separate overlay. */
  excludedNodeIds?: ReadonlySet<number>
}

type OrdinaryGraphMaterializerInput = {
  graph: Graph<any>
  nodesById: Map<number, Node<any>>
  dataEdges?: Iterable<OrdinaryDataEdge>
  flowEdges?: Iterable<OrdinaryFlowEdge>
  mapOutputIndex?: (nodeId: number, pinIndex: number) => number
  mapInputIndex?: (nodeId: number, pinIndex: number) => number
  flowInsertPosition?: (edge: OrdinaryFlowEdge) => number | undefined
  onMissingDataEndpoint?: (edge: OrdinaryDataEdge) => void
  onMissingFlowEndpoint?: (edge: OrdinaryFlowEdge) => void
  integrity?: OrdinaryGraphIntegrityContract
}

function physicalIndex(
  mapIndex: ((nodeId: number, pinIndex: number) => number) | undefined,
  nodeId: number,
  pinIndex: number
): number {
  return mapIndex?.(nodeId, pinIndex) ?? pinIndex
}

function requireOrdinaryEndpoint(
  nodesById: Map<number, Node<any>>,
  excludedNodeIds: ReadonlySet<number> | undefined,
  edge: OrdinaryDataEdge | OrdinaryFlowEdge,
  kind: 'data' | 'flow'
): [Node<any>, Node<any>] | undefined {
  if (excludedNodeIds?.has(edge.fromId) || excludedNodeIds?.has(edge.toId)) {
    throw new Error(`[error] ordinary ${kind} edge crosses excluded boundary: ${edge.fromId}->${edge.toId}`)
  }
  const source = nodesById.get(edge.fromId)
  const target = nodesById.get(edge.toId)
  return source && target ? [source, target] : undefined
}

function assertNodeIndexes(
  nodesById: Map<number, Node<any>>,
  expectedNodeIndexes: ReadonlyMap<number, number> | undefined
): void {
  const seen = new Set<number>()
  for (const [nodeId, node] of nodesById) {
    const expected = expectedNodeIndexes?.get(nodeId)
    if (expected !== undefined && node.NodeIndex !== expected) {
      throw new Error(`[error] ordinary nodeIndex mismatch for ${nodeId}: ${node.NodeIndex} !== ${expected}`)
    }
    if (seen.has(node.NodeIndex)) {
      throw new Error(`[error] ordinary encoded nodeIndex is not unique: ${node.NodeIndex}`)
    }
    seen.add(node.NodeIndex)
  }
}

function pinType(pin: any): string | undefined {
  return pin?.type === null || pin?.type === undefined ? undefined : JSON.stringify(pin.type)
}

// Real editor samples never encode monitor OutParam pins: signal parameter
// outputs come from the CompositeDef declaration and consumer connections
// reference OutParam kind/index directly (see 修复后 min_main 样本). The
// materializer keeps the edge for graph.connect but skips pin existence here.
function isMonitorSignalPlaceholder(node: Node<any>): boolean {
  return (node.GenericId as unknown) === 300001 || (node.ConcreteId as unknown) === 300001
}

function assertDataPins(
  edge: OrdinaryDataEdge,
  source: Node<any>,
  target: Node<any>,
  fromIndex: number,
  toIndex: number
): void {
  const sourcePin = source.pins.find((pin) => pin.kind === 4 && pin.index === fromIndex)
  const targetPin = target.pins.find((pin) => pin.kind === 3 && pin.index === toIndex)
  if (!sourcePin || !targetPin) {
    if (!sourcePin && targetPin && fromIndex >= 3 && isMonitorSignalPlaceholder(source)) {
      return
    }
    throw new Error(
      `[error] ordinary data edge pin missing: ${edge.fromId}.${fromIndex}->${edge.toId}.${toIndex} sourceIds=${JSON.stringify({ g: source.GenericId, c: source.ConcreteId })}`
    )
  }
  const sourceType = pinType(sourcePin)
  const targetType = pinType(targetPin)
  if (sourceType && targetType && sourceType !== targetType) {
    throw new Error(
      `[error] ordinary data edge pin type mismatch: ${edge.fromId}.${fromIndex}->${edge.toId}.${toIndex} source=${sourceType} target=${targetType}`
    )
  }
}

/**
 * Shared ordinary Graph edge materialization for root and vendor-gated composite impl graphs.
 * Composite/capture boundaries must be filtered or handled by their explicit overlay before here.
 */
export function materializeOrdinaryGraphEdges(input: OrdinaryGraphMaterializerInput): void {
  assertNodeIndexes(input.nodesById, input.integrity?.expectedNodeIndexes)
  const dataTargets = new Set<string>()

  for (const edge of input.dataEdges ?? []) {
    const endpoints = requireOrdinaryEndpoint(
      input.nodesById,
      input.integrity?.excludedNodeIds,
      edge,
      'data'
    )
    if (!endpoints) {
      if (input.onMissingDataEndpoint) {
        input.onMissingDataEndpoint(edge)
        continue
      }
      throw new Error(`[error] ordinary data edge endpoint missing: ${edge.fromId}->${edge.toId}`)
    }
    const [source, target] = endpoints
    const fromIndex = physicalIndex(input.mapOutputIndex, edge.fromId, edge.fromIndex)
    const toIndex = physicalIndex(input.mapInputIndex, edge.toId, edge.toIndex)
    const targetKey = `${edge.toId}.${toIndex}`
    if (dataTargets.has(targetKey)) {
      throw new Error(`[error] ordinary data edge target is not unique: ${targetKey}`)
    }
    dataTargets.add(targetKey)
    assertDataPins(edge, source, target, fromIndex, toIndex)
    input.graph.connect(source, target, fromIndex, toIndex)
  }

  for (const edge of input.flowEdges ?? []) {
    const endpoints = requireOrdinaryEndpoint(
      input.nodesById,
      input.integrity?.excludedNodeIds,
      edge,
      'flow'
    )
    if (!endpoints) {
      if (input.onMissingFlowEndpoint) {
        input.onMissingFlowEndpoint(edge)
        continue
      }
      throw new Error(`[error] ordinary flow edge endpoint missing: ${edge.fromId}->${edge.toId}`)
    }
    const [source, target] = endpoints
    input.graph.flow(
      source,
      target,
      physicalIndex(input.mapOutputIndex, edge.fromId, edge.fromIndex),
      physicalIndex(input.mapInputIndex, edge.toId, edge.toIndex),
      input.flowInsertPosition?.(edge)
    )
  }
}
