import { loadGiaProto } from '../../injector/proto.js'
import { resolveGraphIdForGraph } from '../../runtime/graph_defaults.js'
import type { ClientIRDocument } from '../../runtime/IR.js'
import { CLIENT_ERROR_CODES, clientNodegraphError } from '../../shared/client_capability_errors.js'
import { CLIENT_ENUM_VALUES } from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_enum_values.js'
import type { ClientNodeMetadata } from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.js'
import { NodePin_Index_Kind, VarBase_Class } from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'
import {
  CLIENT_REFLECT_IOC_BY_TYPE,
  client_graph_body,
  client_inline_var_value,
  client_list_literal_value,
  client_literal_value,
  client_node_body,
  client_node_connect_from,
  client_node_connect_to,
  client_signal_name_value,
  client_value_base,
  client_wrapped_value,
  getClientGraphEncoding,
  wrap_gia,
  type Root as GiaRoot
} from '../gia_vendor.js'
import {
  CLIENT_VAR_TYPE_BY_IR_TYPE,
  resolveClientConcreteVariant,
  resolveClientNodeMetadata
} from './client_nodes.js'
import type { IrToGiaOptions } from './index.js'
import { parseEnumValue } from './mappings.js'
import { buildExecutionGraph, layoutPositions } from './layout.js'
import type { IRNode, NodeId } from './types.js'

const PIN_KIND_OUT_FLOW = NodePin_Index_Kind.OutFlow
const PIN_KIND_IN_PARAM = NodePin_Index_Kind.InParam
const PIN_KIND_CLIENT_SIGNAL = NodePin_Index_Kind.ClientSignal
const CLIENT_VAR_TYPE_ENUM = 13
const CLIENT_SEND_SIGNAL_PLACEHOLDER_GID = 300002

type ClientGiaNode = ReturnType<typeof client_node_body>
type IrArg = NonNullable<IRNode['args']>[number]
type ValueArg = Exclude<IrArg, null | { type: 'conn' }>

function isValueArg(arg: IrArg | null | undefined): arg is ValueArg {
  return arg != null && arg.type !== 'conn'
}

function toPinLiteral(clientVarType: number, value: unknown, argIndex: number, nodeType: string) {
  if (clientVarType === CLIENT_VAR_TYPE_ENUM && typeof value === 'string') {
    return CLIENT_ENUM_VALUES[value] ?? parseEnumValue(value, argIndex, nodeType).enumValue
  }
  return value
}

export function argPinIndex(metadata: ClientNodeMetadata, argIndex: number): number {
  return metadata.argPins?.[argIndex] ?? argIndex
}

function pinI2Index(
  metadata: ClientNodeMetadata,
  kind: 'output' | 'in_flow' | 'out_flow',
  index: number
): number {
  const pins = kind === 'output' ? metadata.outputs : (metadata.flows ?? [])
  const pin = pins.find((p) => p.kind === kind && p.index === index)
  return pin?.i2Index ?? index
}

function findInPin(node: ClientGiaNode, pinIndex: number) {
  return node.pins.find((p) => p.i1?.kind === PIN_KIND_IN_PARAM && p.i1.index === pinIndex)
}

function setInPinValue(
  node: ClientGiaNode,
  pinIndex: number,
  clientVarType: number,
  value: ReturnType<typeof client_literal_value>,
  ioc = 0
) {
  const pin = findInPin(node, pinIndex)
  if (!pin) throw new Error(`[error] missing input pin index ${pinIndex}`)
  pin.type = clientVarType
  pin.value = client_wrapped_value(ioc, value)
}

function irTypeOfArg(arg: IrArg | undefined): string | undefined {
  if (arg == null) return undefined
  return arg.type === 'conn' ? arg.value.type : arg.type
}

function applyAssemblyList(
  node: ClientGiaNode,
  irNode: IRNode,
  metadata: ClientNodeMetadata,
  concreteId: number | string
) {
  const elements = irNode.args ?? []
  const countPin = findInPin(node, 0)
  if (countPin) countPin.value = client_literal_value(3, elements.length)
  const variant = metadata.reflectMap?.find((v) => v.concreteId === concreteId)
  elements.forEach((arg, idx) => {
    if (!isValueArg(arg)) return
    const pinIndex = idx + 1
    const variantPin = variant?.pins?.find((p) => p.kind === 'input' && p.index === pinIndex)
    const clientVarType = variantPin?.clientVarType ?? 0
    setInPinValue(
      node,
      pinIndex,
      clientVarType,
      client_literal_value(clientVarType, toPinLiteral(clientVarType, arg.value, idx, irNode.type)),
      0
    )
  })
}

function applyMultipleBranches(node: ClientGiaNode, irNode: IRNode) {
  const args = irNode.args ?? []
  const controlArg = args[0]
  if (isValueArg(controlArg)) {
    setInPinValue(
      node,
      0,
      3,
      client_literal_value(3, toPinLiteral(3, controlArg.value, 0, irNode.type)),
      0
    )
  }
  const caseValues: unknown[] = []
  for (let i = 1; i < args.length; i++) {
    const a = args[i]
    if (!a || a.type === 'conn') continue
    caseValues.push(a.value)
  }
  if (caseValues.length) setInPinValue(node, 1, 4, client_list_literal_value(4, caseValues), 0)
}

