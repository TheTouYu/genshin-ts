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
  customVariableTypeOffset,
  resolveClientConcreteVariant,
  resolveClientNodeMetadata
} from './client_nodes.js'
import type { IrToGiaOptions } from './index.js'
import { parseEnumValue } from './mappings.js'
import { buildExecutionGraph, layoutPositions } from './layout.js'
import type { IRNode, NodeId } from './types.js'

const PIN_KIND_OUT_FLOW = NodePin_Index_Kind.OutFlow
const PIN_KIND_IN_PARAM = NodePin_Index_Kind.InParam
const PIN_KIND_CLIENT_EXEC = NodePin_Index_Kind.ClientExecNode
const CLIENT_VAR_TYPE_ENUM = 13
const CLIENT_SEND_SIGNAL_PLACEHOLDER_GID = 300002

/** element ClientVarType -> list ClientVarType */
const LIST_TYPE_BY_ELEM_TYPE: Record<number, number> = {
  1: 2,
  3: 4,
  5: 6,
  7: 8,
  9: 10,
  11: 12,
  13: 17,
  14: 15,
  16: 25,
  18: 20,
  19: 21
}

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

function resolvedVariant(metadata: ClientNodeMetadata, concreteId: number | string) {
  return metadata.reflectMap?.find((v) => v.concreteId === concreteId)
}

/**
 * indexOfConcrete of reflective pins = rank of the resolved variant among the
 * node's concrete ids in ascending order. Corpus-proven: 200019 cids 100..109
 * -> ioc 0..9; assembly_list cids 1025..1045 -> ioc 0..8; get_custom_variable
 * ioc = cid - base.
 */
function variantRank(metadata: ClientNodeMetadata, concreteId: number | string): number {
  const cids = (metadata.reflectMap ?? []).map((v) => v.concreteId)
  const rank = [...cids].sort((a, b) => Number(a) - Number(b)).indexOf(concreteId)
  return rank >= 0 ? rank : 0
}

function findOutPin(node: ClientGiaNode, pinIndex: number) {
  return node.pins.find(
    (p) => p.i1?.kind === NodePin_Index_Kind.OutParam && p.i1.index === pinIndex
  )
}

function applyAssemblyList(
  node: ClientGiaNode,
  irNode: IRNode,
  metadata: ClientNodeMetadata,
  concreteId: number | string
) {
  const elements = irNode.args ?? []
  const countPin = findInPin(node, 0)
  // sample count pins keep alreadySetVal=false while carrying the payload
  if (countPin) countPin.value = client_value_base(3, elements.length)
  const variant = resolvedVariant(metadata, concreteId)
  const rank = variantRank(metadata, concreteId)
  let elemClientType = 0
  elements.forEach((arg, idx) => {
    const pinIndex = idx + 1
    const variantPin = variant?.pins?.find((p) => p.kind === 'input' && p.index === pinIndex)
    const clientVarType = variantPin?.clientVarType ?? 0
    if (clientVarType) elemClientType = clientVarType
    if (!isValueArg(arg)) return
    setInPinValue(
      node,
      pinIndex,
      clientVarType,
      client_literal_value(clientVarType, toPinLiteral(clientVarType, arg.value, idx, irNode.type)),
      rank
    )
  })
  const listType = LIST_TYPE_BY_ELEM_TYPE[elemClientType]
  const outPin = findOutPin(node, 0)
  if (outPin && listType) {
    outPin.type = listType
    outPin.value = client_wrapped_value(rank, client_value_base(listType))
  }
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
  const inputArg = irNode.args?.[1]
  const outIrType = irNode.clientHints?.outputIrType
  const inIrType = irTypeOfArg(inputArg ?? undefined)
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
    isValueArg(inputArg)
      ? client_literal_value(
          inClientType,
          toPinLiteral(inClientType, inputArg.value, 1, irNode.type)
        )
      : client_value_base(inClientType),
    inIoc
  )
  const outPin = findOutPin(node, 0)
  if (outPin) {
    outPin.type = outClientType
    outPin.value = client_wrapped_value(outIoc, client_value_base(outClientType))
  }
}

/**
 * get_custom_variable resolves its output pin from clientHints (the cid table
 * already fixed the variant); corpus shows type + ConcreteBase(ioc = type
 * offset) with an unset inner value. Dict output has no sample evidence and
 * keeps the unresolved placeholder.
 */
