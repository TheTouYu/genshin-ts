import type {
  CompositePinEntry,
  ControlFlowDef,
  ParamFlowDef
} from '../../runtime/IR.js'
import {
  NodePin_Index_Kind,
  type CompositePin,
  type GraphNode
} from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'
import { encodeBoundaryPins } from './normalize_capture.js'

/**
 * CompositePins overlay is a pure Composite boundary step applied after ordinary /
 * call materialization and nodeIndex remap.
 *
 * Ownership:
 * - IR boundary routes → encoded GIA nodeIndex routes
 * - protobuf `CompositePin` records (`outerPin` / `innerNodeId` / `innerPin` / `innerPin2`)
 * - outer-definition / encoded-inner integrity checks
 *
 * Capture filtering, call pin schema, definition ParameterFlow and ordinary
 * materialization are out of scope. This module must not invent ordinary node/edge
 * semantics or change layout.
 *
 * Physical pin presence is intentionally optional under current materializers:
 * capture/sparse InParam holes, source-driven InFlow, ordinary OutFlow terminals
 * without outgoing edges, and pure-data passthrough OutParam. Production therefore
 * defaults to node existence + outer definition + uniqueness. Opt into
 * `requirePhysicalPins` only in focused contracts that provide complete pin sets.
 */

export type CompositePinsDefinitionInterface = {
  inflows?: readonly Pick<ControlFlowDef, 'index'>[]
  outflows?: readonly Pick<ControlFlowDef, 'index'>[]
  inputs?: readonly Pick<ParamFlowDef, 'index'>[]
  outputs?: readonly Pick<ParamFlowDef, 'index'>[]
}

export type CompositePinsOverlayInput = {
  /** Boundary routes still expressed with IR node ids (post-capture normalization). */
  boundaryPins: readonly CompositePinEntry[]
  /** IR node id → encoded GIA nodeIndex for ordinary + synthetic call nodes. */
  nodeIndexMap: ReadonlyMap<number, number>
  /**
   * When provided, outer pin kind/index must exist on the CompositeDef interface.
   * Optional so pure encode callers and pre-definition fixtures stay usable.
   */
  definition?: CompositePinsDefinitionInterface
  /**
   * When provided, each route's encoded inner node must exist on a materialised
   * GraphNode. Optional so pure encode callers can run without full impl nodes.
   */
  encodedNodes?: readonly GraphNode[]
  /**
   * When true (default), missing outer definition indexes or encoded inner nodes
   * throw. Only applies to checks that have the corresponding optional input.
   */
  strictIntegrity?: boolean
  /**
   * When true, also require a matching physical pin on the encoded node.
   * Defaults to false: current production materializers leave intentional pin holes
   * for capture/sparse InParam, InFlow targets, ordinary OutFlow terminals and some
   * pure-data OutParam passthroughs.
   */
  requirePhysicalPins?: boolean
}

export type EncodedBoundaryPin = CompositePinEntry & { encodedInnerNodeId: number }

export type CompositePinsOverlayOutput = {
  /** IR routes with encodedInnerNodeId filled from nodeIndexMap. */
  encodedBoundaryPins: EncodedBoundaryPin[]
  /** Protobuf compositePins written onto the impl GraphUnit NodeGraph. */
  compositePins: CompositePin[]
}

/**
 * Stable contract surface for tests and Phase 4 audits.
 */
export const COMPOSITE_PINS_OVERLAY_CONTRACT = {
  /**
   * Overlay consumes capture-normalized boundaryPins + nodeIndexMap after ordinary /
   * call materialization. It does not re-filter `__composite_capture__`.
   */
  applicationOrder: 'after-materialization' as const,
  /**
   * Real/current gsts encodings mirror innerPin onto innerPin2 for every route.
   * Overlay ownership includes that duplication; callers must not invent a second pin.
   */
  innerPin2MirrorsInnerPin: true,
  /**
   * Production default only asserts outer definition, encoded node and uniqueness.
   * Physical pin presence is opt-in (`requirePhysicalPins`) because materializers
   * currently leave intentional holes.
   */
  productionDefaultPhysicalPins: false,
  integrityChecks: [
    'outer-definition-pin-exists',
    'inner-encoded-node-exists',
    'inner-node-pin-exists',
    'kind-index-alignment',
    'node-index-map-alignment',
    'no-duplicate-physical-route'
  ] as const
}

function outerDefinitionIndexes(
  definition: CompositePinsDefinitionInterface | undefined,
  kind: number
): Set<number> | undefined {
  if (!definition) return undefined
  const list =
    kind === NodePin_Index_Kind.InFlow ? definition.inflows :
    kind === NodePin_Index_Kind.OutFlow ? definition.outflows :
    kind === NodePin_Index_Kind.InParam ? definition.inputs :
    kind === NodePin_Index_Kind.OutParam ? definition.outputs :
    undefined
  if (!list) return undefined
  return new Set(list.map((entry) => entry.index))
}

