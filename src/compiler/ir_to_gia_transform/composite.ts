// @ts-nocheck thirdparty
import type { CompositeDefIR } from '../../runtime/IR.js'
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
  type GraphUnit,
  type GraphNode,
  type NodePin,
  type NodeGraph,
  type CompositeDef
} from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'
import { Graph, Node } from '../gia_vendor.js'
import { buildExecutionGraph, layoutPositions } from './layout.js'
import { SPECIAL_NODE_IDS, SPECIAL_NODE_MAPPINGS, getNodeIdLowerMap } from './mappings.js'
import { irTypeToNodeSuffix, irTypeToVarBaseClass, irTypeToVarType, isListType } from './vartype_map.js'

/**
 * 将 CompositeDefIR 编码为 accessories 中的 GraphUnit（CompositeDef 和 impl NodeGraph 成对）
 */
export function buildCompositeAccessories(
  def: CompositeDefIR,
  compositeDefById?: Map<number, CompositeDefIR>
): GraphUnit[] {
  const accessories: GraphUnit[] = []

  const implGraphId = def.id + 10000

  // === 识别 __composite_capture__ 节点 ===
  // capture 是 IR 层输入占位符，由 compositePins 路由，GIA 中不需要物理节点
  // 始终过滤掉，并将其引出边从 implEdges 中移除
  const captureNodeId = def.implNodes.find(
    n => n.type === '__composite_capture__'
  )?.id

  // capture 的第一个 exec 子节点（如有），用于重定向 compositePins 引用
  let captureFirstChildId: number | undefined
  if (captureNodeId !== undefined) {
    const captureEdges = def.implEdges[captureNodeId]
    if (captureEdges && captureEdges.length > 0) {
      captureFirstChildId = getEdgeTarget(captureEdges[0])
    }
  }

  // 过滤 capture 节点
  const implNodesForEncoding = def.implNodes.filter(
    n => n.type !== '__composite_capture__'
  )
  const nodeIndexMap = new Map<number, number>()
  implNodesForEncoding.forEach((n, i) => nodeIndexMap.set(n.id, i + 2))

  // 过滤后的 edges：移除 capture 的引出边，避免布局引擎看到已删除节点的入边
  const filteredEdges: Record<number, ImplEdge[]> = {}
  for (const [fromIdStr, edges] of Object.entries(def.implEdges)) {
    const fromId = Number(fromIdStr)
    if (fromId === captureNodeId) continue
    filteredEdges[fromId] = edges as ImplEdge[]
  }

  // 从 compositePins 提取 OutParam 映射，供 impl 节点生成正确的 OutParam pin
  const implOutParamMap = new Map<number, Array<{ pinIndex: number; type: string }>>()
  for (const cp of def.compositePins) {
    if (cp.outerPinKind !== 4) continue // 只取 OutParam
    const arr = implOutParamMap.get(cp.innerNodeId) ?? []
    arr.push({ pinIndex: cp.innerPinIndex, type: def.outputs[cp.outerPinIndex]?.type ?? 'int' })
    implOutParamMap.set(cp.innerNodeId, arr)
  }

  const implNodes = buildImplGraphNodes(implNodesForEncoding, nodeIndexMap, filteredEdges, implOutParamMap, def.implVariables, def, compositeDefById)

  // 1. CompositeDef（定义 + 接口）—— 在 impl graph 之前，匹配参考顺序
  const compositeDef: CompositeDef = {
    id: {
      genericId: {
        class: NodeGraph_Id_Class.SystemDefined,
        type: NodeProperty_Type.Server,
        kind: NodeGraph_Id_Kind.SysGraph,
        id: def.id
      },
      concreteId: {
        class: NodeGraph_Id_Class.SystemDefined,
        type: NodeProperty_Type.Server,
        kind: NodeGraph_Id_Kind.SysGraph,
        id: def.id
      },
      graphId: {
        class: NodeGraph_Id_Class.UserDefined,
        type: NodeGraph_Id_Type.BasicNode,
        kind: NodeGraph_Id_Kind.CompositeGraph,
        id: implGraphId
      }
    },
    inflows: def.inflows.map((flow) => ({
      name: flow.name,
      visible: flow.visible,
      index: { kind: NodePin_Index_Kind.InFlow, index: flow.index },
      description: '',
      pinIndex: flow.pinIndex
    })),
    outflows: def.outflows.map((flow) => ({
      name: flow.name,
      visible: flow.visible,
      index: { kind: NodePin_Index_Kind.OutFlow, index: flow.index },
      description: '',
      pinIndex: flow.pinIndex
    })),
    inputs: def.inputs.map((param) => ({
      name: param.name,
      visible: param.visible,
      index: { kind: NodePin_Index_Kind.InParam, index: param.index },
      type: {
        class: irTypeToVarBaseClass(param.type as any),
        type1: irTypeToVarType(param.type as any),
        type2: irTypeToVarType(param.type as any),
        valueId: null
      },
      pinIndex: param.pinIndex
    })),
    outputs: def.outputs.map((param) => ({
      name: param.name,
      visible: param.visible,
      index: { kind: NodePin_Index_Kind.OutParam, index: param.index },
      type: {
        class: irTypeToVarBaseClass(param.type as any),
        type1: irTypeToVarType(param.type as any),
        type2: irTypeToVarType(param.type as any),
        valueId: null
      },
      pinIndex: param.pinIndex
    })),
    type: {
      kind: CompositeDef_Type_Kind.Composite
    },
    name: def.name,
    description: '',
    xxx: 6
  }

  const defGraphUnit: GraphUnit = {
    id: {
      class: GraphUnit_Id_Class.AffiliatedNode,
      type: GraphUnit_Id_Type.ServerGraph,
      id: def.id
    },
    relatedIds: [
      { class: GraphUnit_Id_Class.Basic, type: 0, id: implGraphId }
    ],
    name: def.name,
    which: GraphUnit_Which.CompositeGraph,
    compositeDef: {
      inner: {
        def: compositeDef
      }
    }
  }
  accessories.push(defGraphUnit)

  // 收集此 impl 调用的子复合 ID（用于 relatedIds）
  const calledCompositeIds: Array<{ class: number; type: number; id: number }> = []
  if (compositeDefById) {
    const seen = new Set<number>()
    for (const node of def.implNodes) {
      if (node.type === '__composite_call__') {
        const arg0 = (node.args as any)?.[0]
        if (arg0 && arg0.type !== 'conn') {
          const cid = Number(arg0.value)
          if (cid && !seen.has(cid)) {
            seen.add(cid)
            calledCompositeIds.push({
              class: GraphUnit_Id_Class.AffiliatedNode,
              type: 0,
              id: cid
            })
          }
        }
      }
    }
  }

  // 2. impl NodeGraph（实现图）
  const implGraphUnit: GraphUnit = {
    id: {
      class: GraphUnit_Id_Class.Basic,
      type: GraphUnit_Id_Type.ServerGraph,
      id: implGraphId
    },
    relatedIds: calledCompositeIds,
    name: '',
    which: GraphUnit_Which.EntityNode,
    graph: {
      inner: {
        graph: {
          id: {
            class: NodeGraph_Id_Class.UserDefined,
            type: NodeGraph_Id_Type.BasicNode,
            kind: NodeGraph_Id_Kind.CompositeGraph,
            id: implGraphId
          },
          name: '',
          nodes: implNodes,
          compositePins: def.compositePins.map((entry) => {
            // remap: 指向 capture 的 compositePin 重定向到其首个 exec 子节点
            const actualNodeId =
              captureNodeId !== undefined && entry.innerNodeId === captureNodeId && captureFirstChildId !== undefined
                ? captureFirstChildId
                : entry.innerNodeId
            return {
              outerPin: {
                kind: entry.outerPinKind as NodePin_Index_Kind,
                index: entry.outerPinIndex
              },
              innerNodeId: nodeIndexMap.get(actualNodeId) ?? actualNodeId,
              innerPin: {
                kind: entry.innerPinKind as NodePin_Index_Kind,
                index: entry.innerPinIndex
              },
              innerPin2: {
                kind: entry.innerPinKind as NodePin_Index_Kind,
                index: entry.innerPinIndex
              }
            }
          }),
          comments: [],
          graphValues: [],
          affiliations: []
        }
      }
    }
  }
  accessories.push(implGraphUnit)

  return accessories
}

