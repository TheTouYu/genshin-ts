// @ts-nocheck thirdparty

import type { CompositeDefIR } from '../../runtime/IR.js'
import {
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
  type GraphNode,
  type GraphUnit,
  type NodeGraph,
  type NodePin
} from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'
import { Graph, Node } from '../gia_vendor.js'
import { buildCompositeDefinitionInterface } from './build_composite_definition.js'
import { computeCompositeImplLayout } from './build_composite_layout.js'
import { assertCompositePinsIntegrity, buildCompositePinsOverlay } from './build_composite_pins.js'
import { patchEncodedSignalNodes } from './build_signal_definition.js'
import { COMPOSITE_LEGACY_INVENTORY_CONTRACT } from './legacy_ordinary_inventory.js'
import {
  buildCompositeCallPins,
  collectCalledCompositeIds,
  COMPOSITE_CALL_NODE_TYPE,
  isCompositeCallNode,
  resolveCompositeCallIdentity
} from './lower_composite_call.js'
import { getNodeIdLowerMap, SPECIAL_NODE_IDS, SPECIAL_NODE_MAPPINGS } from './mappings.js'
import { COMPOSITE_CAPTURE_NODE_TYPE, normalizeCompositeCaptures } from './normalize_capture.js'
import {
  materializeOrdinaryGraphEdges,
  materializeSyntheticSourceDataEdges,
  splitSyntheticSourceDataEdges
} from './ordinary_graph_materializer.js'
import { createOrdinaryVendorNode, normalizeOrdinaryVendorPins } from './ordinary_node_factory.js'
import {
  isSharedPinHoleAdapterNodeType,
  PIN_HOLE_ADAPTER_CONTRACT,
  pinHoleInputPinIndex,
  remapPinHoleInputIndex,
  SHARED_PIN_HOLE_ADAPTER_NODE_TYPES
} from './pin_hole_adapter.js'
import {
  resolveArgumentTypes,
  resolveNodeIdentity,
  usesSharedOrdinaryConcreteIdentity,
  usesSharedVariantResolution
} from './resolved_node.js'
import { ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT } from './root_impl_ordinary_coverage_matrix.js'
import { ROOT_ORDINARY_CAPABILITY_CONTRACT } from './root_ordinary_capability_inventory.js'
import {
  isAssemblySpecialArgNodeType,
  isSharedSpecialArgAdapterNodeType,
  remapSpecialArgInputIndex,
  SHARED_SPECIAL_ARG_ADAPTER_NODE_TYPES,
  SPECIAL_ARG_ADAPTER_CONTRACT,
  specialArgInputPinIndex
} from './special_arg_adapter.js'
import { isSharedVendorImplGraphEnabled, STAGE3_BACKEND_CONTRACT } from './stage3_backend.js'

/**
 * Stable orchestration contract for Phase 4 exit audits.
 *
 * `composite.ts` wires boundary modules and the ordinary impl backend. It must not
 * re-implement capture/call/definition/compositePins/layout builders. Ordinary pin
 * builders remain free of `__composite_call__` / `__composite_capture__` branches;
 * arg-level `capture: true` normally skips physical InParam materialization. A reflective
 * DTC targeted by compositePins keeps the physical pin required by real editor GIA.
 *
 * Phase 5 inventory of remaining ordinary handwritten surfaces lives in
 * `legacy_ordinary_inventory.ts` and is referenced here without deleting helpers.
 */
export const COMPOSITE_ORCHESTRATION_CONTRACT = {
  pipeline: [
    'normalize_capture',
    'resolve_ordinary_and_call',
    'layout',
    'materialize',
    'definition_interface',
    'composite_pins_overlay'
  ] as const,
  boundaryModules: {
    capture: 'normalize_capture.ts',
    call: 'lower_composite_call.ts',
    definition: 'build_composite_definition.ts',
    compositePins: 'build_composite_pins.ts',
    layout: 'build_composite_layout.ts'
  } as const,
  ordinaryPinBuilderForbiddenNodeTypes: [
    COMPOSITE_CAPTURE_NODE_TYPE,
    COMPOSITE_CALL_NODE_TYPE
  ] as const,
  /**
   * Arg-level capture markers normally skip physical InParam pins. Boundary DTC pins are
   * the real-GIA exception; this is not a second capture-node lowerer.
   */
  ordinaryArgCaptureSkip: true,
  boundaryDtcPhysicalPin: true,
  /** Default production backend uses shared vendor Graph; legacy remains an explicit fallback. */
  defaultVendorImplGraphGate: true,
  legacyOrdinaryBackendPresent: true,
  /** P5-W1: inventory/assert surface; does not delete legacy backend. */
  legacyInventory: COMPOSITE_LEGACY_INVENTORY_CONTRACT,
  /** P5-W2: shared vendor Graph is now the default; legacy remains an explicit fallback. */
  stage3Backend: STAGE3_BACKEND_CONTRACT,
  /** P5-W3: root ordinary capability inventory; does not delete legacy. */
  rootOrdinaryCapabilities: ROOT_ORDINARY_CAPABILITY_CONTRACT,
  /** P5-W6..W10: root→shared-beta ordinary coverage matrix (pin-hole W9, special-arg W10). */
  ordinaryCoverageMatrix: ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT,
  /** P5-W9: shared pin-hole adapter for all 9 named pin-hole node types. */
  pinHoleAdapter: PIN_HOLE_ADAPTER_CONTRACT,
  /** P5-W10: shared special-arg adapter for all 5 named special-arg node types. */
  specialArgAdapter: SPECIAL_ARG_ADAPTER_CONTRACT
} as const

export {
  COMPOSITE_LEGACY_INVENTORY_CONTRACT,
  listLegacyOrdinaryCallSiteIds,
  listLegacyOrdinaryHelperSymbols,
  findLegacyOrdinaryCallSite
} from './legacy_ordinary_inventory.js'

export {
  ROOT_ORDINARY_CAPABILITY_CONTRACT,
  ROOT_ORDINARY_CAPABILITIES,
  ROOT_SHARED_SCALAR_SAME_TYPE_BINARY_NODE_TYPES,
  ROOT_SHARED_RESIDUAL_SCALAR_NODE_TYPES,
  ROOT_SHARED_ENUMERATIONS_EQUAL_NODE_TYPES,
  ROOT_SHARED_VARIABLE_NODE_TYPES,
  ROOT_NAMED_PIN_HOLE_ADAPTER_NODE_TYPES,
  ROOT_NAMED_SPECIAL_ARG_ADAPTER_NODE_TYPES,
  ROOT_NAMED_TYPED_IDENTITY_ADAPTER_NODE_TYPES,
  ROOT_HIGH_RISK_PENDING_FAMILIES,
  listRootOrdinaryCapabilityIds,
  listRootOrdinaryCapabilitiesByCategory,
  findRootOrdinaryCapability,
  assertSharedVariantInventoryConsistency
} from './root_ordinary_capability_inventory.js'
export type {
  RootOrdinaryCapabilityCategory,
  RootOrdinaryCapabilityLayer,
  RootOrdinaryEvidenceClass,
  RootOrdinaryCapability
} from './root_ordinary_capability_inventory.js'

export {
  ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT,
  ORDINARY_COVERAGE_GRILLING_DECISIONS,
  SHARED_RESIDUAL_SCALAR_NODE_TYPES,
  SHARED_ENUMERATIONS_EQUAL_NODE_TYPES,
  RESIDUAL_CONCRETE_WRAPPED_NODE_TYPES,
  RESIDUAL_UNARY_SCALAR_NODE_TYPES,
  RESIDUAL_BINARY_SCALAR_NODE_TYPES,
  listStaticOrdinaryCoverageRows,
  classifyStaticCoverageStatuses,
  listOrdinaryCoverageRowIds,
  findOrdinaryCoverageRow,
  assertCoverageMatrixInvariants,
  summarizeOrdinaryCoverage
} from './root_impl_ordinary_coverage_matrix.js'
export type {
  OrdinaryCoverageStatus,
  OrdinaryCoverageProbeKind,
  OrdinaryCoverageRow,
  CoverageProbeSummary
} from './root_impl_ordinary_coverage_matrix.js'
// Encode probes live in root_impl_ordinary_coverage_probe.ts and import irToGia from
// index.ts; they are intentionally NOT re-exported here to avoid a cycle:
// index -> composite -> probe -> index.

export {
  PIN_HOLE_ADAPTER_CONTRACT,
  SHARED_PIN_HOLE_ADAPTER_NODE_TYPES,
  PIN_HOLE_SPECS,
  isSharedPinHoleAdapterNodeType,
  getPinHoleSpec,
  remapPinHoleInputIndex,
  pinHoleInputPinIndex,
  applyPinHoleLiteralArgs
} from './pin_hole_adapter.js'
export type { PinHoleSpec } from './pin_hole_adapter.js'

