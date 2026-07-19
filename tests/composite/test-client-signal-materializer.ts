/**
 * 客户端信号 materializer v2：引用目标地图已有信号，不携带 SignalDef accessories。
 *
 * 参考 GIA 只用于确认 ClientSignal(kind=6) 的信号名 pin 编码；信号 identity 和参数
 * schema 来自目标地图 .gil 的 Signal Manager 资源。
 *
 * 运行：
 *   npx tsx tests/composite/test-client-signal-materializer.ts
 *   npx tsx tests/composite/test-client-signal-materializer.ts --output
 */

import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'

import protobuf from 'protobufjs'

import { readRegisteredSignalsFromGil } from '../../src/cli/gil_signals.js'
import {
  clientBoolValue,
  clientFloatValue,
  clientIdValue,
  clientIntValue,
  clientVectorValue,
  ClientVarType,
  NodePin_Index_Kind,
  wrap_gia
} from '../../src/compiler/gia_vendor.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const protoPath = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const root = new protobuf.Root().loadSync(protoPath, { keepCase: true })
const rootMessage = root.lookupType('Root')

const GAME_EXPORT_DIR = '/home/h/genshin-ts/Beyond_Local_Export'
const DEFAULT_REFERENCE_DIR = `${GAME_EXPORT_DIR}/user_edit/客户端`
const DEFAULT_OUTPUT_DIR = GAME_EXPORT_DIR
const DEFAULT_OUTPUT_STEM = 'gsts测试信号_v2'
const TARGET_MAP_PATH =
  process.env.GSTS_TARGET_GIL ??
  '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741848.gil'
const TARGET_SIGNAL_NAME = '信号_全部参数测试'
const TARGET_SIGNAL_SERVER_ID = 1610612743

const SIGNAL_SERVER_SHELL_ID = TARGET_SIGNAL_SERVER_ID
const SIGNAL_SERVER_KERNEL_ID = 2000
const GRAPH_START_SHELL_ID = 200042
const GRAPH_START_KERNEL_ID = 2001
const BINDING_NODE_ID = 200124
const SELF_ENTITY_GENERIC_ID = 200033
const SELF_ENTITY_CONCRETE_ID = 1013
const QUERY_GUID_GENERIC_ID = 200027
const QUERY_GUID_CONCRETE_ID = 1005
const REFERENCE_SIGNAL_PATH = `${DEFAULT_REFERENCE_DIR}/信号.gia`
const REFERENCE_SIGNAL_WITH_PARAMS_PATH = `${DEFAULT_REFERENCE_DIR}/信号-参数.gia`

type AnyRecord = Record<string, any>

type TargetSignal = {
  name: string
  params: { name: string; type: string }[]
  sendId: number
  monitorId: number
  serverId: number
}

function extractSignalName(refPath: string): string | null {
  const decoded = decode_gia_file(refPath, undefined, false) as AnyRecord
  const nodes = decoded.graph.graph.inner.graph.nodes as AnyRecord[]
  for (const node of nodes) {
    if (node.genericId?.nodeId !== SIGNAL_SERVER_SHELL_ID) continue
    for (const pin of node.pins ?? []) {
      if (pin.clientExecNode?.kind === NodePin_Index_Kind.ClientSignal && pin.value?.bString?.val) {
        return pin.value.bString.val
      }
    }
  }
  return null
}

function readTargetSignal(): TargetSignal {
  const signal = readRegisteredSignalsFromGil(TARGET_MAP_PATH).find(
    (entry) => entry.name === TARGET_SIGNAL_NAME
  )
  assert.ok(signal, `target map must register ${TARGET_SIGNAL_NAME}`)
  assert.equal(signal.serverId, TARGET_SIGNAL_SERVER_ID)
  return signal
}

function clientEntityValue(): AnyRecord {
  return {
    class: 0,
    alreadySetVal: false,
    itemType: { classBase: 2, type_client: { type: ClientVarType.Entity_ } }
  }
}

function clientStringValue(value: string): AnyRecord {
  return {
    class: 5,
    alreadySetVal: true,
    itemType: { classBase: 2, type_client: { type: ClientVarType.String_ } },
    bString: { val: value }
  }
}

function clientDefaultIdValue(type: ClientVarType): AnyRecord {
  return {
    class: 1,
    alreadySetVal: false,
    itemType: { classBase: 2, type_client: { type } },
    bId: { val: 0 }
  }
}

const SIGNAL_PARAM_COMPOSITE_PIN_INDEX: Record<number, number[]> = {
  1610612740: [65, 66, 70, 71, 79],
  1610612746: [176, 177, 178, 179, 180, 181, 182, 183, 184],
  1610612743: [137, 138, 139, 140, 141, 142, 143, 144, 145]
}

