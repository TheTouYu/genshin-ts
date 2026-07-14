import type {
  CompositeDefIR,
  CompositePinEntry,
  NextConnection,
  ServerNode
} from '../../runtime/IR.js'
import { NodePin_Index_Kind } from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'
import { buildExecutionGraph, layoutPositions } from './layout.js'

/**
 * Composite layout isolation is a pure Composite boundary step.
 *
 * Ownership:
 * - virtual InFlow input anchors built from capture-normalized boundaryPins
 * - virtual OutParam output anchors + extraDataConnections
 * - impl-only layout options (`execLaneSpacingScale`)
 * - position map for ordinary + synthetic call nodes only
 *
 * Must consume capture-normalized ordinary graph + boundaryPins. Must not:
 * - invent node/pin semantics or change encoded nodeIndex
 * - read raw `def.compositePins` (capture routes may still point at `__composite_capture__`)
 * - invent ordinary edges for materialization
 * - place virtual anchors into the returned position map used by materializers
 *
 * Shared layout engine (`layout.ts`) remains the placement core; this module only
 * prepares boundary virtual graph context and filters the result.
 */

export const COMPOSITE_INPUT_ANCHOR_TYPE = '__composite_input_anchor__' as const
export const COMPOSITE_OUTPUT_ANCHOR_TYPE = '__composite_output_anchor__' as const

/** Impl graphs use a tighter exec-lane scale than root; value is historical and locked. */
export const COMPOSITE_IMPL_EXEC_LANE_SPACING_SCALE = 0.6

export type CompositeLayoutInput = {
  /**
   * Capture-normalized ordinary + synthetic call nodes.
   * Must not contain `__composite_capture__` or virtual anchors.
   */
  ordinaryNodes: readonly ServerNode[]
  /** Capture-normalized ordinary flow edges (no capture-source edges). */
  ordinaryEdges: Readonly<Record<number, readonly NextConnection[]>>
  /**
   * Capture-normalized boundary routes expressed with IR node ids.
   * InFlow routes that previously targeted capture must already be redirected.
   */
  boundaryPins: readonly CompositePinEntry[]
  /**
   * Child composite defs for visual height estimation of nested call nodes.
   * Layout must not re-lower or invent call pins from these defs.
   */
  compositeDefs?: readonly CompositeDefIR[]
  /** Override for tests; production uses COMPOSITE_IMPL_EXEC_LANE_SPACING_SCALE. */
  execLaneSpacingScale?: number
}

export type CompositeLayoutVirtualInputAnchor = {
  id: number
  type: typeof COMPOSITE_INPUT_ANCHOR_TYPE
  args: []
  next: Array<{
    node_id: number
    source_index: number
    target_index: number
  }>
  outerPinIndex: number
}

export type CompositeLayoutVirtualOutputAnchor = {
  id: number
  type: typeof COMPOSITE_OUTPUT_ANCHOR_TYPE
  args: []
}

export type CompositeLayoutExtraDataConnection = {
  fromId: number
  toId: number
  fromIndex: number
  toIndex: number
}

export type CompositeLayoutVirtualGraph = {
  virtualInputAnchors: CompositeLayoutVirtualInputAnchor[]
  virtualOutputAnchors: CompositeLayoutVirtualOutputAnchor[]
  layoutNodes: ServerNode[]
  extraDataConnections: CompositeLayoutExtraDataConnection[]
  virtualConsumerIds: number[]
  execLaneSpacingScale: number
}

export type CompositeLayoutOutput = {
  /** IR node id → layout coordinate for ordinary / synthetic call nodes only. */
  positions: Map<number, { x: number; y: number }>
  /** Diagnostic: virtual graph fed into shared layout engine. */
  virtualGraph: CompositeLayoutVirtualGraph
}

/**
 * Stable contract surface for tests and Phase 4 audits.
 */
export const COMPOSITE_LAYOUT_CONTRACT = {
  /**
   * Layout runs after capture normalization and before / during materialization
   * position assignment. It never invents pins, routes, or encoded indexes.
   */
  applicationOrder: 'after-capture-normalization' as const,
  /**
   * Virtual anchors exist only for shared layout engine consumption.
   * Materializers must not encode them as GraphNodes.
   */
  virtualAnchorsEncoded: false,
  /**
   * Positions returned to materializers cover only ordinaryNodes ids.
   * Virtual anchor coordinates are discarded.
   */
  returnsOrdinaryPositionsOnly: true,
  /**
   * InFlow anchors and OutParam consumers come from boundaryPins, not raw
   * def.compositePins. This keeps capture-redirected InFlow routes consistent
   * with normalize_capture / compositePins overlay.
   */
  boundaryPinsSource: 'capture-normalized' as const,
  virtualAnchorTypes: [
    COMPOSITE_INPUT_ANCHOR_TYPE,
    COMPOSITE_OUTPUT_ANCHOR_TYPE
  ] as const,
  defaultExecLaneSpacingScale: COMPOSITE_IMPL_EXEC_LANE_SPACING_SCALE,
  /**
   * Layout must not change node/pin/edge semantics. Only x/y coordinates.
   */
  mutatesNodePinSemantics: false
} as const