const DATA_TYPE_CONVERSION_ENUM: Record<string, number> = {
  'int->bool': 800,
  'int->float': 801,
  'int->str': 802,
  'entity->str': 803,
  'guid->str': 804,
  'bool->int': 805,
  'bool->str': 806,
  'float->int': 807,
  'float->str': 808,
  'vec3->str': 809,
  'faction->str': 810
}

function applyDataTypeConversion(node: ClientGiaNode, irNode: IRNode, metadata: ClientNodeMetadata) {
  const enumArg = irNode.args?.[0]
  const inputArg = irNode.args?.[1]
  if (!isValueArg(enumArg) || !isValueArg(inputArg)) return
  const outIrType = irNode.clientHints?.outputIrType
  const inIrType = irTypeOfArg(inputArg)
  if (!outIrType || !inIrType) {
    throw clientNodegraphError(
      CLIENT_ERROR_CODES.NODE_UNAVAILABLE,
      `${metadata.subType}.data_type_conversion missing input/output type hints`
    )
  }
  const convKey = `${inIrType}->${outIrType}`
  const enumVal = DATA_TYPE_CONVERSION_ENUM[convKey]
  if (enumVal === undefined) {
    throw clientNodegraphError(
      CLIENT_ERROR_CODES.NODE_UNAVAILABLE,
      `${metadata.subType}.data_type_conversion unsupported conversion ${convKey}`
    )
  }
  const inClientType = CLIENT_VAR_TYPE_BY_IR_TYPE[inIrType] ?? 0
  const outClientType = CLIENT_VAR_TYPE_BY_IR_TYPE[outIrType] ?? 0
  const inIoc = CLIENT_REFLECT_IOC_BY_TYPE[inClientType] ?? 0
  const outIoc = CLIENT_REFLECT_IOC_BY_TYPE[outClientType] ?? 0
  setInPinValue(node, 0, 13, client_literal_value(13, enumVal), -1)
  setInPinValue(
    node,
    1,
    inClientType,
    client_literal_value(inClientType, toPinLiteral(inClientType, inputArg.value, 1, irNode.type)),
    inIoc
  )
  const outPin = node.pins.find((p) => p.i1?.kind === NodePin_Index_Kind.OutParam && p.i1.index === 0)
  if (outPin) {
    outPin.type = outClientType
    outPin.value = client_wrapped_value(outIoc, client_value_base(outClientType))
  }
}

function applyInlineVarTypeHint(node: ClientGiaNode, irNode: IRNode, metadata: ClientNodeMetadata) {
  if (metadata.nodeType === 'fixed_point_projectile_launch') {
    const arg = irNode.args?.[0]
    if (isValueArg(arg)) {
      const pin = findInPin(node, 0)
      if (pin) {
        pin.type = 19
        pin.value = client_inline_var_value(19, Number(arg.value))
      }
    }
  }
  if (metadata.nodeType === 'switch_to_self_execution_status') {
    const arg = irNode.args?.[1]
    if (isValueArg(arg)) {
      const pin = findInPin(node, 1)
      if (pin) {
        pin.type = 18
        pin.value = client_inline_var_value(18, Number(arg.value))
      }
    }
  }
}

function applySendSignalToServer(node: ClientGiaNode, irNode: IRNode, metadata: ClientNodeMetadata) {
  const nameArg = irNode.args?.[0]
  if (nameArg?.type === 'conn') {
    throw clientNodegraphError(
      CLIENT_ERROR_CODES.VALUE_TYPE_UNAVAILABLE,
      `${metadata.subType}.send_signal_to_server_node_graph does not accept wired signal name`
    )
  }
  if (!isValueArg(nameArg)) {
    throw clientNodegraphError(
      CLIENT_ERROR_CODES.VALUE_TYPE_UNAVAILABLE,
      `${metadata.subType}.send_signal_to_server_node_graph expects a literal signal name`
    )
  }
  node.genericId!.nodeId = CLIENT_SEND_SIGNAL_PLACEHOLDER_GID
  const signalPin = node.pins.find((p) => p.i1?.kind === PIN_KIND_CLIENT_SIGNAL)
  if (signalPin) signalPin.value = client_signal_name_value(String(nameArg.value))
}

