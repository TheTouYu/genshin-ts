/**
 * Signal definition accessories + encoded-node patch for send/monitor/server (P5-W10).
 *
 * Real editor GIA evidence (修复后 min_main/min_composite 2026-07-31、多信号2.gia、
 * 客户端/信号.gia、001/002.gia):
 * - send/monitor node ids are the REGISTERED signal triplet ids (e.g. cube_turn
 *   1610612741/42/43), kind SysGraph(22001), server signalVersion=2
 * - client send_signal_to_server_node_graph node uses the registered serverId
 *   (1610612743), kind SysGraph(22001), concreteId 2000 (SysCall), signalVersion=1
 * - 1610612738/39/40 are NOT special builtins: they are the `信号_1` triplet
 *   (the editor's first/default signal), which is why old samples show them.
 *   gsts never hardcodes them; it always patches to the map-registered triplet.
 * - SignalDef accessory which=14 name="发送信号" id=sendId with ParameterFlow inputs
 * - Monitor CompositeDef which=12 name="监听信号" id=monitorId graphId=0 with OutParams
 * - ClientExec pin compositePinIndex=7 (send); data InParam cpi = SignalDef input pinIndex
 * - Data pins start at physical index 0 (= IR arg 1); name is ClientExec not InParam
 *
 * Historical gsts placeholders 300000/300001/300002 remain for IR resolution and
 * injector remap; this module rewrites encoded nodes to the registered SysGraph ids
 * and emits the missing SignalDef/Monitor definition accessories so the editor can
 * show parameters without injection.
 */

import type { Argument, IRDocument } from '../../runtime/IR.js'
import {
  GraphUnit_Id_Class,
  GraphUnit_Id_Type,
  GraphUnit_Which,
  NodeGraph_Id_Class,
  NodeGraph_Id_Kind,
  NodeGraph_Id_Type,
  NodePin_Index_Kind,
  NodeProperty_Type,
  VarBase_Class,
  VarType,
  type GraphUnit
} from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'
import { buildCompositeParameterType } from './build_composite_definition.js'
import { SPECIAL_NODE_IDS } from './mappings.js'
import type { RegisteredSignalDefinition, SignalRegistry } from '../signal_registry.js'

export const SIGNAL_PLACEHOLDER_SEND_ID = SPECIAL_NODE_IDS.send_signal // 300000
export const SIGNAL_PLACEHOLDER_MONITOR_ID = SPECIAL_NODE_IDS.monitor_signal // 300001
/** Client send_signal_to_server_node_graph placeholder (client_graph.ts CLIENT_SEND_SIGNAL_PLACEHOLDER_GID). */
export const SIGNAL_PLACEHOLDER_SERVER_ID = 300002

/** Stable pinIndex layout from 001/002.gia for send SignalDef. */
export const SEND_SIGNAL_PIN_INDEX = {
  inflow: 3,
  outflow: 5,
  clientExec: 7,
  firstParam: 12
} as const

/**
 * Monitor CompositeDef pinIndex layout (001.gia with 1 param).
 * Fixed outputs 0..2 then params at 3+; ClientExec sits between outflow and first output.
 */
export const MONITOR_SIGNAL_PIN_INDEX = {
  outflow: 13,
  clientExec: 14,
  firstFixedOutput: 15,
  /** First signal-parameter OutParam pinIndex (= firstFixedOutput + 3). */
  firstParamOutput: 18
} as const