function inParamPin(
  shellIndex: number,
  type: ClientVarType,
  value: AnyRecord,
  compositePinIndex: number
): AnyRecord {
  return {
    i1: { kind: NodePin_Index_Kind.InParam, index: shellIndex },
    i2: { kind: NodePin_Index_Kind.InParam, index: shellIndex },
    value,
    type,
    connects: [],
    compositePinIndex
  }
}

function clientExecBindingPin(compositePinIndex: number): AnyRecord {
  return {
    i1: { kind: NodePin_Index_Kind.ClientExecNode, index: 0 },
    i2: { kind: NodePin_Index_Kind.ClientExecNode, index: 0 },
    value: clientIntValue(),
    type: ClientVarType.Integer_,
    connects: [],
    clientExecNode: {
      kind: NodePin_Index_Kind.ClientExecNode,
      index: 1,
      nodeId: { id: BINDING_NODE_ID }
    },
    compositePinIndex
  }
}

function clientExecSignalNamePin(signalName: string, compositePinIndex: number): AnyRecord {
  return {
    i1: { kind: NodePin_Index_Kind.ClientExecNode, index: 1 },
    i2: { kind: NodePin_Index_Kind.ClientExecNode, index: 1 },
    value: clientStringValue(signalName),
    type: ClientVarType.String_,
    connects: [],
    clientExecNode: {
      kind: NodePin_Index_Kind.ClientSignal,
      index: 1
    },
    compositePinIndex
  }
}

function clientArrayValue(type: ClientVarType, value: AnyRecord): AnyRecord {
  return {
    class: 10002,
    alreadySetVal: true,
    itemType: { classBase: 2, type_client: { type } },
    bArray: { entries: [value] }
  }
}

function valueForParam(type: string, withValues: boolean): { type: ClientVarType; value: AnyRecord } {
  const scalarType = type.endsWith('_list') ? type.slice(0, -5) : type
  let clientType: ClientVarType
  let value: AnyRecord
  switch (scalarType) {
    case 'int':
      clientType = ClientVarType.Integer_
      value = withValues ? clientIntValue(1) : clientIntValue()
      break
    case 'float':
      clientType = ClientVarType.Float_
      value = withValues ? clientFloatValue(2.2) : clientFloatValue(0)
      break
    case 'vec3':
      clientType = ClientVarType.Vector_
      value = withValues ? clientVectorValue([1, 2, 3.4]) : clientVectorValue([0, 0, 0])
      break
    case 'guid':
      clientType = ClientVarType.GUID_
      value = withValues ? clientIdValue(clientType, 3) : clientDefaultIdValue(clientType)
      break
    case 'bool':
      clientType = ClientVarType.Boolean_
      value = withValues ? clientBoolValue(true) : clientBoolValue(false)
      break
    case 'entity':
      clientType = ClientVarType.Entity_
      value = clientEntityValue()
      break
    case 'prefab_id':
      clientType = ClientVarType.Prefab_
      value = withValues ? clientIdValue(clientType, 2345) : clientDefaultIdValue(clientType)
      break
    case 'config_id':
      clientType = ClientVarType.Configuration_
      value = withValues ? clientIdValue(clientType, 3453544) : clientDefaultIdValue(clientType)
      break
    case 'str':
      clientType = ClientVarType.String_
      value = withValues ? clientStringValue('字符串') : clientStringValue('')
      value.alreadySetVal = withValues ? true : false
      break
    default:
      throw new Error(`unsupported client signal parameter type: ${type}`)
  }

  if (!type.endsWith('_list')) return { type: clientType, value }
  const listType = ({
    guid: ClientVarType.GUIDList_,
    int: ClientVarType.IntegerList_,
    bool: ClientVarType.BooleanList_,
    float: ClientVarType.FloatList_,
    str: ClientVarType.StringList_,
    vec3: ClientVarType.VectorList_,
    entity: ClientVarType.EntityList_,
    config_id: ClientVarType.ConfigurationList_,
    prefab_id: ClientVarType.PrefabList_
  } as Record<string, ClientVarType>)[scalarType]
  if (listType === undefined) throw new Error(`unsupported client signal list type: ${type}`)
  return { type: listType, value: clientArrayValue(listType, value) }
}

