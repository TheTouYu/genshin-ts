import type { ClientNode, ClientValueIR } from '../runtime/IR.js'
import { buildExecutionGraph, layoutPositions } from './ir_to_gia_transform/layout.js'
import type { IRNode } from './ir_to_gia_transform/types.js'

/**
 * Client graphs use the same visual layout contract as server graphs.  The
 * adapter intentionally translates only topology; it does not expose GIA pin
 * details to the layout engine.
 */
function clientValueToArgument(value: ClientValueIR) {
  if (value.kind === 'conn') {
    return {
      type: 'conn' as const,
      value: {
        node_id: value.node_id,
        index: value.index,
        type: value.type
      }
    }
  }
  if (value.kind === 'list' && value.encoding === 'assembly-list' && value.node_id !== undefined) {
    return {
      type: 'conn' as const,
      value: {
        node_id: value.node_id,
        index: value.index ?? 0,
        type: value.elementType + '_list'
      }
    }
  }
  return null
}

function toLayoutNode(node: ClientNode): IRNode {
  const values = node.clientValues ?? []
  const args = node.type === 'assembly_list'
    ? [
        { type: 'int', value: node.elementCount ?? 0 },
        ...(node.elementValues ?? []).map(clientValueToArgument)
      ]
    : values.map(clientValueToArgument)

  return {
    id: node.id,
    type: node.type,
    args,
    next: node.next
  } as IRNode
}

export function clientLayoutPositions(nodes: readonly ClientNode[]): Map<number, [number, number]> {
  const layoutNodes = nodes.map(toLayoutNode)
  const graph = buildExecutionGraph(layoutNodes)
  return layoutPositions(layoutNodes, graph)
}