export const SIGNAL_DEFINITION_CONTRACT = {
  workPackage: 'P5-W10',
  phase: 'P5-W10',
  // Real editor samples (001.gia, 修复后 min_main/min_composite) signalVersion=2;
  // 153f2ec flipped this to 1 without evidence and real-game send/receive broke.
  signalVersion: 2,
  signalDefWhich: 14 as const,
  signalDefXxx: 1,
  /** Real samples use type.kind=1001 for SignalDef (not Composite=1000). */
  signalDefTypeKind: 1001,
  /** Client send_signal_to_server_node_graph nodes use signalVersion=1 (客户端/信号.gia). */
  clientSignalVersion: 1,
  placeholderSendId: SIGNAL_PLACEHOLDER_SEND_ID,
  placeholderMonitorId: SIGNAL_PLACEHOLDER_MONITOR_ID,
  placeholderServerId: SIGNAL_PLACEHOLDER_SERVER_ID,
  sendPinIndex: SEND_SIGNAL_PIN_INDEX,
  monitorPinIndex: MONITOR_SIGNAL_PIN_INDEX,
  clientExecNodeKind: 6,
  notes:
    'Emit SignalDef(which=14)+监听信号 CompositeDef and patch placeholder 300000/300001 nodes to builtin SysGraph ids with compositePinIndex so editor shows signal parameters without inject.'
} as const

export type SignalParamSpec = {
  name: string
  type: string
}

export type SignalDefinitionIdentity = {
  sendId: number
  monitorId: number
  serverId: number
}

export type CollectedSignalUsage = {
  name: string
  /** Param types from send_signal IR args[1..] (best available schema for this name). */
  params: SignalParamSpec[]
  hasSend: boolean
  hasMonitor: boolean
  /** monitor OutParam indices (>=3) observed via connIndex consumers. */
  monitorOutIndexes: number[]
}

function isValueArg(a: Argument | undefined | null): a is Exclude<Argument, { type: 'conn' } | null> {
  return !!a && a.type !== 'conn'
}

function signalNameFromArgs(args: Array<Argument | null | undefined> | undefined): string | undefined {
  const nameArg = args?.[0]
  if (!nameArg || nameArg.type === 'conn') return undefined
  if (nameArg.type !== 'str') return undefined
  return String(nameArg.value)
}

function paramTypeFromArg(arg: Argument | null | undefined): string {
  if (!arg) return 'int'
  if (arg.type === 'conn') {
    return (arg.value as { type?: string }).type ?? 'int'
  }
  if (arg.type === 'enum' || arg.type === 'enumeration') return 'enum'
  return arg.type
}

/**
 * Collect unique signal names and best-effort param schemas from IR nodes.
 * send_signal args define params; monitor_signal contributes out-pin demand.
 */
export function collectSignalUsages(
  ir: IRDocument,
  connIndex?: Map<number, Map<number, { type: string; dict?: { k: string; v: string } }>>
): CollectedSignalUsage[] {
  const byName = new Map<string, CollectedSignalUsage>()

  const ensure = (name: string): CollectedSignalUsage => {
    let entry = byName.get(name)
    if (!entry) {
      entry = {
        name,
        params: [],
        hasSend: false,
        hasMonitor: false,
        monitorOutIndexes: []
      }
      byName.set(name, entry)
    }
    return entry
  }

  for (const node of (ir.nodes ?? []) as Array<{
    id: number
    type: string
    args?: Array<Argument | null>
  }>) {
    if (node.type === 'send_signal') {
      const name = signalNameFromArgs(node.args)
      if (!name) continue
      const entry = ensure(name)
      entry.hasSend = true
      const params: SignalParamSpec[] = []
      for (let i = 1; i < (node.args ?? []).length; i++) {
        const arg = node.args![i]
        const type = paramTypeFromArg(arg)
        params.push({ name: `参数_${i}`, type })
      }
      // Prefer the longest param list seen for this name.
      if (params.length >= entry.params.length) entry.params = params
    } else if (node.type === 'monitor_signal') {
      const name = signalNameFromArgs(node.args)
      if (!name) continue
      const entry = ensure(name)
      entry.hasMonitor = true
      const outs = connIndex?.get(node.id)
      if (outs) {
        for (const pinIndex of outs.keys()) {
          if (pinIndex >= 3 && !entry.monitorOutIndexes.includes(pinIndex)) {
            entry.monitorOutIndexes.push(pinIndex)
          }
        }
        entry.monitorOutIndexes.sort((a, b) => a - b)
        // If send did not provide params, invent from monitor out types.
        if (entry.params.length === 0) {
          for (const pinIndex of entry.monitorOutIndexes) {
            const info = outs.get(pinIndex)
            const type = info?.type ?? 'int'
            entry.params.push({
              name: `参数_${pinIndex - 2}`,
              type
            })
          }
        }
      }
    }
  }

  return [...byName.values()]
}

