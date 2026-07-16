import { loadGiaProto } from '../../injector/proto.js'
import type {
  Argument,
  CompositeDefIR,
  ConnectionArgument,
  IRDocument,
  ServerGraphMode as ServerGraphRuntimeMode,
  ServerGraphSubType,
  ValueType,
  Variable
} from '../../runtime/IR.js'
import type { DictKeyType, DictValueType } from '../../runtime/value.js'
import { isListValueInfo, type ListValueInfo } from '../../runtime/variables.js'
import type { NodeType } from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/nodes.js'
import {
  GraphUnit_Id_Class,
  NodeGraph_Id_Class,
  NodeGraph_Id_Kind,
  NodePin_Index_Kind,
  NodeProperty_Type
} from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'
import {
  Graph,
  Node,
  NODE_ID,
  NodeIdFor,
  Pin,
  wrap_gia,
  type Root as GiaRoot
} from '../gia_vendor.js'
import { buildCompositeAccessories } from './composite.js'
import { buildExecutionGraph, layoutPositions } from './layout.js'
import { buildConnTypeIndex, resolveGiaNodeId, type ConnTypeInfo } from './node_id.js'
import { optimizeTimerDispatchAggregate } from './optimize_timer_dispatch.js'
import {
  applyOrdinaryLiteralArgs,
  createOrdinaryVendorNode,
  normalizeOrdinaryVendorPins
} from './ordinary_node_factory.js'
import { materializeOrdinaryGraphEdges } from './ordinary_graph_materializer.js'
import { setEnumArgValue, setLiteralArgValue } from './pins.js'
import {
  applyPinHoleLiteralArgs,
  isSharedPinHoleAdapterNodeType,
  remapPinHoleInputIndex
} from './pin_hole_adapter.js'
import {
  applySpecialArgLiteralArgs,
  isSharedSpecialArgAdapterNodeType,
  remapSpecialArgInputIndex,
  type SpecialArgTypeTag
} from './special_arg_adapter.js'
import { finalizeSignalEncoding } from './build_signal_definition.js'
import { expandListLiterals } from './preprocess.js'
import type { IRNode, NodeId } from './types.js'

type IrToGiaOptimizeOptions = {
  timerDispatchAggregate?: boolean
}

export interface IrToGiaOptions {
  graphId?: number
  uid?: number
  name?: string
  protoPath: string
  optimize?: IrToGiaOptimizeOptions
}

function buildVarsByName(ir: IRDocument): Map<string, Variable> {
  return new Map<string, Variable>((ir.variables ?? []).map((v) => [v.name, v]))
}

type ScalarType =
  | 'bool'
  | 'int'
  | 'float'
  | 'str'
  | 'vec3'
  | 'guid'
  | 'entity'
  | 'prefab_id'
  | 'config_id'
  | 'faction'

function baseNodeType(type: ScalarType): NodeType {
  switch (type) {
    case 'bool':
      return { t: 'b', b: 'Bol' }
    case 'int':
      return { t: 'b', b: 'Int' }
    case 'float':
      return { t: 'b', b: 'Flt' }
    case 'str':
      return { t: 'b', b: 'Str' }
    case 'vec3':
      return { t: 'b', b: 'Vec' }
    case 'guid':
      return { t: 'b', b: 'Gid' }
    case 'entity':
      return { t: 'b', b: 'Ety' }
    case 'prefab_id':
      return { t: 'b', b: 'Pfb' }
    case 'config_id':
      return { t: 'b', b: 'Cfg' }
    case 'faction':
      return { t: 'b', b: 'Fct' }
  }
}

function valueTypeToNodeType(type: ValueType | DictKeyType | DictValueType): NodeType {
  if (type.endsWith('_list')) {
    const base = type.slice(0, -5) as ScalarType
    return { t: 'l', i: baseNodeType(base) }
  }
  if (type === 'dict') {
    throw new Error('[error] dict type requires key/value types')
  }
  return baseNodeType(type as ScalarType)
}

function dictNodeType(k: DictKeyType, v: DictValueType): NodeType {
  return { t: 'd', k: valueTypeToNodeType(k), v: valueTypeToNodeType(v) }
}

