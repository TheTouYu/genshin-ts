import type { CompositeDefIR, NextConnection, ServerNode } from '../../runtime/IR.js'
import {
  NodeGraph_Id_Class,
  NodeGraph_Id_Kind,
  NodePin_Index_Kind,
  NodeProperty_Type,
  VarBase_Class,
  VarType,
  type NodePin
} from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'

/**
 * Composite call lowerer is a pure Composite boundary step.
 *
 * `__composite_call__` is a synthetic SysGraph marker (ADR-009). It never enters the
 * ordinary vendor Graph path. This module owns:
 * - child CompositeDef identity (generic/concrete nodeId = child definition id)
 * - sparse declaration-index InParam materialization
 * - capture-input classification (skip physical pin; compositePins routes it)
 * - literal / connection input classification
 * - OutFlow physical pins + child outflow `compositePinIndex`
 *
 * Ordinary lowerers must not invent call pin schema or sparse index rules.
 */

export const COMPOSITE_CALL_NODE_TYPE = '__composite_call__' as const

export type CompositeCallArg = {
  type?: string
  value?: unknown
  capture?: boolean
  compositeInputIndex?: number
}

export type CompositeCallDataConnection = {
  nodeId: number
  pin: NodePin
  upstreamNodeId: number
  upstreamPinIndex: number
}

export type CompositeCallIdentity = {
  isCompositeCall: true
  compositeId: number
  calledDef: CompositeDefIR | undefined
  /** GIA generic/concrete nodeId for the SysGraph marker. */
  nodeId: number
  genericId: {
    class: number
    type: number
    /** Always SysGraph for synthetic composite calls (ADR-009). */
    kind: number
    nodeId: number
  }
}

export type CompositeCallPinBuildInput = {
  node: ServerNode
  calledDef: CompositeDefIR
  /** Impl flow edges keyed by IR node id; used only for this call's OutFlow indexes. */
  implEdges: Readonly<Record<number, readonly NextConnection[]>>
  /**
   * InFlow indexes required by outer compositePins routes that target this call.
   * A synthetic call is an impl entry target only through this explicit boundary route.
   */
  requiredInflowIndexes?: ReadonlySet<number>
  /**
   * OutFlow indexes required by outer compositePins routes that target this call
   * (e.g. nested multi-outflow). Merged with edges that leave the call node.
   */
  requiredOutflowIndexes?: ReadonlySet<number>
}

export type CompositeCallPinBuildOutput = {
  pins: NodePin[]
  dataConns: CompositeCallDataConnection[]
  /**
   * Physical InParam indexes that were materialised. Sparse declaration indexes are
   * preserved; capture inputs are intentionally absent.
   */
  physicalInputIndexes: number[]
  /** Capture-marked call args that must not receive physical InParam pins. */
  captureInputIndexes: number[]
}

export type CompositeCallFlowConnection = {
  fromId: number
  toId: number
  fromIndex: number
}

/**
 * Stable contract surface for tests and Phase 4 audits.
 */
export const COMPOSITE_CALL_LOWERER_CONTRACT = {
  nodeType: COMPOSITE_CALL_NODE_TYPE,
  graphKind: NodeGraph_Id_Kind.SysGraph,
  /**
   * Call IR args layout: args[0] = child composite id literal; args[1..] = bindings.
   * Binding physical pin index is `arg.compositeInputIndex ?? (argSlot - 1)`.
   */
  idArgIndex: 0,
  firstBindingArgIndex: 1,
  remainingArgFields: ['capture', 'compositeInputIndex'] as const
}

type ImplEdge = number | { node_id: number; source_index?: number; target_index?: number }

function getEdgeSourceIndex(edge: ImplEdge): number {
  return typeof edge === 'number' ? 0 : (edge.source_index ?? 0)
}

function groupEdgesBySourceIndex(edges: readonly ImplEdge[]): Map<number, ImplEdge[]> {
  const bySourceIndex = new Map<number, ImplEdge[]>()
  for (const edge of edges) {
    const sourceIndex = getEdgeSourceIndex(edge)
    const group = bySourceIndex.get(sourceIndex) ?? []
    group.push(edge)
    bySourceIndex.set(sourceIndex, group)
  }
  return bySourceIndex
}

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
    default:
      if (argType.endsWith('_list')) {
        return argVarBaseClass(argType.slice(0, -5))
      }
      return 0
  }
}