function makeSendSignalNode(
  nodeIndex: number,
  signal: TargetSignal,
  withValues: boolean
): AnyRecord {
  const dataPins = signal.params.map((param, index) => {
    const paramValue = valueForParam(param.type, withValues)
    const compositePinIndex = SIGNAL_PARAM_COMPOSITE_PIN_INDEX[signal.serverId]?.[index] ?? 137 + index
    return inParamPin(index, paramValue.type, paramValue.value, compositePinIndex)
  })

  return {
    nodeIndex,
    genericId: { class: 10001, type: 20002, kind: 22001, nodeId: signal.serverId },
    concreteId: { class: 10001, type: 20002, kind: 22000, nodeId: SIGNAL_SERVER_KERNEL_ID },
    pins: [
      ...dataPins,
      clientExecBindingPin(135),
      clientExecSignalNamePin(signal.name, 136)
    ],
    x: 36.8,
    y: -319.4,
    usingStruct: [],
    signalVersion: 1
  }
}

function buildSignalGraph(options: {
  graphId: number
  graphName: string
  signal: TargetSignal
  withValues: boolean
}): AnyRecord {
  return {
    graph: {
      id: { class: 1, type: 3, id: options.graphId },
      relatedIds: [{ class: 23, type: 0, id: options.signal.serverId }],
      name: options.graphName,
      which: 11,
      graph: {
        inner: {
          graph: {
            id: { class: 10000, type: 20002, kind: 21001, id: options.graphId },
            name: options.graphName,
            nodes: [
              {
                nodeIndex: 1,
                genericId: {
                  class: 10001,
                  type: 20002,
                  kind: 22000,
                  nodeId: GRAPH_START_SHELL_ID
                },
                concreteId: {
                  class: 10001,
                  type: 20002,
                  kind: 22000,
                  nodeId: GRAPH_START_KERNEL_ID
                },
                pins: [
                  {
                    i1: { kind: NodePin_Index_Kind.OutFlow, index: 0 },
                    i2: { kind: NodePin_Index_Kind.OutFlow, index: 0 },
                    value: null,
                    type: 0,
                    connects: [
                      {
                        id: 3,
                        connect: { kind: NodePin_Index_Kind.InFlow, index: 0 },
                        connect2: { kind: NodePin_Index_Kind.InFlow, index: 0 }
                      }
                    ]
                  }
                ],
                x: -292.2,
                y: -296.4,
                usingStruct: [],
                contextDeclaration: { kind: NodePin_Index_Kind.ClientSignal, index: 0 }
              },
              makeSendSignalNode(3, options.signal, options.withValues)
            ],
            compositePins: [],
            comments: [],
            graphValues: [],
            affiliations: [],
            entrySlotIndex: 1
          }
        }
      }
    },
    accessories: [],
    filePath: `110170759-${Math.floor(Date.now() / 1000)}-1073741848-\\${options.graphName}.gia`,
    gameVersion: '6.7.0'
  }
}

function makeFlowPin(targetNodeIndex: number): AnyRecord {
  return {
    i1: { kind: NodePin_Index_Kind.OutFlow },
    i2: { kind: NodePin_Index_Kind.OutFlow },
    value: null,
    type: 0,
    connects: [
      {
        id: targetNodeIndex,
        connect: { kind: NodePin_Index_Kind.InFlow },
        connect2: { kind: NodePin_Index_Kind.InFlow }
      }
    ]
  }
}

function makeSelfEntityNode(nodeIndex: number): AnyRecord {
  return {
    nodeIndex,
    genericId: { class: 10001, type: 20002, kind: 22000, nodeId: SELF_ENTITY_GENERIC_ID },
    concreteId: { class: 10001, type: 20002, kind: 22000, nodeId: SELF_ENTITY_CONCRETE_ID },
    pins: [
      {
        i1: { kind: NodePin_Index_Kind.OutParam, index: 0 },
        i2: { kind: NodePin_Index_Kind.OutParam, index: 0 },
        value: clientDefaultIdValue(ClientVarType.Entity_),
        type: ClientVarType.Entity_,
        connects: []
      }
    ],
    x: -526.8571,
    y: -70.8286,
    usingStruct: []
  }
}

function makeQueryGuidNode(nodeIndex: number, selfEntityNodeIndex: number): AnyRecord {
  return {
    nodeIndex,
    genericId: { class: 10001, type: 20002, kind: 22000, nodeId: QUERY_GUID_GENERIC_ID },
    concreteId: { class: 10001, type: 20002, kind: 22000, nodeId: QUERY_GUID_CONCRETE_ID },
    pins: [
      {
        i1: { kind: NodePin_Index_Kind.InParam, index: 0 },
        i2: { kind: NodePin_Index_Kind.InParam, index: 0 },
        value: clientDefaultIdValue(ClientVarType.Entity_),
        type: ClientVarType.Entity_,
        connects: [
          {
            id: selfEntityNodeIndex,
            connect: { kind: NodePin_Index_Kind.OutParam, index: 0 },
            connect2: { kind: NodePin_Index_Kind.OutParam, index: 0 }
          }
        ]
      },
      {
        i1: { kind: NodePin_Index_Kind.OutParam, index: 0 },
        i2: { kind: NodePin_Index_Kind.OutParam, index: 0 },
        value: clientDefaultIdValue(ClientVarType.GUID_),
        type: ClientVarType.GUID_,
        connects: []
      }
    ],
    x: -118.8571,
    y: -123.8571,
    usingStruct: []
  }
}