type ImplEdge = number | { node_id: number; source_index?: number }

function getEdgeTarget(edge: ImplEdge): number {
  return typeof edge === 'number' ? edge : edge.node_id
}

function getEdgeSourceIndex(edge: ImplEdge): number {
  return typeof edge === 'number' ? 0 : (edge.source_index ?? 0)
}

function groupEdgesBySourceIndex(edges: ImplEdge[]): Map<number, ImplEdge[]> {
  const bySourceIndex = new Map<number, ImplEdge[]>()
  for (const edge of edges) {
    const si = getEdgeSourceIndex(edge)
    const arr = bySourceIndex.get(si) ?? []
    arr.push(edge)
    bySourceIndex.set(si, arr)
  }
  return bySourceIndex
}

// impl 图复用主图语义布局。注意：impl GraphNode 的 x/y 字段使用布局像素坐标，
// 不走主图 Graph/Node#setPos 的 1/300、1/200 缩放。

/**
 * 从 IR 节点构建 GIA GraphNode 列表（impl 图）
 */
function buildImplGraphNodes(
  implNodes: CompositeDefIR['implNodes'],
  nodeIndexMap: Map<number, number>,
  implEdges: Record<number, any[]>,
  implOutParamMap: Map<number, Array<{ pinIndex: number; type: string }>>,
  implVariables: CompositeDefIR['implVariables'],
  def: CompositeDefIR,
  compositeDefById?: Map<number, CompositeDefIR>
): GraphNode[] {
  const allDataConns: Array<{ nodeId: number; pin: NodePin; upstreamNodeId: number; upstreamPinIndex: number }> = []
  const nodeResults = implNodes.map((node) => {
    let nodeId = resolveImplNodeId(node.type, node.args as any)
    // 对 __composite_call__ 节点：使用子复合 ID 作为 GIA nodeId
    let compositeId: number | undefined
    let calledDef: CompositeDefIR | undefined
    if (node.type === '__composite_call__') {
      const arg0 = (node.args as any)?.[0]
      if (arg0 && arg0.type !== 'conn') {
        compositeId = Number(arg0.value)
        if (compositeDefById) calledDef = compositeDefById.get(compositeId)
        nodeId = compositeId
      }
    }
    const isCompositeCall = node.type === '__composite_call__'
    const isDTC = node.type.startsWith('data_type_conversion_')
    // data_type_conversion 节点：genericId 固定为 180（通用类型），
    // concreteId 为具体变种 ID（如 182=int→str, 186=bool→str 等）
    const dtcGenericId = isDTC ? getNodeIdLowerMap().get('data_type_conversion__generic') ?? 180 : undefined
    const genericId = {
      class: NodeGraph_Id_Class.SystemDefined,
      type: NodeProperty_Type.Server,
      kind: isCompositeCall ? NodeGraph_Id_Kind.SysGraph : NodeGraph_Id_Kind.SysCall,
      nodeId: dtcGenericId ?? nodeId
    }
    // get_node_graph_variable：根据变量类型解析 concreteId（如 str_list → 347）
    let gvConcreteNid: number | undefined
    if (node.type === 'get_node_graph_variable') {
      const nameArg = (node.args ?? [])[0]
      if (nameArg && nameArg.type === 'str' && typeof nameArg.value === 'string') {
        const varName = nameArg.value
        const implVar = implVariables?.find(v => v.name === varName)
        if (implVar) {
          const suffix = irTypeToNodeSuffix(implVar.type as any)
          if (suffix) {
            const nodeIdLower = getNodeIdLowerMap()
            const direct = nodeIdLower.get(`get_node_graph_variable__${suffix}`)
            if (direct) {
              gvConcreteNid = direct
            } else if (suffix.startsWith('list_')) {
              // fallback：尝试元素级后缀（如 get_node_graph_variable__str）
              const elemSuffix = suffix.slice(5)
              const elemTyped = nodeIdLower.get(`get_node_graph_variable__${elemSuffix}`)
              if (elemTyped) gvConcreteNid = elemTyped
            }
          }
        }
      }
    }
    const { pins, dataConns } = buildImplNodePins(node, implEdges, implOutParamMap, implVariables, calledDef, gvConcreteNid)
    allDataConns.push(...dataConns)
    return { node, nodeId, genericId, pins, isDTC: isDTC || false, dtcConcreteNid: isDTC ? nodeId : undefined, gvConcreteNid, nodeIndex: nodeIndexMap.get(node.id) ?? node.id }
  })

  for (const dc of allDataConns) {
    const mappedUpstreamId = nodeIndexMap.get(dc.upstreamNodeId) ?? dc.upstreamNodeId
    ;(dc.pin as any).connects = [{
      id: mappedUpstreamId,
      connect: { kind: NodePin_Index_Kind.OutParam, index: dc.upstreamPinIndex },
      connect2: { kind: NodePin_Index_Kind.OutParam, index: dc.upstreamPinIndex }
    }]
  }

  const layout = computeImplLayout(implNodes, implEdges, def, compositeDefById)

  return nodeResults.map(({ node, nodeId, genericId, pins, nodeIndex, isDTC, dtcConcreteNid, gvConcreteNid }) => {
    const outEdges = implEdges[node.id]
    if (outEdges && outEdges.length > 0) {
      for (const [srcIdx, edges] of groupEdgesBySourceIndex(outEdges)) {
        const outFlowPin = pins.find((p: any) =>
          p.i1?.kind === NodePin_Index_Kind.OutFlow && p.i1?.index === srcIdx
        )
        if (outFlowPin) {
          ;(outFlowPin as any).connects = edges.map((edge) => {
            const targetId = getEdgeTarget(edge)
            return {
              id: nodeIndexMap.get(targetId) ?? targetId,
              connect: { kind: NodePin_Index_Kind.InFlow, index: 0 },
              connect2: { kind: NodePin_Index_Kind.InFlow, index: 0 }
            }
          })
        }
      }
    }

    const pos = layout.get(node.id) ?? { x: 0, y: 0 }
    return {
      nodeIndex,
      genericId,
      // data_type_conversion / get_node_graph_variable: concreteId 使用具体变种 nid
      concreteId: isDTC && dtcConcreteNid ? { ...genericId, nodeId: dtcConcreteNid } : gvConcreteNid ? { ...genericId, nodeId: gvConcreteNid } : { ...genericId },
      pins,
      x: pos.x,
      y: pos.y,
      usingStruct: []
    }
  })
}

