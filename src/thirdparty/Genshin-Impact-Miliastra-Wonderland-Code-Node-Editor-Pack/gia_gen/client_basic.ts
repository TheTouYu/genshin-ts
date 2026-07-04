// @ts-nocheck thirdparty

import type { ClientNodeMetadata, ClientPinMetadata } from '../node_data/client_node_metadata.js'
import {
  GraphUnit_Id_Class,
  GraphUnit_Id_Type,
  NodeGraph_Id_Class,
  NodeGraph_Id_Kind,
  NodePin_Index_Kind,
  VarBase_Class,
  VarBase_ItemType_ClassBase,
  type GraphNode,
  type NodePin,
  type Root,
  type VarBase
} from '../protobuf/gia.proto.js'
import { graph_body, node_connect_from, node_connect_to } from './basic.js'

export function client_graph_body(body: {
  uid: number
  graph_id: number
  graph_name: string
  graphType: number
  graphWhich: number
  nodes: GraphNode[]
}): Root {
  const root = graph_body({
    uid: body.uid,
    graph_id: body.graph_id,
    graph_name: body.graph_name,
    nodes: body.nodes,
    mode: 'server'
  })
  root.graph.id = {
    class: GraphUnit_Id_Class.Basic,
    type: GraphUnit_Id_Type.ClientGraph,
    id: body.graph_id
  }
  root.graph.which = body.graphWhich
  root.graph.graph!.inner.graph.id = {
    class: NodeGraph_Id_Class.UserDefined,
    type: body.graphType,
    kind: NodeGraph_Id_Kind.NodeGraph,
    id: body.graph_id
  }
  return root
}

function emptyClientValue(pin: ClientPinMetadata): VarBase {
  return {
    class: VarBase_Class.ConcreteBase,
    alreadySetVal: false,
    itemType: {
      classBase: VarBase_ItemType_ClassBase.Client,
      type_client: {
        type: pin.clientVarType ?? 0
      }
    },
    bConcreteValue: {
      value: {}
    }
  } as VarBase
}

export function client_pin_body(pin: ClientPinMetadata): NodePin {
  const kind =
    pin.kind === 'input'
      ? NodePin_Index_Kind.InParam
      : pin.kind === 'output'
        ? NodePin_Index_Kind.OutParam
        : pin.kind === 'client_exec'
          ? NodePin_Index_Kind.ClientExecNode
          : pin.kind === 'client_signal'
            ? NodePin_Index_Kind.ClientSignal
            : pin.kind === 'in_flow'
              ? NodePin_Index_Kind.InFlow
              : NodePin_Index_Kind.OutFlow
  return {
    i1: { kind, index: pin.index },
    i2: { kind, index: pin.index },
    type: pin.clientVarType ?? 0,
    value: pin.kind === 'input' ? emptyClientValue(pin) : undefined,
    connects: []
  }
}

export function client_node_body(body: {
  metadata: ClientNodeMetadata
  unique_index: number
  x: number
  y: number
}): GraphNode {
  const pins = [
    ...body.metadata.inputs.map(client_pin_body),
    ...body.metadata.outputs.map(client_pin_body),
    ...(body.metadata.flows ?? []).map(client_pin_body)
  ]
  const node: GraphNode = {
    nodeIndex: body.unique_index,
    genericId: {
      class: NodeGraph_Id_Class.SystemDefined,
      // NodeProperty.type observed per family; recorded as graphType during extraction
      type: body.metadata.graphType,
      kind: NodeGraph_Id_Kind.SysCall,
      nodeId: body.metadata.genericId
    },
    concreteId: {
      class: NodeGraph_Id_Class.SystemDefined,
      type: body.metadata.graphType,
      kind: NodeGraph_Id_Kind.SysCall,
      nodeId: Number(body.metadata.concreteId)
    },
    pins,
    x: body.x * 300,
    y: body.y * 200,
    usingStruct: []
  }
  if (
    body.metadata.specialKind === 'start' &&
    body.metadata.subType.startsWith('creation_status')
  ) {
    node.statusNodeExtension = { type: 1, inner: { value: 1 } }
  }
  return node
}

export { node_connect_from, node_connect_to }
