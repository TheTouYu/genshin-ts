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
import { Graph, Node, NodeIdFor, NODE_ID, Pin, wrap_gia, type Root as GiaRoot } from '../gia_vendor.js'
import {
  GraphUnit_Id_Class,
  NodeGraph_Id_Class,
  NodeGraph_Id_Kind,
  NodeProperty_Type
} from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'
import { buildExecutionGraph, layoutPositions } from './layout.js'
import { buildConnTypeIndex, resolveGiaNodeId, type ConnTypeInfo } from './node_id.js'
import { optimizeTimerDispatchAggregate } from './optimize_timer_dispatch.js'
import { setClientExecLiteralArgValue, setEnumArgValue, setLiteralArgValue } from './pins.js'
import { expandListLiterals } from './preprocess.js'
import type { IRNode, NodeId } from './types.js'
import { buildCompositeAccessories } from './composite.js'

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

function compositeTypeToBaseTag(type: string): 'Str' | 'Bol' | 'Int' | 'Flt' | 'Vec' | 'Ety' | 'Gid' | 'Cfg' | 'Fct' | 'Pfb' | null {
  switch (type) {
    case 'bool': return 'Bol'
    case 'int': return 'Int'
    case 'float': return 'Flt'
    case 'str': return 'Str'
    case 'vec3': return 'Vec'
    case 'guid': return 'Gid'
    case 'entity': return 'Ety'
    case 'faction': return 'Fct'
    case 'config_id': return 'Cfg'
    case 'prefab_id': return 'Pfb'
    default: return null
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
  const positions = layoutPositions(ir.nodes!, graphInfo)
  const connIndex = buildConnTypeIndex(ir)
  const varsByName = buildVarsByName(ir)
  applyGraphVariables(graph, ir.variables ?? [])

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
    giaNode.pins = (giaNode.pins ?? []).filter(
      // @ts-ignore thirdparty Pin shape
      (p) => !((p?.kind === 3 || p?.kind === 4) && p?.type?.t === 'b' && p?.type?.b === 'Unk')
    )
  }

  const applyArgsWithNullHole = (
    nodeType: string,
    giaNode: GiaNode,
    irNode: IRNode,
    argsLength: number,
    holeIndex: number
  ): boolean => {
    const args = irNode.args ?? []
    if (args.length !== argsLength) return false
    const patched: Argument[] = [...args]
    patched.splice(holeIndex, 0, null)
    for (let i = 0; i < patched.length; i++) {
      const a = patched[i]
      if (isValueArg(a)) setArgValue(giaNode, i, i, nodeType, a)
    }
    return true
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
    // 存在疑似弃用的参数, 需要占位空值
    if (nodeType === 'create_prefab') {
      if (applyArgsWithNullHole(nodeType, giaNode, irNode, 7, 4)) return true
    }

    // 存在疑似弃用的参数, 需要占位空值
    if (nodeType === 'create_prefab_group') {
      if (applyArgsWithNullHole(nodeType, giaNode, irNode, 7, 4)) return true
    }

    // vendor 节点定义存在隐藏的 Unk 输入 pin，但实际的 GIA 通常不会写入该 pin
    // nodes.ts 侧只暴露 (Ety, Bol) 两参，这里补一个 null 占位，避免 Bol 错位写入 Unk 导致 thirdparty 警告
    if (
      nodeType === 'activate_disable_follow_motion_device' ||
      nodeType === 'activate_disable_collision_trigger_source' ||
      nodeType === 'activate_disable_character_disruptor_device'
    ) {
      if (applyArgsWithNullHole(nodeType, giaNode, irNode, 2, 1)) return true
    }

    if (nodeType === 'activate_disable_pathfinding_obstacle_feature') {
      if (applyArgsWithNullHole(nodeType, giaNode, irNode, 2, 1)) return true
    }
    if (nodeType === 'activate_disable_pathfinding_obstacle') {
      if (applyArgsWithNullHole(nodeType, giaNode, irNode, 3, 0)) return true
    }

    // vendor 实测：Remove Unit Status 的 removerEntity 写在 pinIndex=4（pinIndex=3 为隐藏/空 pin）
    // nodes.ts 侧暴露 4 个参数，这里补一个 null 占位，避免 removerEntity 写入错误的 pin。
    if (nodeType === 'remove_unit_status') {
      if (applyArgsWithNullHole(nodeType, giaNode, irNode, 4, 3)) return true
    }

    // 实测：Set Custom Variable 的 triggerEvent 实际写在 pinIndex=4（中间 pinIndex=3 为隐藏/空 pin）
    // nodes.ts 侧只有 4 个参数，这里补一个 null 占位，避免 triggerEvent 写入错误的 pin。
    if (nodeType === 'set_custom_variable') {
      if (applyArgsWithNullHole(nodeType, giaNode, irNode, 4, 3)) return true
    }

    if (nodeType === 'send_signal' || nodeType === 'monitor_signal') {
      const nameArg = irNode.args?.[0]
      if (nameArg && nameArg.type === 'conn') {
        throw new Error(`[error] ${nodeType} does not accept wired signal name`)
      }
      if (nameArg && !isValueArg(nameArg)) {
        throw new Error(`[error] ${nodeType} expects a literal string signal name`)
      }
      giaNode.pins = []
      if (nameArg) {
        setClientExecLiteralArgValue(giaNode, 0, 0, nodeType, nameArg.type, nameArg.value)
      }
      // Create input pins for signal parameters so graph.connect can find them
      // Signal name is an exec literal (not a data pin), so data pins start at index 0
      if (nodeType === 'send_signal') {
        const args = irNode.args ?? []
        for (let i = 1; i < args.length; i++) {
          const arg = args[i]
          if (!arg) continue
          if (arg.type === 'conn') {
            const connType = (arg as ConnectionArgument).value.type as ScalarType
            const pinType = baseNodeType(connType)
            if (pinType) {
              const p = new Pin(giaNode.ConcreteId!, 3, i - 1)
              p.setType(pinType)
              giaNode.pins.push(p)
            }
          } else if (isValueArg(arg)) {
            setArgValue(giaNode, i - 1, i, nodeType, arg)
          }
        }
      } else {
        const signalParams = connIndex.get(irNode.id)
        signalParams?.forEach((info, pinIndex) => {
          if (pinIndex < 3) return
          const p = new Pin(giaNode.ConcreteId!, 4, pinIndex)
          p.setType(connTypeInfoToNodeType(info))
          giaNode.pins.push(p)
        })
      }
      return true
    }

    if (nodeType === 'assembly_list' || nodeType === 'assembly_dictionary') {
      // GIA: pin0 为元素数量；IR: args 为元素列表
      giaNode.setVal(0, irNode.args?.length ?? 0)
      irNode.args?.forEach((arg, idx) => {
        if (!isValueArg(arg)) return
        setArgValue(giaNode, idx + 1, idx, nodeType, arg)
      })
      return true
    }

    if (nodeType === 'multiple_branches') {
      const args = irNode.args ?? []

      // control expression
      const controlArg = args[0]
      if (isValueArg(controlArg)) setArgValue(giaNode, 0, 0, nodeType, controlArg)

      // cases
      const caseValues: unknown[] = []
      let caseValueType: string | undefined
      for (let i = 1; i < args.length; i++) {
        const a = args[i]
        if (!a || a.type === 'conn') continue
        if (caseValueType === undefined) caseValueType = a.type
        caseValues.push(a.value)
      }

      if (caseValues.length > 0 && caseValueType) {
        try {
          setLiteralArgValue(giaNode, 1, 1, nodeType, `${caseValueType}_list`, caseValues)
        } catch (e) {
          console.error(
            `[error] failed to set value for pin 1 of node ${nodeType} (id=${irNode.id})\n`
          )
          throw e
        }
      }

      return true
    }

    return false
  }

  const applyGenericArgs = (nodeType: string, giaNode: GiaNode, irNode: IRNode) => {
    irNode.args?.forEach((arg, idx) => {
      if (isValueArg(arg)) setArgValue(giaNode, idx, idx, nodeType, arg)
    })
  }

  const remapInputIndexForHiddenPin = (nodeType: string, idx: number): number => {
    // 注意：applySpecialArgs 里对这些节点做了“插入 null 占位”来适配 vendor 的 pinIndex 空洞，
    // 那么 dataConnections 里的 toIndex（仍按 IR 的原始参数顺序）也必须同步 remap。
    switch (nodeType) {
      case 'activate_disable_follow_motion_device':
      case 'activate_disable_collision_trigger_source':
      case 'activate_disable_character_disruptor_device':
        return idx >= 1 ? idx + 1 : idx // hole at 1
      case 'activate_disable_pathfinding_obstacle_feature':
        return idx >= 1 ? idx + 1 : idx // hole at 1
      case 'activate_disable_pathfinding_obstacle':
        return idx + 1 // hole at 0
      case 'set_custom_variable':
      case 'remove_unit_status':
        return idx >= 3 ? idx + 1 : idx // hole at 3
      case 'create_prefab':
      case 'create_prefab_group':
        return idx >= 4 ? idx + 1 : idx // hole at 4
      case 'send_signal':
        return idx > 0 ? idx - 1 : idx // signal name is exec literal, data pins shift by -1
      default:
        return idx
    }
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
  for (const cd of ((ir as any).compositeDefs ?? []) as CompositeDefIR[]) {
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
        // 从 IR args[1..] 填充 InParam 字面量值（args[0] 是 compositeId）
        for (let ai = 1; ai < callArgs.length; ai++) {
          const arg = callArgs[ai]
          const pinIdx = ai - 1
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
    const giaNode: GiaNode = new Node<ServerGraphMode>(
      irNode.id,
      serverMode,
      nodeId as NodeIdFor<ServerGraphMode>
    )
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

  for (const { fromId, toId, fromIndex, toIndex } of graphInfo.flowConnections) {
    const from = nodesById.get(fromId)
    const to = nodesById.get(toId)
    if (!from || !to) {
      throw new Error(
        `[error] bad flow connection ${fromId}->${toId}, index=${fromIndex}->${toIndex}`
      )
    }
    graph.flow(from, to, fromIndex, toIndex)
  }

  // === 为未连接下游的复合 outflow 生成终端 Print_String 节点 ===
  // 参考文件（顺序执行.gia 等）中，每个无下游的 outflow 出口都有一个 Print_String 终端节点
  let nextTerminalId = Math.max(...ir.nodes!.map(n => n.id)) + 1

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

    const hasDownstream = downstreamTargets.length > 0 && maxDownstreamY > -Infinity
    let unconnectedIdx = 0
    for (const outflow of cdef.outflows) {
      if (connectedOutflows.has(outflow.index)) continue

      // 创建 Print_String 终端节点（NODE_ID=1）
      const terminalId = nextTerminalId++
      const terminalNode = new Node<ServerGraphMode>(
        terminalId,
        serverMode,
        NODE_ID.Print_String as NodeIdFor<ServerGraphMode>
      )
      // 位置：复合节点右侧 1 列
      const rawX = compositePos[0] + 350  // columnWidth
      // 有下游节点时放在所有下游节点之下；无下游节点时按 outflow 索引纵向偏移
      const rawY = hasDownstream
        ? maxDownstreamY + 252 + unconnectedIdx * 252
        : compositePos[1] + outflow.index * 252  // branchGap = rowHeight * 0.9
      terminalNode.setPos(rawX / 300, rawY / 200)

      nodesById.set(terminalId, terminalNode)
      graph.add_node(terminalNode)
      graph.flow(compositeNode, terminalNode, outflow.index, 0)
      unconnectedIdx++
    }
  }

  for (const { fromId, toId, fromIndex, toIndex } of graphInfo.dataConnections) {
    const from = nodesById.get(fromId)
    const to = nodesById.get(toId)
    if (!from || !to) {
      throw new Error(
        `[error] bad data connection ${fromId}->${toId}, index=${fromIndex}->${toIndex}`
      )
    }
    const fromType = irNodeTypeById.get(fromId) ?? ''
    const toType = irNodeTypeById.get(toId) ?? ''
    const mappedFromIndex = remapOutputIndexForHiddenPin(fromType, fromIndex)
    const mappedToIndex = remapInputIndexForHiddenPin(toType, toIndex)
    graph.connect(from, to, mappedFromIndex, mappedToIndex)
  }

  // 应用复合节点之间的数据连线
  const compositeDataEdges = (ir as any).compositeDataEdges as Array<{
    fromNodeId: number; fromPinIndex: number; toMarkerId: number; toPinIndex: number
  }> | undefined
  // 构建已存在连接的集合，避免 compositeDataEdges 重复连接
  const existingConnections = new Set(graphInfo.dataConnections.map(
    (c: { fromId: number; toId: number; fromIndex: number; toIndex: number }) =>
      `${c.fromId}-${c.fromIndex}-${c.toId}-${c.toIndex}`
  ))
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

    // 修正 composite call 节点的 kind 为 SysGraph(22001) 并设置正确的 nodeId + compositePinIndex
    if (compositeCallNodeIndices.size > 0) {
      const mainNodes = (root.graph as any)?.graph?.inner?.graph?.nodes as any[] | undefined
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
                if (pin.i1?.kind === 3) { // InParam
                  const inputIdx = pin.i1.index ?? 0
                  if (inputIdx < cdef.inputs.length) {
                    pin.compositePinIndex = cdef.inputs[inputIdx].pinIndex
                  // 数据连线输入的 InParam：值来自上游，自身应 null
                  if (pin.connects?.length > 0) {
                    pin.value = null
                  }
                  }
                }
                if (pin.i1?.kind === 2) { // OutFlow
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
    const compositeDefs: CompositeDefIR[] = (ir as any).compositeDefs ?? []
    for (const def of compositeDefs) {
      const accs = buildCompositeAccessories(def)
      root.accessories.push(...accs)
    }
  } catch (e) {
    console.error('[composite] failed to build composite accessories:', e)
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