/** 为 impl 图节点计算布局坐标。复用主图布局核心，保持 exec/data 语义一致。 */
function computeImplLayout(
  implNodes: CompositeDefIR['implNodes'],
  implEdges: Record<number, any[]>,
  def: CompositeDefIR,
  compositeDefById?: Map<number, CompositeDefIR>
): Map<number, { x: number; y: number }> {
  const maxNodeId = implNodes.reduce((max, node) => Math.max(max, node.id), 0)
  const outputPins = def.compositePins.filter((entry) => entry.outerPinKind === NodePin_Index_Kind.OutParam)
  const virtualOutputNodes = outputPins.map((entry, index) => ({
    id: maxNodeId + index + 1,
    type: '__composite_output_anchor__',
    args: []
  }))
  const layoutNodes = [
    ...implNodes.map((node) => ({
      ...node,
      next: implEdges[node.id] ?? (node as any).next
    })),
    ...virtualOutputNodes
  ] as any[]
  const extraDataConnections = outputPins.map((entry, index) => ({
    fromId: entry.innerNodeId,
    toId: virtualOutputNodes[index].id,
    fromIndex: entry.innerPinIndex,
    toIndex: entry.outerPinIndex
  }))

  const graphInfo = buildExecutionGraph(layoutNodes)
  const positions = layoutPositions(
    layoutNodes,
    graphInfo,
    compositeDefById ? [...compositeDefById.values()] : [],
    {
      extraDataConnections,
      virtualConsumerIds: virtualOutputNodes.map((node) => node.id)
    }
  )

  const pos = new Map<number, { x: number; y: number }>()
  for (const [nodeId, [x, y]] of positions) {
    pos.set(nodeId, { x, y })
  }

  return pos
}