function connectSignalParam(
  signalNode: AnyRecord,
  paramIndex: number,
  sourceNodeIndex: number
): void {
  const pin = signalNode.pins.find(
    (candidate: AnyRecord) =>
      candidate.i1?.kind === NodePin_Index_Kind.InParam && candidate.i1.index === paramIndex
  )
  assert.ok(pin, `signal parameter ${paramIndex} must exist`)
  pin.connects = [
    {
      id: sourceNodeIndex,
      connect: { kind: NodePin_Index_Kind.OutParam, index: 0 },
      connect2: { kind: NodePin_Index_Kind.OutParam, index: 0 }
    }
  ]
}

const ASSEMBLY_LIST_SPECS = [
  { targetSignalIndex: 1, element: 'entity', concreteId: 1025, signalIndex: 4 },
  { targetSignalIndex: 2, element: 'config_id', concreteId: 568, signalIndex: 0 },
  { targetSignalIndex: 2, element: 'prefab_id', concreteId: 569, signalIndex: 1 },
  { targetSignalIndex: 2, element: 'entity', concreteId: 1025, signalIndex: 2 },
  { targetSignalIndex: 2, element: 'guid', concreteId: 1043, signalIndex: 3 },
  { targetSignalIndex: 2, element: 'bool', concreteId: 1027, signalIndex: 4 },
  { targetSignalIndex: 2, element: 'vec3', concreteId: 1030, signalIndex: 5 },
  { targetSignalIndex: 2, element: 'str', concreteId: 1029, signalIndex: 6 },
  { targetSignalIndex: 2, element: 'float', concreteId: 173, signalIndex: 7 },
  { targetSignalIndex: 2, element: 'int', concreteId: 1026, signalIndex: 8 }
] as const

const ASSEMBLY_LIST_TYPES: Record<string, ClientVarType> = {
  entity: ClientVarType.EntityList_,
  guid: ClientVarType.GUIDList_,
  bool: ClientVarType.BooleanList_,
  vec3: ClientVarType.VectorList_,
  str: ClientVarType.StringList_,
  int: ClientVarType.IntegerList_,
  float: ClientVarType.FloatList_,
  config_id: ClientVarType.ConfigurationList_,
  prefab_id: ClientVarType.PrefabList_
}

function assemblyElementValue(element: string, index = 0): AnyRecord {
  switch (element) {
    case 'entity':
      return clientEntityValue()
    case 'guid':
      return clientDefaultIdValue(ClientVarType.GUID_)
    case 'bool':
      return clientBoolValue(index === 1)
    case 'vec3':
      return clientVectorValue(index === 0 ? [3, 0, 2] : [0, 0, 0])
    case 'str':
      return clientStringValue(index === 0 ? '测试' : '')
    case 'int':
      return clientIntValue(index === 0 ? 3 : 0)
    case 'float':
      return clientFloatValue(index === 0 ? 2.2 : 0)
    case 'config_id':
      return clientIdValue(ClientVarType.Configuration_, index === 0 ? 3453544 : 0)
    case 'prefab_id':
      return clientIdValue(ClientVarType.Prefab_, index === 0 ? 2345 : 0)
    default:
      throw new Error(`unsupported assembly element: ${element}`)
  }
}

function assemblyElementCount(element: string): number {
  return element === 'bool' ? 2 : 1
}

function wrappedAssemblyValue(value: AnyRecord, indexOfConcrete: number): AnyRecord {
  return {
    class: 10000,
    alreadySetVal: true,
    bConcreteValue: { indexOfConcrete, value }
  }
}

