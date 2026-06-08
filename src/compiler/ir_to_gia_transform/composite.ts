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

/**
 * 将 CompositeDefIR 编码为 accessories 中的 GraphUnit（CompositeDef 和 impl NodeGraph 成对）
 */
export function buildCompositeAccessories(def: CompositeDefIR): GraphUnit[] {
  const accessories: GraphUnit[] = []

  // 1. 构建 impl NodeGraph（实现图）
  const implGraphId = def.id + 10000 // impl 图使用偏移 ID
  const implNodes = buildImplGraphNodes(def.implNodes)

  const implGraphUnit: GraphUnit = {
    id: {
      class: GraphUnit_Id_Class.Basic,
      type: GraphUnit_Id_Type.ServerGraph,
      id: implGraphId
    },
    relatedIds: [],
    name: `${def.name}_impl`,
    which: GraphUnit_Which.EntityNode,
    graph: {
      inner: {
        graph: {
          id: {
            class: NodeGraph_Id_Class.UserDefined,
            type: NodeGraph_Id_Type.BasicNode,
            kind: NodeGraph_Id_Kind.NodeGraph,
            id: implGraphId
          },
          name: `${def.name}_impl`,
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

  // 2. 构建 CompositeDef（定义 + 接口）
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
        valueId: { id: 0 }
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
        valueId: { id: 0 }
      },
      pinIndex: param.pinIndex
    })),
    type: {
      kind: CompositeDef_Type_Kind.Composite
    },
    name: def.name,
    description: '',
    xxx: 0
  }

  const defGraphUnit: GraphUnit = {
    id: {
      class: GraphUnit_Id_Class.AffiliatedNode,
      type: GraphUnit_Id_Type.ServerGraph,
      id: def.id
    },
    relatedIds: [],
    name: def.name,
    which: GraphUnit_Which.CompositeGraph,
    compositeDef: {
      inner: {
        def: compositeDef
      }
    }
  }
  accessories.push(defGraphUnit)

  return accessories
}

/**
 * 从 IR 节点构建 GIA GraphNode 列表（impl 图的简易版本）
 */
function buildImplGraphNodes(implNodes: CompositeDefIR['implNodes']): GraphNode[] {
  return implNodes.map((node, i) => ({
    nodeIndex: node.id,
    genericId: {
      class: NodeGraph_Id_Class.SystemDefined,
      type: NodeProperty_Type.Server,
      kind: NodeGraph_Id_Kind.SysCall,
      nodeId: 0
    },
    pins: [],
    x: 100 + i * 200 + Math.random() * 10,
    y: 100 + Math.random() * 10,
    usingStruct: []
  }))
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