function pinKindLabel(kind: number): string {
  switch (kind) {
    case NodePin_Index_Kind.InFlow: return 'InFlow'
    case NodePin_Index_Kind.OutFlow: return 'OutFlow'
    case NodePin_Index_Kind.InParam: return 'InParam'
    case NodePin_Index_Kind.OutParam: return 'OutParam'
    default: return `kind(${kind})`
  }
}

function findEncodedNode(
  encodedNodes: readonly GraphNode[] | undefined,
  encodedNodeId: number
): GraphNode | undefined {
  return encodedNodes?.find((node) => node.nodeIndex === encodedNodeId)
}

function nodeHasPin(node: GraphNode, kind: number, index: number): boolean {
  return (node.pins ?? []).some((pin: any) => {
    const pinKind = pin?.i1?.kind ?? pin?.kind
    const pinIndex = pin?.i1?.index ?? pin?.index
    return pinKind === kind && pinIndex === index
  })
}

/**
 * Map one IR boundary pin onto a protobuf CompositePin after nodeIndex remap.
 * `innerPin2` always mirrors `innerPin` (current real/current gsts encoding).
 */
export function materializeCompositePin(entry: EncodedBoundaryPin): CompositePin {
  return {
    outerPin: {
      kind: entry.outerPinKind as NodePin_Index_Kind,
      index: entry.outerPinIndex
    },
    innerNodeId: entry.encodedInnerNodeId,
    innerPin: {
      kind: entry.innerPinKind as NodePin_Index_Kind,
      index: entry.innerPinIndex
    },
    innerPin2: {
      kind: entry.innerPinKind as NodePin_Index_Kind,
      index: entry.innerPinIndex
    }
  }
}

/**
 * Assert outer definition presence, encoded inner node presence and uniqueness of
 * physical routes. Optionally require physical pins when `requirePhysicalPins` is set.
 */
export function assertCompositePinsIntegrity(
  encodedBoundaryPins: readonly EncodedBoundaryPin[],
  options: {
    definition?: CompositePinsDefinitionInterface
    encodedNodes?: readonly GraphNode[]
    strictIntegrity?: boolean
    requirePhysicalPins?: boolean
  } = {}
): void {
  const strict = options.strictIntegrity !== false
  const requirePhysicalPins = options.requirePhysicalPins === true
  const seenPhysicalRoutes = new Set<string>()

  for (const entry of encodedBoundaryPins) {
    const outerLabel =
      `${pinKindLabel(entry.outerPinKind)}[${entry.outerPinIndex}]`
    const innerLabel =
      `${pinKindLabel(entry.innerPinKind)}[${entry.innerPinIndex}]`
    const routeLabel =
      `${outerLabel}->node ${entry.innerNodeId}/${entry.encodedInnerNodeId}.${innerLabel}`

    const outerIndexes = outerDefinitionIndexes(options.definition, entry.outerPinKind)
    if (outerIndexes && !outerIndexes.has(entry.outerPinIndex)) {
      const message =
        `[error] compositePins outer pin missing on definition: ${routeLabel}`
      if (strict) throw new Error(message)
    }

    if (
      entry.encodedInnerNodeId !== entry.innerNodeId &&
      entry.encodedInnerNodeId === undefined
    ) {
      const message =
        `[error] compositePins missing encodedInnerNodeId: ${routeLabel}`
      if (strict) throw new Error(message)
    }

    const physicalKey =
      `${entry.encodedInnerNodeId}:${entry.innerPinKind}:${entry.innerPinIndex}:` +
      `${entry.outerPinKind}:${entry.outerPinIndex}`
    if (seenPhysicalRoutes.has(physicalKey)) {
      const message =
        `[error] compositePins duplicate physical route: ${routeLabel}`
      if (strict) throw new Error(message)
    }
    seenPhysicalRoutes.add(physicalKey)

    if (!options.encodedNodes) continue

    const encodedNode = findEncodedNode(options.encodedNodes, entry.encodedInnerNodeId)
    if (!encodedNode) {
      const message =
        `[error] compositePins inner encoded node missing: ${routeLabel}`
      if (strict) throw new Error(message)
      continue
    }

    if (!requirePhysicalPins) continue

    if (!nodeHasPin(encodedNode, entry.innerPinKind, entry.innerPinIndex)) {
      const message =
        `[error] compositePins inner pin missing on encoded node: ${routeLabel}`
      if (strict) throw new Error(message)
    }
  }
}

/**
 * Build the impl GraphUnit `compositePins` overlay from capture-normalized boundary
 * routes and the materialised nodeIndex map.
 *
 * Does not modify ordinary nodes, call pins, definition ParameterFlow, layout, or
 * default backend selection.
 */
export function buildCompositePinsOverlay(
  input: CompositePinsOverlayInput
): CompositePinsOverlayOutput {
  const encodedBoundaryPins = encodeBoundaryPins(input.boundaryPins, input.nodeIndexMap)

  assertCompositePinsIntegrity(encodedBoundaryPins, {
    definition: input.definition,
    encodedNodes: input.encodedNodes,
    strictIntegrity: input.strictIntegrity,
    requirePhysicalPins: input.requirePhysicalPins
  })

  return {
    encodedBoundaryPins,
    compositePins: encodedBoundaryPins.map(materializeCompositePin)
  }
}