export {
  SPECIAL_ARG_ADAPTER_CONTRACT,
  SHARED_SPECIAL_ARG_ADAPTER_NODE_TYPES,
  isSharedSpecialArgAdapterNodeType,
  isAssemblySpecialArgNodeType,
  isSignalSpecialArgNodeType,
  remapSpecialArgInputIndex,
  specialArgInputPinIndex,
  applySpecialArgLiteralArgs,
  applyAssemblySpecialArgs,
  applyMultipleBranchesSpecialArgs,
  applySignalSpecialArgs,
  listSharedSpecialArgAdapterNodeTypes
} from './special_arg_adapter.js'
export type { SpecialArgApplyContext, SpecialArgTypeTag } from './special_arg_adapter.js'

export {
  STAGE3_BACKEND_CONTRACT,
  STAGE3_VENDOR_IMPL_GRAPH_ENV,
  STAGE3_SHARED_IMPL_BETA_CLI_FLAG,
  STAGE3_SHARED_IMPL_BETA_CONFIG_PATH,
  resolveStage3ImplBackend,
  applyStage3ImplBackendEnv,
  formatStage3BackendDiagnostic,
  isSharedVendorImplGraphEnabled
} from './stage3_backend.js'
export type {
  Stage3ImplBackend,
  Stage3BackendSource,
  Stage3BackendDecision,
  ResolveStage3ImplBackendInput
} from './stage3_backend.js'

/**
 * 将 CompositeDefIR 编码为 accessories 中的 GraphUnit（CompositeDef 和 impl NodeGraph 成对）
 */
