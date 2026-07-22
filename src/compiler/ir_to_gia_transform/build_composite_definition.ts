import type {
  CompositeDefIR,
  ControlFlowDef,
  ParamFlowDef
} from '../../runtime/IR.js'
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
  type CompositeDef,
  type GraphUnit
} from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'

/**
 * Definition interface builder is a pure Composite boundary step.
 *
 * It owns CompositeDef surface encoding only:
 * - SysGraph identity + UserDefined CompositeGraph relation (`graphId` / relatedIds)
 * - ParameterFlow inputs/outputs (class/type1/type2, bool enum metadata, pinIndex)
 * - ControlFlow inflows/outflows (index kind + pinIndex)
 * - definition GraphUnit wrapper order (CompositeDef before impl graph)
 *
 * Ordinary lowerers, call lowerer, capture normalization and compositePins overlay are
 * out of scope. This module must not invent ordinary node/edge semantics.
 */

/** Current gsts impl GraphUnit ids are `CompositeDef.id + 10000`. */
export const DEFAULT_IMPL_GRAPH_ID_OFFSET = 10000

/** Observed constant on encoded CompositeDef.xxx across current real samples. */
export const COMPOSITE_DEF_XXX = 6

export type CompositeDefinitionInterfaceInput = {
  /** Full or partial CompositeDefIR; only interface fields are consumed. */
  def: Pick<
    CompositeDefIR,
    'id' | 'name' | 'inflows' | 'outflows' | 'inputs' | 'outputs'
  >
  /**
   * Encoded UserDefined CompositeGraph id referenced by CompositeDef.id.graphId and
   * definition GraphUnit.relatedIds. Defaults to `def.id + 10000`.
   */
  implGraphId?: number
}

export type CompositeDefinitionParameterType = {
  class: VarBase_Class
  type1: VarType
  type2: VarType
  /** Present only for bool ParameterFlow (real GIA enum metadata; field 101). */
  enumId?: { val: number }
  /**
   * Always null on current definition ParameterFlow encodings.
   * Vendor types declare an object, but real/current gsts emit JSON null.
   */
  valueId: null
}

export type CompositeDefinitionInterfaceOutput = {
  implGraphId: number
  /** Encoded CompositeDef (definition + interface). */
  compositeDef: CompositeDef
  /**
   * GraphUnit wrapping CompositeDef.
   * `relatedIds[0].id` always equals `implGraphId`.
   */
  definitionGraphUnit: GraphUnit
}

/**
 * Stable contract surface for tests and Phase 4 audits.
 */
export const COMPOSITE_DEFINITION_INTERFACE_CONTRACT = {
  implGraphIdOffset: DEFAULT_IMPL_GRAPH_ID_OFFSET,
  compositeDefXxx: COMPOSITE_DEF_XXX,
  definitionGraphUnitWhich: GraphUnit_Which.CompositeGraph,
  /**
   * Bool ParameterFlow must carry enum metadata `{ val: 1 }` (R20 / real GIA).
   * Non-bool types must not write `enumId`.
   */
  boolEnumIdVal: 1,
  /**
   * Definition GraphUnit is emitted before the impl NodeGraph unit so accessory
   * order matches reference GIA samples.
   */
  accessoryOrder: 'definition-before-impl' as const
}

export function resolveImplGraphId(
  compositeDefId: number,
  override?: number
): number {
  return override ?? compositeDefId + DEFAULT_IMPL_GRAPH_ID_OFFSET
}

/**
 * Encode one CompositeDef ParameterFlow type, including bool enum metadata.
 *
 * Evidence scope: current real GIA / R20 covers bool `enumId.val = 1` only.
 * Other enums, signal payloads and ordinary pin wrappers are not claimed here.
 */