function argVarType(argType: string): number {
  switch (argType) {
    case 'bool': return VarType.Boolean
    case 'int': return VarType.Integer
    case 'float': return VarType.Float
    case 'str': return VarType.String
    case 'vec3': return VarType.Vector
    case 'local_variable': return VarType.LocalVariable
    case 'guid': return VarType.GUID
    case 'entity': return VarType.Entity
    case 'faction': return VarType.Faction
    case 'prefab_id': return VarType.Prefab
    case 'config_id': return VarType.Configuration
    default:
      if (argType.endsWith('_list')) {
        const elementType = argType.slice(0, -5)
        switch (elementType) {
          case 'int': return VarType.IntegerList
          case 'bool': return VarType.BooleanList
          case 'float': return VarType.FloatList
          case 'str': return VarType.StringList
          case 'vec3': return VarType.VectorList
          case 'guid': return VarType.GUIDList
          case 'entity': return VarType.EntityList
          case 'prefab_id': return VarType.PrefabList
          case 'config_id': return VarType.ConfigurationList
          default: return 0
        }
      }
      return 0
  }
}

function makeVarBaseValue(
  varClass: number,
  varType: number,
  setVal: boolean
): Record<string, unknown> {
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
    return {
      class: varClass,
      alreadySetVal: setVal,
      itemType,
      bVector: { val: { x: 0, y: 0, z: 0 } }
    }
  }
  if (varClass === VarBase_Class.EnumBase) {
    return { class: varClass, alreadySetVal: setVal, itemType, bEnum: { val: 0 } }
  }
  if (varClass === VarBase_Class.IdBase) {
    return { class: varClass, alreadySetVal: setVal, itemType, bId: { val: 0 } }
  }
  return { class: varClass, alreadySetVal: setVal, itemType }
}

/** Connection placeholder pin for a composite-call InParam. No ordinary concrete wrapping. */
function buildCallConnPin(pinIndex: number, typeName: string): NodePin {
  const varType = argVarType(typeName)
  const varClass = argVarBaseClass(typeName)
  return {
    i1: { kind: NodePin_Index_Kind.InParam, index: pinIndex },
    i2: { kind: NodePin_Index_Kind.InParam, index: pinIndex },
    value: makeVarBaseValue(varClass, varType, false) as any,
    type: varType
  } as NodePin
}

/** Literal pin for a composite-call InParam. No ordinary concrete wrapping. */
function buildCallLiteralPin(pinIndex: number, argType: string, value: unknown): NodePin {
  const varType = argVarType(argType)
  const varClass = argVarBaseClass(argType)
  const itemType = { classBase: 1, type_server: { type: varType, kind: 0 } }

  let pinValue: Record<string, unknown> = {}
  if (varClass === VarBase_Class.IntBase) {
    pinValue = { class: varClass, alreadySetVal: true, itemType, bInt: { val: Number(value) } }
  } else if (varClass === VarBase_Class.FloatBase) {
    pinValue = { class: varClass, alreadySetVal: true, itemType, bFloat: { val: Number(value) } }
  } else if (varClass === VarBase_Class.EnumBase) {
    pinValue = {
      class: varClass,
      alreadySetVal: true,
      itemType,
      bEnum: { val: Number(Boolean(value)) }
    }
  } else if (varClass === VarBase_Class.StringBase) {
    pinValue = { class: varClass, alreadySetVal: true, itemType, bString: { val: String(value) } }
  } else if (varClass === VarBase_Class.VectorBase) {
    const vector = Array.isArray(value) ? value : [0, 0, 0]
    pinValue = {
      class: varClass,
      alreadySetVal: true,
      itemType,
      bVector: {
        val: {
          x: Number(vector[0]),
          y: Number(vector[1]),
          z: Number(vector[2])
        }
      }
    }
  } else if (varClass === VarBase_Class.IdBase) {
    // prefab_id / config_id / guid / entity / faction literals need bId + alreadySetVal.
    pinValue = {
      class: varClass,
      alreadySetVal: true,
      itemType,
      bId: { val: Number(value) }
    }
  }

  return {
    i1: { kind: NodePin_Index_Kind.InParam, index: pinIndex },
    i2: { kind: NodePin_Index_Kind.InParam, index: pinIndex },
    value: pinValue as any,
    type: varType
  } as NodePin
}

export function isCompositeCallNode(
  node: Pick<ServerNode, 'type'> | undefined | null
): boolean {
  return node?.type === COMPOSITE_CALL_NODE_TYPE
}

/**
 * Read child composite id from call args[0]. Returns undefined when the call IR is incomplete.
 */