/**
 * 解析 impl 节点的 GIA node ID
 */
function resolveImplNodeId(nodeType: string, args?: Array<{ type: string; value: unknown } | null>): number {
  const special = SPECIAL_NODE_IDS[nodeType]
  if (special) return special

  // data_type_conversion_<outType> 需要组合 inType 查询
  if (nodeType.startsWith('data_type_conversion_')) {
    const outKey = nodeType.slice('data_type_conversion_'.length).trim()
    const nodeIdLower = getNodeIdLowerMap()
    
    const firstArg = args?.[0]
    let inType: string | undefined
    if (firstArg) {
      inType = firstArg.type === 'conn'
        ? (firstArg.value as any)?.type as string | undefined
        : firstArg.type as string
    }
    if (inType && inType !== 'dict') {
      const inKey = inType === 'vec3' ? 'vec' : inType
      const direct = nodeIdLower.get(`data_type_conversion__${inKey}_${outKey}`)
      if (direct) return direct
    }
    const generic = nodeIdLower.get('data_type_conversion__generic')
    if (generic) return generic
    return 0
  }

  const mapped = SPECIAL_NODE_MAPPINGS[nodeType]
  const key = (mapped ?? nodeType).toLowerCase()
  const nodeIdLower = getNodeIdLowerMap()
  const direct = nodeIdLower.get(key)
  if (direct) return direct
  const generic = nodeIdLower.get(`${key}__generic`)
  if (generic) return generic

  return 0
}


/**
 * 为 impl 节点构建 pins。由捕获数据驱动：args → InParam、outputValues → OutParam、edges → OutFlow。
 * dataConns 数组中持有对 pins 内 pin 对象的引用，供调用方填充 connects。
 * 对 __composite_call__ 节点，根据子复合的 input/output 定义生成 InParam/OutParam pins。
 */
