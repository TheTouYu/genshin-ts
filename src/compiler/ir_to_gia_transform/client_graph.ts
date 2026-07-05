import { loadGiaProto } from '../../injector/proto.js'
import { resolveGraphIdForGraph } from '../../runtime/graph_defaults.js'
import type { ClientIRDocument } from '../../runtime/IR.js'
import { CLIENT_ERROR_CODES, clientNodegraphError } from '../../shared/client_capability_errors.js'
import type { ClientNodeMetadata } from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.js'
import {
  client_graph_body,
  client_literal_value,
  client_node_body,
  client_node_connect_from,
  client_node_connect_to,
  client_wrapped_value,
  getClientGraphEncoding,
  wrap_gia,
  type Root as GiaRoot
} from '../gia_vendor.js'
import { resolveClientConcreteVariant, resolveClientNodeMetadata } from './client_nodes.js'
import type { IrToGiaOptions } from './index.js'
import { parseEnumValue } from './mappings.js'
import { buildExecutionGraph, layoutPositions } from './layout.js'
import type { IRNode, NodeId } from './types.js'

// NodePin_Index_Kind values from gia.proto: 2 = OutFlow, 3 = InParam
const PIN_KIND_OUT_FLOW = 2
const PIN_KIND_IN_PARAM = 3

type ClientGiaNode = ReturnType<typeof client_node_body>

/** ClientVarType id for enum pins (see CLIENT_VAR_TYPE_BY_IR_TYPE) */
const CLIENT_VAR_TYPE_ENUM = 13

/** IR enum literals arrive as "EnumName.Member" strings; pins need the numeric value */
function toPinLiteral(clientVarType: number, value: unknown, argIndex: number, nodeType: string) {
  if (clientVarType === CLIENT_VAR_TYPE_ENUM && typeof value === 'string') {
    return parseEnumValue(value, argIndex, nodeType).enumValue
  }
  return value
}

/**
 * IR args follow the generated method signature (no holes); metadata.argPins
 * maps each arg to its physical input pin when hidden pins shift the layout.
 */
export function argPinIndex(metadata: ClientNodeMetadata, argIndex: number): number {
  return metadata.argPins?.[argIndex] ?? argIndex
}

/**
 * Write literal IR args into the node's input pins. Non-reflective pins use
 * the sample-proven scalar shapes; reflective pins wrap the literal in a
 * ConcreteBase using the resolved variant's concrete pin type. Empty list
 * literals keep the typed-but-unset ArrayBase placeholder.
 */
function applyLiteralArgs(
  node: ClientGiaNode,
  irNode: IRNode,
  metadata: ClientNodeMetadata,
  concreteId: number | string
) {
  for (const [argIndex, arg] of (irNode.args ?? []).entries()) {
    if (arg == null || arg.type === 'conn') continue
    const pinIndex = argPinIndex(metadata, argIndex)
    const pinMeta = metadata.inputs.find((p) => p.index === pinIndex)
    if (!pinMeta) {
      throw clientNodegraphError(
        CLIENT_ERROR_CODES.NODE_UNAVAILABLE,
        `${metadata.subType}.${metadata.nodeType} has no input pin #${pinIndex} for literal arg #${argIndex}`
      )
    }
    if (Array.isArray(arg.value) && arg.type.endsWith('_list')) {
      if (arg.value.length === 0) continue
      throw clientNodegraphError(
        CLIENT_ERROR_CODES.VALUE_TYPE_UNAVAILABLE,
        `${metadata.subType}.${metadata.nodeType} input #${argIndex}: non-empty list literals have no sample-proven client encoding; build the list via nodes instead`
      )
    }
    const pin = node.pins.find((p) => p.i1?.kind === PIN_KIND_IN_PARAM && p.i1.index === pinIndex)
    if (!pin) {
      throw clientNodegraphError(
        CLIENT_ERROR_CODES.NODE_UNAVAILABLE,
        `${metadata.subType}.${metadata.nodeType} built node misses input pin #${pinIndex}`
      )
    }
    if (pinMeta.reflective) {
      const variant = metadata.reflectMap?.find((v) => v.concreteId === concreteId)
      const variantPin = variant?.pins?.find((p) => p.kind === 'input' && p.index === pinIndex)
      if (!variantPin?.clientVarType) {
        throw clientNodegraphError(
          CLIENT_ERROR_CODES.NODE_UNAVAILABLE,
          `${metadata.subType}.${metadata.nodeType} input #${argIndex}: no variant pin type evidence for literal on reflective pin (concreteId ${concreteId})`
        )
      }
      pin.type = variantPin.clientVarType
      pin.value = client_wrapped_value(
        0,
        client_literal_value(variantPin.clientVarType, toPinLiteral(variantPin.clientVarType, arg.value, argIndex, irNode.type))
      )
    } else {
      const clientVarType = pinMeta.clientVarType ?? 0
      pin.value = client_literal_value(clientVarType, toPinLiteral(clientVarType, arg.value, argIndex, irNode.type))
    }
  }
}