function makeAssemblyListNode(
  nodeIndex: number,
  element: string,
  concreteId: number,
  source?: { nodeIndex: number; pinIndex: number }
): AnyRecord {
  const listType = ASSEMBLY_LIST_TYPES[element]
  const elementValue = assemblyElementValue(element)
  const elementCount = assemblyElementCount(element)
  const elementConcreteIndex: Record<string, number> = {
    entity: 0,
    guid: 6,
    bool: 2,
    vec3: 5,
    str: 4,
    int: 1,
    float: 3,
    config_id: 7,
    prefab_id: 8
  }[element]
  const pins: AnyRecord[] = [
    {
      i1: { kind: NodePin_Index_Kind.InParam, index: 0 },
      i2: { kind: NodePin_Index_Kind.InParam, index: 0 },
      value: clientIntValue(elementCount),
      type: ClientVarType.Integer_,
      connects: []
    }
  ]
  for (let index = 1; index <= 10; index++) {
    const pin: AnyRecord = {
      i1: { kind: NodePin_Index_Kind.InParam, index },
      i2: { kind: NodePin_Index_Kind.InParam, index },
      value: wrappedAssemblyValue(assemblyElementValue(element, index - 1), elementConcreteIndex),
      type: assemblyElementValue(element, index - 1).itemType.type_client.type,
      connects: []
    }
    if (index === 1 && source) {
      pin.connects = [{
        id: source.nodeIndex,
        connect: { kind: NodePin_Index_Kind.OutParam, index: source.pinIndex },
        connect2: { kind: NodePin_Index_Kind.OutParam, index: source.pinIndex }
      }]
    }
    pins.push(pin)
  }
  pins.push({
    i1: { kind: NodePin_Index_Kind.OutParam, index: 0 },
    i2: { kind: NodePin_Index_Kind.OutParam, index: 0 },
    value: wrappedAssemblyValue(
      {
        class: 10002,
        alreadySetVal: false,
        itemType: { classBase: 2, type_client: { type: listType } },
        bArray: { entries: [] }
      },
      elementConcreteIndex
    ),
    type: listType,
    connects: []
  })
  return {
    nodeIndex,
    genericId: { class: 10001, type: 20002, kind: 22000, nodeId: 200049 },
    concreteId: { class: 10001, type: 20002, kind: 22000, nodeId: concreteId },
    pins,
    x: -500,
    y: 200,
    usingStruct: []
  }
}

function buildCombinedSignalGraph(
  graphId: number,
  signals: TargetSignal[],
  withValues: boolean
): AnyRecord {
  const graphName = 'gsts测试信号_v2_三个信号顺序发送_带参数'
  const nodes: AnyRecord[] = [
    {
      nodeIndex: 1,
      genericId: { class: 10001, type: 20002, kind: 22000, nodeId: GRAPH_START_SHELL_ID },
      concreteId: { class: 10001, type: 20002, kind: 22000, nodeId: GRAPH_START_KERNEL_ID },
      pins: [makeFlowPin(2)],
      x: -292.2,
      y: -296.4,
      usingStruct: [],
      contextDeclaration: { kind: NodePin_Index_Kind.ClientSignal }
    }
  ]

  signals.forEach((signal, index) => {
    const nodeIndex = index + 2
    const node = makeSendSignalNode(nodeIndex, signal, withValues)
    node.x = 36.8 + index * 520
    node.y = -319.4
    if (index < signals.length - 1) node.pins.push(makeFlowPin(nodeIndex + 1))
    nodes.push(node)
  })

  if (withValues) {
    const selfEntityNodeIndex = signals.length + 2
    const queryGuidNodeIndex = signals.length + 3
    const completeSignalNode = nodes[signals.length]
    nodes.push(
      makeSelfEntityNode(selfEntityNodeIndex),
      makeQueryGuidNode(queryGuidNodeIndex, selfEntityNodeIndex)
    )
    connectSignalParam(completeSignalNode, 5, selfEntityNodeIndex)
    connectSignalParam(completeSignalNode, 3, queryGuidNodeIndex)
    const queryGuidOut = nodes[nodes.length - 1].pins.find(
      (pin: AnyRecord) => pin.i1?.kind === NodePin_Index_Kind.OutParam
    )
    assert.ok(queryGuidOut)
    queryGuidOut.connects = [
      {
        id: completeSignalNode.nodeIndex,
        connect: { kind: NodePin_Index_Kind.InParam, index: 3 },
        connect2: { kind: NodePin_Index_Kind.InParam, index: 3 }
      }
    ]

    for (const [offset, spec] of ASSEMBLY_LIST_SPECS.entries()) {
      const assemblyNodeIndex = signals.length + 4 + offset
      const source = spec.element === 'entity'
        ? { nodeIndex: selfEntityNodeIndex, pinIndex: 0 }
        : spec.element === 'guid'
          ? { nodeIndex: queryGuidNodeIndex, pinIndex: 0 }
          : undefined
      const assemblyNode = makeAssemblyListNode(
        assemblyNodeIndex,
        spec.element,
        spec.concreteId,
        source
      )
      nodes.push(assemblyNode)
      const targetSignalNode = nodes[spec.targetSignalIndex]
      const signalPin = targetSignalNode.pins.find(
        (pin: AnyRecord) => pin.i1?.kind === NodePin_Index_Kind.InParam && pin.i1.index === spec.signalIndex
      )
      assert.ok(signalPin)
      signalPin.connects = [{
        id: assemblyNodeIndex,
        connect: { kind: NodePin_Index_Kind.OutParam, index: 0 },
        connect2: { kind: NodePin_Index_Kind.OutParam, index: 0 }
      }]
      const outputPin = assemblyNode.pins[assemblyNode.pins.length - 1]
      outputPin.connects = [{
        id: targetSignalNode.nodeIndex,
        connect: { kind: NodePin_Index_Kind.InParam, index: spec.signalIndex },
        connect2: { kind: NodePin_Index_Kind.InParam, index: spec.signalIndex }
      }]
    }
  }

  return {
    graph: {
      id: { class: 1, type: 3, id: graphId },
      relatedIds: signals.map((signal) => ({ class: 23, type: 0, id: signal.serverId })),
      name: graphName,
      which: 11,
      graph: {
        inner: {
          graph: {
            id: { class: 10000, type: 20002, kind: 21001, id: graphId },
            name: graphName,
            nodes,
            compositePins: [],
            comments: [],
            graphValues: [],
            affiliations: [],
            entrySlotIndex: 1
          }
        }
      }
    },
    accessories: [],
    filePath: `110170759-${Math.floor(Date.now() / 1000)}-1073741848-\\${graphName}.gia`,
    gameVersion: '6.7.0'
  }
}