function buildImplNodePins(
  node: CompositeDefIR['implNodes'][number],
  implEdges: Record<number, any[]>,
  implOutParamMap: Map<number, Array<{ pinIndex: number; type: string }>>,
  implVariables: CompositeDefIR['implVariables'],
  calledDef?: CompositeDefIR,
  gvConcreteNid?: number
): { pins: NodePin[]; dataConns: Array<{ nodeId: number; pin: NodePin; upstreamNodeId: number; upstreamPinIndex: number }> } {
  const pins: NodePin[] = []
  const dataConns: Array<{ nodeId: number; pin: NodePin; upstreamNodeId: number; upstreamPinIndex: number }> = []

  // get_node_graph_variable：临时用 Graph+Node 编码，100% 复用 vendor 的 pin 生成逻辑
  if (node.type === 'get_node_graph_variable' && gvConcreteNid) {
    const tmpGraph = new Graph('server', 0, '', 0)
    const tmpNode = new Node(0, 'server', gvConcreteNid, undefined as any)

    // vendor 自动创建了 pins，找到 InParam pin 并设置变量名
    const nameArg = (node.args ?? [])[0]
    if (nameArg && nameArg.type === 'str') {
      for (const pin of tmpNode.pins) {
        if (pin.kind === 3 && pin.index === 0) {
          pin.setVal(nameArg.value)
        }
      }
    }

    // 过滤 Unk pins（和主图完全一致）
    tmpNode.pins = (tmpNode.pins ?? []).filter(
      (p: any) => !((p?.kind === 3 || p?.kind === 4) && p?.type?.t === 'b' && p?.type?.b === 'Unk')
    )

    tmpGraph.add_node(tmpNode)
    const tmpRoot = tmpGraph.encode() as any
    const encodedNode = tmpRoot.graph?.graph?.inner?.graph?.nodes?.[0]
    const vendorPins = encodedNode?.pins ?? []

    // 临时 Graph 没有连线，vendor 不会生成 connects；清理以防万一
    for (const p of vendorPins) {
      p.connects = undefined
    }

    return { pins: vendorPins, dataConns: [] }
  }

  // __composite_call__ 节点：仅创建有内部数据连线的 pin（conn 类型 arg）
  // 外层输入由 compositePins 路由，不创建物理 pin
  if (node.type === '__composite_call__') {
    if (calledDef) {
      const callArgs = (node.args as any) ?? []
      for (let ai = 1; ai < callArgs.length; ai++) {
        const arg = callArgs[ai]
        if (arg && arg.type === 'conn') {
          const inputIdx = ai - 1
          // 从子复合的输入定义中取类型和 pinIndex
          let cpi: number | undefined
          let typeName = 'int'
          if (inputIdx < calledDef.inputs.length) {
            cpi = calledDef.inputs[inputIdx].pinIndex
            typeName = calledDef.inputs[inputIdx].type as string
          }
          const pin = buildConnPin(inputIdx, typeName) as NodePin & { compositePinIndex?: number }
          if (cpi !== undefined) pin.compositePinIndex = cpi
          pins.push(pin)
          const conn = arg.value as { node_id: number; index: number }
          dataConns.push({
            nodeId: node.id,
            pin,
            upstreamNodeId: conn.node_id,
            upstreamPinIndex: conn.index
          })
        }
      }
    }
    return { pins, dataConns }
  }

  // __composite_capture__: 跳过数据 pin 但保留 OutFlow pin 生成
  if (node.type !== '__composite_capture__') {

  const args = node.args ?? []

  // assembly_list 节点：第一个 pin 是 count（元素数量的 Int 字面量）
  if (node.type === 'assembly_list') {
    const countPin = buildLiteralPin(0, 'int', args.length, node.type)
    pins.push(countPin)
  }
  let pinIndex = node.type === 'assembly_list' ? 1 : 0
  for (const arg of args) {
    // Capture-input args are routed via compositePins, not physical InParam pins,
    // but they still occupy their original argument slot. Otherwise later literal
    // args shift left and collide with the compositePins target pin.
    if (arg && (arg as any).capture === true) {
      pinIndex++
      continue
    }
    if (arg && arg.type === 'conn') {
      const conn = arg.value as { node_id: number; index: number; type?: string }
      const connType = (conn as any).type as string | undefined
      // data_type_conversion 节点：用 concrete map 查找正确的 indexOfConcrete 和类型
      if (node.type.startsWith('data_type_conversion_') && connType) {
        const dtcInfo = getDtcInParamInfo(connType)
        if (dtcInfo) {
          const innerValue = makeVarBaseValue(dtcInfo.varClass, dtcInfo.varType, false)
          const pin = {
            i1: { kind: NodePin_Index_Kind.InParam, index: pinIndex },
            i2: { kind: NodePin_Index_Kind.InParam, index: pinIndex },
            value: {
              class: 10000,
              alreadySetVal: true,
              bConcreteValue: { indexOfConcrete: dtcInfo.indexOfConcrete, value: innerValue }
            } as any,
            type: dtcInfo.varType
          }
          pins.push(pin)
          dataConns.push({
            nodeId: node.id,
            pin: pin as any,
            upstreamNodeId: conn.node_id,
            upstreamPinIndex: conn.index
          })
          pinIndex++
          continue
        }
      }
      // 其他 conn arg：用连接携带的真实类型构建占位 pin，避免 float 输入被误编码成 int。
      const pin = buildConnPin(pinIndex, connType ?? inferInputTypeFromNode(node.type, pinIndex))
      if (needsConcreteWrapping(node.type) && pin.value) {
        pin.value = wrapConcreteValueForNodeInput(node.type, pin.value, connType, pinIndex) as any
      }
      pins.push(pin)
      const connNum = arg.value as { node_id: number; index: number }
      dataConns.push({
        nodeId: node.id,
        pin,
        upstreamNodeId: connNum.node_id,
        upstreamPinIndex: connNum.index
      })
      pinIndex++
      continue
    }
    if (arg) {
      // data_type_conversion 节点的 literal arg：用 concrete map 的正确 indexOfConcrete
      if (node.type.startsWith('data_type_conversion_') && arg.type && arg.type !== 'dict') {
        const dtcInfo = getDtcInParamInfo(arg.type)
        if (dtcInfo) {
          const innerValue = makeVarBaseValue(dtcInfo.varClass, dtcInfo.varType, true)
          pins.push({
            i1: { kind: NodePin_Index_Kind.InParam, index: pinIndex },
            i2: { kind: NodePin_Index_Kind.InParam, index: pinIndex },
            value: {
              class: 10000,
              alreadySetVal: true,
              bConcreteValue: { indexOfConcrete: dtcInfo.indexOfConcrete, value: innerValue }
            } as any,
            type: dtcInfo.varType
          })
          pinIndex++
          continue
        }
      }
      pins.push(buildLiteralPin(pinIndex, arg.type, arg.value, node.type))
    } else {
      pins.push(buildPlaceholderPin(pinIndex, node.type))
    }
    pinIndex++
  }

  const outParams = implOutParamMap.get(node.id)
  if (outParams) {
    for (const op of outParams) {
      const outVarType = irTypeToVarType(op.type)
      const outVarClass = irTypeToVarBaseClass(op.type)
      pins.push({
        i1: { kind: NodePin_Index_Kind.OutParam, index: op.pinIndex },
        i2: { kind: NodePin_Index_Kind.OutParam, index: op.pinIndex },
        value: isListType(op.type)
          ? makeListVarBaseValue(outVarType, false) as any
          : wrapConcreteValue(concreteOutputIndex(op.type), outVarClass, outVarType, '') as any,
        type: outVarType
      })
    }
  }

  const hasExplicitOutParam = outParams && outParams.length > 0
  if (!hasExplicitOutParam && pins.length > 0 && isDataProducerNode(node.type)) {
    let outType = pins[0].type
    let outClass = pins[0].value?.bConcreteValue?.value?.class ?? pins[0].value?.class ?? 0
    // assembly_list：OutParam 是列表类型，不是 count pin 的 int 类型。
    if (node.type === 'assembly_list') {
      const firstElementArg = (node.args ?? []).find((arg: any) => arg && arg.type !== 'conn')
      const elementType = firstElementArg?.type as string | undefined
      if (elementType) {
        outType = irTypeToVarType(`${elementType}_list`)
        outClass = VarBase_Class.ArrayBase
      }
    }
    // data_type_conversion 节点：InParam 用了正确类型，但 OutParam 需要独立设置
    // OutParam 类型 = 目标类型（str=6），indexOfConcrete 固定为 2（M17[2]=6=String）
    if (node.type.startsWith('data_type_conversion_')) {
      const outKey = node.type.slice('data_type_conversion_'.length).trim()
      outType = irTypeToVarType(outKey)
      outClass = irTypeToVarBaseClass(outKey)
    }
    // get_list_length：OutParam 固定为 int，不能继承输入的 *_list 类型。
    if (node.type === 'get_list_length') {
      outType = VarType.Integer
      outClass = VarBase_Class.IntBase
    }
    // list_iteration_loop：OutParam 是元素类型，从 arg[0] 的 conn type 中推导
    if (node.type === 'list_iteration_loop') {
      const firstArg = (node.args ?? [])[0]
      if (firstArg && firstArg.type === 'conn') {
        const connType = (firstArg.value as any)?.type as string | undefined
        if (connType && connType.endsWith('_list')) {
          const elementType = connType.slice(0, -5)
          outType = irTypeToVarType(elementType)
          outClass = irTypeToVarBaseClass(elementType)
        }
      }
    }
    // get_node_graph_variable：OutParam 应从 implVariables 中取变量真实类型
    if (node.type === 'get_node_graph_variable') {
      const nameArg = (node.args ?? [])[0]
      if (nameArg && nameArg.type === 'str' && typeof nameArg.value === 'string') {
        const varName = nameArg.value
        const implVar = implVariables?.find(v => v.name === varName)
        if (implVar) {
          outType = irTypeToVarType(implVar.type)
          outClass = irTypeToVarBaseClass(implVar.type)
        }
      }
    }
    if (vec3ToFloatNodeTypes.has(node.type)) {
      outType = VarType.Float
      outClass = VarBase_Class.FloatBase
    }
    if (booleanOutputNodeTypes.has(node.type)) {
      outType = VarType.Boolean
      outClass = VarBase_Class.EnumBase
    }
    const innerValue = makeVarBaseValue(outClass, outType, false)
    let outValue: Record<string, unknown> = isListVarType(outType)
      ? makeListVarBaseValue(outType, false)
      : innerValue
    if (needsConcreteWrapping(node.type) && !booleanOutputNodeTypes.has(node.type)) {
      const outTypeName = node.type.startsWith('data_type_conversion_')
        ? node.type.slice('data_type_conversion_'.length).trim()
        : varTypeNameFromVarType(outType)
      outValue = {
        class: 10000,
        alreadySetVal: true,
        bConcreteValue: { indexOfConcrete: concreteOutputIndexForNode(node.type, outTypeName), value: innerValue }
      }
    }
    pins.push({
      i1: { kind: NodePin_Index_Kind.OutParam, index: 0 },
      i2: { kind: NodePin_Index_Kind.OutParam, index: 0 },
      value: outValue as any,
      type: outType
    })
  }

  const outEdges = implEdges[node.id]
  if (outEdges && outEdges.length > 0) {
    for (const [srcIdx] of groupEdgesBySourceIndex(outEdges)) {
      pins.push({
        i1: { kind: NodePin_Index_Kind.OutFlow, index: srcIdx },
        i2: { kind: NodePin_Index_Kind.OutFlow, index: srcIdx },
        type: 0,
        value: undefined as any
      })
    }
  }
  return { pins, dataConns }
} // end if (node.type !== '__composite_capture__')
}

