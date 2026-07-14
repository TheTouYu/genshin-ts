import type {
  CompositePinEntry,
  NextConnection,
  ServerNode
} from '../../runtime/IR.js'

/**
 * Capture normalization is a pure Composite boundary step.
 *
 * It removes the IR-only `__composite_capture__` placeholder before ordinary / call
 * lowering, rewrites capture-sourced flow edges, and redirects boundary pin routes that
 * still point at the capture node. Encoded GIA nodeIndex mapping is produced here so
 * later materialization and compositePins overlays share one deterministic index space.
 *
 * Ordinary lowerers must only consume `ordinaryNodes` / `ordinaryEdges`. They must never
 * observe `__composite_capture__` nodes or capture-source edges. Arg-level `capture: true`
 * remains a call / ordinary pin-builder concern (skip physical InParam only; P4-W7).
 */

export const COMPOSITE_CAPTURE_NODE_TYPE = '__composite_capture__' as const

/** Current gsts impl graphs reserve encoded indexes 0/1; ordinary nodes start at 2. */
export const DEFAULT_FIRST_ENCODED_NODE_INDEX = 2

export type CaptureNormalizationInput = {
  implNodes: readonly ServerNode[]
  implEdges: Readonly<Record<number, readonly NextConnection[]>>
  compositePins: readonly CompositePinEntry[]
  /** Encoded GIA nodeIndex assigned to the first ordinary impl node. Defaults to 2. */
  firstEncodedNodeIndex?: number
}

export type CaptureNormalizationOutput = {
  captureNodeId: number | undefined
  captureFirstChildId: number | undefined
  /** Nodes visible to ordinary + call lowering. Never contains `__composite_capture__`. */
  ordinaryNodes: ServerNode[]
  /** Flow edges with capture-source edges removed. */
  ordinaryEdges: Record<number, NextConnection[]>
  /**
   * Boundary routes still expressed with IR node ids.
   * InFlow routes that pointed at the capture node are redirected to its first child.
   */
  boundaryPins: CompositePinEntry[]
  /** IR node id → encoded GIA nodeIndex for `ordinaryNodes` only. */
  nodeIndexMap: Map<number, number>
}

/**
 * Fields / node kinds that ordinary lowerers must not see after normalization.
 * Kept as a stable contract surface for tests and Phase 4 audits.
 */
export const ORDINARY_LOWERER_FORBIDDEN_CAPTURE = {
  nodeTypes: [COMPOSITE_CAPTURE_NODE_TYPE] as const,
  /**
   * Arg-level capture markers still exist on ordinary / call nodes after this step.
   * Call lowerer and pin builders own them; ordinary factory must not invent capture
   * semantics from them beyond skipping physical InParam materialization.
   */
  remainingArgField: 'capture' as const
}

function getEdgeTarget(edge: NextConnection): number {
  return typeof edge === 'number' ? edge : edge.node_id
}

/**
 * Normalize composite capture placeholders into ordinary-graph input and boundary routes.
 */
export function normalizeCompositeCaptures(
  input: CaptureNormalizationInput
): CaptureNormalizationOutput {
  const firstEncodedNodeIndex = input.firstEncodedNodeIndex ?? DEFAULT_FIRST_ENCODED_NODE_INDEX
  const captureNodeId = input.implNodes.find(
    (node) => node.type === COMPOSITE_CAPTURE_NODE_TYPE
  )?.id

  let captureFirstChildId: number | undefined
  if (captureNodeId !== undefined) {
    const captureEdges = input.implEdges[captureNodeId]
    if (captureEdges && captureEdges.length > 0) {
      captureFirstChildId = getEdgeTarget(captureEdges[0])
    }
  }

  const ordinaryNodes = input.implNodes.filter(
    (node) => node.type !== COMPOSITE_CAPTURE_NODE_TYPE
  )

  const nodeIndexMap = new Map<number, number>()
  ordinaryNodes.forEach((node, index) => {
    nodeIndexMap.set(node.id, index + firstEncodedNodeIndex)
  })

  const ordinaryEdges: Record<number, NextConnection[]> = {}
  for (const [fromIdStr, edges] of Object.entries(input.implEdges)) {
    const fromId = Number(fromIdStr)
    if (fromId === captureNodeId) continue
    ordinaryEdges[fromId] = [...edges]
  }

  const boundaryPins = input.compositePins.map((entry) => {
    if (
      captureNodeId !== undefined &&
      entry.innerNodeId === captureNodeId &&
      captureFirstChildId !== undefined
    ) {
      return { ...entry, innerNodeId: captureFirstChildId }
    }
    return { ...entry }
  })

  return {
    captureNodeId,
    captureFirstChildId,
    ordinaryNodes,
    ordinaryEdges,
    boundaryPins,
    nodeIndexMap
  }
}

/**
 * Map IR-id boundary pins onto encoded GIA nodeIndex values.
 * Boundary overlay ownership stays outside ordinary materialization.
 */
export function encodeBoundaryPins(
  boundaryPins: readonly CompositePinEntry[],
  nodeIndexMap: ReadonlyMap<number, number>
): Array<CompositePinEntry & { encodedInnerNodeId: number }> {
  return boundaryPins.map((entry) => ({
    ...entry,
    encodedInnerNodeId: nodeIndexMap.get(entry.innerNodeId) ?? entry.innerNodeId
  }))
}