function verifyCombinedGraph(data: AnyRecord, signals: TargetSignal[]): void {
  assert.equal(data.graph.which, 11)
  assert.deepEqual(data.accessories, [])
  assert.deepEqual(
    data.graph.relatedIds,
    signals.map((signal) => ({ class: 23, type: 0, id: signal.serverId }))
  )

  const nodes = data.graph.graph.inner.graph.nodes as AnyRecord[]
  assert.equal(nodes.length, signals.length + 3 + ASSEMBLY_LIST_SPECS.length)
  assert.deepEqual(
    nodes.slice(1, signals.length + 1).map((node) => node.genericId.nodeId),
    signals.map((signal) => signal.serverId)
  )
  assert.deepEqual(
    nodes
      .slice(1, signals.length + 1)
      .map((node) => node.pins.find((pin: AnyRecord) => pin.i1.kind === 5 && pin.i1.index === 1)?.value.bString.val),
    signals.map((signal) => signal.name)
  )
  assert.deepEqual(
    nodes
      .slice(1, signals.length + 1)
      .map((node) => node.pins.filter((pin: AnyRecord) => pin.i1.kind === 3).length),
    signals.map((signal) => signal.params.length)
  )

  const completeSignal = nodes[signals.length]
  const selfEntity = nodes[signals.length + 1]
  const queryGuid = nodes[signals.length + 2]
  assert.equal(selfEntity.concreteId.nodeId, SELF_ENTITY_CONCRETE_ID)
  assert.equal(selfEntity.pins[0].type, ClientVarType.Entity_)
  assert.equal(queryGuid.concreteId.nodeId, QUERY_GUID_CONCRETE_ID)
  assert.equal(queryGuid.pins[0].connects[0].id, selfEntity.nodeIndex)
  assert.equal(queryGuid.pins[1].type, ClientVarType.GUID_)
  assert.equal(queryGuid.pins[1].connects[0].id, completeSignal.nodeIndex)
  assert.equal(queryGuid.pins[1].connects[0].connect.index, 3)
  assert.equal(completeSignal.pins.find((pin: AnyRecord) => pin.i1.kind === 3 && pin.i1.index === 5).connects[0].id, selfEntity.nodeIndex)
  assert.equal(completeSignal.pins.find((pin: AnyRecord) => pin.i1.kind === 3 && pin.i1.index === 3).connects[0].id, queryGuid.nodeIndex)

  const assemblyNodes = ASSEMBLY_LIST_SPECS.map((_, offset) => nodes[signals.length + 3 + offset])
  assert.deepEqual(
    assemblyNodes.map((node) => node.concreteId.nodeId),
    ASSEMBLY_LIST_SPECS.map((spec) => spec.concreteId)
  )
  for (const [index, spec] of ASSEMBLY_LIST_SPECS.entries()) {
    const assembly = assemblyNodes[index]
    const target = nodes[spec.targetSignalIndex]
    const listPin = target.pins.find(
      (pin: AnyRecord) => pin.i1?.kind === NodePin_Index_Kind.InParam && pin.i1.index === spec.signalIndex
    )
    assert.equal(listPin.type, ASSEMBLY_LIST_TYPES[spec.element])
    assert.equal(listPin.connects[0].id, assembly.nodeIndex)
    assert.equal(assembly.pins[0].type, ClientVarType.Integer_)
    assert.equal(assembly.pins[1].connects[0]?.id, spec.element === 'entity' ? selfEntity.nodeIndex : spec.element === 'guid' ? queryGuid.nodeIndex : undefined)
    assert.equal(assembly.pins[assembly.pins.length - 1].type, ASSEMBLY_LIST_TYPES[spec.element])
    assert.equal(assembly.pins[assembly.pins.length - 1].connects[0].id, target.nodeIndex)
  }

  for (let index = 0; index < signals.length; index++) {
    const flowPin = nodes[index].pins.find(
      (pin: AnyRecord) => pin.i1.kind === NodePin_Index_Kind.OutFlow
    )
    assert.ok(flowPin, `signal ${index} must have an execution flow`)
    assert.equal(flowPin.connects[0].id, index + 2)
  }
}