function parameterTypeForSignal(type: string): ReturnType<typeof buildCompositeParameterType> {
  // SignalDef / 监听信号 ParameterFlow is NOT identical to ordinary CompositeDef encoding.
  // Real GIA evidence (test/信号使用-带参数版本.gia, test/ts_g_define_全类型覆盖测试.gia,
  // user_edit/信号/001.gia):
  // - entity → class=Unknown(0), type1=type2=Entity(1)
  // - every *_list → class=ArrayBase(10002), type1=type2=StringList(11)
  //   (editor uses StringList as the list-container tag in ParameterFlow; element
  //   discrimination lives on the wired pin / runtime value, not type1)
  // - other scalars reuse CompositeDef encoding (int/float/bool/str/vec3/prefab/guid/...)
  // Enum signal params remain unsupported upstream; fall back to int metadata only if reached.
  if (type === 'enum' || type === 'enumeration') {
    return buildCompositeParameterType('int')
  }
  if (type.endsWith('_list')) {
    return {
      class: VarBase_Class.ArrayBase as any,
      type1: VarType.StringList,
      type2: VarType.StringList,
      valueId: null
    }
  }
  if (type === 'entity') {
    return {
      class: VarBase_Class.Unknown as any,
      type1: VarType.Entity,
      type2: VarType.Entity,
      valueId: null
    }
  }
  return buildCompositeParameterType(type)
}

/**
 * Build SignalDef (which=14) "发送信号" for the given param schema.
 * Uses builtin id 1610612738 (single-schema editor sample path).
 */
export function buildSendSignalDefGraphUnit(
  params: SignalParamSpec[],
  identity: SignalDefinitionIdentity
): GraphUnit {
  const inputs = params.map((p, i) => ({
    name: p.name,
    visible: true,
    index: { kind: NodePin_Index_Kind.InParam, index: i },
    type: parameterTypeForSignal(p.type),
    pinIndex: SEND_SIGNAL_PIN_INDEX.firstParam + i
  }))

  const compositeDef = {
    id: {
      genericId: {
        class: NodeGraph_Id_Class.SystemDefined,
        type: NodeProperty_Type.Server,
        kind: NodeGraph_Id_Kind.SysGraph,
        id: identity.sendId
      },
      concreteId: {
        class: NodeGraph_Id_Class.SystemDefined,
        type: NodeProperty_Type.Server,
        kind: NodeGraph_Id_Kind.SysGraph,
        id: identity.sendId
      },
      graphId: {
        class: NodeGraph_Id_Class.UserDefined,
        type: NodeGraph_Id_Type.BasicNode,
        kind: NodeGraph_Id_Kind.NodeGraph,
        id: 0
      }
    },
    inflows: [
      {
        name: '',
        visible: true,
        index: { kind: NodePin_Index_Kind.InFlow, index: 0 },
        description: '',
        pinIndex: SEND_SIGNAL_PIN_INDEX.inflow
      }
    ],
    outflows: [
      {
        name: '',
        visible: true,
        index: { kind: NodePin_Index_Kind.OutFlow, index: 0 },
        description: '',
        pinIndex: SEND_SIGNAL_PIN_INDEX.outflow
      }
    ],
    inputs,
    outputs: [],
    type: { kind: SIGNAL_DEFINITION_CONTRACT.signalDefTypeKind as any },
    name: '发送信号',
    description: '',
    xxx: SIGNAL_DEFINITION_CONTRACT.signalDefXxx
  }

  return {
    id: {
      class: GraphUnit_Id_Class.AffiliatedNode,
      type: GraphUnit_Id_Type.ServerGraph,
      id: identity.sendId
    },
    relatedIds: [
      {
        class: GraphUnit_Id_Class.AffiliatedNode,
        type: GraphUnit_Id_Type.ServerGraph,
        id: identity.monitorId
      },
      {
        class: GraphUnit_Id_Class.AffiliatedNode,
        type: GraphUnit_Id_Type.ServerGraph,
        id: identity.serverId
      }
    ],
    name: '发送信号',
    which: SIGNAL_DEFINITION_CONTRACT.signalDefWhich as any,
    compositeDef: {
      inner: {
        def: compositeDef as any
      }
    }
  }
}

