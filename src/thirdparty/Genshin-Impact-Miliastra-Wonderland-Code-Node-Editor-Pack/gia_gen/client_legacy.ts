import {
  ClientVarType,
  GraphUnit_Id_Class,
  GraphUnit_Id_Type,
  GraphUnit_Which,
  NodeGraph_Id_Class,
  NodeGraph_Id_Kind,
  NodeGraph_Id_Type,
  NodePin_Index_Kind,
  NodeProperty_Type,
  VarBase_Class,
  VarBase_ItemType_ClassBase,
  type GraphNode,
  type NodeConnection,
  type NodePin,
  type NodePin_Index,
  type Root,
  type VarBase
} from '../protobuf/gia.proto.js'

export interface ClientLegacyGraphOptions {
  graphId: number
  graphName: string
  filePath: string
  gameVersion: string
  nodes: GraphNode[]
}

export interface ClientLegacyNodeOptions {
  nodeIndex: number
  shellId: number
  kernelId: number
  pins?: NodePin[]
  x?: number
  y?: number
  contextDeclaration?: { kind: NodePin_Index_Kind; index: number }
}

export interface ClientLegacyDataPinOptions {
  shellIndex: number
  kernelIndex: number
  type: ClientVarType
  value: VarBase
  connects?: NodeConnection[]
}

export function clientItemType(type: ClientVarType): VarBase['itemType'] {
  return {
    classBase: VarBase_ItemType_ClassBase.Client,
    type_client: { type }
  }
}

export function clientIntValue(value?: number, alreadySetVal = value !== undefined): VarBase {
  return {
    class: VarBase_Class.IntBase,
    alreadySetVal: alreadySetVal ? true : undefined,
    itemType: clientItemType(ClientVarType.Integer_),
    bInt: value === undefined ? {} : { val: value }
  } as VarBase
}

export function clientIdValue(type: ClientVarType, value: number): VarBase {
  return {
    class: VarBase_Class.IdBase,
    alreadySetVal: true,
    itemType: clientItemType(type),
    bId: { val: value }
  }
}

export function clientFloatValue(value: number): VarBase {
  return {
    class: VarBase_Class.FloatBase,
    alreadySetVal: true,
    itemType: clientItemType(ClientVarType.Float_),
    bFloat: { val: value }
  }
}

export function clientVectorValue(value: [number, number, number]): VarBase {
  return {
    class: VarBase_Class.VectorBase,
    alreadySetVal: true,
    itemType: clientItemType(ClientVarType.Vector_),
    bVector: { val: { x: value[0], y: value[1], z: value[2] } }
  }
}

export function clientBoolValue(value: boolean): VarBase {
  return {
    class: VarBase_Class.EnumBase,
    alreadySetVal: true,
    itemType: clientItemType(ClientVarType.Boolean_),
    bEnum: value ? { val: 1 } : {}
  } as VarBase
}

function pinIndex(kind: NodePin_Index_Kind, index: number): NodePin_Index {
  return (index === 0 ? { kind } : { kind, index }) as NodePin_Index
}

export function clientDataPin(options: ClientLegacyDataPinOptions): NodePin {
  return {
    i1: pinIndex(NodePin_Index_Kind.InParam, options.shellIndex),
    i2: pinIndex(NodePin_Index_Kind.InParam, options.kernelIndex),
    value: options.value,
    type: options.type,
    connects: options.connects ?? []
  }
}

export function clientBindingPin(shellId: number): NodePin {
  return {
    i1: pinIndex(NodePin_Index_Kind.ClientExecNode, 0),
    i2: pinIndex(NodePin_Index_Kind.ClientExecNode, 0),
    value: clientIntValue(),
    type: ClientVarType.Integer_,
    connects: [],
    clientExecNode: {
      kind: NodePin_Index_Kind.ClientExecNode,
      index: 1,
      nodeId: { id: shellId }
    }
  }
}

export function clientOutflowPin(
  targetNodeIndex: number,
  outflowIndex = 0,
  inflowIndex = 0
): NodePin {
  return {
    i1: pinIndex(NodePin_Index_Kind.OutFlow, outflowIndex),
    i2: pinIndex(NodePin_Index_Kind.OutFlow, outflowIndex),
    value: undefined,
    type: undefined,
    connects: [
      {
        id: targetNodeIndex,
        connect: pinIndex(NodePin_Index_Kind.InFlow, inflowIndex),
        connect2: pinIndex(NodePin_Index_Kind.InFlow, inflowIndex)
      }
    ]
  } as unknown as NodePin
}

export function clientLegacyNode(options: ClientLegacyNodeOptions): GraphNode {
  const identity = {
    class: NodeGraph_Id_Class.SystemDefined,
    type: NodeProperty_Type.Skill,
    kind: NodeGraph_Id_Kind.SysCall
  }
  return {
    nodeIndex: options.nodeIndex,
    genericId: { ...identity, nodeId: options.shellId },
    concreteId: { ...identity, nodeId: options.kernelId },
    pins: options.pins ?? [],
    x: options.x,
    y: options.y,
    contextDeclaration:
      options.contextDeclaration === undefined
        ? undefined
        : pinIndex(options.contextDeclaration.kind, options.contextDeclaration.index),
    usingStruct: []
  } as GraphNode
}

export function clientLegacySkillGraph(options: ClientLegacyGraphOptions): Root {
  return {
    graph: {
      id: {
        class: GraphUnit_Id_Class.Node,
        type: GraphUnit_Id_Type.ClientGraph,
        id: options.graphId
      },
      relatedIds: [],
      name: options.graphName,
      which: GraphUnit_Which.Skills,
      graph: {
        inner: {
          graph: {
            id: {
              class: NodeGraph_Id_Class.UserDefined,
              type: NodeGraph_Id_Type.Skills,
              kind: NodeGraph_Id_Kind.NodeGraph,
              id: options.graphId
            },
            name: options.graphName,
            nodes: options.nodes,
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
    filePath: options.filePath,
    gameVersion: options.gameVersion
  }
}