export function buildCompositeAccessories(
  def: CompositeDefIR,
  compositeDefById?: Map<number, CompositeDefIR>
): GraphUnit[] {
  const accessories: GraphUnit[] = []

  // Capture normalization is a pure boundary step: filter IR capture placeholders,
  // drop capture-source edges, redirect InFlow routes, and fix nodeIndex mapping
  // before ordinary / call lowering. See normalize_capture.ts.
  const captureNormalized = normalizeCompositeCaptures({
    implNodes: def.implNodes,
    implEdges: def.implEdges,
    compositePins: def.compositePins
  })
  const implNodesForEncoding = captureNormalized.ordinaryNodes
  const nodeIndexMap = captureNormalized.nodeIndexMap
  const filteredEdges = captureNormalized.ordinaryEdges as Record<number, ImplEdge[]>
  // IR compositePins use logical argIndex. Pin-hole physical InParam indexes shift by
  // hole remap (e.g. activate_disable_pathfinding_obstacle entity IR0 → pin1). Align
  // boundary routes before ordinary materialization and compositePins overlay so
  // capture-filtered physical pins still match overlay innerPinIndex.
  const nodeTypeById = new Map(
    implNodesForEncoding.map((node: any) => [node.id, node.type as string])
  )
  const boundaryPins = captureNormalized.boundaryPins.map((pin) => {
    if (pin.innerPinKind !== 3) return pin
    const nodeType = nodeTypeById.get(pin.innerNodeId)
    if (!nodeType) return pin
    // assembly_list already encoded with +1 in composite_registry IR builder.
    // Other special-arg / pin-hole physical indexes still need shared remap.
    if (isAssemblySpecialArgNodeType(nodeType)) return pin
    if (isSharedPinHoleAdapterNodeType(nodeType)) {
      const physical = remapPinHoleInputIndex(nodeType, pin.innerPinIndex)
      return physical === pin.innerPinIndex ? pin : { ...pin, innerPinIndex: physical }
    }
    if (isSharedSpecialArgAdapterNodeType(nodeType)) {
      const physical = remapSpecialArgInputIndex(nodeType, pin.innerPinIndex)
      return physical === pin.innerPinIndex ? pin : { ...pin, innerPinIndex: physical }
    }
    return pin
  })

  // 从 compositePins 提取 OutParam 映射，供 impl 节点生成正确的 OutParam pin
  const implOutParamMap = new Map<number, Array<{ pinIndex: number; type: string }>>()
  for (const cp of boundaryPins) {
    if (cp.outerPinKind !== 4) continue // 只取 OutParam
    const arr = implOutParamMap.get(cp.innerNodeId) ?? []
    arr.push({ pinIndex: cp.innerPinIndex, type: def.outputs[cp.outerPinIndex]?.type ?? 'int' })
    implOutParamMap.set(cp.innerNodeId, arr)
  }

  const implNodes = buildImplGraphNodes(
    implNodesForEncoding,
    nodeIndexMap,
    filteredEdges,
    implOutParamMap,
    def.implVariables,
    def,
    boundaryPins,
    compositeDefById
  )

  // 1. CompositeDef interface (definition + ParameterFlow/ControlFlow + impl relation).
  // Owned by build_composite_definition.ts; accessories still emit definition before impl.
  const definitionInterface = buildCompositeDefinitionInterface({ def })
  const implGraphId = definitionInterface.implGraphId
  accessories.push(definitionInterface.definitionGraphUnit)

  // Synthetic call lowerer owns child id extraction for relatedIds (ADR-009).
  const calledCompositeIds = compositeDefById
    ? collectCalledCompositeIds(def.implNodes).map((id) => ({
        class: GraphUnit_Id_Class.AffiliatedNode,
        type: 0,
        id
      }))
    : []

  // 2. impl NodeGraph（实现图）
  // compositePins overlay is applied after ordinary/call materialization and nodeIndex remap.
  // See build_composite_pins.ts for encode + outer/inner integrity ownership.
  const definition = {
    inflows: def.inflows,
    outflows: def.outflows,
    inputs: def.inputs,
    outputs: def.outputs
  }
  const pinsOverlay = buildCompositePinsOverlay({
    boundaryPins,
    nodeIndexMap,
    definition,
    encodedNodes: implNodes
  })
  const dtcBoundaryInputs = pinsOverlay.encodedBoundaryPins.filter(
    (pin) =>
      pin.innerPinKind === NodePin_Index_Kind.InParam &&
      nodeTypeById.get(pin.innerNodeId)?.startsWith('data_type_conversion_')
  )
  assertCompositePinsIntegrity(dtcBoundaryInputs, {
    definition,
    encodedNodes: implNodes,
    requirePhysicalPins: true
  })
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
          compositePins: pinsOverlay.compositePins,
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

function getEdgeTargetIndex(edge: ImplEdge): number {
  return typeof edge === 'number' ? 0 : ((edge as any).target_index ?? 0)
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
  /** Capture-normalized boundary routes; layout + OutFlow requirements must not use raw pins. */
  boundaryPins: CompositeDefIR['compositePins'],
  compositeDefById?: Map<number, CompositeDefIR>
): GraphNode[] {
  const allDataConns: Array<{
    nodeId: number
    pin: NodePin
    upstreamNodeId: number
    upstreamPinIndex: number
  }> = []
  const requiredCompositeCallInflows = new Map<number, Set<number>>()
  const requiredCompositeCallOutflows = new Map<number, Set<number>>()
  for (const pin of boundaryPins) {
    const requiredIndexes =
      pin.outerPinKind === NodePin_Index_Kind.InFlow
        ? requiredCompositeCallInflows
        : pin.outerPinKind === NodePin_Index_Kind.OutFlow
          ? requiredCompositeCallOutflows
          : undefined
    if (!requiredIndexes) continue
    const indexes = requiredIndexes.get(pin.innerNodeId) ?? new Set<number>()
    indexes.add(pin.innerPinIndex)
    requiredIndexes.set(pin.innerNodeId, indexes)
  }
  const implConnTypeIndex = buildImplConnTypeIndex(implNodes)
  const boundaryInputIndexesByNode = new Map<number, Set<number>>()
  for (const pin of boundaryPins) {
    if (pin.innerPinKind !== NodePin_Index_Kind.InParam) continue
    const indexes = boundaryInputIndexesByNode.get(pin.innerNodeId) ?? new Set<number>()
    indexes.add(pin.innerPinIndex)
    boundaryInputIndexesByNode.set(pin.innerNodeId, indexes)
  }
  const boundaryInputTypesByNode = new Map<number, Map<number, string>>()
  for (const pin of boundaryPins) {
    if (
      pin.outerPinKind !== NodePin_Index_Kind.InParam ||
      pin.innerPinKind !== NodePin_Index_Kind.InParam
    )
      continue
    const type = def.inputs[pin.outerPinIndex]?.type
    if (!type) continue
    const types = boundaryInputTypesByNode.get(pin.innerNodeId) ?? new Map<number, string>()
    types.set(pin.innerPinIndex, type)
    boundaryInputTypesByNode.set(pin.innerNodeId, types)
  }
  const nodeResults = implNodes.map((node) => {
    let nodeId = resolveImplNodeId(node.type, node.args as any)
    let sharedConcreteNid: number | undefined
    if (usesSharedVariantResolution(node.type)) {
      const context = {
        scope: { kind: 'composite-impl' as const, name: def.name },
        strictTypeChecks: false,
        variablesByName: new Map(
          (implVariables ?? []).map((variable) => [variable.name, variable])
        ),
        connectionTypes: implConnTypeIndex as any
      }
      const inputs = resolveArgumentTypes(node, context)
      for (const [inputIndex, type] of boundaryInputTypesByNode.get(node.id) ?? []) {
        if (inputs[inputIndex]) inputs[inputIndex].type = { kind: 'scalar', name: type as any }
      }
      const identity = resolveNodeIdentity(node, context, inputs)
      nodeId = identity.genericNodeId
      sharedConcreteNid = identity.concreteNodeId
    }
    const producedValuePinIndex = node.type === 'get_local_variable' ? 1 : 0
    const producedType =
      implConnTypeIndex.get(node.id)?.get(producedValuePinIndex)?.type ??
      implOutParamMap.get(node.id)?.find((output) => output.pinIndex === producedValuePinIndex)
        ?.type
    // assembly_list: resolveImplNodeId may return typed concrete (e.g. 170=str).
    // Vendor Node must keep generic record id (169) + typed concrete; both-typed yields 0 pins.
    const assemblyGenericId =
      node.type === 'assembly_list'
        ? (getNodeIdLowerMap().get('assembly_list__generic') ?? 169)
        : undefined
    // P5-W7/W8: residual scalar + enumerations_equal ordinary concrete ids come from
    // shared resolveNodeIdentity. Handwritten resolveImplOrdinaryConcreteNodeId remains
    // only as a non-shared fallback for any still-unmigrated concrete-wrapped family.
    // assembly typed concrete: nodeId already resolved to variant; keep it as concrete only.
    const ordinaryConcreteNid = usesSharedOrdinaryConcreteIdentity(node.type)
      ? sharedConcreteNid
      : assemblyGenericId !== undefined && nodeId !== assemblyGenericId
        ? nodeId
        : resolveImplOrdinaryConcreteNodeId(node.type, producedType)
    // Synthetic call lowerer owns SysGraph identity; ordinary nodes stay SysCall.
    const callIdentity = resolveCompositeCallIdentity(node, compositeDefById)
    const calledDef = callIdentity?.calledDef
    if (callIdentity) nodeId = callIdentity.nodeId
    if (nodeId === 0) {
      throw new Error(
        `[error] cannot resolve Composite impl node type "${node.type}" ` +
          `(IR node ${node.id}, Composite "${def.name}")`
      )
    }
    const isCompositeCall = callIdentity !== undefined
    const isDTC = node.type.startsWith('data_type_conversion_')
    // data_type_conversion 节点：genericId 固定为 180（通用类型），
    // concreteId 为具体变种 ID（如 182=int→str, 186=bool→str 等）
    const dtcGenericId = isDTC
      ? (getNodeIdLowerMap().get('data_type_conversion__generic') ?? 180)
      : undefined
    const genericId = callIdentity?.genericId ?? {
      class: NodeGraph_Id_Class.SystemDefined,
      type: NodeProperty_Type.Server,
      kind: NodeGraph_Id_Kind.SysCall,
      nodeId: dtcGenericId ?? assemblyGenericId ?? nodeId
    }
    // Node-graph/custom/local concrete ids come from shared resolveNodeIdentity().
    // P5-W4 deleted the empty legacy typed-identity adapter; gvConcreteNid is now only the
    // shared concrete id for node-graph variable families (pin builder / materialize still use
    // this field for the temporary vendor Node path).
    const gvConcreteNid =
      node.type === 'get_node_graph_variable' || node.type === 'set_node_graph_variable'
        ? sharedConcreteNid
        : undefined
    const customVariableConcreteNid =
      node.type === 'get_custom_variable' || node.type === 'set_custom_variable'
        ? sharedConcreteNid
        : undefined
    const localVariableConcreteNid =
      node.type === 'get_local_variable' || node.type === 'set_local_variable'
        ? sharedConcreteNid
        : undefined
    // Boundary call pins are owned by lower_composite_call.ts. Ordinary pin builder
    // never receives `__composite_call__` / `__composite_capture__` after P4-W7.
    const { pins, dataConns } = isCompositeCallNode(node)
      ? calledDef
        ? buildCompositeCallPins({
            node,
            calledDef,
            implEdges,
            requiredInflowIndexes: requiredCompositeCallInflows.get(node.id),
            requiredOutflowIndexes: requiredCompositeCallOutflows.get(node.id)
          })
        : {
            pins: [] as NodePin[],
            dataConns: [] as Array<{
              nodeId: number
              pin: NodePin
              upstreamNodeId: number
              upstreamPinIndex: number
            }>
          }
      : buildImplNodePins(
          node,
          implEdges,
          implOutParamMap,
          implVariables,
          gvConcreteNid,
          customVariableConcreteNid,
          localVariableConcreteNid,
          boundaryInputIndexesByNode.get(node.id),
          boundaryInputTypesByNode.get(node.id)
        )
    allDataConns.push(...dataConns)
    return {
      node,
      nodeId,
      genericId,
      pins,
      isCompositeCall,
      isDTC: isDTC || false,
      dtcConcreteNid: isDTC ? (sharedConcreteNid ?? nodeId) : undefined,
      gvConcreteNid,
      customVariableConcreteNid,
      localVariableConcreteNid,
      ordinaryConcreteNid,
      nodeIndex: nodeIndexMap.get(node.id) ?? node.id
    }
  })

  for (const dc of allDataConns) {
    const mappedUpstreamId = nodeIndexMap.get(dc.upstreamNodeId) ?? dc.upstreamNodeId
    ;(dc.pin as any).connects = [
      {
        id: mappedUpstreamId,
        connect: { kind: NodePin_Index_Kind.OutParam, index: dc.upstreamPinIndex },
        connect2: { kind: NodePin_Index_Kind.OutParam, index: dc.upstreamPinIndex }
      }
    ]
  }

  // Layout isolation owns virtual anchors + impl spacing from capture-normalized
  // ordinary graph + boundaryPins. See build_composite_layout.ts.
  const layout = computeCompositeImplLayout({
    ordinaryNodes: implNodes,
    ordinaryEdges: implEdges as Record<number, any[]>,
    boundaryPins,
    compositeDefs: compositeDefById ? [...compositeDefById.values()] : []
  }).positions

  if (isSharedVendorImplGraphEnabled()) {
    return materializeImplOrdinaryGraphWithVendor(
      nodeResults,
      implEdges,
      layout,
      nodeIndexMap,
      boundaryInputIndexesByNode,
      boundaryInputTypesByNode
    )
  }

  const legacyNodes = nodeResults.map((result) =>
    materializeLegacyImplGraphNode(result, implEdges, layout, nodeIndexMap)
  )
  // Same signal SysGraph/cpi patch as vendor path (root still emits SignalDef accessories).
  patchEncodedSignalNodes(legacyNodes as any)
  return legacyNodes
}

function materializeLegacyImplGraphNode(
  result: any,
  implEdges: Record<number, ImplEdge[]>,
  layout: Map<number, { x: number; y: number }>,
  nodeIndexMap: Map<number, number>
): GraphNode {
  const {
    node,
    genericId,
    pins,
    nodeIndex,
    isDTC,
    dtcConcreteNid,
    gvConcreteNid,
    customVariableConcreteNid,
    localVariableConcreteNid,
    ordinaryConcreteNid
  } = result
  const outEdges = implEdges[node.id]
  if (outEdges && outEdges.length > 0) {
    for (const [srcIdx, edges] of groupEdgesBySourceIndex(outEdges)) {
      const outFlowPin = pins.find(
        (p: any) => p.i1?.kind === NodePin_Index_Kind.OutFlow && p.i1?.index === srcIdx
      )
      if (outFlowPin) {
        ;(outFlowPin as any).connects = edges.map((edge) => {
          const targetId = getEdgeTarget(edge)
          const targetIndex = getEdgeTargetIndex(edge)
          return {
            id: nodeIndexMap.get(targetId) ?? targetId,
            connect: { kind: NodePin_Index_Kind.InFlow, index: targetIndex },
            connect2: { kind: NodePin_Index_Kind.InFlow, index: targetIndex }
          }
        })
      }
    }
  }

  const pos = layout.get(node.id) ?? { x: 0, y: 0 }
  return {
    nodeIndex,
    genericId,
    concreteId:
      isDTC && dtcConcreteNid
        ? { ...genericId, nodeId: dtcConcreteNid }
        : gvConcreteNid
          ? { ...genericId, nodeId: gvConcreteNid }
          : customVariableConcreteNid
            ? { ...genericId, nodeId: customVariableConcreteNid }
            : localVariableConcreteNid
              ? { ...genericId, nodeId: localVariableConcreteNid }
              : ordinaryConcreteNid
                ? { ...genericId, nodeId: ordinaryConcreteNid }
                : { ...genericId },
    pins,
    x: pos.x,
    y: pos.y,
    usingStruct: []
  }
}

/**
 * P2-W5 experiment gate: materialize a closed ordinary impl graph through vendor Graph.
 *
 * Composite calls and capture/boundary pins remain outside this path. The gate rejects every
 * unsupported node instead of silently returning to handwritten connects, so each editor
 * candidate has an unambiguous backend.
 */
function materializeImplOrdinaryGraphWithVendor(
  nodeResults: any[],
  implEdges: Record<number, ImplEdge[]>,
  layout: Map<number, { x: number; y: number }>,
  nodeIndexMap: Map<number, number>,
  boundaryInputIndexesByNode: Map<number, Set<number>>,
  boundaryInputTypesByNode: Map<number, Map<number, string>>
): GraphNode[] {
  const graph = new Graph('server', 0, '', 0)
  const vendorNodes = new Map<number, Node<any>>()
  const syntheticResults = nodeResults.filter(
    (result) => result.isCompositeCall || result.node.type === COMPOSITE_CALL_NODE_TYPE
  )
  const ordinaryResults = nodeResults.filter(
    (result) => !result.isCompositeCall && result.node.type !== COMPOSITE_CALL_NODE_TYPE
  )
  if (ordinaryResults.some((result) => result.node.type === COMPOSITE_CALL_NODE_TYPE)) {
    throw new Error('[error] Composite call was not classified as synthetic')
  }

  for (const result of ordinaryResults) {
    const { node, nodeIndex, genericId } = result
    // Capture nodes are filtered by normalize_capture before materialization.
    if (node.type === COMPOSITE_CAPTURE_NODE_TYPE || isCompositeCallNode(node)) {
      throw new Error(
        `[error] vendor ordinary materializer received boundary node ${node.type} (${node.id})`
      )
    }

    const concreteNodeId =
      result.dtcConcreteNid ??
      result.gvConcreteNid ??
      result.customVariableConcreteNid ??
      result.localVariableConcreteNid ??
      result.ordinaryConcreteNid ??
      result.nodeId
    if (!concreteNodeId) {
      throw new Error(`[error] vendor impl graph gate cannot resolve ${node.type} (${node.id})`)
    }

    const vendorInputPinIndex = isSharedSpecialArgAdapterNodeType(node.type)
      ? specialArgInputPinIndex(node.type)
      : pinHoleInputPinIndex(node.type)
    const vendorNode = createOrdinaryVendorNode({
      nodeId: node.id,
      nodeType: node.type,
      args: node.args,
      nodeIndex,
      mode: 'server',
      concreteNodeId,
      genericNodeId: genericId.nodeId,
      skipCapturedInputs: true,
      inputPinIndex: vendorInputPinIndex
    })

    // Capture inputs usually drop physical InParam (compositePins overlay owns them).
    // multiple_branches control@0 is an exception: keep typed schema pin so case list@1
    // and outer compositePins → InParam 0 remain editor-visible.
    const boundaryInputIndexes = boundaryInputIndexesByNode.get(node.id) ?? new Set<number>()
    const capturedInputIndexes = new Set(
      (node.args ?? [])
        .map((arg: any, index: number) => {
          if (arg?.capture !== true) return undefined
          if (node.type === 'multiple_branches' && index === 0) return undefined
          if (isSharedSpecialArgAdapterNodeType(node.type)) {
            return remapSpecialArgInputIndex(node.type, index)
          }
          const physicalIndex = remapPinHoleInputIndex(node.type, index)
          // Any ordinary boundary capture targeted by compositePins requires a real typed
          // physical InParam. Pin-hole/special-arg families remain sparse because their
          // physical indexes are owned by their adapters.
          if (
            boundaryInputIndexes.has(physicalIndex) &&
            !isSharedPinHoleAdapterNodeType(node.type) &&
            !isSharedSpecialArgAdapterNodeType(node.type)
          ) {
            return undefined
          }
          return physicalIndex
        })
        .filter((index: number | undefined): index is number => index !== undefined)
    )
    vendorNode.pins = vendorNode.pins.filter(
      (pin: any) =>
        !(
          node.type !== 'get_local_variable' &&
          pin.kind === NodePin_Index_Kind.InParam &&
          capturedInputIndexes.has(pin.index)
        )
    )
    normalizeOrdinaryVendorPins(vendorNode)

    // Synthetic Composite-call outputs are connected after vendor encoding. Give the
    // target input a typed placeholder now so the vendor protobuf encoder can serialize it.
    for (const [argIndex, arg] of (node.args ?? []).entries()) {
      if (
        arg?.type !== 'conn' ||
        !syntheticResults.some((result) => result.node.id === arg.value.node_id)
      ) {
        continue
      }
      const physicalIndex = isSharedSpecialArgAdapterNodeType(node.type)
        ? remapSpecialArgInputIndex(node.type, argIndex)
        : remapPinHoleInputIndex(node.type, argIndex)
      const pin = vendorNode.pins.find(
        (candidate: any) =>
          candidate.kind === NodePin_Index_Kind.InParam && candidate.index === physicalIndex
      )
      if (!pin) continue
      const placeholder =
        arg.value.type === 'bool'
          ? false
          : arg.value.type === 'float'
            ? 0
            : arg.value.type === 'vec3'
              ? [0, 0, 0]
              : arg.value.type === 'str'
                ? ''
                : 0
      pin.setVal(placeholder as any)
    }

    vendorNodes.set(node.id, graph.add_node(vendorNode))
  }

  const syntheticNodeIds = new Set(syntheticResults.map((result) => result.node.id))
  const implDataEdges = ordinaryResults.flatMap((result) =>
    (result.node.args ?? []).flatMap((arg: any, toIndex: number) => {
      if (arg?.type !== 'conn' || arg.capture === true) return []
      return [
        {
          fromId: arg.value.node_id,
          toId: result.node.id,
          fromIndex: arg.value.index,
          toIndex
        }
      ]
    })
  )
  const splitImplDataEdges = splitSyntheticSourceDataEdges(implDataEdges, syntheticNodeIds)
  const mapImplInputIndex = (nodeId: number, pinIndex: number) => {
    const nodeType = nodeResults.find((result) => result.node.id === nodeId)?.node.type ?? ''
    return isSharedSpecialArgAdapterNodeType(nodeType)
      ? remapSpecialArgInputIndex(nodeType, pinIndex)
      : remapPinHoleInputIndex(nodeType, pinIndex)
  }
  const ordinaryFlowEdges = Object.entries(implEdges).flatMap(([fromId, edges]) =>
    (edges as ImplEdge[]).flatMap((edge) => {
      const targetId = getEdgeTarget(edge)
      return vendorNodes.has(Number(fromId)) && vendorNodes.has(targetId)
        ? [
            {
              fromId: Number(fromId),
              toId: targetId,
              fromIndex: getEdgeSourceIndex(edge),
              toIndex: getEdgeTargetIndex(edge)
            }
          ]
        : []
    })
  )
  const vendorFlowCountBySource = new Map<string, number>()
  materializeOrdinaryGraphEdges({
    graph,
    nodesById: vendorNodes,
    dataEdges: splitImplDataEdges.ordinary,
    flowEdges: ordinaryFlowEdges,
    flowInsertPosition: (edge) => {
      const flowKey = `${edge.fromId}:${edge.fromIndex}`
      const position = vendorFlowCountBySource.get(flowKey) ?? 0
      vendorFlowCountBySource.set(flowKey, position + 1)
      return position
    },
    onMissingDataEndpoint: (edge) => {
      throw new Error(
        `[error] vendor impl graph data source crosses synthetic boundary: ${edge.fromId}`
      )
    },
    integrity: {
      expectedNodeIndexes: new Map(nodeResults.map((result) => [result.node.id, result.nodeIndex])),
      excludedNodeIds: new Set(syntheticResults.map((result) => result.node.id))
    }
  })

  const encodedRoot = graph.encode() as any
  const encodedNodes = (encodedRoot.graph?.graph?.inner?.graph?.nodes ?? []) as GraphNode[]
  if (encodedNodes.length !== ordinaryResults.length) {
    throw new Error(
      `[error] vendor impl graph lost nodes: ${encodedNodes.length}/${ordinaryResults.length}`
    )
  }
  // Patch send/monitor placeholders to builtin SysGraph ids + compositePinIndex
  // (root path also runs finalizeSignalEncoding for SignalDef accessories).
  patchEncodedSignalNodes(encodedNodes as any)
  for (const encodedNode of encodedNodes) {
    const source = nodeResults.find((result) => result.nodeIndex === encodedNode.nodeIndex)
    const pos = source ? layout.get(source.node.id) : undefined
    if (!source || !pos) throw new Error(`[error] vendor impl graph lost node position`)
    encodedNode.x = pos.x
    encodedNode.y = pos.y
    encodedNode.usingStruct = []

    // Vendor typed templates may omit capture-boundary InParams even though the
    // handwritten builder materialized their concrete schema. Merge the already encoded
    // protobuf pins after vendor Graph encoding; compositePins cannot create physical pins.
    const boundaryIndexes = boundaryInputIndexesByNode.get(source.node.id) ?? new Set<number>()
    const boundaryTypes = boundaryInputTypesByNode.get(source.node.id) ?? new Map<number, string>()
    const boundaryPins = [...(source.pins ?? [])].filter(
      (pin: any) =>
        pin.i1?.kind === NodePin_Index_Kind.InParam &&
        boundaryIndexes.has(pin.i1.index) &&
        !(encodedNode.pins ?? []).some(
          (existing: any) =>
            existing.i1?.kind === NodePin_Index_Kind.InParam && existing.i1.index === pin.i1.index
        )
    )
    for (const pinIndex of boundaryIndexes) {
      const existingIndex = (encodedNode.pins ?? []).findIndex(
        (existing: any) =>
          existing.i1?.kind === NodePin_Index_Kind.InParam && existing.i1.index === pinIndex
      )
      const inputType =
        boundaryTypes.get(pinIndex) ?? inferInputTypeFromNode(source.node.type, pinIndex)
      const pin = buildConnPin(pinIndex, inputType)
      if (needsConcreteWrapping(source.node.type) && pin.value) {
        pin.value = wrapConcreteValueForNodeInput(
          source.node.type,
          pin.value,
          inputType,
          pinIndex
        ) as any
      }
      if (existingIndex >= 0) {
        encodedNode.pins.splice(existingIndex, 1)
      }
      boundaryPins.push(pin)
    }
    encodedNode.pins = [...(encodedNode.pins ?? []), ...boundaryPins]

    // multiple_branches keeps default OutFlow 0 even when the default branch is empty.
    if (source.node.type === 'multiple_branches') {
      const hasDefault = (encodedNode.pins ?? []).some(
        (pin: any) => pin.i1?.kind === NodePin_Index_Kind.OutFlow && pin.i1?.index === 0
      )
      if (!hasDefault) {
        encodedNode.pins = encodedNode.pins ?? []
        encodedNode.pins.push({
          i1: { kind: NodePin_Index_Kind.OutFlow, index: 0 },
          i2: { kind: NodePin_Index_Kind.OutFlow, index: 0 },
          type: 0,
          value: undefined as any
        })
      }
    }
  }
  const syntheticNodes = syntheticResults.map((result) =>
    materializeLegacyImplGraphNode(result, implEdges, layout, nodeIndexMap)
  )
  const allNodes = [...encodedNodes, ...syntheticNodes]
  const allNodesByIndex = new Map(allNodes.map((node) => [node.nodeIndex, node]))

  // Composite-call OutParams are overlay pins. Their logical edges share the same split and
  // physical-index seam as root; impl only differs in writing connects after vendor encoding.
  materializeSyntheticSourceDataEdges({
    dataEdges: splitImplDataEdges.syntheticSource,
    syntheticSourceIds: syntheticNodeIds,
    mapInputIndex: mapImplInputIndex,
    connect: (edge, fromIndex, toIndex) => {
      const sourceResult = nodeResults.find((result) => result.node.id === edge.fromId)
      const targetResult = nodeResults.find((result) => result.node.id === edge.toId)
      const targetNode = targetResult && allNodesByIndex.get(targetResult.nodeIndex)
      if (!sourceResult || !targetResult || !targetNode) {
        throw new Error(
          `[error] vendor impl graph missing Composite data endpoint ${edge.fromId}->${edge.toId}`
        )
      }
      const targetPin = targetNode.pins?.find(
        (pin: any) => pin.i1?.kind === NodePin_Index_Kind.InParam && pin.i1.index === toIndex
      )
      if (!targetPin) {
        throw new Error(
          `[error] vendor impl graph missing Composite target pin ${edge.toId}.${toIndex}`
        )
      }
      ;(targetPin as any).connects = [
        {
          id: sourceResult.nodeIndex,
          connect: { kind: NodePin_Index_Kind.OutParam, index: fromIndex },
          connect2: { kind: NodePin_Index_Kind.OutParam, index: fromIndex }
        }
      ]
    }
  })

  for (const [fromId, edges] of Object.entries(implEdges)) {
    const sourceResult = nodeResults.find((result) => result.node.id === Number(fromId))
    if (!sourceResult || !sourceResult.isCompositeCall) continue
    for (const edge of edges) {
      const targetId = getEdgeTarget(edge)
      const targetResult = nodeResults.find((result) => result.node.id === targetId)
      if (!targetResult || targetResult.isCompositeCall) continue
      const source = allNodesByIndex.get(sourceResult.nodeIndex)
      const target = allNodesByIndex.get(targetResult.nodeIndex)
      if (!source || !target)
        throw new Error('[error] vendor impl graph lost synthetic flow endpoint')
      const sourceIndex = getEdgeSourceIndex(edge)
      const sourcePin = source.pins?.find(
        (pin: any) => pin.i1?.kind === NodePin_Index_Kind.OutFlow && pin.i1?.index === sourceIndex
      )
      if (!sourcePin) {
        throw new Error(
          `[error] vendor impl graph missing ${sourceResult.node.type} OutFlow[${sourceIndex}] for synthetic overlay`
        )
      }
      const targetIndex = getEdgeTargetIndex(edge)
      const connects = (sourcePin as any).connects ?? []
      if (
        !connects.some(
          (connect: any) =>
            connect.id === target.nodeIndex &&
            connect.connect?.kind === NodePin_Index_Kind.InFlow &&
            connect.connect?.index === targetIndex
        )
      ) {
        connects.push({
          id: target.nodeIndex,
          connect: { kind: NodePin_Index_Kind.InFlow, index: targetIndex },
          connect2: { kind: NodePin_Index_Kind.InFlow, index: targetIndex }
        })
      }
      ;(sourcePin as any).connects = connects
    }
  }

  return allNodes.sort((a, b) => a.nodeIndex - b.nodeIndex)
}

function buildImplConnTypeIndex(
  implNodes: CompositeDefIR['implNodes']
): Map<number, Map<number, { type: string }>> {
  const index = new Map<number, Map<number, { type: string }>>()

  for (const node of implNodes) {
    for (const arg of node.args ?? []) {
      if (!arg || arg.type !== 'conn') continue
      const conn = arg.value as { node_id: number; index: number; type?: string }
      if (!conn.type) continue
      const outputTypes = index.get(conn.node_id) ?? new Map<number, { type: string }>()
      const existingType = outputTypes.get(conn.index)?.type
      if (existingType && existingType !== conn.type) {
        throw new Error(
          `[error] conflicting impl conn types for ${conn.node_id}.${conn.index}: ${existingType} vs ${conn.type}`
        )
      }
      outputTypes.set(conn.index, { type: conn.type })
      index.set(conn.node_id, outputTypes)
    }
  }

  return index
}

function getImplArgType(
  arg: CompositeDefIR['implNodes'][number]['args'][number] | undefined
): string | undefined {
  if (!arg) return undefined
  return arg.type === 'conn' ? (arg.value as { type?: string }).type : arg.type
}

/**
 * 解析 impl 节点的 GIA node ID
 */
function resolveImplOrdinaryConcreteNodeId(
  nodeType: string,
  producedType: string | undefined
): number | undefined {
  if (!producedType || !concreteWrappedNodeTypes.has(nodeType)) return undefined
  const suffix = producedType === 'vec3' ? 'vec' : producedType
  return getNodeIdLowerMap().get(`${nodeType.toLowerCase()}__${suffix}`)
}

function resolveImplNodeId(
  nodeType: string,
  args?: Array<{ type: string; value: unknown } | null>
): number {
  const special = SPECIAL_NODE_IDS[nodeType]
  if (special) return special

  const nodeIdLower = getNodeIdLowerMap()

  // data_type_conversion_<outType> 需要组合 inType 查询
  if (nodeType.startsWith('data_type_conversion_')) {
    const outKey = nodeType.slice('data_type_conversion_'.length).trim()

    const firstArg = args?.[0]
    let inType: string | undefined
    if (firstArg) {
      inType =
        firstArg.type === 'conn'
          ? ((firstArg.value as any)?.type as string | undefined)
          : (firstArg.type as string)
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

  // assembly_list: mirror root resolveGiaNodeId typed suffix (str/int/...) so
  // vendor OutParam type matches wired consumers (e.g. send_signal str_list).
  // assembly_dictionary typed identity is NOT applied here: consumers like
  // query_dictionary_s_length still lack shared typed resolution (typed-identity pack);
  // typing only the producer would create pin-type mismatches under vendor beta.
  if (nodeType === 'assembly_list') {
    const firstArg = args?.[0]
    let elementType: string | undefined
    if (firstArg) {
      elementType =
        firstArg.type === 'conn'
          ? ((firstArg.value as any)?.type as string | undefined)
          : (firstArg.type as string)
    }
    if (elementType && elementType !== 'dict' && elementType !== 'enum') {
      const suffix =
        elementType === 'vec3'
          ? 'vec'
          : elementType === 'config_id'
            ? 'config'
            : elementType === 'prefab_id'
              ? 'prefab'
              : elementType
      const typed = nodeIdLower.get(`assembly_list__${suffix}`)
      if (typed) return typed
    }
  }

  const mapped = SPECIAL_NODE_MAPPINGS[nodeType]
  const key = (mapped ?? nodeType).toLowerCase()
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
    case 'int':
      return VarBase_Class.IntBase
    case 'float':
      return VarBase_Class.FloatBase
    case 'bool':
      return VarBase_Class.EnumBase
    case 'str':
      return VarBase_Class.StringBase
    case 'vec3':
      return VarBase_Class.VectorBase
    case 'entity':
    case 'guid':
    case 'faction':
    case 'prefab_id':
    case 'config_id':
      return VarBase_Class.IdBase
    default:
      if (argType.endsWith('_list')) {
        const elementType = argType.slice(0, -5)
        return argVarBaseClass(elementType)
      }
      return 0
  }
}

function argVarType(argType: string): number {
  switch (argType) {
    case 'bool':
      return VarType.Boolean
    case 'int':
      return VarType.Integer
    case 'float':
      return VarType.Float
    case 'str':
      return VarType.String
    case 'vec3':
      return VarType.Vector
    case 'local_variable':
      return VarType.LocalVariable
    case 'guid':
      return VarType.GUID
    case 'entity':
      return VarType.Entity
    case 'faction':
      return VarType.Faction
    case 'prefab_id':
      return VarType.Prefab
    case 'config_id':
      return VarType.Configuration
    default:
      if (argType.endsWith('_list')) {
        const elementType = argType.slice(0, -5)
        switch (elementType) {
          case 'int':
            return VarType.IntegerList
          case 'bool':
            return VarType.BooleanList
          case 'float':
            return VarType.FloatList
          case 'str':
            return VarType.StringList
          case 'guid':
            return VarType.GUIDList
          case 'entity':
            return VarType.EntityList
          default:
            return 0
        }
      }
      return 0
  }
}

/**
 * Ordinary-only impl pin builder.
 *
 * Driven by: args → InParam, boundary OutParam map → OutParam, edges → OutFlow.
 * dataConns holds pin object refs so the caller can fill connects after nodeIndex remap.
 *
 * Boundary ownership (P4-W7):
 * - `__composite_call__` → lower_composite_call.ts (orchestration routes before this builder)
 * - `__composite_capture__` → normalize_capture.ts (removed before ordinary/call lowering)
 * - arg-level `capture: true` only skips physical InParam materialization
 */
function buildImplNodePins(
  node: CompositeDefIR['implNodes'][number],
  implEdges: Record<number, any[]>,
  implOutParamMap: Map<number, Array<{ pinIndex: number; type: string }>>,
  implVariables: CompositeDefIR['implVariables'],
  gvConcreteNid?: number,
  customVariableConcreteNid?: number,
  localVariableConcreteNid?: number,
  boundaryInputIndexes: ReadonlySet<number> = new Set<number>(),
  boundaryInputTypes: ReadonlyMap<number, string> = new Map<number, string>()
): {
  pins: NodePin[]
  dataConns: Array<{
    nodeId: number
    pin: NodePin
    upstreamNodeId: number
    upstreamPinIndex: number
  }>
} {
  const pins: NodePin[] = []
  const dataConns: Array<{
    nodeId: number
    pin: NodePin
    upstreamNodeId: number
    upstreamPinIndex: number
  }> = []

  if (isCompositeCallNode(node) || node.type === COMPOSITE_CAPTURE_NODE_TYPE) {
    throw new Error(
      `[error] ordinary impl pin builder received boundary node ${node.type} (${node.id}); ` +
        'route call/capture through lower_composite_call / normalize_capture'
    )
  }

  if (
    (node.type === 'get_local_variable' || node.type === 'set_local_variable') &&
    localVariableConcreteNid
  ) {
    const tmpGraph = new Graph('server', 0, '', 0)
    const tmpNode = new Node(0, 'server', localVariableConcreteNid, undefined as any)
    const pendingConns: Array<{
      pinIndex: number
      upstreamNodeId: number
      upstreamPinIndex: number
    }> = []

    for (let argIndex = 0; argIndex < (node.args ?? []).length; argIndex++) {
      const arg = node.args?.[argIndex]
      if (!arg || (arg as any).capture === true) continue
      if (arg.type === 'conn') {
        const conn = arg.value as { node_id: number; index: number }
        pendingConns.push({
          pinIndex: argIndex,
          upstreamNodeId: conn.node_id,
          upstreamPinIndex: conn.index
        })
      } else {
        const pin = tmpNode.pins.find(
          (candidate) =>
            candidate.kind === NodePin_Index_Kind.InParam && candidate.index === argIndex
        )
        pin?.setVal(arg.value)
      }
    }

    tmpNode.pins = (tmpNode.pins ?? []).filter(
      (pin: any) =>
        !(
          (pin?.kind === NodePin_Index_Kind.InParam || pin?.kind === NodePin_Index_Kind.OutParam) &&
          pin?.type?.t === 'b' &&
          pin?.type?.b === 'Unk'
        )
    )
    tmpGraph.add_node(tmpNode)
    const tmpRoot = tmpGraph.encode() as any
    const encodedNode = tmpRoot.graph?.graph?.inner?.graph?.nodes?.[0]
    const vendorPins = (encodedNode?.pins ?? []) as NodePin[]

    for (const pin of vendorPins) {
      ;(pin as any).connects = undefined
      if (pin.type === VarType.LocalVariable) {
        ;(pin as any).value = undefined
      }
    }
    for (const conn of pendingConns) {
      const pin = vendorPins.find(
        (candidate: any) =>
          candidate.i1?.kind === NodePin_Index_Kind.InParam && candidate.i1?.index === conn.pinIndex
      )
      if (!pin) continue
      dataConns.push({
        nodeId: node.id,
        pin,
        upstreamNodeId: conn.upstreamNodeId,
        upstreamPinIndex: conn.upstreamPinIndex
      })
    }

    const outEdges = implEdges[node.id]
    if (outEdges && outEdges.length > 0) {
      for (const [sourceIndex] of groupEdgesBySourceIndex(outEdges)) {
        vendorPins.push({
          i1: { kind: NodePin_Index_Kind.OutFlow, index: sourceIndex },
          i2: { kind: NodePin_Index_Kind.OutFlow, index: sourceIndex },
          type: 0,
          value: undefined as any
        })
      }
    }

    return { pins: vendorPins, dataConns }
  }

  if (
    (node.type === 'get_custom_variable' || node.type === 'set_custom_variable') &&
    customVariableConcreteNid
  ) {
    const tmpGraph = new Graph('server', 0, '', 0)
    const tmpNode = new Node(0, 'server', customVariableConcreteNid, undefined as any)
    const captureInputIndices = new Set<number>()
    const pendingConns: Array<{
      pinIndex: number
      upstreamNodeId: number
      upstreamPinIndex: number
    }> = []

    for (let argIndex = 0; argIndex < (node.args ?? []).length; argIndex++) {
      const arg = node.args?.[argIndex]
      if (!arg) continue
      const physicalPinIndex = remapPinHoleInputIndex(node.type, argIndex)
      if ((arg as any).capture === true) {
        captureInputIndices.add(physicalPinIndex)
      } else if (arg.type === 'conn') {
        const conn = arg.value as { node_id: number; index: number }
        pendingConns.push({
          pinIndex: physicalPinIndex,
          upstreamNodeId: conn.node_id,
          upstreamPinIndex: conn.index
        })
      } else {
        const pin = tmpNode.pins.find(
          (candidate) =>
            candidate.kind === NodePin_Index_Kind.InParam && candidate.index === physicalPinIndex
        )
        pin?.setVal(arg.value)
      }
    }

    tmpNode.pins = (tmpNode.pins ?? []).filter(
      (pin: any) =>
        !(pin.kind === NodePin_Index_Kind.InParam && captureInputIndices.has(pin.index)) &&
        !((pin?.kind === 3 || pin?.kind === 4) && pin?.type?.t === 'b' && pin?.type?.b === 'Unk')
    )
    tmpGraph.add_node(tmpNode)
    const tmpRoot = tmpGraph.encode() as any
    const encodedNode = tmpRoot.graph?.graph?.inner?.graph?.nodes?.[0]
    const vendorPins = (encodedNode?.pins ?? []) as NodePin[]

    for (const pin of vendorPins) {
      ;(pin as any).connects = undefined
    }
    for (const conn of pendingConns) {
      const pin = vendorPins.find(
        (candidate: any) =>
          candidate.i1?.kind === NodePin_Index_Kind.InParam && candidate.i1?.index === conn.pinIndex
      )
      if (!pin) continue
      dataConns.push({
        nodeId: node.id,
        pin,
        upstreamNodeId: conn.upstreamNodeId,
        upstreamPinIndex: conn.upstreamPinIndex
      })
    }

    const outEdges = implEdges[node.id]
    if (outEdges && outEdges.length > 0) {
      for (const [sourceIndex] of groupEdgesBySourceIndex(outEdges)) {
        vendorPins.push({
          i1: { kind: NodePin_Index_Kind.OutFlow, index: sourceIndex },
          i2: { kind: NodePin_Index_Kind.OutFlow, index: sourceIndex },
          type: 0,
          value: undefined as any
        })
      }
    }

    return { pins: vendorPins, dataConns }
  }

  // set_node_graph_variable：使用 concrete vendor Node 物化完整 pin schema。
  // literal 与 connection 共用同一 schema；connection 只延后填入 connects。
  if (node.type === 'set_node_graph_variable' && gvConcreteNid) {
    const tmpGraph = new Graph('server', 0, '', 0)
    const tmpNode = new Node(0, 'server', gvConcreteNid, undefined as any)
    const pendingConns: Array<{
      pinIndex: number
      upstreamNodeId: number
      upstreamPinIndex: number
    }> = []

    for (let argIndex = 0; argIndex < (node.args ?? []).length; argIndex++) {
      const arg = node.args?.[argIndex]
      if (!arg || (arg as any).capture === true) continue
      if (arg.type === 'conn') {
        const conn = arg.value as { node_id: number; index: number }
        pendingConns.push({
          pinIndex: argIndex,
          upstreamNodeId: conn.node_id,
          upstreamPinIndex: conn.index
        })
      } else {
        const pin = tmpNode.pins.find(
          (candidate) =>
            candidate.kind === NodePin_Index_Kind.InParam && candidate.index === argIndex
        )
        pin?.setVal(arg.value)
      }
    }

    tmpGraph.add_node(tmpNode)
    const tmpRoot = tmpGraph.encode() as any
    const encodedNode = tmpRoot.graph?.graph?.inner?.graph?.nodes?.[0]
    const vendorPins = (encodedNode?.pins ?? []) as NodePin[]

    for (const pin of vendorPins) {
      ;(pin as any).connects = undefined
    }
    for (const conn of pendingConns) {
      const pin = vendorPins.find(
        (candidate: any) =>
          candidate.i1?.kind === NodePin_Index_Kind.InParam && candidate.i1?.index === conn.pinIndex
      )
      if (!pin) continue
      dataConns.push({
        nodeId: node.id,
        pin,
        upstreamNodeId: conn.upstreamNodeId,
        upstreamPinIndex: conn.upstreamPinIndex
      })
    }

    const outEdges = implEdges[node.id]
    if (outEdges && outEdges.length > 0) {
      for (const [sourceIndex] of groupEdgesBySourceIndex(outEdges)) {
        vendorPins.push({
          i1: { kind: NodePin_Index_Kind.OutFlow, index: sourceIndex },
          i2: { kind: NodePin_Index_Kind.OutFlow, index: sourceIndex },
          type: 0,
          value: undefined as any
        })
      }
    }

    return { pins: vendorPins, dataConns }
  }

  // get_node_graph_variable：shared identity 提供 concrete variant，vendor Node 物化 pin schema。
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

  const args = node.args ?? []

  // Legacy multiple_branches: reuse shared special-arg layout (control@0 + case list@1)
  // via a temporary vendor Node. Capture control still gets a typed pin0 schema so
  // compositePins can target InParam 0; OutFlow pins come from implEdges below.
  if (node.type === 'multiple_branches') {
    const tmpGraph = new Graph('server', 0, '', 0)
    const tmpNode = createOrdinaryVendorNode({
      nodeId: node.id,
      nodeType: node.type,
      args: args as any,
      nodeIndex: 0,
      mode: 'server',
      concreteNodeId: 3,
      genericNodeId: 3,
      skipCapturedInputs: true,
      inputPinIndex: specialArgInputPinIndex(node.type)
    })
    normalizeOrdinaryVendorPins(tmpNode)
    tmpGraph.add_node(tmpNode)
    const tmpRoot = tmpGraph.encode() as any
    const encodedNode = tmpRoot.graph?.graph?.inner?.graph?.nodes?.[0]
    const vendorPins = (encodedNode?.pins ?? []) as NodePin[]
    for (const pin of vendorPins) {
      ;(pin as any).connects = undefined
      pins.push(pin)
    }

    const outEdges = implEdges[node.id]
    // Always keep default OutFlow 0 (editor "默认" slot), then case OutFlows 1..n.
    const outflowIndexes = new Set<number>([0])
    if (outEdges && outEdges.length > 0) {
      for (const [sourceIndex] of groupEdgesBySourceIndex(outEdges)) {
        outflowIndexes.add(sourceIndex)
      }
    }
    for (const sourceIndex of [...outflowIndexes].sort((a, b) => a - b)) {
      pins.push({
        i1: { kind: NodePin_Index_Kind.OutFlow, index: sourceIndex },
        i2: { kind: NodePin_Index_Kind.OutFlow, index: sourceIndex },
        type: 0,
        value: undefined as any
      })
    }
    return { pins, dataConns }
  }

  // assembly_list/dictionary：第一个 pin 是 count（元素数量的 Int 字面量）
  if (isAssemblySpecialArgNodeType(node.type)) {
    const countPin = buildLiteralPin(0, 'int', args.length, node.type)
    pins.push(countPin)
  }
  // Pin-hole (P5-W9) / special-arg (P5-W10) use shared IR→physical remap.
  // assembly keeps sequential pinIndex starting at 1; other nodes map independently.
  const usesPinHoleRemap = isSharedPinHoleAdapterNodeType(node.type)
  const usesSpecialArgRemap =
    isSharedSpecialArgAdapterNodeType(node.type) && !isAssemblySpecialArgNodeType(node.type)
  let sequentialPinIndex = isAssemblySpecialArgNodeType(node.type) ? 1 : 0
  for (let argIndex = 0; argIndex < args.length; argIndex++) {
    const arg = args[argIndex]
    // Signal name is ClientExec (not InParam); shared special-arg layout owns it on vendor path.
    if ((node.type === 'send_signal' || node.type === 'monitor_signal') && argIndex === 0) {
      continue
    }
    const pinIndex = usesPinHoleRemap
      ? remapPinHoleInputIndex(node.type, argIndex)
      : usesSpecialArgRemap
        ? remapSpecialArgInputIndex(node.type, argIndex)
        : sequentialPinIndex
    // Capture inputs are normally sparse boundary routes without physical pins. Any input
    // targeted by compositePins is different: the editor expects a typed physical InParam.
    if (arg && (arg as any).capture === true) {
      const isBoundaryInput = boundaryInputIndexes.has(pinIndex)
      if (isBoundaryInput && node.type.startsWith('data_type_conversion_')) {
        const dtcInfo = getDtcInParamInfo(getImplArgType(arg) ?? boundaryInputTypes.get(pinIndex))
        if (dtcInfo) {
          pins.push({
            i1: { kind: NodePin_Index_Kind.InParam, index: pinIndex },
            i2: { kind: NodePin_Index_Kind.InParam, index: pinIndex },
            value: {
              class: 10000,
              alreadySetVal: true,
              bConcreteValue: {
                indexOfConcrete: dtcInfo.indexOfConcrete,
                value: makeVarBaseValue(dtcInfo.varClass, dtcInfo.varType, false)
              }
            } as any,
            type: dtcInfo.varType
          })
        }
      } else if (isBoundaryInput && !usesPinHoleRemap) {
        const inputType =
          boundaryInputTypes.get(pinIndex) ??
          getImplArgType(arg) ??
          inferInputTypeFromNode(node.type, pinIndex)
        const pin = buildConnPin(pinIndex, inputType)
        if (needsConcreteWrapping(node.type) && pin.value) {
          pin.value = wrapConcreteValueForNodeInput(
            node.type,
            pin.value,
            inputType,
            pinIndex
          ) as any
        }
        pins.push(pin)
      }
      if (!usesPinHoleRemap && !usesSpecialArgRemap) sequentialPinIndex++
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
          if (!usesPinHoleRemap && !usesSpecialArgRemap) sequentialPinIndex++
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
      if (!usesPinHoleRemap && !usesSpecialArgRemap) sequentialPinIndex++
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
          if (!usesPinHoleRemap && !usesSpecialArgRemap) sequentialPinIndex++
          continue
        }
      }
      pins.push(buildLiteralPin(pinIndex, arg.type, arg.value, node.type))
    } else {
      pins.push(buildPlaceholderPin(pinIndex, node.type))
    }
    if (!usesPinHoleRemap && !usesSpecialArgRemap) sequentialPinIndex++
  }

  const outParams = implOutParamMap.get(node.id)
  if (outParams) {
    for (const op of outParams) {
      const outVarType = argVarType(op.type)
      const outVarClass = argVarBaseClass(op.type)
      pins.push({
        i1: { kind: NodePin_Index_Kind.OutParam, index: op.pinIndex },
        i2: { kind: NodePin_Index_Kind.OutParam, index: op.pinIndex },
        value: wrapConcreteValue(concreteOutputIndex(op.type), outVarClass, outVarType, '') as any,
        type: outVarType
      })
    }
  }

  const hasExplicitOutParam = outParams && outParams.length > 0
  const requiresDtcOutput = node.type.startsWith('data_type_conversion_')
  if (
    !hasExplicitOutParam &&
    (pins.length > 0 || requiresDtcOutput) &&
    isDataProducerNode(node.type)
  ) {
    let outType = pins[0]?.type ?? 0
    let outClass = pins[0]?.value?.bConcreteValue?.value?.class ?? pins[0]?.value?.class ?? 0
    // data_type_conversion 节点：InParam 用了正确类型，但 OutParam 需要独立设置
    // OutParam 类型 = 目标类型（str=6），indexOfConcrete 固定为 2（M17[2]=6=String）
    if (node.type.startsWith('data_type_conversion_')) {
      const outKey = node.type.slice('data_type_conversion_'.length).trim()
      outType = argVarType(outKey)
      outClass = argVarBaseClass(outKey)
    }
    // list_iteration_loop：OutParam 是元素类型，从 arg[0] 的 conn type 中推导
    if (node.type === 'list_iteration_loop') {
      const firstArg = (node.args ?? [])[0]
      if (firstArg && firstArg.type === 'conn') {
        const connType = (firstArg.value as any)?.type as string | undefined
        if (connType && connType.endsWith('_list')) {
          const elementType = connType.slice(0, -5)
          outType = argVarType(elementType)
          outClass = argVarBaseClass(elementType)
        }
      }
    }
    // get_node_graph_variable：OutParam 应从 implVariables 中取变量真实类型
    if (node.type === 'get_node_graph_variable') {
      const nameArg = (node.args ?? [])[0]
      if (nameArg && nameArg.type === 'str' && typeof nameArg.value === 'string') {
        const varName = nameArg.value
        const implVar = implVariables?.find((v) => v.name === varName)
        if (implVar) {
          outType = argVarType(implVar.type)
          outClass = argVarBaseClass(implVar.type)
        }
      }
    }
    if (vec3ToFloatNodeTypes.has(node.type)) {
      outType = VarType.Float
      outClass = VarBase_Class.FloatBase
    }
    const innerValue = makeVarBaseValue(outClass, outType, false)
    let outValue: Record<string, unknown> = innerValue
    if (needsConcreteWrapping(node.type)) {
      const outTypeName = node.type.startsWith('data_type_conversion_')
        ? node.type.slice('data_type_conversion_'.length).trim()
        : varTypeNameFromVarType(outType)
      outValue = {
        class: 10000,
        alreadySetVal: true,
        bConcreteValue: { indexOfConcrete: concreteOutputIndex(outTypeName), value: innerValue }
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
  if (
    nodeType === 'assembly_list' ||
    nodeType === 'list_iteration_loop' ||
    nodeType === 'get_node_graph_variable'
  )
    return true
  if (nodeType.startsWith('get_') && !nodeType.startsWith('get_node_graph_variable')) return true
  return false
}

/**
 * data_type_conversion 节点的 DTC 具体序列（M16 = 第 16 号 concrete map）
 * 每个条目对应一个 DTC 变种的 InParam VarType，indexOfConcrete = 在序列中的位置
 */
const DTC_IN_PARAM_VARTYPE_SEQUENCE = [
  VarType.Integer, // 0: int→str
  VarType.Entity, // 1: entity→str
  VarType.GUID, // 2: guid→str
  VarType.Boolean, // 3: bool→str
  VarType.Float, // 4: float→str
  VarType.Vector, // 5: vec→str
  VarType.Faction // 6: faction→str
]

/**
 * 查 data_type_conversion 节点 InParam 的 concrete 信息
 * @returns { indexOfConcrete, varType, varClass } 或 null（非 DTC 节点）
 */
function getDtcInParamInfo(
  inType: string | undefined
): { indexOfConcrete: number; varType: number; varClass: number } | null {
  if (!inType) return null
  const varType = argVarType(inType)
  if (varType === 0) return null
  const idx = DTC_IN_PARAM_VARTYPE_SEQUENCE.indexOf(varType)
  if (idx === -1) return null
  return {
    indexOfConcrete: idx,
    varType,
    varClass: argVarBaseClass(inType)
  }
}

/** 构建 VarBase 值结构（bInt/bFloat/bString 等） */
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
    innerValue = {
      class: varClass,
      alreadySetVal: false,
      itemType,
      bVector: { val: { x: 0, y: 0, z: 0 } }
    }
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
  'addition',
  'subtraction',
  'multiplication',
  'division',
  'modulo_operation',
  'exponentiation',
  'equal',
  'greater_than',
  'less_than',
  'greater_than_or_equal_to',
  'less_than_or_equal_to',
  'logical_and_operation',
  'logical_or_operation',
  'logical_not_operation',
  'logical_xor_operation',
  'absolute_value_operation',
  'sign_operation',
  'arithmetic_square_root_operation',
  'round_to_integer_operation',
  'range_limiting_operation',
  'take_larger_value',
  'take_smaller_value',
  'enumerations_equal'
])

// vec3 输入节点：InParam placeholder 需要 VectorBase 类型
const vec3NodeTypes = new Set([
  '_3d_vector_addition',
  '_3d_vector_subtraction',
  '_3d_vector_cross_product',
  '_3d_vector_zoom',
  '_3d_vector_rotation',
  '_3d_vector_modulo_operation',
  '_3d_vector_dot_product',
  '_3d_vector_angle',
  '_3d_vector_normalization',
  'split_3d_vector',
  'create_3d_vector'
])

// vec3→float 输出节点：输入 vec3 但输出 float，自动 OutParam 需特殊处理
const vec3ToFloatNodeTypes = new Set([
  '_3d_vector_modulo_operation',
  '_3d_vector_dot_product',
  '_3d_vector_angle'
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
    varType = VarType.String
    varClass = VarBase_Class.StringBase
  } else if (concreteWrappedNodeTypes.has(nodeType)) {
    varType = VarType.Integer
    varClass = VarBase_Class.IntBase
  } else if (vec3NodeTypes.has(nodeType)) {
    varType = VarType.Vector
    varClass = VarBase_Class.VectorBase
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
  const varType = argVarType(typeName)
  const varClass = argVarBaseClass(typeName)
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
        : concreteInputIndex(typeName ?? inferInputTypeFromNode(nodeType, pinIndex)),
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

function buildLiteralPin(
  pinIndex: number,
  argType: string,
  value: unknown,
  nodeType: string
): NodePin {
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
    // Legacy impl previously dropped value here; editor shows empty/0 defaults.
    pinValue = {
      class: varClass,
      alreadySetVal: true,
      itemType,
      bId: { val: Number(value) }
    }
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