function isDataProducerNode(nodeType: string): boolean {
  if (needsConcreteWrapping(nodeType)) return true
  if (vec3NodeTypes.has(nodeType)) return true
  if (nodeType === 'assembly_list' || nodeType === 'list_iteration_loop' || nodeType === 'get_node_graph_variable') return true
  if (nodeType.startsWith('get_') && !nodeType.startsWith('get_node_graph_variable')) return true
  return false
}

/**
 * data_type_conversion 节点的 DTC 具体序列（M16 = 第 16 号 concrete map）
 * 每个条目对应一个 DTC 变种的 InParam VarType，indexOfConcrete = 在序列中的位置
 */
const DTC_IN_PARAM_VARTYPE_SEQUENCE = [
  VarType.Integer,  // 0: int→str
  VarType.Entity,   // 1: entity→str
  VarType.GUID,     // 2: guid→str
  VarType.Boolean,  // 3: bool→str
  VarType.Float,    // 4: float→str
  VarType.Vector,   // 5: vec→str
  VarType.Faction,  // 6: faction→str
]

/**
 * 查 data_type_conversion 节点 InParam 的 concrete 信息
 * @returns { indexOfConcrete, varType, varClass } 或 null（非 DTC 节点）
 */
function getDtcInParamInfo(inType: string): { indexOfConcrete: number; varType: number; varClass: number } | null {
  const varType = irTypeToVarType(inType)
  if (varType === 0) return null
  const idx = DTC_IN_PARAM_VARTYPE_SEQUENCE.indexOf(varType)
  if (idx === -1) return null
  return {
    indexOfConcrete: idx,
    varType,
    varClass: irTypeToVarBaseClass(inType)
  }
}

