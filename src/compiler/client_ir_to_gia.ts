import { loadGiaProto } from '../injector/proto.js'
import type { ClientIRDocument, ClientNode, ClientValueIR } from '../runtime/IR.js'
import type { ValueType } from '../runtime/IR.js'
import type { SignalRegistry, RegisteredSignalDefinition } from './signal_registry.js'
import {
  ClientVarType,
  clientBindingPin,
  clientBoolValue,
  clientFloatValue,
  clientIdValue,
  clientItemType,
  clientIntValue,
  clientLegacyNode,
  clientLegacySkillGraph,
  clientOutflowPin,
  clientDataPin,
  clientVectorValue,
  wrap_gia
} from './gia_vendor.js'
import {
  NodePin_Index_Kind,
  VarBase_Class
} from '../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'

function clientFlowPin(targetNodeIndex: number): any {
  return {
    i1: { kind: NodePin_Index_Kind.OutFlow, index: 0 },
    i2: { kind: NodePin_Index_Kind.OutFlow, index: 0 },
    value: null,
    type: 0,
    connects: [{
      id: targetNodeIndex,
      connect: { kind: NodePin_Index_Kind.InFlow, index: 0 },
      connect2: { kind: NodePin_Index_Kind.InFlow, index: 0 }
    }]
  }
}

function clientStringValue(value: string) {
  return {
    class: VarBase_Class.StringBase,
    alreadySetVal: true,
    itemType: clientItemType(ClientVarType.String_),
    bString: { val: value }
  }
}

function clientEntityValue() {
  return {
    class: VarBase_Class.Unknown,
    alreadySetVal: false,
    itemType: clientItemType(ClientVarType.Entity_)
  }
}

function clientDefaultIdValue(type: ClientVarType) {
  return {
    class: VarBase_Class.IdBase,
    alreadySetVal: false,
    itemType: clientItemType(type),
    bId: { val: 0 }
  }
}

function valueForParam(type: string, value: unknown) {
  switch (type) {
    case 'int': return { type: ClientVarType.Integer_, value: clientIntValue(Number(value)) }
    case 'float': return { type: ClientVarType.Float_, value: clientFloatValue(Number(value)) }
    case 'bool': return { type: ClientVarType.Boolean_, value: clientBoolValue(Boolean(value)) }
    case 'str': return { type: ClientVarType.String_, value: clientStringValue(String(value)) }
    case 'vec3': return { type: ClientVarType.Vector_, value: clientVectorValue(value as [number, number, number]) }
    case 'guid': return { type: ClientVarType.GUID_, value: clientIdValue(ClientVarType.GUID_, Number(value)) }
    case 'entity': return { type: ClientVarType.Entity_, value: clientEntityValue() }
    case 'prefab_id': return { type: ClientVarType.Prefab_, value: clientIdValue(ClientVarType.Prefab_, Number(value)) }
    case 'config_id': return { type: ClientVarType.Configuration_, value: clientIdValue(ClientVarType.Configuration_, Number(value)) }
    default:
      throw new Error(`[error] client lowering does not yet support signal parameter type: ${type}`)
  }
}

const ASSEMBLY_CONCRETE: Record<string, number> = {
  config_id: 568,
  prefab_id: 569,
  entity: 1025,
  guid: 1043,
  bool: 1027,
  vec3: 1030,
  str: 1029,
  float: 173,
  int: 1026
}

const ELEMENT_CONCRETE_INDEX: Record<string, number> = {
  entity: 0,
  int: 1,
  bool: 2,
  float: 3,
  str: 4,
  vec3: 5,
  guid: 6,
  config_id: 7,
  prefab_id: 8
}

const LIST_CLIENT_TYPE: Record<string, ClientVarType> = {
  config_id: ClientVarType.ConfigurationList_,
  prefab_id: ClientVarType.PrefabList_,
  entity: ClientVarType.EntityList_,
  guid: ClientVarType.GUIDList_,
  bool: ClientVarType.BooleanList_,
  vec3: ClientVarType.VectorList_,
  str: ClientVarType.StringList_,
  float: ClientVarType.FloatList_,
  int: ClientVarType.IntegerList_
}

function literalValue(arg: ClientValueIR | undefined): unknown {
  if (!arg || arg.kind !== 'literal') throw new Error('[error] client literal value required')
  return arg.value
}

function valueFromIR(type: string, arg: ClientValueIR): any {
  if (arg.kind !== 'literal') return undefined
  return valueForParam(type, arg.value).value
}

