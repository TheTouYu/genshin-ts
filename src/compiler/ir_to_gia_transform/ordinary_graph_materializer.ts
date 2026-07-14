import { Graph, Node } from '../gia_vendor.js'

export type OrdinaryDataEdge = {
  fromId: number
  toId: number
  fromIndex: number
  toIndex: number
}

export type OrdinaryFlowEdge = OrdinaryDataEdge

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
}

/**
 * Shared ordinary Graph edge materialization for root and vendor-gated composite impl graphs.
 * Composite/capture boundaries must be filtered or handled by their explicit overlay before here.
 */
export function materializeOrdinaryGraphEdges(input: OrdinaryGraphMaterializerInput): void {
  for (const edge of input.dataEdges ?? []) {
    const source = input.nodesById.get(edge.fromId)
    const target = input.nodesById.get(edge.toId)
    if (!source || !target) {
      if (input.onMissingDataEndpoint) {
        input.onMissingDataEndpoint(edge)
        continue
      }
      throw new Error(`[error] ordinary data edge endpoint missing: ${edge.fromId}->${edge.toId}`)
    }
    input.graph.connect(
      source,
      target,
      input.mapOutputIndex?.(edge.fromId, edge.fromIndex) ?? edge.fromIndex,
      input.mapInputIndex?.(edge.toId, edge.toIndex) ?? edge.toIndex
    )
  }

  for (const edge of input.flowEdges ?? []) {
    const source = input.nodesById.get(edge.fromId)
    const target = input.nodesById.get(edge.toId)
    if (!source || !target) {
      if (input.onMissingFlowEndpoint) {
        input.onMissingFlowEndpoint(edge)
        continue
      }
      throw new Error(`[error] ordinary flow edge endpoint missing: ${edge.fromId}->${edge.toId}`)
    }
    input.graph.flow(
      source,
      target,
      input.mapOutputIndex?.(edge.fromId, edge.fromIndex) ?? edge.fromIndex,
      input.mapInputIndex?.(edge.toId, edge.toIndex) ?? edge.toIndex,
      input.flowInsertPosition?.(edge)
    )
  }
}