/** 构建 VarBase 值结构（bInt/bFloat/bString 等） */
function makeVarBaseValue(varClass: number, varType: number, setVal: boolean): Record<string, unknown> {
  if (isListVarType(varType)) {
    return makeListVarBaseValue(varType, setVal)
  }

  const itemType = { classBase: 1, type_server: { type: varType, kind: 0 } }
  if (varClass === VarBase_Class.IntBase) {
    return { class: varClass, alreadySetVal: setVal, itemType, bInt: { val: 0 } }
  }
  if (varClass === VarBase_Class.FloatBase) {
    return { class: varClass, alreadySetVal: setVal, itemType, bFloat: { val: 0 } }
  }
  if (varClass === VarBase_Class.StringBase) {
    return { class: varClass, alreadySetVal: setVal, itemType, bString: { val: '' } }
  }
  if (varClass === VarBase_Class.VectorBase) {
    return { class: varClass, alreadySetVal: setVal, itemType, bVector: { val: { x: 0, y: 0, z: 0 } } }
  }
  if (varClass === VarBase_Class.EnumBase) {
    return { class: varClass, alreadySetVal: setVal, itemType, bEnum: { val: 0 } }
  }
  if (varClass === VarBase_Class.IdBase) {
    return { class: varClass, alreadySetVal: setVal, itemType, bId: { val: 0 } }
  }
  return { class: varClass, alreadySetVal: setVal, itemType }
}

function isListVarType(varType: number): boolean {
  return [
    VarType.GUIDList,
    VarType.IntegerList,
    VarType.BooleanList,
    VarType.FloatList,
    VarType.StringList,
    VarType.EntityList,
    VarType.VectorList,
    VarType.ConfigurationList,
    VarType.PrefabList,
    VarType.FactionList
  ].includes(varType)
}

function makeListVarBaseValue(varType: number, _setVal: boolean): Record<string, unknown> {
  const itemType = { classBase: 1, type_server: { type: varType, kind: 0 } }
  return {
    class: VarBase_Class.ConcreteBase,
    alreadySetVal: true,
    bConcreteValue: {
      indexOfConcrete: 0,
      value: {
        class: VarBase_Class.ArrayBase,
        alreadySetVal: true,
        itemType,
        bArray: { entries: [] }
      }
    }
  }
}

/** bConcreteValue 包裹（data_type_conversion 等节点需要） */
function wrapConcreteValue(
  indexOfConcrete: number,
  varClass: number,
  varType: number,
  strVal: string
): Record<string, unknown> {
  const itemType = { classBase: 1, type_server: { type: varType, kind: 0 } }
  let innerValue: Record<string, unknown> = {}
  if (varClass === VarBase_Class.StringBase) {
    innerValue = { class: varClass, alreadySetVal: false, itemType, bString: { val: strVal } }
  } else if (varClass === VarBase_Class.VectorBase) {
    innerValue = { class: varClass, alreadySetVal: false, itemType, bVector: { val: { x: 0, y: 0, z: 0 } } }
  } else if (varClass === VarBase_Class.IdBase) {
    innerValue = { class: varClass, alreadySetVal: false, itemType }
  } else {
    innerValue = { class: varClass, alreadySetVal: false, itemType }
  }
  return {
    class: 10000, // ConcreteBase
    alreadySetVal: true,
    bConcreteValue: {
      indexOfConcrete,
      value: innerValue
    }
  }
}

// impl graph 中需要 bConcreteValue 包裹的数据节点类型集合
const concreteWrappedNodeTypes = new Set([
  'addition', 'subtraction', 'multiplication', 'division', 'modulo_operation', 'exponentiation',
  'equal', 'greater_than', 'less_than', 'greater_than_or_equal_to', 'less_than_or_equal_to',
  'logical_and_operation', 'logical_or_operation', 'logical_not_operation', 'logical_xor_operation',
  'absolute_value_operation', 'sign_operation', 'arithmetic_square_root_operation',
  'round_to_integer_operation', 'range_limiting_operation',
  'take_larger_value', 'take_smaller_value',
  'enumerations_equal',
])

// vec3 输入节点：InParam placeholder 需要 VectorBase 类型
const vec3NodeTypes = new Set([
  '_3d_vector_addition', '_3d_vector_subtraction', '_3d_vector_cross_product',
  '_3d_vector_zoom', '_3d_vector_rotation',
  '_3d_vector_modulo_operation', '_3d_vector_dot_product',
  '_3d_vector_angle', '_3d_vector_normalization',
  'split_3d_vector', 'create_3d_vector',
])

// vec3→float 输出节点：输入 vec3 但输出 float，自动 OutParam 需特殊处理
const vec3ToFloatNodeTypes = new Set([
  '_3d_vector_modulo_operation', '_3d_vector_dot_product', '_3d_vector_angle',
])

const booleanOutputNodeTypes = new Set([
  'equal', 'greater_than', 'less_than', 'greater_than_or_equal_to', 'less_than_or_equal_to',
  'logical_and_operation', 'logical_or_operation', 'logical_not_operation', 'logical_xor_operation',
  'enumerations_equal',
])

/** 判断节点类型是否需要 bConcreteValue 包裹 */
function needsConcreteWrapping(nodeType: string): boolean {
  return nodeType.startsWith('data_type_conversion_') || concreteWrappedNodeTypes.has(nodeType)
}