export function readCompositeCallId(node: ServerNode): number | undefined {
  if (!isCompositeCallNode(node)) return undefined
  const arg0 = (node.args as CompositeCallArg[] | undefined)?.[
    COMPOSITE_CALL_LOWERER_CONTRACT.idArgIndex
  ]
  if (!arg0 || arg0.type === 'conn') return undefined
  const compositeId = Number(arg0.value)
  return compositeId ? compositeId : undefined
}

/**
 * Resolve SysGraph identity for a `__composite_call__` node.
 * Returns undefined for non-call nodes so callers can keep ordinary resolution.
 */
export function resolveCompositeCallIdentity(
  node: ServerNode,
  compositeDefById?: ReadonlyMap<number, CompositeDefIR>
): CompositeCallIdentity | undefined {
  if (!isCompositeCallNode(node)) return undefined
  const compositeId = readCompositeCallId(node)
  if (compositeId === undefined) return undefined
  const calledDef = compositeDefById?.get(compositeId)
  return {
    isCompositeCall: true,
    compositeId,
    calledDef,
    nodeId: compositeId,
    genericId: {
      class: NodeGraph_Id_Class.SystemDefined,
      type: NodeProperty_Type.Server,
      kind: NodeGraph_Id_Kind.SysGraph,
      nodeId: compositeId
    }
  }
}

/**
 * Reject execution edges that a composite call cannot encode because its definition omitted
 * the corresponding OutFlow declaration/binding. Without this check the editor silently shows
 * a broken white execution wire while data wires can remain connected.
 */
export function validateCompositeCallOutflowConnections(
  node: ServerNode,
  calledDef: CompositeDefIR,
  flowConnections: readonly CompositeCallFlowConnection[]
): void {
  if (!isCompositeCallNode(node) || calledDef.inflows.length === 0) return

  const outgoing = flowConnections.filter((connection) => connection.fromId === node.id)
  if (outgoing.length === 0) return

  const missingIndexes = [
    ...new Set(
      outgoing
        .map((connection) => connection.fromIndex)
        .filter((index) => calledDef.outflows[index] === undefined)
    )
  ].sort((a, b) => a - b)
  if (missingIndexes.length === 0) return

  const downstreamIds = [...new Set(outgoing.map((connection) => connection.toId))]
  throw new Error(
    `[error] GSTS-COMPOSITE-MISSING-OUTFLOW: execution flow after composite ` +
      `"${calledDef.name}" (id=${calledDef.id}, callNode=${node.id}) cannot be connected: ` +
      `OutFlow[${missingIndexes.join(', ')}] is not declared; downstream node(s): ` +
      `${downstreamIds.join(', ')}.\n` +
      `Fix the source syntax: add the required entry to defineComposite(..., { ` +
      `outflows: ['完成'], ... }), then bind the internal exit in build() with ` +
      `f.outflow('完成', sourceNode, sourceOutflowIndex). Do not only add the declaration: ` +
      `the f.outflow(...) binding is required. If this composite is intentionally terminal, ` +
      `remove or move the statements that currently follow its call.`
  )
}

/**
 * Classify one call binding arg into capture / connection / literal source.
 * Physical pin index always uses sparse declaration index (ADR-010).
 */
export function classifyCompositeCallBinding(
  arg: CompositeCallArg | undefined,
  argSlot: number
): {
  kind: 'missing' | 'capture' | 'connection' | 'literal'
  inputIndex: number
  typeName: string
  value?: unknown
  upstream?: { node_id: number; index: number }
} {
  const inputIndex =
    arg?.compositeInputIndex ??
    argSlot - COMPOSITE_CALL_LOWERER_CONTRACT.firstBindingArgIndex
  if (!arg) {
    return { kind: 'missing', inputIndex, typeName: 'int' }
  }
  if (arg.capture === true) {
    return {
      kind: 'capture',
      inputIndex,
      typeName: (arg.type as string | undefined) ?? 'int'
    }
  }
  if (arg.type === 'conn') {
    const conn = arg.value as { node_id: number; index: number }
    return {
      kind: 'connection',
      inputIndex,
      typeName: (arg.type as string | undefined) ?? 'int',
      upstream: conn
    }
  }
  return {
    kind: 'literal',
    inputIndex,
    typeName: (arg.type as string | undefined) ?? 'int',
    value: arg.value
  }
}

/**
 * Build physical pins + deferred data connections for one synthetic call node.
 *
 * Capture inputs are skipped (compositePins overlay owns them). Sparse named inputs keep
 * their declaration `compositeInputIndex` and child definition `compositePinIndex`.
 */