/**
 * Build 监听信号 CompositeDef (which=12, graphId=0) with fixed outs + signal params.
 */
export function buildMonitorSignalCompositeGraphUnit(
  params: SignalParamSpec[],
  identity: SignalDefinitionIdentity
): GraphUnit {
  const fixedOutputs = [
    { name: '事件源实体', type: 'entity', index: 0 },
    { name: '事件源GUID', type: 'guid', index: 1 },
    { name: '信号来源实体', type: 'entity', index: 2 }
  ]
  const outputs = [
    ...fixedOutputs.map((o) => ({
      name: o.name,
      visible: true,
      index: { kind: NodePin_Index_Kind.OutParam, index: o.index },
      type: parameterTypeForSignal(o.type),
      pinIndex: MONITOR_SIGNAL_PIN_INDEX.firstFixedOutput + o.index
    })),
    ...params.map((p, i) => ({
      name: p.name,
      visible: true,
      index: { kind: NodePin_Index_Kind.OutParam, index: 3 + i },
      type: parameterTypeForSignal(p.type),
      pinIndex: MONITOR_SIGNAL_PIN_INDEX.firstParamOutput + i
    }))
  ]

  const compositeDef = {
    id: {
      genericId: {
        class: NodeGraph_Id_Class.SystemDefined,
        type: NodeProperty_Type.Server,
        kind: NodeGraph_Id_Kind.SysGraph,
        id: identity.monitorId
      },
      concreteId: {
        class: NodeGraph_Id_Class.SystemDefined,
        type: NodeProperty_Type.Server,
        kind: NodeGraph_Id_Kind.SysGraph,
        id: identity.monitorId
      },
      graphId: {
        class: NodeGraph_Id_Class.UserDefined,
        type: NodeGraph_Id_Type.BasicNode,
        kind: NodeGraph_Id_Kind.NodeGraph,
        id: 0
      }
    },
    inflows: [],
    outflows: [
      {
        name: '',
        visible: true,
        index: { kind: NodePin_Index_Kind.OutFlow, index: 0 },
        description: '',
        pinIndex: MONITOR_SIGNAL_PIN_INDEX.outflow
      }
    ],
    inputs: [],
    outputs,
    // Real 监听信号 samples use type.kind=1002 and xxx=2 (SignalDef send=1001/xxx=1).
    type: { kind: 1002 as any },
    name: '监听信号',
    description: '',
    xxx: 2
  }

  return {
    id: {
      class: GraphUnit_Id_Class.AffiliatedNode,
      type: GraphUnit_Id_Type.ServerGraph,
      id: identity.monitorId
    },
    relatedIds: [
      {
        class: GraphUnit_Id_Class.AffiliatedNode,
        type: GraphUnit_Id_Type.ServerGraph,
        id: identity.sendId
      },
      {
        class: GraphUnit_Id_Class.AffiliatedNode,
        type: GraphUnit_Id_Type.ServerGraph,
        id: identity.serverId
      }
    ],
    name: '监听信号',
    which: GraphUnit_Which.CompositeGraph,
    compositeDef: {
      inner: {
        def: compositeDef as any
      }
    }
  }
}

/**
 * Optional companion SignalDef for 向服务器节点图发送信号 (present in all real samples).
 * Minimal empty-param shell so relatedIds stay consistent; not required for local send pins.
 */