function applyCustomVariableOutPin(node: ClientGiaNode, irNode: IRNode) {
  const outIrType = irNode.clientHints?.outputIrType
  if (!outIrType || outIrType === 'dict') return
  const clientVarType = CLIENT_VAR_TYPE_BY_IR_TYPE[outIrType]
  const offset = customVariableTypeOffset(outIrType)
  if (!clientVarType || offset === undefined) return
  const outPin = findOutPin(node, 0)
  if (!outPin) return
  outPin.type = clientVarType
  outPin.value = client_wrapped_value(offset, client_value_base(clientVarType))
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
  // corpus: signal name lives on the client_exec (kind 5) str pin
  const signalPin = node.pins.find((p) => p.i1?.kind === PIN_KIND_CLIENT_EXEC && p.type === 9)
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
  if (irNode.type === 'get_custom_variable') {
    applyLiteralArgs(node, irNode, metadata, concreteId)
    applyCustomVariableOutPin(node, irNode)
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
      const variantPin = pinMeta.reflective
        ? resolvedVariant(metadata, concreteId)?.pins?.find(
            (p) => p.kind === 'input' && p.index === pinIndex
          )
        : undefined
      const clientVarType =
        variantPin?.clientVarType ?? pinMeta.clientVarType ?? CLIENT_VAR_TYPE_BY_IR_TYPE[arg.type] ?? 0
      const elements =
        clientVarType === 17
          ? arg.value.map((v) => toPinLiteral(13, v, argIndex, irNode.type))
          : arg.value
      const inner =
        elements.length === 0
          ? client_value_base(clientVarType)
          : client_list_literal_value(clientVarType, elements)
      pin.type = clientVarType
      pin.value = pinMeta.reflective
        ? client_wrapped_value(variantRank(metadata, concreteId), inner)
        : inner
      continue
    }
    const pin = findInPin(node, pinIndex)
    if (!pin) continue
    if (
      metadata.specialKind === 'inline_var_type_hint' &&
      (pinMeta.clientVarType === 18 || pinMeta.clientVarType === 19)
    ) {
      // only 200052/200128 store t18/t19 dropdowns in the field#3 inline
      // binding; ordinary t18/t19 pins carry plain bId literals
      pin.type = pinMeta.clientVarType
      pin.value = client_inline_var_value(pinMeta.clientVarType as 18 | 19, Number(arg.value))
      continue
    }
    if (pinMeta.reflective) {
      const variant = resolvedVariant(metadata, concreteId)
      const variantPin = variant?.pins?.find((p) => p.kind === 'input' && p.index === pinIndex)
      if (!variantPin?.clientVarType) {
        throw clientNodegraphError(
          CLIENT_ERROR_CODES.NODE_UNAVAILABLE,
          `${metadata.subType}.${metadata.nodeType} input #${argIndex}: no variant pin type for literal`
        )
      }
      pin.type = variantPin.clientVarType
      pin.value = client_wrapped_value(
        variantRank(metadata, concreteId),
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
  const concreteById = new Map<NodeId, number | string>()

  for (const irNode of nodes) {
    const metadata = resolveClientNodeMetadata(ir.graph.sub_type, irNode)
    metadataById.set(irNode.id, metadata)
    const concreteId = resolveClientConcreteVariant(metadata, irNode)
    concreteById.set(irNode.id, concreteId)
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
    // wired reflective pins keep a typed ConcreteBase placeholder
    // (ioc = variant rank, inner unset) instead of the unresolved -1 marker
    const pinMeta = toMeta.inputs.find((p) => p.index === toPinIndex)
    if (
      pinMeta?.reflective &&
      pin.value?.class === VarBase_Class.ConcreteBase &&
      pin.value.bConcreteValue?.indexOfConcrete === -1
    ) {
      const toConcreteId = concreteById.get(toId)!
      const variantPin = resolvedVariant(toMeta, toConcreteId)?.pins?.find(
        (p) => p.kind === 'input' && p.index === toPinIndex
      )
      if (variantPin?.clientVarType) {
        pin.type = variantPin.clientVarType
        pin.value = client_wrapped_value(
          variantRank(toMeta, toConcreteId),
          client_value_base(variantPin.clientVarType)
        )
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
