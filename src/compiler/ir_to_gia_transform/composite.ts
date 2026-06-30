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
import { SPECIAL_NODE_IDS, SPECIAL_NODE_MAPPINGS, getNodeIdLowerMap } from './mappings.js'

/**
 * 将 CompositeDefIR 编码为 accessories 中的 GraphUnit（CompositeDef 和 impl NodeGraph 成对）
 */
export function buildCompositeAccessories(def: CompositeDefIR): GraphUnit[] {
  const accessories: GraphUnit[] = []

  const implGraphId = def.id + 10000

  // 将 impl 节点 ID 重新编号为从 1 开始的连续序列
  const nodeIndexMap = new Map<number, number>()
  def.implNodes.forEach((n, i) => nodeIndexMap.set(n.id, i + 2))

  // 从 compositePins 提取 OutParam 映射，供 impl 节点生成正确的 OutParam pin
  const implOutParamMap = new Map<number, Array<{ pinIndex: number; type: string }>>()
  for (const cp of def.compositePins) {
    if (cp.outerPinKind !== 4) continue // 只取 OutParam
    const arr = implOutParamMap.get(cp.innerNodeId) ?? []
    arr.push({ pinIndex: cp.innerPinIndex, type: def.outputs[cp.outerPinIndex]?.type ?? 'int' })
    implOutParamMap.set(cp.innerNodeId, arr)
  }

  const implNodes = buildImplGraphNodes(def.implNodes, nodeIndexMap, def.implEdges, implOutParamMap)

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
        class: typeClassFromValueType(param.type as any),
        type1: typeIdFromValueType(param.type as any),
        type2: typeIdFromValueType(param.type as any),
        valueId: null
      },
      pinIndex: param.pinIndex
    })),
    outputs: def.outputs.map((param) => ({
      name: param.name,
      visible: param.visible,
      index: { kind: NodePin_Index_Kind.OutParam, index: param.index },
      type: {
        class: typeClassFromValueType(param.type as any),
        type1: typeIdFromValueType(param.type as any),
        type2: typeIdFromValueType(param.type as any),
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

  // 2. impl NodeGraph（实现图）
  const implGraphUnit: GraphUnit = {
    id: {
      class: GraphUnit_Id_Class.Basic,
      type: GraphUnit_Id_Type.ServerGraph,
      id: implGraphId
    },
    relatedIds: [],
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
          compositePins: def.compositePins.map((entry) => ({
            outerPin: {
              kind: entry.outerPinKind as NodePin_Index_Kind,
              index: entry.outerPinIndex
            },
            innerNodeId: nodeIndexMap.get(entry.innerNodeId) ?? entry.innerNodeId,
            innerPin: {
              kind: entry.innerPinKind as NodePin_Index_Kind,
              index: entry.innerPinIndex
            },
            innerPin2: {
              kind: entry.innerPinKind as NodePin_Index_Kind,
              index: entry.innerPinIndex
            }
          })),
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

// impl 图布局间距常量
const LAYOUT_EXEC_H_STEP = 800
const LAYOUT_EXEC_V_STEP = 300
const LAYOUT_DATA_H_STEP = 800
const LAYOUT_DATA_Y_OFFSET = -400

/**
 * 从 IR 节点构建 GIA GraphNode 列表（impl 图）
 */
function buildImplGraphNodes(
  implNodes: CompositeDefIR['implNodes'],
  nodeIndexMap: Map<number, number>,
  implEdges: Record<number, any[]>,
  implOutParamMap: Map<number, Array<{ pinIndex: number; type: string }>>
): GraphNode[] {
  const allDataConns: Array<{ nodeId: number; pin: NodePin; upstreamNodeId: number; upstreamPinIndex: number }> = []
  const nodeResults = implNodes.map((node) => {
    const nodeId = resolveImplNodeId(node.type, node.args as any)
    const genericId = {
      class: NodeGraph_Id_Class.SystemDefined,
      type: NodeProperty_Type.Server,
      kind: NodeGraph_Id_Kind.SysCall,
      nodeId
    }
    const { pins, dataConns } = buildImplNodePins(node, implEdges, implOutParamMap)
    allDataConns.push(...dataConns)
    return { node, nodeId, genericId, pins, nodeIndex: nodeIndexMap.get(node.id) ?? node.id }
  })

  for (const dc of allDataConns) {
    const mappedUpstreamId = nodeIndexMap.get(dc.upstreamNodeId) ?? dc.upstreamNodeId
    ;(dc.pin as any).connects = [{
      id: mappedUpstreamId,
      connect: { kind: NodePin_Index_Kind.OutParam, index: dc.upstreamPinIndex },
      connect2: { kind: NodePin_Index_Kind.OutParam, index: dc.upstreamPinIndex }
    }]
  }

  const layout = computeImplLayout(nodeResults, implNodes, implEdges)

  return nodeResults.map(({ node, nodeId, genericId, pins, nodeIndex }) => {
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
      concreteId: { ...genericId },
      pins,
      x: pos.x,
      y: pos.y,
      usingStruct: []
    }
  })
}

/** 为 impl 图节点计算布局坐标。exec 节点 BFS，数据节点按 Kahn 拓扑深度分列。 */
function computeImplLayout(
  nodeResults: Array<{ node: CompositeDefIR['implNodes'][number] }>,
  implNodes: CompositeDefIR['implNodes'],
  implEdges: Record<number, any[]>
): Map<number, { x: number; y: number }> {
  const pos = new Map<number, { x: number; y: number }>()

  const hasExecOut = new Set<number>()
  const execChildren = new Map<number, number[]>()
  for (const [fromIdStr, edges] of Object.entries(implEdges)) {
    const fromId = Number(fromIdStr)
    hasExecOut.add(fromId)
    execChildren.set(fromId, edges.map(e => getEdgeTarget(e)))
  }

  const hasExecIn = new Set<number>()
  for (const children of execChildren.values()) {
    for (const c of children) hasExecIn.add(c)
  }
  const entryNodes = implNodes.filter(n => hasExecOut.has(n.id) && !hasExecIn.has(n.id))

  const visited = new Set<number>()
  type QueueEntry = { id: number; x: number; y: number }
  const queue: QueueEntry[] = entryNodes.map(id => ({ id: id.id, x: 0, y: 0 }))
  let qi = 0

  while (qi < queue.length) {
    const { id, x, y } = queue[qi++]
    if (visited.has(id)) continue
    visited.add(id)
    pos.set(id, { x, y })

    const children = execChildren.get(id) ?? []
    children.forEach((childId, i) => {
      if (!visited.has(childId)) {
        queue.push({ id: childId, x: x + LAYOUT_EXEC_H_STEP, y: y + i * LAYOUT_EXEC_V_STEP })
      }
    })
  }

  // 环中节点放远一点
  let orphanX = -400
  let orphanY = -400
  for (const id of hasExecOut) {
    if (visited.has(id)) continue
    pos.set(id, { x: orphanX, y: orphanY })
    orphanX -= 400
    if (orphanX < -2000) { orphanX = -400; orphanY += 400 }
  }

  const dataNodeIds = implNodes.filter(n => !hasExecOut.has(n.id)).map(n => n.id)
  const dataNodeIdSet = new Set(dataNodeIds)
  const dataEdges = new Map<number, number[]>()
  const dataInDegree = new Map<number, number>()
  for (const id of dataNodeIds) dataInDegree.set(id, 0)
  for (const nr of nodeResults) {
    const args = nr.node.args ?? []
    for (const arg of args) {
      if (arg && (arg as any).type === 'conn') {
        const v = (arg as any).value as { node_id?: number } | undefined
        if (v?.node_id && dataNodeIdSet.has(v.node_id)) {
          const deps = dataEdges.get(v.node_id) ?? []
          deps.push(nr.node.id)
          dataEdges.set(v.node_id, deps)
          dataInDegree.set(nr.node.id, (dataInDegree.get(nr.node.id) ?? 0) + 1)
        }
      }
    }
  }

  const dataDepth = new Map<number, number>()
  const kahnQ: number[] = []
  let kahnQi = 0
  for (const id of dataNodeIds) {
    if ((dataInDegree.get(id) ?? 0) === 0) {
      kahnQ.push(id)
      dataDepth.set(id, 0)
    }
  }
  while (kahnQi < kahnQ.length) {
    const cur = kahnQ[kahnQi++]
    const curDepth = dataDepth.get(cur) ?? 0
    for (const child of dataEdges.get(cur) ?? []) {
      const newDeg = (dataInDegree.get(child) ?? 1) - 1
      dataInDegree.set(child, newDeg)
      dataDepth.set(child, Math.max(dataDepth.get(child) ?? 0, curDepth + 1))
      if (newDeg === 0) kahnQ.push(child)
    }
  }

  const dataCols = new Map<number, number[]>()
  for (const id of dataNodeIds) {
    const d = dataDepth.get(id) ?? 0
    const col = dataCols.get(d) ?? []
    col.push(id)
    dataCols.set(d, col)
  }
  const maxDepth = Math.max(...dataNodeIds.map(id => dataDepth.get(id) ?? 0), 0)
  for (let d = 0; d <= maxDepth; d++) {
    const col = dataCols.get(d) ?? []
    col.forEach((id, row) => {
      pos.set(id, { x: d * LAYOUT_DATA_H_STEP, y: row * LAYOUT_EXEC_V_STEP + LAYOUT_DATA_Y_OFFSET })
    })
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
    // 尝试从第一个 arg 推断 inType
    const firstArg = args?.[0]
    if (firstArg && firstArg.type !== 'conn') {
      const inType = firstArg.type as string
      if (inType && inType !== 'dict') {
        const inKey = inType === 'vec3' ? 'vec' : inType
        const direct = nodeIdLower.get(`data_type_conversion__${inKey}_${outKey}`)
        if (direct) return direct
      }
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
 * 将 arg 的 IR literal type 映射为 VarBase_Class
 */
function argVarBaseClass(argType: string): number {
  switch (argType) {
    case 'int': return VarBase_Class.IntBase
    case 'float': return VarBase_Class.FloatBase
    case 'bool': return VarBase_Class.EnumBase
    case 'str': return VarBase_Class.StringBase
    case 'vec3': return VarBase_Class.VectorBase
    case 'entity':
    case 'guid':
    case 'faction':
    case 'prefab_id':
    case 'config_id':
      return VarBase_Class.IdBase
    default: return 0
  }
}

/**
 * 将 arg 的 IR literal type 映射为 VarType
 */
function argVarType(argType: string): number {
  switch (argType) {
    case 'bool': return VarType.Boolean
    case 'int': return VarType.Integer
    case 'float': return VarType.Float
    case 'str': return VarType.String
    case 'vec3': return VarType.Vector
    case 'guid': return VarType.GUID
    case 'entity': return VarType.Entity
    case 'faction': return VarType.Faction
    case 'prefab_id': return VarType.Prefab
    case 'config_id': return VarType.Configuration
    default: return 0
  }
}

/**
 * 为 impl 节点构建 pins。由捕获数据驱动：args → InParam、outputValues → OutParam、edges → OutFlow。
 * dataConns 数组中持有对 pins 内 pin 对象的引用，供调用方填充 connects。
 */
function buildImplNodePins(
  node: CompositeDefIR['implNodes'][number],
  implEdges: Record<number, any[]>,
  implOutParamMap: Map<number, Array<{ pinIndex: number; type: string }>>
): { pins: NodePin[]; dataConns: Array<{ nodeId: number; pin: NodePin; upstreamNodeId: number; upstreamPinIndex: number }> } {
  const pins: NodePin[] = []
  const dataConns: Array<{ nodeId: number; pin: NodePin; upstreamNodeId: number; upstreamPinIndex: number }> = []

  if (node.type === '__composite_capture__' || node.type === '__composite_call__') {
    return { pins, dataConns }
  }

  const args = node.args ?? []
  let pinIndex = 0
  for (const arg of args) {
    if (arg && arg.type === 'conn') {
      const pin = buildPlaceholderPin(pinIndex, node.type)
      pins.push(pin)
      const conn = arg.value as { node_id: number; index: number }
      dataConns.push({
        nodeId: node.id,
        pin,
        upstreamNodeId: conn.node_id,
        upstreamPinIndex: conn.index
      })
      pinIndex++
      continue
    }
    if (arg) {
      pins.push(buildLiteralPin(pinIndex, arg.type, arg.value, node.type))
    } else {
      pins.push(buildPlaceholderPin(pinIndex, node.type))
    }
    pinIndex++
  }

  const outParams = implOutParamMap.get(node.id)
  if (outParams) {
    for (const op of outParams) {
      const outVarType = argVarType(op.type)
      const outVarClass = argVarBaseClass(op.type)
      pins.push({
        i1: { kind: NodePin_Index_Kind.OutParam, index: op.pinIndex },
        i2: { kind: NodePin_Index_Kind.OutParam, index: op.pinIndex },
        value: wrapConcreteValue(op.pinIndex, outVarClass, outVarType, '') as any,
        type: outVarType
      })
    }
  }

  const hasExplicitOutParam = outParams && outParams.length > 0
  if (!hasExplicitOutParam && pins.length > 0 && isDataProducerNode(node.type)) {
    let outType = pins[0].type
    let outClass = pins[0].value?.bConcreteValue?.value?.class ?? pins[0].value?.class ?? 0
    // vec3→float 节点：输出是 float 而非 vec3
    if (vec3ToFloatNodeTypes.has(node.type)) {
      outType = VarType.Float
      outClass = VarBase_Class.FloatBase
    }
    const innerValue = makeVarBaseValue(outClass, outType, false)
    let outValue: Record<string, unknown> = innerValue
    if (needsConcreteWrapping(node.type)) {
      outValue = {
        class: 10000,
        alreadySetVal: true,
        bConcreteValue: { indexOfConcrete: 0, value: innerValue }
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
}

function isDataProducerNode(nodeType: string): boolean {
  if (needsConcreteWrapping(nodeType)) return true
  if (vec3NodeTypes.has(nodeType)) return true
  if (nodeType.startsWith('get_') && !nodeType.startsWith('get_node_graph_variable')) return true
  return false
}

/** 构建 VarBase 值结构（bInt/bFloat/bString 等） */
function makeVarBaseValue(varClass: number, varType: number, setVal: boolean): Record<string, unknown> {
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
  return { class: varClass, alreadySetVal: setVal, itemType }
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

function buildLiteralPin(pinIndex: number, argType: string, value: unknown, nodeType: string): NodePin {
  const kind = NodePin_Index_Kind.InParam
  const varType = argVarType(argType)
  const varClass = argVarBaseClass(argType)

  const itemType = { classBase: 1, type_server: { type: varType, kind: 0 } }

  let pinValue: Record<string, unknown> = {}
  if (varClass === VarBase_Class.IntBase) {
    pinValue = { class: varClass, alreadySetVal: true, itemType, bInt: { val: Number(value) } }
  } else if (varClass === VarBase_Class.FloatBase) {
    pinValue = { class: varClass, alreadySetVal: true, itemType, bFloat: { val: Number(value) } }
  } else if (varClass === VarBase_Class.EnumBase) {
    pinValue = { class: varClass, alreadySetVal: true, itemType, bBool: { val: Boolean(value) } }
  } else if (varClass === VarBase_Class.StringBase) {
    pinValue = { class: varClass, alreadySetVal: true, itemType, bString: { val: String(value) } }
  } else if (varClass === VarBase_Class.IdBase) {
    pinValue = { class: varClass, alreadySetVal: false, itemType }
  }

  if (needsConcreteWrapping(nodeType)) {
    pinValue = {
      class: 10000,
      alreadySetVal: true,
      bConcreteValue: {
        indexOfConcrete: 0,
        value: pinValue
      }
    }
  }

  return {
    i1: { kind, index: pinIndex },
    i2: { kind, index: pinIndex },
    value: pinValue as any,
    type: varType
  }
}

// ============== 类型映射辅助 ==============

function typeClassFromValueType(type: string): number {
  switch (type) {
    case 'int': return VarBase_Class.IntBase    // 2
    case 'float': return VarBase_Class.FloatBase  // 4
    case 'bool': return VarBase_Class.EnumBase    // 6
    case 'str': return VarBase_Class.StringBase   // 5
    case 'vec3': return VarBase_Class.VectorBase  // 7
    case 'entity':
    case 'guid':
    case 'faction':
    case 'prefab_id':
    case 'config_id':
      return VarBase_Class.IdBase                 // 1
    default:
      if (type.endsWith('_list')) return VarBase_Class.ArrayBase // 10002
      return 0
  }
}

function typeIdFromValueType(type: string): number {
  switch (type) {
    case 'bool': return VarType.Boolean          // 4
    case 'int': return VarType.Integer           // 3
    case 'float': return VarType.Float           // 5
    case 'str': return VarType.String            // 6
    case 'vec3': return VarType.Vector           // 12
    case 'guid': return VarType.GUID             // 2
    case 'entity': return VarType.Entity         // 1
    case 'prefab_id': return VarType.Prefab      // 21
    case 'config_id': return VarType.Configuration // 20
    case 'faction': return VarType.Faction       // 17
    default:
      if (type === 'bool_list') return VarType.BooleanList     // 9
      if (type === 'int_list') return VarType.IntegerList      // 8
      if (type === 'float_list') return VarType.FloatList      // 10
      if (type === 'str_list') return VarType.StringList       // 11
      if (type === 'entity_list') return VarType.EntityList    // 13
      if (type === 'guid_list') return VarType.GUIDList        // 7
      return 0
  }
}