function dataNode(node: ClientNode, index: number): any {
  switch (node.type) {
    case 'get_self_entity':
      return clientLegacyNode({ nodeIndex: index, shellId: 200033, kernelId: 1013, pins: [{ ...clientDataPin({ shellIndex: 0, kernelIndex: 0, type: ClientVarType.Entity_, value: clientDefaultIdValue(ClientVarType.Entity_) }), i1: { kind: NodePin_Index_Kind.OutParam, index: 0 }, i2: { kind: NodePin_Index_Kind.OutParam, index: 0 } }] })
    case 'query_guid_by_entity':
      return clientLegacyNode({ nodeIndex: index, shellId: 200027, kernelId: 1005, pins: [
        clientDataPin({ shellIndex: 0, kernelIndex: 0, type: ClientVarType.Entity_, value: clientDefaultIdValue(ClientVarType.Entity_) }),
        { ...clientDataPin({ shellIndex: 0, kernelIndex: 0, type: ClientVarType.GUID_, value: clientDefaultIdValue(ClientVarType.GUID_) }), i1: { kind: NodePin_Index_Kind.OutParam, index: 0 }, i2: { kind: NodePin_Index_Kind.OutParam, index: 0 } }
      ] })
    default:
      throw new Error(`[error] unsupported client data node: ${node.type}`)
  }
}

function assemblyNode(node: ClientNode, index: number): any {
  const elementType = node.elementType?.replace(/_list$/, '')
  if (!elementType || ASSEMBLY_CONCRETE[elementType] === undefined) throw new Error('[error] assembly_list requires a supported element type')
  const listType = LIST_CLIENT_TYPE[elementType]
  const count = node.elementCount ?? 0
  const values = node.elementValues ?? []
  const pins: any[] = [{ ...clientDataPin({ shellIndex: 0, kernelIndex: 0, type: ClientVarType.Integer_, value: clientIntValue(count) }), i1: { kind: NodePin_Index_Kind.InParam, index: 0 }, i2: { kind: NodePin_Index_Kind.InParam, index: 0 } }]
  for (let slot = 0; slot < 10; slot++) {
    const arg = values[slot]
    const value = arg?.kind === 'conn'
      ? { ...valueForParam(elementType, 0).value, alreadySetVal: false }
      : arg
        ? valueFromIR(elementType, arg) ?? valueForParam(elementType, 0).value
        : valueForParam(elementType, 0).value
    const wrapped = { class: VarBase_Class.ConcreteBase, alreadySetVal: true, bConcreteValue: { indexOfConcrete: ELEMENT_CONCRETE_INDEX[elementType], value } }
    pins.push({ i1: { kind: NodePin_Index_Kind.InParam, index: slot + 1 }, i2: { kind: NodePin_Index_Kind.InParam, index: slot + 1 }, value: wrapped, type: valueForParam(elementType, 0).type, connects: [] })
  }
  pins.push({
    i1: { kind: NodePin_Index_Kind.OutParam, index: 0 },
    i2: { kind: NodePin_Index_Kind.OutParam, index: 0 },
    value: {
      class: VarBase_Class.ConcreteBase,
      alreadySetVal: true,
      bConcreteValue: {
        indexOfConcrete: ELEMENT_CONCRETE_INDEX[elementType],
        value: {
          class: VarBase_Class.ArrayBase,
          alreadySetVal: false,
          itemType: clientItemType(listType),
          bArray: { entries: [] }
        }
      }
    },
    type: listType,
    connects: []
  })
  const result = clientLegacyNode({ nodeIndex: index, shellId: 200049, kernelId: ASSEMBLY_CONCRETE[elementType], pins }) as any
  result.__elementCount = count
  return result
}

function directListValue(type: string, elements: ClientValueIR[]): any {
  const elementType = type.slice(0, -5)
  const listType = LIST_CLIENT_TYPE[elementType]
  if (!listType) throw new Error(`[error] unsupported client list type: ${type}`)
  const entries = elements.map((element) => {
    if (element.kind !== 'literal') {
      throw new Error('[error] direct-list elements must be literal values')
    }
    return valueForParam(elementType, element.value).value
  })
  return {
    class: VarBase_Class.ArrayBase,
    alreadySetVal: entries.length > 0,
    itemType: clientItemType(listType),
    bArray: { entries }
  }
}

function listPlaceholder(type: string, source?: any): any {
  const element = type.slice(0, -5)
  const listType = LIST_CLIENT_TYPE[element]
  const entries = source
    ? (source.pins ?? [])
        .filter((pin: any) => pin.i1?.kind === NodePin_Index_Kind.InParam && (pin.i1.index ?? 0) >= 1 && (pin.i1.index ?? 0) <= 10)
        .slice(0, source.__elementCount ?? 0)
        .map((pin: any) => {
          const value = pin.value?.bConcreteValue?.value ?? pin.value
          return value ? { ...value, alreadySetVal: element !== 'entity' } : value
        })
    : []
  return {
    class: VarBase_Class.ArrayBase,
    alreadySetVal: entries.length > 0,
    itemType: clientItemType(listType),
    bArray: { entries }
  }
}