function connTypeInfoToNodeType(info: ConnTypeInfo): NodeType {
  if (info.type === 'dict') return dictNodeType(info.dict.k, info.dict.v)
  if (info.type === 'enum') {
    throw new Error('[error] enum signal parameters are not supported in GIA conversion')
  }
  return valueTypeToNodeType(info.type)
}

function expandListValueInfo(info: ListValueInfo): unknown[] {
  // 这行目前永远不会触发, 暂留
  if (info.values) return info.values
  // 总是执行这行
  return new Array(info.length)
}

function buildListValue(variable: Variable): unknown[] {
  if (variable.value !== undefined && Array.isArray(variable.value)) {
    return variable.value as unknown[]
  }
  if ('length' in variable && typeof variable.length === 'number') {
    return new Array(variable.length)
  }
  return []
}

function buildDictValue(variable: Variable): unknown[] {
  if (!Array.isArray(variable.value)) return []
  const out: unknown[] = []
  for (const pair of variable.value as unknown[]) {
    if (!pair || typeof pair !== 'object') continue
    const k = (pair as { k?: unknown }).k
    const rawV = (pair as { v?: unknown }).v
    const v = isListValueInfo(rawV) ? expandListValueInfo(rawV) : rawV
    out.push([k, v])
  }
  return out
}

function applyGraphVariables(graph: GiaGraph, variables: Variable[]) {
  for (const v of variables) {
    let nodeType: NodeType
    let value: unknown
    if (v.type === 'dict') {
      if (!v.dict) {
        throw new Error(`[error] dict variable "${v.name}" missing key/value types`)
      }
      nodeType = dictNodeType(v.dict.k, v.dict.v)
      value = buildDictValue(v)
    } else if (v.type.endsWith('_list')) {
      nodeType = valueTypeToNodeType(v.type)
      value = buildListValue(v)
    } else {
      nodeType = valueTypeToNodeType(v.type)
      value = v.value
    }
    const graphVar = graph.add_graph_var(v.name, nodeType, false, value as never)
    if (graphVar && value === undefined) {
      graphVar.val = undefined as never
    }
  }
}

export type ServerGraphMode = 'server' | 'status' | 'class' | 'item'
export type GiaGraph = Graph<ServerGraphMode>
export type GiaNode = Node<ServerGraphMode>

function extractCompositeIdFromArgs(args: Argument[] | undefined): number | undefined {
  const arg = args?.[0]
  if (!arg || arg.type === 'conn') return undefined
  return Number(arg.value)
}

function compositeTypeToBaseTag(
  type: string
): 'Str' | 'Bol' | 'Int' | 'Flt' | 'Vec' | 'Ety' | 'Gid' | 'Cfg' | 'Fct' | 'Pfb' | null {
  switch (type) {
    case 'bool':
      return 'Bol'
    case 'int':
      return 'Int'
    case 'float':
      return 'Flt'
    case 'str':
      return 'Str'
    case 'vec3':
      return 'Vec'
    case 'guid':
      return 'Gid'
    case 'entity':
      return 'Ety'
    case 'faction':
      return 'Fct'
    case 'config_id':
      return 'Cfg'
    case 'prefab_id':
      return 'Pfb'
    default:
      if (type.endsWith('_list')) {
        const elementType = type.slice(0, -5)
        return compositeTypeToBaseTag(elementType)
      }
      return null
  }
}

function resolveServerGraphMode(graphType: ServerGraphSubType | undefined): ServerGraphMode {
  switch (graphType) {
    case 'status':
      return 'status'
    case 'class':
      return 'class'
    case 'item':
      return 'item'
    case 'entity':
    default:
      return 'server'
  }
}

const SERVER_GRAPH_RUNTIME_MODES = new Set<ServerGraphRuntimeMode>(['beyond', 'classic'])

function resolveServerGraphRuntimeMode(
  mode: ServerGraphRuntimeMode | undefined
): ServerGraphRuntimeMode {
  const resolved = mode ?? 'beyond'
  if (!SERVER_GRAPH_RUNTIME_MODES.has(resolved)) {
    throw new Error(`[error] invalid server graph mode: ${String(mode)}`)
  }
  return resolved
}