export function buildCompositeCallPins(
  input: CompositeCallPinBuildInput
): CompositeCallPinBuildOutput {
  const pins: NodePin[] = []
  const dataConns: CompositeCallDataConnection[] = []
  const physicalInputIndexes: number[] = []
  const captureInputIndexes: number[] = []
  const { node, calledDef } = input
  const callArgs = (node.args as CompositeCallArg[] | undefined) ?? []

  for (let argSlot = COMPOSITE_CALL_LOWERER_CONTRACT.firstBindingArgIndex; argSlot < callArgs.length; argSlot++) {
    const arg = callArgs[argSlot]
    const classified = classifyCompositeCallBinding(arg, argSlot)
    if (classified.kind === 'missing') continue
    if (classified.kind === 'capture') {
      captureInputIndexes.push(classified.inputIndex)
      continue
    }

    let compositePinIndex: number | undefined
    let typeName = classified.typeName
    if (classified.inputIndex < calledDef.inputs.length) {
      compositePinIndex = calledDef.inputs[classified.inputIndex].pinIndex
      typeName = calledDef.inputs[classified.inputIndex].type as string
    }

    const pin = (
      classified.kind === 'connection'
        ? buildCallConnPin(classified.inputIndex, typeName)
        : buildCallLiteralPin(classified.inputIndex, typeName, classified.value)
    ) as NodePin & { compositePinIndex?: number }
    if (compositePinIndex !== undefined) pin.compositePinIndex = compositePinIndex
    pins.push(pin)
    physicalInputIndexes.push(classified.inputIndex)

    if (classified.kind === 'connection' && classified.upstream) {
      dataConns.push({
        nodeId: node.id,
        pin,
        upstreamNodeId: classified.upstream.node_id,
        upstreamPinIndex: classified.upstream.index
      })
    }
  }

  for (const inflowIndex of [...(input.requiredInflowIndexes ?? [])].sort((a, b) => a - b)) {
    const pin = {
      i1: { kind: NodePin_Index_Kind.InFlow, index: inflowIndex },
      i2: { kind: NodePin_Index_Kind.InFlow, index: inflowIndex },
      type: 0,
      value: undefined as any
    } as unknown as NodePin & { compositePinIndex?: number }
    const compositePinIndex = calledDef.inflows[inflowIndex]?.pinIndex
    if (compositePinIndex !== undefined) pin.compositePinIndex = compositePinIndex
    pins.push(pin)
  }

  for (let outputIndex = 0; outputIndex < calledDef.outputs.length; outputIndex++) {
    const output = calledDef.outputs[outputIndex]
    pins.push({
      i1: { kind: NodePin_Index_Kind.OutParam, index: outputIndex },
      i2: { kind: NodePin_Index_Kind.OutParam, index: outputIndex },
      value: makeVarBaseValue(
        argVarBaseClass(output.type as string),
        argVarType(output.type as string),
        false
      ) as any,
      type: argVarType(output.type as string)
    } as NodePin)
  }

  const outflowIndexes = new Set<number>(input.requiredOutflowIndexes)
  for (const [sourceIndex] of groupEdgesBySourceIndex(input.implEdges[node.id] ?? [])) {
    outflowIndexes.add(sourceIndex)
  }
  for (const sourceIndex of [...outflowIndexes].sort((a, b) => a - b)) {
    const pin = {
      i1: { kind: NodePin_Index_Kind.OutFlow, index: sourceIndex },
      i2: { kind: NodePin_Index_Kind.OutFlow, index: sourceIndex },
      type: 0,
      value: undefined as any
    } as unknown as NodePin & { compositePinIndex?: number }
    const compositePinIndex = calledDef.outflows[sourceIndex]?.pinIndex
    if (compositePinIndex !== undefined) pin.compositePinIndex = compositePinIndex
    pins.push(pin)
  }

  return {
    pins,
    dataConns,
    physicalInputIndexes,
    captureInputIndexes
  }
}

/**
 * Collect unique child composite definition ids referenced by call markers.
 * Used for impl GraphUnit `relatedIds`.
 */
export function collectCalledCompositeIds(
  implNodes: readonly ServerNode[]
): number[] {
  const ids: number[] = []
  const seen = new Set<number>()
  for (const node of implNodes) {
    const compositeId = readCompositeCallId(node)
    if (compositeId === undefined || seen.has(compositeId)) continue
    seen.add(compositeId)
    ids.push(compositeId)
  }
  return ids
}