export function buildSendServerSignalDefGraphUnit(
  params: SignalParamSpec[],
  identity: SignalDefinitionIdentity
): GraphUnit {
  const inputs = params.map((p, i) => ({
    name: p.name,
    visible: true,
    index: { kind: NodePin_Index_Kind.InParam, index: i },
    type: parameterTypeForSignal(p.type),
    // Real samples use a separate pinIndex pool (e.g. 23+); keep offset from send.
    pinIndex: 23 + i
  }))

  const compositeDef = {
    id: {
      genericId: {
        class: NodeGraph_Id_Class.SystemDefined,
        type: 20002,
        kind: NodeGraph_Id_Kind.SysGraph,
        id: identity.serverId
      },
      concreteId: {
        class: NodeGraph_Id_Class.SystemDefined,
        type: 20002,
        kind: NodeGraph_Id_Kind.SysCall,
        id: 2000
      },
      graphId: {
        class: NodeGraph_Id_Class.UserDefined,
        type: NodeGraph_Id_Type.BasicNode,
        kind: NodeGraph_Id_Kind.NodeGraph,
        id: 0
      }
    },
    inflows: [
      {
        name: '',
        visible: true,
        index: { kind: NodePin_Index_Kind.InFlow, index: 0 },
        description: '',
        pinIndex: 19
      }
    ],
    outflows: [
      {
        name: '',
        visible: true,
        index: { kind: NodePin_Index_Kind.OutFlow, index: 0 },
        description: '',
        pinIndex: 20
      }
    ],
    inputs,
    outputs: [],
    type: { kind: SIGNAL_DEFINITION_CONTRACT.signalDefTypeKind as any },
    name: '向服务器节点图发送信号',
    description: '',
    xxx: SIGNAL_DEFINITION_CONTRACT.signalDefXxx
  }

  return {
    id: {
      class: GraphUnit_Id_Class.AffiliatedNode,
      type: GraphUnit_Id_Type.ServerGraph,
      id: identity.serverId
    },
    relatedIds: [
      {
        class: GraphUnit_Id_Class.AffiliatedNode,
        type: GraphUnit_Id_Type.ServerGraph,
        id: identity.monitorId
      },
      {
        class: GraphUnit_Id_Class.AffiliatedNode,
        type: GraphUnit_Id_Type.ServerGraph,
        id: identity.sendId
      }
    ],
    name: '向服务器节点图发送信号',
    which: SIGNAL_DEFINITION_CONTRACT.signalDefWhich as any,
    compositeDef: {
      inner: {
        def: compositeDef as any
      }
    }
  }
}

/**
 * Collect send_signal_to_server_node_graph usages from a client IR document.
 * Same shape as CollectedSignalUsage so accessories reuse the server builders.
 */
export function collectClientSignalUsages(ir: {
  nodes?: Array<{ type: string; args?: Array<Argument | null | undefined> }>
}): CollectedSignalUsage[] {
  const byName = new Map<string, CollectedSignalUsage>()
  for (const node of ir.nodes ?? []) {
    if (node.type !== 'send_signal_to_server_node_graph') continue
    const name = signalNameFromArgs(node.args)
    if (!name) continue
    let entry = byName.get(name)
    if (!entry) {
      entry = { name, params: [], hasSend: false, hasMonitor: false, monitorOutIndexes: [] }
      byName.set(name, entry)
    }
    const params: SignalParamSpec[] = []
    for (let i = 1; i < (node.args ?? []).length; i++) {
      params.push({ name: `参数_${i}`, type: paramTypeFromArg(node.args![i]) })
    }
    if (params.length >= entry.params.length) entry.params = params
  }
  return [...byName.values()]
}

/**
 * Build all signal definition accessories for the collected usages.
 * Single-schema path: one 发送信号 SignalDef + 监听信号 CompositeDef + 向服务器 shell.
 * Param schema is the longest param list among usages (covers send+monitor).
 */
export function toSignalDefinitionIdentity(
  entry: RegisteredSignalDefinition
): SignalDefinitionIdentity {
  return {
    sendId: entry.sendId,
    monitorId: entry.monitorId,
    serverId: entry.serverId
  }
}