function signalNode(node: ClientNode, signal: RegisteredSignalDefinition, index: number, dataNodes: Map<number, any>): ReturnType<typeof clientLegacyNode> {
  const encoding = signal.clientEncoding
  const parameterCpis = encoding?.parameterCompositePinIndices
  if (!encoding || !parameterCpis || parameterCpis.some((value) => value === undefined)) {
    throw new Error(`[error] client signal registry lacks encoding metadata: ${signal.name}`)
  }
  if (parameterCpis.length !== signal.params.length) {
    throw new Error(`[error] client signal registry CPI count mismatch: ${signal.name}`)
  }
  const values = node.clientValues ?? []
  if (values.length !== signal.params.length) {
    throw new Error(`[error] client signal parameter count mismatch: ${signal.name}`)
  }
  const pins: any[] = signal.params.map((param, i) => {
    const arg = values[i]
    const isList = param.type.endsWith('_list')
    const listSource = arg.kind === 'list' && arg.encoding === 'assembly-list'
      ? dataNodes.get(arg.node_id ?? -1)
      : undefined
    const encoded = isList
      ? arg.kind !== 'list' || arg.elementType !== param.type.slice(0, -5)
        ? (() => { throw new Error(`[error] client signal list parameter ${i} must use an explicit list value`) })()
        : arg.encoding === 'direct-list'
          ? { type: LIST_CLIENT_TYPE[param.type.slice(0, -5)], value: directListValue(param.type, arg.elements) }
          : { type: LIST_CLIENT_TYPE[param.type.slice(0, -5)], value: listPlaceholder(param.type, listSource) }
      : arg.kind === 'conn'
        ? valueForParam(param.type, 0)
        : valueForParam(param.type, literalValue(arg))
    const pin: any = {
      i1: { kind: NodePin_Index_Kind.InParam, index: i },
      i2: { kind: NodePin_Index_Kind.InParam, index: i },
      value: encoded.value,
      type: encoded.type,
      connects: [],
      compositePinIndex: parameterCpis[i]
    }
    if (arg.kind === 'conn') {
      const source = dataNodes.get(arg.node_id)
      if (!source) throw new Error(`[error] missing client connection source node: ${arg.node_id}`)
      pin.connects = [{ id: source.nodeIndex, connect: { kind: NodePin_Index_Kind.OutParam, index: arg.index }, connect2: { kind: NodePin_Index_Kind.OutParam, index: arg.index } }]
    } else if (arg.kind === 'list' && arg.encoding === 'assembly-list') {
      const source = dataNodes.get(arg.node_id ?? -1)
      if (!source) throw new Error(`[error] missing client assembly source node: ${arg.node_id}`)
      pin.connects = [{ id: source.nodeIndex, connect: { kind: NodePin_Index_Kind.OutParam, index: arg.index ?? 0 }, connect2: { kind: NodePin_Index_Kind.OutParam, index: arg.index ?? 0 } }]
    }
    return pin
  })
  pins.push({ ...clientBindingPin(200124), compositePinIndex: encoding.bindingCompositePinIndex })
  pins.push({
    i1: { kind: NodePin_Index_Kind.ClientExecNode, index: 1 },
    i2: { kind: NodePin_Index_Kind.ClientExecNode, index: 1 },
    value: clientStringValue(signal.name),
    type: ClientVarType.String_,
    connects: [],
    clientExecNode: { kind: NodePin_Index_Kind.ClientSignal, index: 1 },
    compositePinIndex: encoding.nameCompositePinIndex
  })
  const result = clientLegacyNode({
    nodeIndex: index,
    shellId: signal.serverId,
    kernelId: 2000,
    pins,
    x: 36.8 + index * 520,
    y: -319.4
  }) as any
  result.genericId.kind = 22001
  result.signalVersion = 1
  return result
}