export function clientIrToGia(ir: ClientIRDocument, opts: IrToGiaOptions): Uint8Array {
  const graphId = opts.graphId ?? resolveGraphIdForGraph(ir.graph)
  const name = opts.name ?? ir.graph.name ?? '_GSTS_Generated_Client_Graph'
  const uid = opts.uid ?? 100000001
  const nodes = ir.nodes ?? []
  if (!nodes.length) throw new Error('IR document must have at least one node')

  const graphInfo = buildExecutionGraph(nodes)
  const positions = layoutPositions(nodes, graphInfo)
  const builtById = new Map<NodeId, ClientGiaNode>()
  const metadataById = new Map<NodeId, ClientNodeMetadata>()

  for (const irNode of nodes) {
    const metadata = resolveClientNodeMetadata(ir.graph.sub_type, irNode)
    metadataById.set(irNode.id, metadata)
    const concreteId = resolveClientConcreteVariant(metadata, irNode)
    const pos = positions.get(irNode.id) ?? [0, 0]
    const node = client_node_body({
      metadata,
      unique_index: irNode.id,
      x: pos[0] / 300,
      y: pos[1] / 200,
      concrete_id: concreteId
    })
    applyLiteralArgs(node, irNode, metadata, concreteId)
    builtById.set(irNode.id, node)
  }

  for (const { fromId, toId, fromIndex, toIndex } of graphInfo.flowConnections) {
    const from = builtById.get(fromId)
    const to = builtById.get(toId)
    if (!from || !to) throw new Error(`[error] bad client flow connection ${fromId}->${toId}`)
    const connect = client_node_connect_to(to.nodeIndex, toIndex)
    const existing = from.pins.find(
      (p) => p.i1?.kind === PIN_KIND_OUT_FLOW && p.i1.index === fromIndex
    )
    if (existing) {
      existing.connects.push(connect)
    } else {
      from.pins.push({
        i1: { kind: PIN_KIND_OUT_FLOW, index: fromIndex },
        i2: { kind: PIN_KIND_OUT_FLOW, index: fromIndex },
        connects: [connect]
      } as (typeof from.pins)[number])
    }
  }

  for (const { fromId, toId, fromIndex, toIndex } of graphInfo.dataConnections) {
    const from = builtById.get(fromId)
    const to = builtById.get(toId)
    if (!from || !to) throw new Error(`[error] bad client data connection ${fromId}->${toId}`)
    // layout toIndex is the IR arg index; hidden pins shift the physical index
    const toPinIndex = argPinIndex(metadataById.get(toId)!, toIndex)
    const pin = to.pins.find((p) => p.i1?.kind === PIN_KIND_IN_PARAM && p.i1.index === toPinIndex)
    if (!pin) throw new Error(`[error] missing client input pin ${toId}.${toPinIndex}`)
    pin.connects = [client_node_connect_from(from.nodeIndex, fromIndex)]
  }

  const encoding = getClientGraphEncoding(ir.graph.sub_type)
  const root: GiaRoot = client_graph_body({
    uid,
    graph_id: graphId,
    graph_name: name,
    graphType: encoding.graphType,
    graphWhich: encoding.graphWhich,
    nodes: [...builtById.values()]
  })

  const { rootMessage } = loadGiaProto(opts.protoPath)
  return new Uint8Array(wrap_gia(rootMessage, root))
}