function verifyCompleteScalarSignal(data: AnyRecord, targetSignal: TargetSignal): void {
  const nodes = data.graph.graph.inner.graph.nodes as AnyRecord[]
  const signal = nodes.find((node) => node.genericId?.nodeId === targetSignal.serverId)
  assert.ok(signal, 'complete scalar signal node exists')

  const expected = [
    { type: ClientVarType.Integer_, class: 2, field: 'bInt', value: 1 },
    { type: ClientVarType.Float_, class: 4, field: 'bFloat', value: 2.2 },
    { type: ClientVarType.Vector_, class: 7, field: 'bVector', value: { x: 1, y: 2, z: 3.4 } },
    { type: ClientVarType.GUID_, class: 1, field: 'bId', value: 3 },
    { type: ClientVarType.Boolean_, class: 6, field: 'bEnum', value: 1 },
    { type: ClientVarType.Entity_, class: 0, field: undefined, value: undefined },
    { type: ClientVarType.Prefab_, class: 1, field: 'bId', value: 2345 },
    { type: ClientVarType.Configuration_, class: 1, field: 'bId', value: 3453544 },
    { type: ClientVarType.String_, class: 5, field: 'bString', value: '字符串' }
  ]

  const pins = (signal.pins as AnyRecord[])
    .filter((pin) => pin.i1?.kind === NodePin_Index_Kind.InParam)
    .sort((a, b) => a.i1.index - b.i1.index)
  assert.equal(pins.length, expected.length)
  for (const [index, spec] of expected.entries()) {
    const pin = pins[index]
    assert.equal(pin.i1.index, index)
    assert.equal(pin.type, spec.type)
    assert.equal(pin.compositePinIndex, 137 + index)
    assert.equal(pin.value.class, spec.class)
    assert.equal(pin.value.alreadySetVal, spec.field !== undefined)
    assert.equal(pin.value.itemType.type_client.type, spec.type)
    if (spec.field) {
      const value = pin.value[spec.field]
      assert.ok(value, `parameter ${index + 1} must use ${spec.field}`)
      if (spec.field === 'bVector') {
        assert.deepEqual(
          { x: value.val.x, y: value.val.y, z: Number(value.val.z.toFixed(1)) },
          spec.value
        )
      } else {
        assert.equal(value.val, spec.value)
      }
    } else {
      assert.equal(pin.value.bId, undefined)
      assert.equal(pin.value.bEnum, undefined)
      assert.equal(pin.value.bString, undefined)
    }
  }
}

function verifyGraph(data: AnyRecord, label: string, targetSignal: TargetSignal): void {
  assert.equal(data.graph.which, 11, `${label}: which must be Skills(11)`)
  assert.deepEqual(data.accessories, [], `${label}: must not carry signal accessories`)
  assert.deepEqual(data.graph.relatedIds, [{ class: 23, type: 0, id: targetSignal.serverId }])

  const nodes = data.graph.graph.inner.graph.nodes as AnyRecord[]
  assert.equal(nodes.length, 2, `${label}: must have Begin + Signal nodes`)
  const signal = nodes.find((node) => node.nodeIndex === 3)
  assert.ok(signal, `${label}: signal node exists`)
  assert.equal(signal.genericId.nodeId, targetSignal.serverId)
  assert.equal(signal.pins.filter((pin: AnyRecord) => pin.i1.kind === NodePin_Index_Kind.InParam).length, targetSignal.params.length)
  assert.equal(signal.concreteId.nodeId, SIGNAL_SERVER_KERNEL_ID)
  assert.equal(signal.signalVersion, 1)

  const namePin = signal.pins.find(
    (pin: AnyRecord) => pin.i1.kind === NodePin_Index_Kind.ClientExecNode && pin.i1.index === 1
  )
  assert.ok(namePin, `${label}: signal name pin exists`)
  assert.equal(namePin.clientExecNode.kind, NodePin_Index_Kind.ClientSignal)
  assert.equal(namePin.value.bString.val, targetSignal.name)
}