export function clientIrToGia(ir: ClientIRDocument, signalRegistry: SignalRegistry, protoPath: string): Uint8Array {
  if (ir.graph.client_type !== 'skill') throw new Error('[error] only client skill graphs are supported')
  if (!ir.graph.id) throw new Error('[error] client graph id is required')
  const nodes = ir.nodes ?? []
  const outputNodes: ReturnType<typeof clientLegacyNode>[] = []
  const dataNodes = new Map<number, any>()
  const materializedIndex = new Map<number, number>()
  const signalNodes = nodes.filter((node) => node.type === 'send_signal_to_server_node_graph')
  const dataIRNodes = nodes.filter((node) => node.type !== 'client_graph_begins' && node.type !== 'send_signal_to_server_node_graph')
  const start = clientLegacyNode({
    nodeIndex: 1,
    shellId: 200042,
    kernelId: 2001,
    contextDeclaration: { kind: NodePin_Index_Kind.ClientSignal, index: 0 },
    pins: []
  })
  outputNodes.push(start)
  for (const [dataOffset, node] of dataIRNodes.entries()) {
    const currentIndex = signalNodes.length + 2 + dataOffset
    materializedIndex.set(node.id, currentIndex)
    const materialized = node.type === 'assembly_list' ? assemblyNode(node, currentIndex) : dataNode(node, currentIndex)
    ;(materialized as any).__clientNodeType = node.type
    outputNodes.push(materialized)
    dataNodes.set(node.id, materialized)
  }
  let signalIndex = 0
  let previousSignal = start
  for (const node of signalNodes) {
    const name = node.signalRef?.name
    if (!name) throw new Error('[error] client signal node lacks signalRef')
    const signal = signalRegistry.get(name)
    if (!signal) throw new Error(`[error] client signal is not registered: ${name}`)
    const currentIndex = signalIndex + 2
    materializedIndex.set(node.id, currentIndex)
    const current = signalNode(node, signal, currentIndex, dataNodes)
    previousSignal.pins.push(clientFlowPin(current.nodeIndex))
    outputNodes.push(current)
    previousSignal = current
    signalIndex++
  }
  if (signalIndex === 0) throw new Error('[error] client graph must contain a signal node')
  outputNodes.sort((a, b) => a.nodeIndex - b.nodeIndex)
  const root = clientLegacySkillGraph({
    graphId: ir.graph.id,
    graphName: ir.graph.name ?? '_GSTS_Client_Graph',
    filePath: `client-${ir.graph.id}.gia`,
    gameVersion: '6.7.0',
    nodes: outputNodes
  })
  const relatedIds = [...new Set(outputNodes
    .filter((node) => node.genericId?.nodeId && signalRegistry)
    .map((node) => [...signalRegistry.values()].find((signal) => signal.serverId === node.genericId.nodeId)?.serverId)
    .filter((id): id is number => id !== undefined))]
  ;(root.graph as any).relatedIds = relatedIds.map((id) => ({ class: 23, type: 0, id }))

  for (const node of nodes) {
    if (node.type === 'send_signal_to_server_node_graph') continue
    const target = outputNodes.find((candidate) => candidate.nodeIndex === materializedIndex.get(node.id))
    if (!target) continue
    const args = node.type === 'assembly_list' ? node.elementValues ?? [] : node.clientValues ?? []
    for (const [argIndex, arg] of args.entries()) {
      if (arg.kind === 'list') {
        if (arg.encoding !== 'assembly-list') continue
        const source = dataNodes.get(arg.node_id ?? -1)
        if (!source) throw new Error(`[error] missing client assembly source node: ${arg.node_id}`)
        const signalTarget = outputNodes.find((candidate) => candidate.nodeIndex === materializedIndex.get(node.id))
        if (!signalTarget) throw new Error(`[error] missing client signal node: ${node.id}`)
        const signalPin = signalTarget.pins.find((candidate: any) => candidate.i1?.kind === NodePin_Index_Kind.InParam && candidate.i1.index === argIndex)
        if (!signalPin) throw new Error(`[error] missing client signal list InParam[${argIndex}]`)
        signalPin.connects = [{ id: source.nodeIndex, connect: { kind: NodePin_Index_Kind.OutParam, index: arg.index ?? 0 }, connect2: { kind: NodePin_Index_Kind.OutParam, index: arg.index ?? 0 } }]
        continue
      }
      if (arg.kind !== 'conn') continue
      const source = dataNodes.get(arg.node_id)
      if (!source) throw new Error(`[error] missing client connection source node: ${arg.node_id}`)
      const targetPin = node.type === 'query_guid_by_entity' ? 0 : node.type === 'assembly_list' ? argIndex + 1 : argIndex
      const pin = target.pins.find((candidate: any) => candidate.i1?.kind === NodePin_Index_Kind.InParam && (candidate.i1.index ?? 0) === targetPin)
      if (!pin) throw new Error(`[error] missing client target InParam[${targetPin}] for ${node.type}`)
      pin.connects = [{ id: source.nodeIndex, connect: { kind: NodePin_Index_Kind.OutParam, index: arg.index }, connect2: { kind: NodePin_Index_Kind.OutParam, index: arg.index } }]
    }
  }
  const { rootMessage } = loadGiaProto(protoPath)
  return new Uint8Array(wrap_gia(rootMessage, root))
}