function maxNodeId(nodes: readonly { id: number }[]): number {
  return nodes.reduce((max, node) => Math.max(max, node.id), 0)
}

/**
 * Build virtual anchors + layout node list from capture-normalized graph inputs.
 * Pure: does not call the layout engine.
 */
export function buildCompositeLayoutVirtualGraph(
  input: CompositeLayoutInput
): CompositeLayoutVirtualGraph {
  const ordinaryNodes = input.ordinaryNodes
  const ordinaryEdges = input.ordinaryEdges
  const boundaryPins = input.boundaryPins
  const execLaneSpacingScale =
    input.execLaneSpacingScale ?? COMPOSITE_IMPL_EXEC_LANE_SPACING_SCALE

  const baseId = maxNodeId(ordinaryNodes)
  const inputPins = boundaryPins.filter(
    (entry) => entry.outerPinKind === NodePin_Index_Kind.InFlow
  )
  const inputPinsByOuterIndex = new Map<number, CompositePinEntry[]>()
  for (const entry of inputPins) {
    const pins = inputPinsByOuterIndex.get(entry.outerPinIndex) ?? []
    pins.push(entry)
    inputPinsByOuterIndex.set(entry.outerPinIndex, pins)
  }

  const virtualInputAnchors: CompositeLayoutVirtualInputAnchor[] = [
    ...inputPinsByOuterIndex.entries()
  ].map(([outerPinIndex, pins], index) => ({
    id: baseId + index + 1,
    type: COMPOSITE_INPUT_ANCHOR_TYPE,
    args: [],
    next: pins.map((pin) => ({
      node_id: pin.innerNodeId,
      source_index: 0,
      target_index: pin.innerPinIndex
    })),
    outerPinIndex
  }))

  const outputPins = boundaryPins.filter(
    (entry) => entry.outerPinKind === NodePin_Index_Kind.OutParam
  )
  const outputNodeIdBase = baseId + virtualInputAnchors.length
  const virtualOutputAnchors: CompositeLayoutVirtualOutputAnchor[] = outputPins.map(
    (_entry, index) => ({
      id: outputNodeIdBase + index + 1,
      type: COMPOSITE_OUTPUT_ANCHOR_TYPE,
      args: []
    })
  )

  const layoutNodes = [
    ...virtualInputAnchors,
    ...ordinaryNodes.map((node) => ({
      ...node,
      next: ordinaryEdges[node.id] ?? (node as { next?: NextConnection[] }).next
    })),
    ...virtualOutputAnchors
  ] as ServerNode[]

  const extraDataConnections: CompositeLayoutExtraDataConnection[] = outputPins.map(
    (entry, index) => ({
      fromId: entry.innerNodeId,
      toId: virtualOutputAnchors[index].id,
      fromIndex: entry.innerPinIndex,
      toIndex: entry.outerPinIndex
    })
  )

  return {
    virtualInputAnchors,
    virtualOutputAnchors,
    layoutNodes,
    extraDataConnections,
    virtualConsumerIds: virtualOutputAnchors.map((node) => node.id),
    execLaneSpacingScale
  }
}

/**
 * Compute impl-graph layout positions for ordinary / synthetic call nodes only.
 *
 * Virtual anchors drive shared placement but are stripped from the returned map so
 * materializers cannot accidentally encode them.
 */
export function computeCompositeImplLayout(
  input: CompositeLayoutInput
): CompositeLayoutOutput {
  const virtualGraph = buildCompositeLayoutVirtualGraph(input)
  const ordinaryIds = new Set(input.ordinaryNodes.map((node) => node.id))

  const graphInfo = buildExecutionGraph(virtualGraph.layoutNodes as any)
  const rawPositions = layoutPositions(
    virtualGraph.layoutNodes as any,
    graphInfo,
    input.compositeDefs ? [...input.compositeDefs] : [],
    {
      extraDataConnections: virtualGraph.extraDataConnections,
      virtualConsumerIds: virtualGraph.virtualConsumerIds,
      execLaneSpacingScale: virtualGraph.execLaneSpacingScale
    }
  )

  const positions = new Map<number, { x: number; y: number }>()
  for (const [nodeId, [x, y]] of rawPositions) {
    if (!ordinaryIds.has(nodeId)) continue
    positions.set(nodeId, { x, y })
  }

  return { positions, virtualGraph }
}
