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
  type NodeConnection,
  type NodePin,
  type Root,
  type VarBase
} from '../protobuf/gia.proto.js'
import { graph_body } from './basic.js'

export function client_graph_body(body: {
  uid: number
  graph_id: number
  graph_name: string
  graphType: number
  graphWhich: number
  modeFlag?: number
  evaluation_interval?: number
  related_graph_ids?: number[]
  nodes: GraphNode[]
}): Root {
  const root = graph_body({
    uid: body.uid,
    graph_id: body.graph_id,
    graph_name: body.graph_name,
    nodes: body.nodes,
    mode: 'server',
    modeFlag: body.modeFlag
  })
  root.graph.id = {
    class: GraphUnit_Id_Class.Node,
    type: GraphUnit_Id_Type.ClientGraph,
    id: body.graph_id
  }
  root.graph.relatedIds = (body.related_graph_ids ?? []).map((id) => ({
    class: GraphUnit_Id_Class.Node,
    type: GraphUnit_Id_Type.ClientGraph,
    id
  }))
  root.graph.which = body.graphWhich
  root.graph.graph!.inner.graph.id = {
    class: NodeGraph_Id_Class.UserDefined,
    type: body.graphType,
    kind: NodeGraph_Id_Kind.NodeGraph,
    id: body.graph_id
  }
  root.graph.graph!.inner.graph.entrySlotIndex = 1
  if (body.evaluation_interval !== undefined) {
    root.graph.graph!.inner.graph.evaluationInterval = body.evaluation_interval
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
 * field observed in _value_shapes.json). config_id/prefab_id literals are
 * plain bId payloads, proven by the dynamic signal receive node in
 * 结构采样_数据类型转换_拼装列表_信号_射线_攻击盒.gia (pins t18/t19 with bId vals).
 */
const LITERAL_PROVEN_CLIENT_TYPES = new Set([3, 5, 7, 9, 11, 13, 14, 16, 18, 19])

/** list client type -> element client type, all observed as ArrayBase */
const LIST_ELEMENT_CLIENT_TYPE: Record<number, number> = {
  2: 1,
  4: 3,
  6: 5,
  8: 7,
  10: 9,
  12: 11,
  15: 14,
  17: 13,
  20: 18,
  21: 19,
  25: 16
}
const LIST_CLIENT_TYPES = new Set(Object.keys(LIST_ELEMENT_CLIENT_TYPE).map(Number))

/** reflective indexOfConcrete for data_type_conversion pins (round-2 evidence) */
export const CLIENT_REFLECT_IOC_BY_TYPE: Record<number, number> = {
  5: 0, // bool
  3: 1, // int
  7: 2, // float
  14: 3, // guid
  1: 4, // entity
  11: 5, // vec3
  16: 6, // faction
  9: 3 // str (output)
}

/** client types whose pins exist but never carry literal values in samples */
const NEVER_LITERAL_CLIENT_TYPES = new Set([1]) // entity

function client_item_type(clientVarType: number) {
  return {
    classBase: VarBase_ItemType_ClassBase.Client,
    type_client: { type: clientVarType }
  }
}

/**
 * typed-but-unset pin value, matching sample pins with alreadySetVal=false.
 * Editor defaults (e.g. operator-selector enums carrying bEnum val 300/301)
 * are written as payloads while keeping alreadySetVal=false, exactly as
 * observed in samples.
 */
export function client_value_base(clientVarType: number, defaultValue?: unknown): VarBase {
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
  if (defaultValue !== undefined && scalarClass !== undefined) {
    write_scalar_payload(value, scalarClass, defaultValue)
  }
  return value
}

function write_scalar_payload(value: VarBase, scalarClass: number, literal: unknown) {
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
}

function list_elem_client_type(listClientType: number): number {
  return LIST_ELEMENT_CLIENT_TYPE[listClientType] ?? listClientType
}

/** non-empty list literal: ArrayBase with bArray.entries (round-2 evidence) */
export function client_list_literal_value(clientVarType: number, elements: unknown[]): VarBase {
  if (!LIST_CLIENT_TYPES.has(clientVarType)) {
    throw new Error(
      `[CLIENT_VALUE_TYPE_UNAVAILABLE] list literal encoding for client type ${clientVarType} has no sample evidence`
    )
  }
  const elemType = list_elem_client_type(clientVarType)
  const entries = elements.map((el) => client_literal_value(elemType, el))
  return {
    class: VarBase_Class.ArrayBase,
    alreadySetVal: true,
    itemType: client_item_type(clientVarType),
    bArray: { entries }
  }
}

/**
 * t18/t19 ID value with the editor's fixed inline-selector metadata.
 *
 * The selected config/prefab ID belongs in bId. clientInlineBinding describes
 * the editor selector itself and stays constant when the selected ID changes.
 */
export function client_inline_var_value(
  clientVarType: 18 | 19,
  literal: number,
  alreadySetVal = true
): VarBase {
  const inlineBinding =
    clientVarType === 19
      ? { typeTag: 3, bindingInt: { val: 50000 } }
      : { typeTag: 12, bindingEnum: { val: 1 } }
  return {
    class: VarBase_Class.IdBase,
    alreadySetVal,
    itemType: client_item_type(clientVarType),
    bId: { val: Number(literal) },
    clientInlineBinding: inlineBinding
  }
}

/** signal name literal on the client_exec (kind 5) str pin */
export function client_signal_name_value(name: string): VarBase {
  return {
    class: VarBase_Class.StringBase,
    alreadySetVal: true,
    itemType: client_item_type(9),
    bString: { val: name }
  }
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
    write_scalar_payload(value, scalarClass, literal)
    return value
  }
  if (LIST_CLIENT_TYPES.has(clientVarType) && Array.isArray(literal)) {
    return client_list_literal_value(clientVarType, literal)
  }
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

/**
 * Client dictionary pins carry their key/value types in three places:
 * ClientContainerBinding, the MapBase item type, and ConcreteBase.structs.
 * Local/custom variable containers use a different valueClientType marker
 * from ordinary dictionary node pins.
 */
export function client_dictionary_wrapped_value(
  indexOfConcrete: number,
  keyClientVarType: number,
  valueClientVarType: number,
  variableContainer = false
): VarBase {
  return {
    class: VarBase_Class.ConcreteBase,
    alreadySetVal: true,
    bConcreteValue: {
      indexOfConcrete: indexOfConcrete === 0 ? undefined : indexOfConcrete,
      value: {
        class: VarBase_Class.MapBase,
        alreadySetVal: false,
        itemType: {
          classBase: VarBase_ItemType_ClassBase.Client,
          type_client: {
            type: 24,
            implKind: 2,
            containerBinding: {
              mode: keyClientVarType,
              kind: valueClientVarType,
              keyType: 1,
              valueType: 2
            }
          }
        },
        bMap: { mapPairs: [] }
      },
      structs: {
        class: 1,
        inner: {
          wrapper: {
            class: VarBase_Class.MapBase,
            mapPair: {
              key: keyClientVarType,
              value: valueClientVarType,
              keyClientType: 1,
              valueClientType: variableContainer ? 1 : 2
            }
          }
        }
      }
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
      value = client_value_base(pin.clientVarType ?? 0, pin.defaultValue)
    }
  } else if (
    (pin.kind === 'client_exec' || pin.kind === 'client_signal') &&
    pin.clientVarType !== undefined
  ) {
    // corpus: typed client_exec pins carry an unset value with zero payload
    value = client_value_base(pin.clientVarType, pin.clientVarType === 9 ? '' : 0)
  }
  return {
    i1: { kind, index: pin.index },
    i2: { kind, index: pin.i2Index ?? pin.index },
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
    ...body.metadata.inputs.map((p) => {
      const pin = client_pin_body(p)
      if (
        body.metadata.specialKind === 'inline_var_type_hint' &&
        (p.clientVarType === 18 || p.clientVarType === 19)
      ) {
        pin.value = client_inline_var_value(p.clientVarType, Number(p.defaultValue ?? 0), false)
      }
      return pin
    }),
    ...body.metadata.outputs.map((p) => client_pin_body(p)),
    ...(body.metadata.flows ?? []).map((p) => client_pin_body(p))
  ]
  for (const pin of pins) {
    if (pin.i1.kind === NodePin_Index_Kind.ClientExecNode) {
      pin.clientExecNode = {
        kind: NodePin_Index_Kind.ClientExecNode,
        index: 1,
        nodeId: { id: body.metadata.genericId }
      }
    } else if (pin.i1.kind === NodePin_Index_Kind.ClientSignal) {
      pin.clientExecNode = {
        kind: NodePin_Index_Kind.ClientSignal,
        index: 1
      }
    }
  }
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

// Client NodeConnection: connect carries the peer pin's i1, connect2 its i2
// (round-3 wire census: connect2 mirrors the peer i2 on all remapped nodes).

export function client_node_connect_from(
  from: number,
  from_index: number,
  from_index2: number = from_index
): NodeConnection {
  return {
    id: from,
    connect: { kind: NodePin_Index_Kind.OutParam, index: from_index },
    connect2: { kind: NodePin_Index_Kind.OutParam, index: from_index2 }
  }
}

export function client_node_connect_to(
  to: number,
  to_index: number,
  to_index2: number = to_index
): NodeConnection {
  return {
    id: to,
    connect: { kind: NodePin_Index_Kind.InFlow, index: to_index },
    connect2: { kind: NodePin_Index_Kind.InFlow, index: to_index2 }
  }
}