export function assertRegisteredSchema(
  usage: CollectedSignalUsage,
  registered: RegisteredSignalDefinition
): void {
  const actual = usage.params.map((param) => param.type)
  const expected = registered.params.map((param) => param.type)
  if (actual.length !== expected.length || actual.some((type, i) => type !== expected[i])) {
    throw new Error(
      `[error] signal schema mismatch for ${usage.name}: ` +
      `IR=[${actual.join(', ')}], map=[${expected.join(', ')}]`
    )
  }
}

export function buildSignalDefinitionAccessories(
  usages: readonly CollectedSignalUsage[],
  registry: SignalRegistry
): GraphUnit[] {
  return usages.flatMap((usage) => {
    let params = usage.params
    if (params.length === 0) {
      const maxOut = Math.max(0, ...usage.monitorOutIndexes)
      params = Array.from({ length: Math.max(0, maxOut - 2) }, (_, i) => ({
        name: `参数_${i + 1}`,
        type: 'int'
      }))
    }
    const registered = registry.get(usage.name)
    if (!registered) {
      throw new Error(`[error] signal is not registered in target map: ${usage.name}`)
    }
    assertRegisteredSchema(usage, registered)
    const identity = toSignalDefinitionIdentity(registered)
    return [
      buildSendSignalDefGraphUnit(params, identity),
      buildMonitorSignalCompositeGraphUnit(params, identity),
      buildSendServerSignalDefGraphUnit(params, identity)
    ]
  })
}

function signalNameFromEncodedNode(node: any): string | undefined {
  const pin = (node?.pins ?? []).find((p: any) => p.i1?.kind === NodePin_Index_Kind.ClientExecNode || p.i1?.kind === 5)
  const value = pin?.value
  const name = typeof value === 'string' ? value : value?.bString?.val
  return typeof name === 'string' ? name.trim() : undefined
}

function isPlaceholderSignalNode(
  node: any,
  identitiesByName: ReadonlyMap<string, SignalDefinitionIdentity>
): 'send' | 'monitor' | null {
  const id = node?.genericId?.nodeId ?? node?.concreteId?.nodeId
  if (id === SIGNAL_PLACEHOLDER_SEND_ID) return 'send'
  if (id === SIGNAL_PLACEHOLDER_MONITOR_ID) return 'monitor'
  for (const identity of identitiesByName.values()) {
    if (id === identity.sendId) return 'send'
    if (id === identity.monitorId) return 'monitor'
  }
  return null
}

/**
 * Patch encoded graph nodes that are send/monitor signals:
 * - nodeId → builtin SysGraph ids
 * - kind → SysGraph (22001)
 * - signalVersion = 2
 * - ClientExec compositePinIndex + clientExecNode.kind=6 + type=0
 * - send InParam compositePinIndex = 12+i
 * - monitor OutParam compositePinIndex for fixed+param outputs
 */
