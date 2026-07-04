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

// ---------------------------------------------------------------------------
// Client literal value encoding
//
// All shapes below are proven by tests/client_generated/_value_shapes.json,
// extracted from vendor samples. Scalars use their VarBase_Class directly;
// lists are ArrayBase with client item types (only empty lists observed);
// entity pins never carry literal values in any sample.
// ---------------------------------------------------------------------------

/** VarBase_Class per ClientVarType, used for typed-but-unset pin values */
const SCALAR_CLASS_BY_CLIENT_TYPE: Record<number, number> = {
  3: VarBase_Class.IntBase, // int
  7: VarBase_Class.FloatBase, // float
  9: VarBase_Class.StringBase, // str
  5: VarBase_Class.EnumBase, // bool (encoded as EnumBase 0/1)
  13: VarBase_Class.EnumBase, // enum
  11: VarBase_Class.VectorBase, // vec3
  14: VarBase_Class.IdBase, // guid
  16: VarBase_Class.IdBase, // faction
  18: VarBase_Class.IdBase, // config_id
  19: VarBase_Class.IdBase // prefab_id
}

/**
 * Types with sample-proven literal payloads (alreadySetVal=true plus a b* value
 * field observed in _value_shapes.json). config_id/prefab_id pins appear in
 * samples but never with an actual literal payload, so they are excluded.
 */
const LITERAL_PROVEN_CLIENT_TYPES = new Set([3, 5, 7, 9, 11, 13, 14, 16])

/** list client types with observed (empty) ArrayBase literal shapes */
const LIST_CLIENT_TYPES = new Set([2, 4, 6, 8, 12, 15, 20, 25])

/** client types whose pins exist but never carry literal values in samples */
const NEVER_LITERAL_CLIENT_TYPES = new Set([1]) // entity

function client_item_type(clientVarType: number) {
  return {
    classBase: VarBase_ItemType_ClassBase.Client,
    type_client: { type: clientVarType }
  }
}

/** typed-but-unset pin value, matching sample pins with alreadySetVal=false */
export function client_value_base(clientVarType: number): VarBase {
  const scalarClass = SCALAR_CLASS_BY_CLIENT_TYPE[clientVarType]
  const cls = scalarClass ?? (LIST_CLIENT_TYPES.has(clientVarType) ? VarBase_Class.ArrayBase : 0)
  const value: VarBase = {
    class: cls,
    alreadySetVal: false,
    itemType: client_item_type(clientVarType)
  }
  if (cls === VarBase_Class.ArrayBase) {
    value.bArray = { entries: [] }
  }
  return value
}

/** literal pin value with alreadySetVal=true, per proven sample shapes */
export function client_literal_value(clientVarType: number, literal: unknown): VarBase {
  const scalarClass = LITERAL_PROVEN_CLIENT_TYPES.has(clientVarType)
    ? SCALAR_CLASS_BY_CLIENT_TYPE[clientVarType]
    : undefined
  if (scalarClass !== undefined) {
    const value: VarBase = {
      class: scalarClass,
      alreadySetVal: true,
      itemType: client_item_type(clientVarType)
    }
    switch (scalarClass) {
      case VarBase_Class.IntBase:
        value.bInt = { val: Number(literal) }
        break
      case VarBase_Class.FloatBase:
        value.bFloat = { val: Number(literal) }
        break
      case VarBase_Class.StringBase:
        value.bString = { val: String(literal) }
        break
      case VarBase_Class.EnumBase:
        value.bEnum = { val: typeof literal === 'boolean' ? (literal ? 1 : 0) : Number(literal) }
        break
      case VarBase_Class.VectorBase: {
        const [x, y, z] = literal as [number, number, number]
        value.bVector = { val: { x, y, z } }
        break
      }
      case VarBase_Class.IdBase:
        value.bId = { val: Number(literal) }
        break
    }
    return value
  }
  // List pins only appear with alreadySetVal=false placeholders in samples,
  // so list literals (and dict/entity/other types) have no proven encoding.
  throw new Error(
    `[CLIENT_VALUE_TYPE_UNAVAILABLE] literal encoding for client type ${clientVarType} has no sample evidence`
  )
}

/** ConcreteBase wrapper observed on reflective pins */
export function client_wrapped_value(indexOfConcrete: number, inner: VarBase): VarBase {
  return {
    class: VarBase_Class.ConcreteBase,
    alreadySetVal: true,
    bConcreteValue: {
      indexOfConcrete: indexOfConcrete === 0 ? undefined : indexOfConcrete,
      value: inner
    }
  }
}

/** unresolved reflective pin placeholder (indexOfConcrete = -1) */
export function client_unresolved_reflective_value(): VarBase {
  return {
    class: VarBase_Class.ConcreteBase,
    alreadySetVal: false,
    bConcreteValue: { indexOfConcrete: -1, value: {} }
  }
}

export function client_pin_body(pin: ClientPinMetadata, literal?: unknown): NodePin {
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
  const isParam = pin.kind === 'input' || pin.kind === 'output'
  let value: VarBase | undefined
  if (isParam) {
    if (pin.reflective) {
      value = client_unresolved_reflective_value()
    } else if (literal !== undefined) {
      if (NEVER_LITERAL_CLIENT_TYPES.has(pin.clientVarType ?? 0)) {
        throw new Error(
          `[CLIENT_VALUE_TYPE_UNAVAILABLE] client type ${pin.clientVarType} pins never carry literal values in samples`
        )
      }
      value = client_literal_value(pin.clientVarType ?? 0, literal)
    } else {
      value = client_value_base(pin.clientVarType ?? 0)
    }
  }
  return {
    i1: { kind, index: pin.index },
    i2: { kind, index: pin.index },
    type: pin.clientVarType ?? 0,
    value,
    connects: []
  }
}

export function client_node_body(body: {
  metadata: ClientNodeMetadata
  unique_index: number
  x: number
  y: number
  /** resolved concrete id; required when metadata carries a reflectMap */
  concrete_id?: number | string
}): GraphNode {
  const pins = [
    ...body.metadata.inputs.map((p) => client_pin_body(p)),
    ...body.metadata.outputs.map((p) => client_pin_body(p)),
    ...(body.metadata.flows ?? []).map((p) => client_pin_body(p))
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
      nodeId: Number(body.concrete_id ?? body.metadata.concreteId)
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
  if (body.metadata.contextDeclaration) {
    node.contextDeclaration = body.metadata.contextDeclaration
  }
  return node
}

export { node_connect_from, node_connect_to }
