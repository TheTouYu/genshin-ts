/**
 * Signal definition accessories + encoded-node patch for send/monitor (P5-W10).
 *
 * Real editor GIA (user_edit/信号/001.gia, 002.gia, test/信号使用-带参数版本.gia):
 * - send node id 1610612738, kind SysGraph(22001), signalVersion=2
 * - monitor node id 1610612739, kind SysGraph(22001), signalVersion=2
 * - SignalDef accessory which=14 name="发送信号" id=1610612738 with ParameterFlow inputs
 * - Monitor CompositeDef which=12 name="监听信号" id=1610612739 graphId=0 with OutParams
 * - ClientExec pin compositePinIndex=7 (send); data InParam cpi = SignalDef input pinIndex
 * - Data pins start at physical index 0 (= IR arg 1); name is ClientExec not InParam
 *
 * Historical gsts placeholders 300000/300001 remain SPECIAL_NODE_IDS for IR resolution
 * and injector remap; this module rewrites encoded nodes to builtin SysGraph ids and
 * emits the missing SignalDef/Monitor definition accessories so the editor can show
 * parameters without injection.
 */

import type { Argument, IRDocument } from '../../runtime/IR.js'
import {
  CompositeDef_Type_Kind,
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

/** Builtin editor ids (real GIA SignalDef / 监听信号 CompositeDef). */
export const BUILTIN_SEND_SIGNAL_NODE_ID = 1610612738
export const BUILTIN_MONITOR_SIGNAL_NODE_ID = 1610612739
export const BUILTIN_SEND_SERVER_SIGNAL_NODE_ID = 1610612740

export const SIGNAL_PLACEHOLDER_SEND_ID = SPECIAL_NODE_IDS.send_signal // 300000
export const SIGNAL_PLACEHOLDER_MONITOR_ID = SPECIAL_NODE_IDS.monitor_signal // 300001

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
  signalVersion: 2,
  signalDefWhich: 14 as const,
  signalDefXxx: 1,
  /** Real samples use type.kind=1001 for SignalDef (not Composite=1000). */
  signalDefTypeKind: 1001,
  sendNodeId: BUILTIN_SEND_SIGNAL_NODE_ID,
  monitorNodeId: BUILTIN_MONITOR_SIGNAL_NODE_ID,
  sendServerNodeId: BUILTIN_SEND_SERVER_SIGNAL_NODE_ID,
  placeholderSendId: SIGNAL_PLACEHOLDER_SEND_ID,
  placeholderMonitorId: SIGNAL_PLACEHOLDER_MONITOR_ID,
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
export function buildSendSignalDefGraphUnit(params: SignalParamSpec[]): GraphUnit {
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
        id: BUILTIN_SEND_SIGNAL_NODE_ID
      },
      concreteId: {
        class: NodeGraph_Id_Class.SystemDefined,
        type: NodeProperty_Type.Server,
        kind: NodeGraph_Id_Kind.SysGraph,
        id: BUILTIN_SEND_SIGNAL_NODE_ID
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
      id: BUILTIN_SEND_SIGNAL_NODE_ID
    },
    relatedIds: [
      {
        class: GraphUnit_Id_Class.AffiliatedNode,
        type: GraphUnit_Id_Type.ServerGraph,
        id: BUILTIN_MONITOR_SIGNAL_NODE_ID
      },
      {
        class: GraphUnit_Id_Class.AffiliatedNode,
        type: GraphUnit_Id_Type.ServerGraph,
        id: BUILTIN_SEND_SERVER_SIGNAL_NODE_ID
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
export function buildMonitorSignalCompositeGraphUnit(params: SignalParamSpec[]): GraphUnit {
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
        id: BUILTIN_MONITOR_SIGNAL_NODE_ID
      },
      concreteId: {
        class: NodeGraph_Id_Class.SystemDefined,
        type: NodeProperty_Type.Server,
        kind: NodeGraph_Id_Kind.SysGraph,
        id: BUILTIN_MONITOR_SIGNAL_NODE_ID
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
    type: { kind: CompositeDef_Type_Kind.Composite },
    name: '监听信号',
    description: '',
    xxx: SIGNAL_DEFINITION_CONTRACT.signalDefXxx
  }

  return {
    id: {
      class: GraphUnit_Id_Class.AffiliatedNode,
      type: GraphUnit_Id_Type.ServerGraph,
      id: BUILTIN_MONITOR_SIGNAL_NODE_ID
    },
    relatedIds: [],
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
export function buildSendServerSignalDefGraphUnit(params: SignalParamSpec[]): GraphUnit {
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
        id: BUILTIN_SEND_SERVER_SIGNAL_NODE_ID
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
      id: BUILTIN_SEND_SERVER_SIGNAL_NODE_ID
    },
    relatedIds: [
      {
        class: GraphUnit_Id_Class.AffiliatedNode,
        type: GraphUnit_Id_Type.ServerGraph,
        id: BUILTIN_MONITOR_SIGNAL_NODE_ID
      },
      {
        class: GraphUnit_Id_Class.AffiliatedNode,
        type: GraphUnit_Id_Type.ServerGraph,
        id: BUILTIN_SEND_SIGNAL_NODE_ID
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
 * Build all signal definition accessories for the collected usages.
 * Single-schema path: one 发送信号 SignalDef + 监听信号 CompositeDef + 向服务器 shell.
 * Param schema is the longest param list among usages (covers send+monitor).
 */
export function buildSignalDefinitionAccessories(
  usages: readonly CollectedSignalUsage[]
): GraphUnit[] {
  if (usages.length === 0) return []

  // Merge params: take the longest list (types aligned by index when possible).
  let params: SignalParamSpec[] = []
  for (const u of usages) {
    if (u.params.length > params.length) params = u.params
  }
  // If only monitor with out indexes but empty params, synthesize.
  if (params.length === 0) {
    const maxOut = Math.max(0, ...usages.flatMap((u) => u.monitorOutIndexes))
    for (let i = 3; i <= maxOut; i++) {
      params.push({ name: `参数_${i - 2}`, type: 'int' })
    }
  }

  const accessories: GraphUnit[] = []
  accessories.push(buildSendSignalDefGraphUnit(params))
  accessories.push(buildMonitorSignalCompositeGraphUnit(params))
  accessories.push(buildSendServerSignalDefGraphUnit(params))
  return accessories
}

function isPlaceholderSignalNode(node: any): 'send' | 'monitor' | null {
  const id = node?.genericId?.nodeId ?? node?.concreteId?.nodeId
  if (id === SIGNAL_PLACEHOLDER_SEND_ID || id === BUILTIN_SEND_SIGNAL_NODE_ID) return 'send'
  if (id === SIGNAL_PLACEHOLDER_MONITOR_ID || id === BUILTIN_MONITOR_SIGNAL_NODE_ID) {
    return 'monitor'
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
export function patchEncodedSignalNodes(nodes: any[] | undefined): void {
  if (!nodes) return
  for (const node of nodes) {
    const kind = isPlaceholderSignalNode(node)
    if (!kind) continue

    const targetId =
      kind === 'send' ? BUILTIN_SEND_SIGNAL_NODE_ID : BUILTIN_MONITOR_SIGNAL_NODE_ID

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
        // physical index 0..2 fixed; 3+ signal params
        pin.compositePinIndex = MONITOR_SIGNAL_PIN_INDEX.firstFixedOutput + pinIndex
        continue
      }

      if (kind === 'monitor' && pinKind === NodePin_Index_Kind.OutFlow) {
        pin.compositePinIndex = MONITOR_SIGNAL_PIN_INDEX.outflow
      }
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
}): GraphUnit[] {
  const usages = collectSignalUsages(input.ir, input.connIndex)
  if (usages.length === 0) return []

  patchEncodedSignalNodes(input.rootNodes)
  for (const g of input.accessoryGraphs ?? []) {
    patchEncodedSignalNodes(g.nodes)
  }

  return buildSignalDefinitionAccessories(usages)
}

// Keep isValueArg used for future arg inspection helpers.
void isValueArg
void VarType