export function buildCompositeParameterType(
  type: string
): CompositeDefinitionParameterType {
  const typeId = typeIdFromValueType(type)
  return {
    class: typeClassFromValueType(type),
    type1: typeId,
    type2: typeId,
    ...(type === 'bool' ? { enumId: { val: COMPOSITE_DEFINITION_INTERFACE_CONTRACT.boolEnumIdVal } } : {}),
    valueId: null
  }
}

function buildControlFlow(
  flow: ControlFlowDef,
  kind: NodePin_Index_Kind
) {
  return {
    name: flow.name,
    visible: flow.visible,
    index: { kind, index: flow.index },
    description: '',
    pinIndex: flow.pinIndex
  }
}

function buildParameterFlow(
  param: ParamFlowDef,
  kind: NodePin_Index_Kind
) {
  return {
    name: param.name,
    visible: param.visible,
    index: { kind, index: param.index },
    type: buildCompositeParameterType(param.type as string),
    pinIndex: param.pinIndex
  }
}

/**
 * Build the encoded CompositeDef interface and its definition GraphUnit.
 *
 * Does not materialize the impl NodeGraph, compositePins, ordinary nodes, or call pins.
 */
export function buildCompositeDefinitionInterface(
  input: CompositeDefinitionInterfaceInput
): CompositeDefinitionInterfaceOutput {
  const { def } = input
  const implGraphId = resolveImplGraphId(def.id, input.implGraphId)

  // valueId remains JSON null (previous inline encoder / real GIA). Vendor types model an
  // object, so ParameterFlow arrays are cast after construction without changing runtime shape.
  const compositeDef = {
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
    inflows: def.inflows.map((flow) => buildControlFlow(flow, NodePin_Index_Kind.InFlow)),
    outflows: def.outflows.map((flow) => buildControlFlow(flow, NodePin_Index_Kind.OutFlow)),
    inputs: def.inputs.map((param) => buildParameterFlow(param, NodePin_Index_Kind.InParam)),
    outputs: def.outputs.map((param) => buildParameterFlow(param, NodePin_Index_Kind.OutParam)),
    type: {
      kind: CompositeDef_Type_Kind.Composite
    },
    name: def.name,
    description: '',
    xxx: COMPOSITE_DEF_XXX
  } as unknown as CompositeDef

  const definitionGraphUnit: GraphUnit = {
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

  return {
    implGraphId,
    compositeDef,
    definitionGraphUnit
  }
}

function typeClassFromValueType(type: string): VarBase_Class {
  switch (type) {
    case 'int': return VarBase_Class.IntBase
    case 'float': return VarBase_Class.FloatBase
    case 'bool': return VarBase_Class.EnumBase
    case 'str': return VarBase_Class.StringBase
    case 'vec3': return VarBase_Class.VectorBase
    // Ordinary CompositeDef entity parameters use the reference GIA's unknown/base
    // class with an explicit Entity type id. This differs from physical IdBase pins.
    case 'entity':
      return 0 as VarBase_Class
    case 'guid':
    case 'faction':
    case 'prefab_id':
    case 'config_id':
      return VarBase_Class.IdBase
    default:
      if (type.endsWith('_list')) {
        const elementType = type.slice(0, -5)
        return typeClassFromValueType(elementType)
      }
      // Unknown scalar families keep class 0; matches previous inline encoder.
      return 0 as VarBase_Class
  }
}

function typeIdFromValueType(type: string): VarType {
  switch (type) {
    case 'bool': return VarType.Boolean
    case 'int': return VarType.Integer
    case 'float': return VarType.Float
    case 'str': return VarType.String
    case 'vec3': return VarType.Vector
    case 'local_variable': return VarType.LocalVariable
    case 'guid': return VarType.GUID
    case 'entity': return VarType.Entity
    case 'prefab_id': return VarType.Prefab
    case 'config_id': return VarType.Configuration
    case 'faction': return VarType.Faction
    default:
      if (type.endsWith('_list')) {
        const elementType = type.slice(0, -5)
        return typeIdFromValueType(elementType)
      }
      return 0 as VarType
  }
}