/** 为 null arg 创建占位 pin（类型从节点类型推断） */
function buildPlaceholderPin(pinIndex: number, nodeType: string): NodePin {
  let varType = 0
  let varClass = 0
  if (nodeType === 'print_string') {
    varType = VarType.String; varClass = VarBase_Class.StringBase
  } else if (concreteWrappedNodeTypes.has(nodeType)) {
    varType = VarType.Integer; varClass = VarBase_Class.IntBase
  } else if (vec3NodeTypes.has(nodeType)) {
    varType = VarType.Vector; varClass = VarBase_Class.VectorBase
  }
  let pinValue = makeVarBaseValue(varClass, varType, false)

  if (needsConcreteWrapping(nodeType)) {
    pinValue = {
      class: 10000,
      alreadySetVal: true,
      bConcreteValue: { indexOfConcrete: 0, value: pinValue }
    }
  }

  return {
    i1: { kind: NodePin_Index_Kind.InParam, index: pinIndex },
    i2: { kind: NodePin_Index_Kind.InParam, index: pinIndex },
    value: pinValue as any,
    type: varType
  }
}

/**
 * 为连线输入创建占位 pin（基于类型字符串如 'int'/'float'，而非 nodeType）
 */
function buildConnPin(pinIndex: number, typeName: string): NodePin {
  const varType = irTypeToVarType(typeName)
  const varClass = irTypeToVarBaseClass(typeName)
  return {
    i1: { kind: NodePin_Index_Kind.InParam, index: pinIndex },
    i2: { kind: NodePin_Index_Kind.InParam, index: pinIndex },
    value: makeVarBaseValue(varClass, varType, false),
    type: varType
  }
}

function concreteInputIndex(typeName: string | undefined): number {
  switch (typeName) {
    case 'int':
      return 0
    case 'float':
      return 1
    case 'str':
      return 2
    case 'bool':
      return 3
    default:
      return 0
  }
}

function concreteOutputIndex(typeName: string | undefined): number {
  switch (typeName) {
    case 'bool':
      return 0
    case 'float':
      return 1
    case 'str':
      return 2
    case 'int':
      return 3
    default:
      return 0
  }
}

function concreteInputIndexForNode(nodeType: string, typeName: string | undefined): number {
  if (nodeType === 'equal' && typeName === 'int') return 5
  return concreteInputIndex(typeName)
}

function concreteOutputIndexForNode(nodeType: string, typeName: string | undefined): number {
  if (nodeType === 'addition' && typeName === 'int') return 0
  return concreteOutputIndex(typeName)
}

function varTypeNameFromVarType(varType: number): string {
  switch (varType) {
    case VarType.Boolean:
      return 'bool'
    case VarType.Float:
      return 'float'
    case VarType.String:
      return 'str'
    case VarType.Integer:
      return 'int'
    case VarType.Vector:
      return 'vec3'
    default:
      return 'int'
  }
}

function wrapConcreteValueForNodeInput(
  nodeType: string,
  innerValue: Record<string, unknown>,
  typeName: string | undefined,
  pinIndex: number
): Record<string, unknown> {
  return {
    class: 10000,
    alreadySetVal: true,
    bConcreteValue: {
      indexOfConcrete: nodeType.startsWith('data_type_conversion_')
        ? concreteInputIndex(typeName)
        : concreteInputIndexForNode(nodeType, typeName ?? inferInputTypeFromNode(nodeType, pinIndex)),
      value: innerValue
    }
  }
}

function inferInputTypeFromNode(nodeType: string, _pinIndex: number): string {
  if (nodeType === 'print_string') return 'str'
  if (vec3NodeTypes.has(nodeType)) return 'vec3'
  if (concreteWrappedNodeTypes.has(nodeType)) return 'int'
  return 'int'
}

function buildLiteralPin(pinIndex: number, argType: string, value: unknown, nodeType: string): NodePin {
  const kind = NodePin_Index_Kind.InParam
  const varType = irTypeToVarType(argType)
  const varClass = irTypeToVarBaseClass(argType)

  const itemType = { classBase: 1, type_server: { type: varType, kind: 0 } }

  let pinValue: Record<string, unknown> = {}
  if (varClass === VarBase_Class.IntBase) {
    pinValue = { class: varClass, alreadySetVal: true, itemType, bInt: { val: Number(value) } }
  } else if (varClass === VarBase_Class.FloatBase) {
    pinValue = { class: varClass, alreadySetVal: true, itemType, bFloat: { val: Number(value) } }
  } else if (varClass === VarBase_Class.EnumBase) {
    pinValue = { class: varClass, alreadySetVal: true, itemType, bEnum: { val: Number(Boolean(value)) } }
  } else if (varClass === VarBase_Class.StringBase) {
    pinValue = { class: varClass, alreadySetVal: true, itemType, bString: { val: String(value) } }
  } else if (varClass === VarBase_Class.IdBase) {
    pinValue = { class: varClass, alreadySetVal: false, itemType }
  }

  if (needsConcreteWrapping(nodeType)) {
    pinValue = wrapConcreteValueForNodeInput(nodeType, pinValue, argType, pinIndex)
  }

  return {
    i1: { kind, index: pinIndex },
    i2: { kind, index: pinIndex },
    value: pinValue as any,
    type: varType
  }
}