function roundTrip(data: AnyRecord): void {
  const encoded = rootMessage.encode(data).finish()
  const decoded = rootMessage.decode(encoded)
  assert.deepEqual(Buffer.from(rootMessage.encode(decoded).finish()), Buffer.from(encoded))

  const container = Buffer.from(wrap_gia(rootMessage, decoded as never))
  assert.equal(container.readUInt32BE(8), 0x0326)
  assert.equal(container.readUInt32BE(container.length - 4), 0x0679)
  const payload = container.subarray(20, -4)
  const decodedPayload = rootMessage.decode(payload)
  assert.deepEqual(
    Buffer.from(rootMessage.encode(decodedPayload).finish()),
    Buffer.from(payload)
  )
}

function outputGia(data: AnyRecord, outputPath: string): void {
  const decoded = rootMessage.decode(rootMessage.encode(data).finish())
  writeFileSync(outputPath, Buffer.from(wrap_gia(rootMessage, decoded as never)))
  console.log(`  Output: ${outputPath}`)
}

function main() {
  const shouldOutput = process.argv.includes('--output')
  for (const input of [REFERENCE_SIGNAL_PATH, REFERENCE_SIGNAL_WITH_PARAMS_PATH, TARGET_MAP_PATH]) {
    readFileSync(input)
  }

  const registeredSignals = readRegisteredSignalsFromGil(TARGET_MAP_PATH)
  const referenceSignal = registeredSignals.find((entry) => entry.name === TARGET_SIGNAL_NAME)
  assert.ok(referenceSignal)
  assert.equal(extractSignalName(REFERENCE_SIGNAL_PATH), referenceSignal.name)
  assert.equal(extractSignalName(REFERENCE_SIGNAL_WITH_PARAMS_PATH), referenceSignal.name)
  console.log(`=== Target map signals (${registeredSignals.length}) ===`)
  console.log(`  map: ${TARGET_MAP_PATH}`)

  const testCases = [
    { signalName: '信号_1', graphId: 1082130513 },
    { signalName: '信号_全部列表参数测试', graphId: 1082130514 },
    { signalName: TARGET_SIGNAL_NAME, graphId: 1082130515 }
  ]

  for (const testCase of testCases) {
    const signal = registeredSignals.find((entry) => entry.name === testCase.signalName)
    assert.ok(signal, `target map must register ${testCase.signalName}`)
    console.log(`  ${signal.name}: ${signal.serverId}`)
    console.log(`    params: ${signal.params.map((param) => param.type).join(', ')}`)

    for (const [withValues, suffix] of [[false, '无参数'], [true, '有参数']] as const) {
      const graph = buildSignalGraph({
        graphId: testCase.graphId + (withValues ? 100 : 0),
        graphName: `gsts测试信号_v2_${testCase.signalName}_${suffix}`,
        signal,
        withValues
      })
      verifyGraph(graph, `${signal.name}_${suffix}`, signal)
      if (signal.name === TARGET_SIGNAL_NAME && withValues) {
        verifyCompleteScalarSignal(graph, signal)
      }
      roundTrip(graph)
      console.log(`    PASS — ${suffix}`)

    }
  }

  const combinedSignals = [
    registeredSignals.find((entry) => entry.name === '信号_1'),
    registeredSignals.find((entry) => entry.name === '信号_全部列表参数测试'),
    registeredSignals.find((entry) => entry.name === TARGET_SIGNAL_NAME)
  ]
  assert.ok(combinedSignals.every((signal): signal is TargetSignal => !!signal))
  const combinedGraph = buildCombinedSignalGraph(1082130616, combinedSignals, true)
  verifyCombinedGraph(combinedGraph, combinedSignals)
  roundTrip(combinedGraph)
  console.log('  combined PASS — 信号_1 → 信号_全部列表参数测试 → 信号_全部参数测试')
  if (shouldOutput) {
    outputGia(
      combinedGraph,
      `${DEFAULT_OUTPUT_DIR}/${DEFAULT_OUTPUT_STEM}_三个信号顺序发送_带参数_实体GUID.gia`
    )
  }

  console.log('All v2 client signal materializer checks passed.')
}

main()