function applySpecialArgs(
  node: ClientGiaNode,
  irNode: IRNode,
  metadata: ClientNodeMetadata,
  concreteId: number | string
): boolean {
  if (irNode.type === 'assembly_list') {
    applyAssemblyList(node, irNode, metadata, concreteId)
    return true
  }
  if (irNode.type === 'multiple_branches') {
    applyMultipleBranches(node, irNode)
    return true
  }
  if (irNode.type === 'data_type_conversion') {
    applyDataTypeConversion(node, irNode, metadata)
    return true
  }
  if (metadata.specialKind === 'inline_var_type_hint') {
    applyInlineVarTypeHint(node, irNode, metadata)
    return true
  }
  if (irNode.type === 'send_signal_to_server_node_graph') {
    applySendSignalToServer(node, irNode, metadata)
    return true
  }
  return false
}

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
    if (!pinMeta) continue
    if (Array.isArray(arg.value) && arg.type.endsWith('_list')) {
      const pin = findInPin(node, pinIndex)
      if (!pin) continue
      const clientVarType = pinMeta.clientVarType ?? CLIENT_VAR_TYPE_BY_IR_TYPE[arg.type] ?? 0
      pin.type = clientVarType
      pin.value =
        arg.value.length === 0
          ? client_value_base(clientVarType)
          : pinMeta.reflective
            ? client_wrapped_value(0, client_list_literal_value(clientVarType, arg.value))
            : client_list_literal_value(clientVarType, arg.value)
      continue
    }
    const pin = findInPin(node, pinIndex)
    if (!pin) continue
    if (pinMeta.clientVarType === 18 || pinMeta.clientVarType === 19) {
      pin.type = pinMeta.clientVarType
      pin.value = client_inline_var_value(pinMeta.clientVarType as 18 | 19, Number(arg.value))
      continue
    }
    if (pinMeta.reflective) {
      const variant = metadata.reflectMap?.find((v) => v.concreteId === concreteId)
      const variantPin = variant?.pins?.find((p) => p.kind === 'input' && p.index === pinIndex)
      if (!variantPin?.clientVarType) {
        throw clientNodegraphError(
          CLIENT_ERROR_CODES.NODE_UNAVAILABLE,
          `${metadata.subType}.${metadata.nodeType} input #${argIndex}: no variant pin type for literal`
        )
      }
      pin.type = variantPin.clientVarType
      pin.value = client_wrapped_value(
        0,
        client_literal_value(
          variantPin.clientVarType,
          toPinLiteral(variantPin.clientVarType, arg.value, argIndex, irNode.type)
        )
      )
    } else {
      const clientVarType = pinMeta.clientVarType ?? 0
      pin.type = clientVarType
      pin.value = client_literal_value(
        clientVarType,
        toPinLiteral(clientVarType, arg.value, argIndex, irNode.type)
      )
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
    if (!applySpecialArgs(node, irNode, metadata, concreteId)) {
      applyLiteralArgs(node, irNode, metadata, concreteId)
    }
    builtById.set(irNode.id, node)
  }

  for (const { fromId, toId, fromIndex, toIndex } of graphInfo.flowConnections) {
    const from = builtById.get(fromId)
    const to = builtById.get(toId)
    if (!from || !to) throw new Error(`[error] bad client flow connection ${fromId}->${toId}`)
    const toIndex2 = pinI2Index(metadataById.get(toId)!, 'in_flow', toIndex)
    const connect = client_node_connect_to(to.nodeIndex, toIndex, toIndex2)
    const existing = from.pins.find(
      (p) => p.i1?.kind === PIN_KIND_OUT_FLOW && p.i1.index === fromIndex
    )
    if (existing) existing.connects.push(connect)
    else {
      const fromIndex2 = pinI2Index(metadataById.get(fromId)!, 'out_flow', fromIndex)
      from.pins.push({
        i1: { kind: PIN_KIND_OUT_FLOW, index: fromIndex },
        i2: { kind: PIN_KIND_OUT_FLOW, index: fromIndex2 },
        connects: [connect]
      } as (typeof from.pins)[number])
    }
  }

  for (const { fromId, toId, fromIndex, toIndex } of graphInfo.dataConnections) {
    const from = builtById.get(fromId)
    const to = builtById.get(toId)
    if (!from || !to) throw new Error(`[error] bad client data connection ${fromId}->${toId}`)
    const toMeta = metadataById.get(toId)!
    const toPinIndex = argPinIndex(toMeta, toIndex)
    const pin = findInPin(to, toPinIndex)
    if (!pin) throw new Error(`[error] missing client input pin ${toId}.${toPinIndex}`)
    const fromIndex2 = pinI2Index(metadataById.get(fromId)!, 'output', fromIndex)
    pin.connects = [client_node_connect_from(from.nodeIndex, fromIndex, fromIndex2)]
    const pinMeta = toMeta.inputs.find((p) => p.index === toPinIndex)
    if (pinMeta?.reflective && pin.value?.class === VarBase_Class.ConcreteBase) {
      const fromIr = nodes.find((n) => n.id === fromId)
      const outIrType = irTypeOfArg(fromIr?.args?.[fromIndex])
      const clientVarType = outIrType ? CLIENT_VAR_TYPE_BY_IR_TYPE[outIrType] : pinMeta.clientVarType
      const ioc = clientVarType ? (CLIENT_REFLECT_IOC_BY_TYPE[clientVarType] ?? 0) : 0
      if (clientVarType) {
        pin.type = clientVarType
        pin.value = client_wrapped_value(ioc, client_value_base(clientVarType))
      }
    }
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
