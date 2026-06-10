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
  const implNodes = buildImplGraphNodes(def.implNodes)

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
            innerNodeId: entry.innerNodeId,
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

/**
 * 从 IR 节点构建 GIA GraphNode 列表（impl 图）
 *
 * 为每个 impl 节点解析正确的 GIA node ID、构建带类型/值的 pins、并添加 concreteId。
 */
function buildImplGraphNodes(implNodes: CompositeDefIR['implNodes']): GraphNode[] {
  return implNodes.map((node) => {
    const nodeId = resolveImplNodeId(node.type, node.args as any)
    const genericId = {
      class: NodeGraph_Id_Class.SystemDefined,
      type: NodeProperty_Type.Server,
      kind: NodeGraph_Id_Kind.SysCall,
      nodeId
    }
    const pins = buildImplNodePins(node)
    return {
      nodeIndex: node.id,
      genericId,
      concreteId: { ...genericId },
      pins,
      x: 0,
      y: 0,
      usingStruct: []
    }
  })
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
 * 为 impl 节点构建带类型/值的 pins
 */
function buildImplNodePins(node: CompositeDefIR['implNodes'][number]): NodePin[] {
  const args = node.args ?? []
  const pins: NodePin[] = []
  let pinIndex = 0
  for (const arg of args) {
    if (arg && arg.type === 'conn') continue
    if (arg) {
      pins.push(buildLiteralPin(pinIndex, arg.type, arg.value, node.type))
    } else {
      pins.push(buildPlaceholderPin(pinIndex, node.type))
    }
    pinIndex++
  }
  // data_type_conversion_<out> 需要输出 OutParam pin
  if (node.type.startsWith('data_type_conversion_')) {
    const outType = node.type.slice('data_type_conversion_'.length)
    const outVarType = argVarType(outType)
    const outVarClass = argVarBaseClass(outType)
    pins.push({
      i1: { kind: NodePin_Index_Kind.OutParam, index: 0 },
      i2: { kind: NodePin_Index_Kind.OutParam, index: 0 },
      value: wrapConcreteValue(1, outVarClass, outVarType, '') as any,
      type: outVarType
    })
  }
  // 其他数据节点（addition 等）需要 OutParam pin 暴露输出，供 compositePins 的 OutParam 映射使用
  if (!node.type.startsWith('data_type_conversion_') && pins.length > 0 && node.type !== 'print_string') {
    const outType = pins[0].type
    const outClass = pins[0].value?.bConcreteValue?.value?.class ?? pins[0].value?.class ?? 0
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
  return pins
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