export function patchEncodedSignalNodes(
  nodes: any[] | undefined,
  identitiesByName: ReadonlyMap<string, SignalDefinitionIdentity> = new Map()
): void {
  if (!nodes) return
  for (const node of nodes) {
    const kind = isPlaceholderSignalNode(node, identitiesByName)
    if (!kind) continue

    const signalName = signalNameFromEncodedNode(node)
    const identity = signalName
      ? identitiesByName.get(signalName)
      : undefined
    if (!identity) continue
    const targetId = kind === 'send' ? identity.sendId : identity.monitorId

    if (node.genericId) {
      node.genericId.class = NodeGraph_Id_Class.SystemDefined
      node.genericId.type = NodeProperty_Type.Server
      node.genericId.kind = NodeGraph_Id_Kind.SysGraph
      node.genericId.nodeId = targetId
    }
    if (node.concreteId) {
      node.concreteId.class = NodeGraph_Id_Class.SystemDefined
      node.concreteId.type = NodeProperty_Type.Server
      node.concreteId.kind = NodeGraph_Id_Kind.SysGraph
      node.concreteId.nodeId = targetId
    }
    node.signalVersion = SIGNAL_DEFINITION_CONTRACT.signalVersion

    for (const pin of node.pins ?? []) {
      const pinKind = pin.i1?.kind
      const pinIndex = pin.i1?.index ?? 0

      if (pinKind === NodePin_Index_Kind.ClientExecNode || pinKind === 5) {
        pin.compositePinIndex =
          kind === 'send'
            ? SEND_SIGNAL_PIN_INDEX.clientExec
            : MONITOR_SIGNAL_PIN_INDEX.clientExec
        // Real GIA: type=0, clientExecNode.kind=6, i2=null
        pin.type = 0
        pin.i2 = null
        pin.clientExecNode = {
          kind: SIGNAL_DEFINITION_CONTRACT.clientExecNodeKind,
          index: 1
        }
        // itemType.type_server.type = 0 for ClientExec string in real samples
        if (pin.value?.itemType?.type_server) {
          pin.value.itemType.type_server.type = 0
        }
        continue
      }

      if (kind === 'send' && pinKind === NodePin_Index_Kind.InParam) {
        pin.compositePinIndex = SEND_SIGNAL_PIN_INDEX.firstParam + pinIndex
        continue
      }

      if (kind === 'send' && pinKind === NodePin_Index_Kind.OutFlow) {
        pin.compositePinIndex = SEND_SIGNAL_PIN_INDEX.outflow
        continue
      }

      if (kind === 'send' && pinKind === NodePin_Index_Kind.InFlow) {
        pin.compositePinIndex = SEND_SIGNAL_PIN_INDEX.inflow
        continue
      }

      if (kind === 'monitor' && pinKind === NodePin_Index_Kind.OutParam) {
        // Real editor samples never encode monitor OutParam pins: parameter
        // outputs come from the CompositeDef declaration and consumer connections
        // reference OutParam kind/index directly (see 修复后 min_main 样本).
        continue
      }

      if (kind === 'monitor' && pinKind === NodePin_Index_Kind.OutFlow) {
        pin.compositePinIndex = MONITOR_SIGNAL_PIN_INDEX.outflow
      }
    }

    if (kind === 'monitor') {
      node.pins = (node.pins ?? []).filter(
        (pin: any) => pin.i1?.kind !== NodePin_Index_Kind.OutParam
      )
    }
  }
}

/**
 * Full signal post-process for an encoded root: patch all graphs' signal nodes
 * and return accessories to append.
 */
export function finalizeSignalEncoding(input: {
  ir: IRDocument
  rootNodes?: any[]
  accessoryGraphs?: Array<{ nodes?: any[] }>
  connIndex?: Map<number, Map<number, { type: string; dict?: { k: string; v: string } }>>
  signalRegistry?: SignalRegistry
}): { accessories: GraphUnit[]; signalRelatedIds: number[] } {
  const usages = collectSignalUsages(input.ir, input.connIndex)
  if (usages.length === 0) return { accessories: [], signalRelatedIds: [] }
  if (!input.signalRegistry) {
    throw new Error('[error] signal registry is required when encoding signal nodes')
  }
  const identitiesByName = new Map(
    usages.map((usage) => {
      const registered = input.signalRegistry!.get(usage.name)
      if (!registered) {
        throw new Error(`[error] signal is not registered in target map: ${usage.name}`)
      }
      assertRegisteredSchema(usage, registered)
      return [usage.name, toSignalDefinitionIdentity(registered)] as const
    })
  )
  patchEncodedSignalNodes(input.rootNodes, identitiesByName)
  for (const g of input.accessoryGraphs ?? []) {
    patchEncodedSignalNodes(g.nodes, identitiesByName)
  }

  // Real samples list send/monitor ids in graph.relatedIds (001.gia
  // [send, monitor]; 修复后样本 [monitor, send]). Dedupe keeps order stable.
  const signalRelatedIds: number[] = []
  for (const identity of identitiesByName.values()) {
    for (const id of [identity.sendId, identity.monitorId]) {
      if (!signalRelatedIds.includes(id)) signalRelatedIds.push(id)
    }
  }

  return {
    accessories: buildSignalDefinitionAccessories(usages, input.signalRegistry),
    signalRelatedIds
  }
}

// Keep isValueArg used for future arg inspection helpers.
void isValueArg
void VarType