function assertServerGraphRuntimeModeCompatible(
  mode: ServerGraphRuntimeMode,
  subType: ServerGraphSubType | undefined
) {
  const resolvedSubType = subType ?? 'entity'
  if (mode === 'classic' && resolvedSubType === 'class') {
    throw new Error('[error] classic mode does not allow class graph type')
  }
}

export function irToGia(ir: IRDocument, opts: IrToGiaOptions): Uint8Array {
  const graphId = opts.graphId ?? ir.graph?.id ?? 1073741825
  const name = opts.name ?? ir.graph?.name ?? '_GSTS_Generated_Graph'
  const uid = opts.uid ?? 100000001

  if (!ir.nodes || ir.nodes.length === 0) {
    throw new Error('IR document must have at least one node')
  }

  const expanded = expandListLiterals(ir)
  ir = expanded.ir
  const timerDispatchAggregate =
    opts.optimize?.timerDispatchAggregate ?? process.env.GSTS_OPT_TIMER_DISPATCH === '1'
  ir = optimizeTimerDispatchAggregate(ir, timerDispatchAggregate)

  const graphInfo = buildExecutionGraph(ir.nodes!)
  const serverSubType = ir.graph.type === 'server' ? ir.graph.sub_type : undefined
  const serverMode = resolveServerGraphMode(serverSubType)
  const graphRuntimeMode = ir.graph.type === 'server' ? ir.graph.mode : undefined
  const resolvedRuntimeMode = resolveServerGraphRuntimeMode(graphRuntimeMode)
  assertServerGraphRuntimeModeCompatible(resolvedRuntimeMode, serverSubType)
  const graph: GiaGraph = new Graph<ServerGraphMode>(serverMode, uid, name, graphId)
  if (resolvedRuntimeMode === 'classic') {
    graph.rootModeFlag = 1
  }
  const nodesById = new Map<NodeId, GiaNode>()
  const irDoc = ir as { compositeDefs?: CompositeDefIR[]; variables?: Variable[] }
  const positions = layoutPositions(ir.nodes!, graphInfo, irDoc.compositeDefs ?? [])
  const connIndex = buildConnTypeIndex(ir)
  const varsByName = buildVarsByName(ir)
  // 合并复合节点声明的图变量到主图（compositeDefs 仅 ServerIRDocument 有）
  const mainVarNames = new Set(irDoc.variables?.map((v) => v.name) ?? [])
  const allVars = [...(irDoc.variables ?? [])]
  for (const cd of irDoc.compositeDefs ?? []) {
    if (cd.implVariables) {
      for (const v of cd.implVariables) {
        if (!mainVarNames.has(v.name)) {
          mainVarNames.add(v.name)
          allVars.push(v)
        }
      }
    }
  }
  applyGraphVariables(graph, allVars)

  // 以下为引脚设置逻辑
  type ValueArgument = Exclude<Argument, ConnectionArgument | null>
  const isValueArg = (a: Argument | undefined): a is ValueArgument => !!a && a.type !== 'conn'

  const setArgValue = (
    giaNode: GiaNode,
    pinIndex: number,
    argIndex: number,
    nodeType: string,
    arg: ValueArgument
  ) => {
    try {
      if (arg.type === 'enum' || arg.type === 'enumeration') {
        setEnumArgValue(giaNode, pinIndex, argIndex, nodeType, arg.value)
      } else {
        setLiteralArgValue(giaNode, pinIndex, argIndex, nodeType, arg.type, arg.value)
      }
    } catch (e) {
      console.error(
        `[error] failed to set value for pin ${pinIndex} of node ${nodeType} (id=${giaNode.NodeIndex})\n`
      )
      throw e
    }
  }

  const filterUnkPins = (giaNode: GiaNode) => {
    normalizeOrdinaryVendorPins(giaNode as any)
  }

  const applyGetNodeGraphVariableNamePin = (nodeType: string, giaNode: GiaNode, irNode: IRNode) => {
    if (nodeType !== 'get_node_graph_variable') return
    const nameArg = irNode.args?.[0]
    if (!nameArg || nameArg.type !== 'str') return
    if (giaNode.pins.some((pin) => pin.kind === 3 && pin.index === 0)) return
    const p = new Pin(giaNode.ConcreteId!, 3, 0)
    p.setType({ t: 'b', b: 'Str' })
    p.setVal(nameArg.value)
    giaNode.pins.unshift(p)
  }

  const applySpecialArgs = (nodeType: string, giaNode: GiaNode, irNode: IRNode): boolean => {
    // Shared pin-hole family (P5-W9): null-hole literal apply for all 9 named adapters.
    if (isSharedPinHoleAdapterNodeType(nodeType)) {
      if (applyPinHoleLiteralArgs(nodeType, giaNode, irNode.args)) return true
    }

    // Shared special-arg family (P5-W10): signal / assembly / multiple_branches.
    if (isSharedSpecialArgAdapterNodeType(nodeType)) {
      let monitorOutParams: Map<number, SpecialArgTypeTag> | undefined
      if (nodeType === 'monitor_signal') {
        const signalParams = connIndex.get(irNode.id)
        if (signalParams) {
          monitorOutParams = new Map()
          signalParams.forEach((info, pinIndex) => {
            if (pinIndex < 3) return
            if (info.type === 'enum') {
              monitorOutParams!.set(pinIndex, { kind: 'enum' })
            } else if (info.type === 'dict') {
              monitorOutParams!.set(pinIndex, {
                kind: 'dict',
                key: info.dict.k as any,
                value: info.dict.v as any
              })
            } else if (info.type.endsWith('_list')) {
              monitorOutParams!.set(pinIndex, {
                kind: 'list',
                element: info.type.slice(0, -5) as any
              })
            } else {
              monitorOutParams!.set(pinIndex, {
                kind: 'scalar',
                type: info.type as any
              })
            }
          })
        }
      }
      return applySpecialArgLiteralArgs(nodeType, giaNode, irNode.args, { monitorOutParams })
    }

    return false
  }

  const applyGenericArgs = (nodeType: string, giaNode: GiaNode, irNode: IRNode) => {
    applyOrdinaryLiteralArgs(giaNode as any, {
      nodeId: irNode.id,
      nodeType,
      args: irNode.args,
      nodeIndex: irNode.id,
      mode: serverMode
    })
  }

  const remapInputIndexForHiddenPin = (nodeType: string, idx: number): number => {
    // Shared pin-hole family (P5-W9).
    if (isSharedPinHoleAdapterNodeType(nodeType)) {
      return remapPinHoleInputIndex(nodeType, idx)
    }
    // Shared special-arg (P5-W10): root layout already patches assembly +1 into
    // dataConnections; only send_signal name→data shift remains for mapInputIndex.
    // Composite vendor edges call remapSpecialArgInputIndex directly for full family.
    if (nodeType === 'send_signal') {
      return remapSpecialArgInputIndex(nodeType, idx)
    }
    return idx
  }

  const remapOutputIndexForHiddenPin = (nodeType: string, idx: number): number => {
    switch (nodeType) {
      case 'when_path_reaches_waypoint':
        return idx >= 3 ? idx + 1 : idx // hole at 3
      default:
        return idx
    }
  }

  const irNodeTypeById = new Map<NodeId, string>()
  const assemblyDictMeta = new Map<NodeId, { keyConn: boolean[] }>()
  const calledCompositeIds: number[] = []
  const compositeCallNodeIndices = new Map<number, number>() // nodeIndex → compositeId

  // 构建 compositeId → CompositeDefIR 查找表（用于添加 pins 和 compositePinIndex）
  const compositeDefById = new Map<number, CompositeDefIR>()
  for (const cd of (irDoc.compositeDefs ?? []) as CompositeDefIR[]) {
    compositeDefById.set(cd.id, cd)
  }

  ir.nodes!.forEach((irNode) => {
    const nodeType = irNode.type

    // 复合调用标记节点
    if (nodeType === '__composite_call__') {
      const compositeId = extractCompositeIdFromArgs(irNode.args)
      if (compositeId !== undefined) {
        calledCompositeIds.push(compositeId)
        compositeCallNodeIndices.set(irNode.id, compositeId)
      }
      const giaNode: GiaNode = new Node<ServerGraphMode>(
        irNode.id,
        serverMode,
        0 as NodeIdFor<ServerGraphMode>
      )
      const layoutPos = positions.get(irNode.id)!
      giaNode.setPos(layoutPos[0] / 300, layoutPos[1] / 200)

      // 添加 InParam/OutParam pins（带 compositePinIndex）
      const cdef = compositeId !== undefined ? compositeDefById.get(compositeId) : undefined
      if (cdef) {
        const callArgs = irNode.args ?? []
        for (let i = 0; i < cdef.inputs.length; i++) {
          const input = cdef.inputs[i]
          const ai = i + 1
          const arg: Argument | null = ai < callArgs.length ? (callArgs[ai] ?? null) : null
          const p = new Pin(giaNode.ConcreteId!, 3, input.index) // InParam
          ;(p as any).compositePinIndex = input.pinIndex
          const bt = compositeTypeToBaseTag(input.type as string)
          if (bt) p.setType({ t: 'b', b: bt })
          giaNode.pins.push(p)
        }
        // 从 IR args[1..] 填充 InParam 字面量值（args[0] 是 compositeId）。
        // 命名/稀疏输入优先使用 compositeInputIndex，避免只传第二个参数时被压缩成 pin 0。
        for (let ai = 1; ai < callArgs.length; ai++) {
          const arg = callArgs[ai]
          const pinIdx = (arg as any)?.compositeInputIndex ?? ai - 1
          if (!arg || arg.type === 'conn') continue
          if (pinIdx < cdef.inputs.length) {
            setLiteralArgValue(giaNode, pinIdx, ai, nodeType, arg.type, arg.value)
          }
        }
        // 纯数据复合不添加 OutParam pin——输出由 CompositeDef 隐式定义
        if (cdef.inflows.length > 0) {
          for (const output of cdef.outputs) {
            const p = new Pin(giaNode.ConcreteId!, 4, output.index) // OutParam
            const bt = compositeTypeToBaseTag(output.type as string)
            if (bt) p.setType({ t: 'b', b: bt })
            giaNode.pins.push(p)
          }
        }
        // 不在此处添加 OutFlow pin。graph.flow() 在循环中为有下游连接的 outflow 创建 pin，
        // 无下游连接的 outflow 在终端节点生成阶段通过连接 Print_String 节点创建 pin。
      }

      irNodeTypeById.set(irNode.id, nodeType)
      nodesById.set(irNode.id, giaNode)
      graph.add_node(giaNode)
      return
    }

    const nodeId = resolveGiaNodeId(irNode, connIndex, varsByName, resolvedRuntimeMode)

    irNodeTypeById.set(irNode.id, nodeType)
    if (nodeType === 'assembly_dictionary') {
      const args = irNode.args ?? []
      const keyConn: boolean[] = []
      for (let i = 0; i < args.length; i += 2) {
        const key = args[i]
        const keyIsConn = !!key && key.type === 'conn'
        keyConn.push(keyIsConn)
      }
      assemblyDictMeta.set(irNode.id, { keyConn })
    }
    const giaNode: GiaNode = createOrdinaryVendorNode({
      nodeId: irNode.id,
      nodeType,
      args: irNode.args,
      nodeIndex: irNode.id,
      mode: serverMode,
      concreteNodeId: nodeId,
      applyLiterals: false
    })
    const layoutPos = positions.get(irNode.id)!
    giaNode.setPos(layoutPos[0] / 300, layoutPos[1] / 200)

    applyGetNodeGraphVariableNamePin(nodeType, giaNode, irNode)

    if (!applySpecialArgs(nodeType, giaNode, irNode)) {
      applyGenericArgs(nodeType, giaNode, irNode)
    }

    filterUnkPins(giaNode)

    nodesById.set(irNode.id, giaNode)
    graph.add_node(giaNode)
  })

  materializeOrdinaryGraphEdges({
    graph,
    nodesById,
    flowEdges: graphInfo.flowConnections,
    onMissingFlowEndpoint: ({ fromId, toId, fromIndex, toIndex }) => {
      throw new Error(
        `[error] bad flow connection ${fromId}->${toId}, index=${fromIndex}->${toIndex}`
      )
    }
  })

  // === 为未连接下游的复合 outflow 生成终端 Print_String 节点 ===
  // 参考文件（顺序执行.gia 等）中，每个无下游的 outflow 出口都有一个 Print_String 终端节点
  let nextTerminalId = Math.max(...ir.nodes!.map((n) => n.id)) + 1

  // 构建执行子图邻接表，用于下游节点递归搜索
  const execChildren = new Map<number, number[]>()
  for (const fc of graphInfo.flowConnections) {
    const children = execChildren.get(fc.fromId) ?? []
    children.push(fc.toId)
    execChildren.set(fc.fromId, children)
  }

  for (const [compositeNodeId, compositeId] of compositeCallNodeIndices) {
    const cdef = compositeDefById.get(compositeId)
    if (!cdef || cdef.outflows.length === 0 || cdef.inflows.length === 0) continue

    // 收集已连接的 outflow 索引
    const connectedOutflows = new Set<number>()
    const downstreamTargets: number[] = []
    for (const fc of graphInfo.flowConnections) {
      if (fc.fromId === compositeNodeId) {
        connectedOutflows.add(fc.fromIndex)
        downstreamTargets.push(fc.toId)
      }
    }

    const compositeNode = nodesById.get(compositeNodeId)
    const compositePos = positions.get(compositeNodeId)
    if (!compositeNode || !compositePos) continue

    // 计算所有已连接 outflow 的下游节点（递归）的最大 Y 坐标
    // 确保未连接的 outflow 终端放在所有下游节点之下，避免边交叉
    let maxDownstreamY = -Infinity
    const visited = new Set<number>()
    const queue = [...downstreamTargets]
    while (queue.length > 0) {
      const nid = queue.shift()!
      if (visited.has(nid)) continue
      visited.add(nid)
      const pos = positions.get(nid)
      if (pos && pos[1] > maxDownstreamY) maxDownstreamY = pos[1]
      const children = execChildren.get(nid)
      if (children) {
        for (const child of children) {
          if (!visited.has(child)) queue.push(child)
        }
      }
    }

    // 不为未连接的 outflow 创建终端 PrintString 节点（匹配游戏编辑器行为）
    // 游戏编辑器中 composite call 节点可以没有 OutFlow pin
  }

  materializeOrdinaryGraphEdges({
    graph,
    nodesById,
    dataEdges: graphInfo.dataConnections.filter(
      ({ fromId }) => irNodeTypeById.get(fromId) !== '__composite_call__'
    ),
    mapOutputIndex: (nodeId, pinIndex) =>
      remapOutputIndexForHiddenPin(irNodeTypeById.get(nodeId) ?? '', pinIndex),
    mapInputIndex: (nodeId, pinIndex) =>
      remapInputIndexForHiddenPin(irNodeTypeById.get(nodeId) ?? '', pinIndex),
    onMissingDataEndpoint: ({ fromId, toId, fromIndex, toIndex }) => {
      throw new Error(
        `[error] bad data connection ${fromId}->${toId}, index=${fromIndex}->${toIndex}`
      )
    }
  })

  // 复合调用输出是 OutParam overlay pin，不属于普通 Graph pin。
  // 普通 materializer 必须跳过这些边，否则会按普通节点 pin 校验并报 pin missing。
  for (const edge of graphInfo.dataConnections) {
    if (irNodeTypeById.get(edge.fromId) !== '__composite_call__') continue
    const from = nodesById.get(edge.fromId)
    const to = nodesById.get(edge.toId)
    if (!from || !to) {
      throw new Error(`[error] bad composite output connection ${edge.fromId}->${edge.toId}`)
    }
    graph.connect(
      from,
      to,
      edge.fromIndex,
      remapInputIndexForHiddenPin(irNodeTypeById.get(edge.toId) ?? '', edge.toIndex)
    )
  }

  // 应用复合节点之间的数据连线
  const compositeDataEdges = (ir as any).compositeDataEdges as
    | Array<{
        fromNodeId: number
        fromPinIndex: number
        toMarkerId: number
        toPinIndex: number
      }>
    | undefined
  // 构建已存在连接的集合，避免 compositeDataEdges 重复连接
  const existingConnections = new Set(
    graphInfo.dataConnections.map(
      (c: { fromId: number; toId: number; fromIndex: number; toIndex: number }) =>
        `${c.fromId}-${c.fromIndex}-${c.toId}-${c.toIndex}`
    )
  )
  if (compositeDataEdges) {
    for (const edge of compositeDataEdges) {
      const key = `${edge.fromNodeId}-${edge.fromPinIndex}-${edge.toMarkerId}-${edge.toPinIndex}`
      if (existingConnections.has(key)) continue
      const from = nodesById.get(edge.fromNodeId)
      const to = nodesById.get(edge.toMarkerId)
      if (from && to) {
        graph.connect(from, to, edge.fromPinIndex, edge.toPinIndex)
      }
    }
  }

  let root: GiaRoot
  try {
    root = graph.encode()

    const mainNodes = (root.graph as any)?.graph?.inner?.graph?.nodes as any[] | undefined

    // 修正 composite call 节点的 kind 为 SysGraph(22001) 并设置正确的 nodeId + compositePinIndex
    if (compositeCallNodeIndices.size > 0) {
      if (mainNodes) {
        for (const node of mainNodes) {
          const cid = compositeCallNodeIndices.get(node.nodeIndex)
          if (cid !== undefined) {
            if (node.genericId) {
              node.genericId.kind = NodeGraph_Id_Kind.SysGraph
              node.genericId.nodeId = cid
            }
            if (node.concreteId) {
              node.concreteId.kind = NodeGraph_Id_Kind.SysGraph
              node.concreteId.nodeId = cid
            }
            // 为 InParam pins 设置 compositePinIndex，修正 exec flow 路由
            const cdef = compositeDefById.get(cid)
            if (cdef && node.pins) {
              const isPureData = cdef.inflows.length === 0
              if (isPureData) {
                // 纯数据复合：移除所有 flow pins
                node.pins = node.pins.filter((pin: any) => pin.i1?.kind !== 2)
              }
              for (const pin of node.pins) {
                if (pin.i1?.kind === 1) {
                  // InFlow
                  const inflowIdx = pin.i1.index ?? 0
                  if (inflowIdx < cdef.inflows.length) {
                    pin.compositePinIndex = cdef.inflows[inflowIdx].pinIndex
                  }
                }
                if (pin.i1?.kind === 3) {
                  // InParam
                  const inputIdx = pin.i1.index ?? 0
                  if (inputIdx < cdef.inputs.length) {
                    pin.compositePinIndex = cdef.inputs[inputIdx].pinIndex
                    // 数据连线输入的 InParam：值来自上游，自身应 null
                    if (pin.connects?.length > 0) {
                      pin.value = null
                    }
                  }
                }
                if (pin.i1?.kind === 2) {
                  // OutFlow
                  const outflowIdx = pin.i1.index ?? 0
                  if (outflowIdx < cdef.outflows.length) {
                    pin.compositePinIndex = cdef.outflows[outflowIdx].pinIndex
                  }
                }
              }
            }
          }
        }

        // 终端节点已在上游显式生成（Print_String），无需再检测终端/非终端复合。
        // 过滤 event 节点多余的 OutParam pins（参考文件中 event 仅有 OutFlow pin）
        if (mainNodes) {
          for (const n of mainNodes) {
            if (n.genericId?.kind === 22000 && n.genericId?.nodeId === 71) {
              n.pins = n.pins.filter((pin: any) => pin.i1?.kind !== 4)
            }
          }
        }
      }
    }

    // Local Variable 句柄 pin 只有类型和连接，真实 GIA 不序列化空 VarBase 值。
    if (mainNodes) {
      for (const node of mainNodes) {
        for (const pin of node.pins ?? []) {
          if (pin.type === 16) pin.value = null
        }
      }
    }

    // 重排序 pins：OutFlow (kind=2) 在前，InParam (kind=3) 在后（匹配游戏编辑器输出）
    if (mainNodes) {
      for (const n of mainNodes) {
        if (n.pins && n.pins.length > 1) {
          n.pins.sort((a: any, b: any) => {
            const kindA = a.i1?.kind ?? 0
            const kindB = b.i1?.kind ?? 0
            // OutFlow (2) 排在 InParam (3) 和 OutParam (4) 之前
            if (kindA === 2 && kindB !== 2) return -1
            if (kindA !== 2 && kindB === 2) return 1
            return 0
          })
        }
      }
    }

    // 为主图添加 relatedIds 指向被调用的复合定义
    if (calledCompositeIds.length > 0) {
      ;(root.graph as any).relatedIds = calledCompositeIds.map((id) => ({
        class: GraphUnit_Id_Class.AffiliatedNode,
        type: 0,
        id
      }))
    }
  } catch (e) {
    throw e
  }

  // 将复合节点定义编码为 accessories
  try {
    const compositeDefs: CompositeDefIR[] = irDoc.compositeDefs ?? []
    const compositeDefById = new Map<number, CompositeDefIR>(compositeDefs.map((d) => [d.id, d]))
    for (const def of compositeDefs) {
      const accs = buildCompositeAccessories(def, compositeDefById)
      root.accessories.push(...accs)
    }
  } catch (e) {
    console.error('[composite] failed to build composite accessories:', e)
  }

  // SignalDef (which=14) + 监听信号 CompositeDef + SysGraph id/cpi patch.
  // Placeholder 300000/300001 become builtin 1610612738/1610612739 so the editor
  // can show send/monitor parameters without inject (P5-W10).
  try {
    const mainNodes = (root.graph as any)?.graph?.inner?.graph?.nodes as any[] | undefined
    const accessoryGraphs = (root.accessories ?? [])
      .map((acc: any) => acc.graph?.inner?.graph)
      .filter(Boolean)
    const signalAccs = finalizeSignalEncoding({
      ir,
      rootNodes: mainNodes,
      accessoryGraphs,
      connIndex
    })
    if (signalAccs.length > 0) {
      root.accessories.push(...signalAccs)
    }
  } catch (e) {
    console.error('[signal] failed to finalize signal encoding:', e)
    throw e
  }

  if (assemblyDictMeta.size > 0) {
    const setNestedAlreadySetValFalse = (pin: { value?: unknown }) => {
      const value = (pin.value as { bConcreteValue?: { value?: { alreadySetVal?: boolean } } })
        ?.bConcreteValue?.value
      if (value && typeof value === 'object' && 'alreadySetVal' in value) {
        ;(value as { alreadySetVal: boolean }).alreadySetVal = false
      }
    }

    const nodes = root.graph?.graph?.inner?.graph?.nodes ?? []
    for (const node of nodes) {
      const meta = assemblyDictMeta.get(node.nodeIndex)
      if (!meta) continue
      const { keyConn } = meta
      const isValueList = (pin: { value?: unknown }): boolean => {
        const value = (pin.value as { bConcreteValue?: { value?: Record<string, unknown> } })
          ?.bConcreteValue?.value
        if (!value || typeof value !== 'object') return false
        return 'bArray' in value || 'bDict' in value
      }
      for (const pin of node.pins ?? []) {
        if (!pin || pin.i1?.kind !== 3) continue
        const isConnected = !!pin.connects && pin.connects.length > 0
        const pinIndex = pin.i1.index ?? 0
        if (pinIndex === 0) continue
        const pairIndex = Math.floor((pinIndex - 1) / 2)
        const isKeyPin = (pinIndex - 1) % 2 === 0
        if (isKeyPin) {
          if (isConnected && keyConn[pairIndex]) setNestedAlreadySetValFalse(pin)
          continue
        }
        if (isValueList(pin)) {
          setNestedAlreadySetValFalse(pin)
          continue
        }
        if (!isConnected) continue
        setNestedAlreadySetValFalse(pin)
      }
    }
  }

  const protoPath = opts.protoPath
  const { rootMessage } = loadGiaProto(protoPath)
  const buffer = wrap_gia(rootMessage, root)
  const bytes = new Uint8Array(buffer)

  return bytes
}
