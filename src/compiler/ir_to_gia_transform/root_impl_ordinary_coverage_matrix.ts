/**
 * P5-W6/W7: machine-readable root→shared-beta impl ordinary coverage matrix.
 *
 * Grilling decisions (shared understanding, 2026-07-15):
 * - A: capability complete on shared surface (not default cutover / legacy delete)
 * - A4: layered evidence (auto contract default; sentinels escalate)
 * - S4: complete surface = shared beta; default handwritten only preserves history
 * - P3: every ordinary root can emit today (incl. named adapters); root-unsupported excluded
 * - M3: one shared path + machine matrix; no per-API product implementation
 * - C4: row green default = structural contract + no composite-only ordinary fork
 * - I4: rows from root live surfaces, mapped to inventory categories
 * - F4: ordinary fixes only in shared layers; boundary modules for boundary only
 * - W1/E3: matrix + auto probes; P5-W7 residual scalar + P5-W8 enumerations_equal on shared resolver
 *
 * Evidence class: current source observation + automatic probe under shared beta.
 * Not a full game-validation claim. Does not flip default gate or delete legacy.
 */

import { SPECIAL_NODE_IDS } from './mappings.js'
import {
  ROOT_HIGH_RISK_PENDING_FAMILIES,
  ROOT_NAMED_PIN_HOLE_ADAPTER_NODE_TYPES,
  ROOT_NAMED_SPECIAL_ARG_ADAPTER_NODE_TYPES,
  ROOT_NAMED_TYPED_IDENTITY_ADAPTER_NODE_TYPES,
  ROOT_SHARED_ENUMERATIONS_EQUAL_NODE_TYPES,
  ROOT_SHARED_RESIDUAL_SCALAR_NODE_TYPES,
  ROOT_SHARED_SCALAR_SAME_TYPE_BINARY_NODE_TYPES,
  ROOT_SHARED_VARIABLE_NODE_TYPES,
  type RootOrdinaryCapabilityCategory
} from './root_ordinary_capability_inventory.js'
import { usesSharedVariantResolution } from './resolved_node.js'
import { STAGE3_BACKEND_CONTRACT } from './stage3_backend.js'

export type OrdinaryCoverageStatus = 'green' | 'red' | 'unknown'

export type OrdinaryCoverageProbeKind =
  | 'shared-identity'
  | 'generic-encode'
  | 'static-surface'
  | 'prior-evidence'
  | 'none'

export type OrdinaryCoverageRow = {
  /** Stable matrix row id. */
  id: string
  /** Representative IR node type / family key. */
  nodeType: string
  /** Inventory-aligned category (ADR-013). */
  category: RootOrdinaryCapabilityCategory
  /** Coarse family used for scheduling next packs. */
  family:
    | 'generic-ordinary'
    | 'variable'
    | 'dtc'
    | 'scalar-binary'
    | 'residual-scalar'
    | 'residual-concrete'
    | 'enumerations-equal'
    | 'pin-hole'
    | 'special-arg'
    | 'typed-identity'
    | 'mode-specific'
    | 'special-id'
    | 'graph-container'
    | 'boundary'
    | 'root-unsupported'
  /** Whether Composite still has a handwritten ordinary risk for this family. */
  compositeLegacyRisk: boolean
  /** Whether usesSharedVariantResolution covers this nodeType (exact match / prefix handled by probe). */
  sharedIdentity: boolean
  /** How this row was classified for W1 probing. */
  probeKind: OrdinaryCoverageProbeKind
  /** W1 auto probe result under shared beta. */
  status: OrdinaryCoverageStatus
  /** Short machine reason for status. */
  reason: string
  /** Evidence pointers (tests, inventory ids, source symbols). */
  evidence: readonly string[]
}

/**
 * Residual scalar ordinary families migrated to shared identity in P5-W7.
 * Still need concrete wrapping on handwritten pin path, but concrete id is shared.
 */
export const SHARED_RESIDUAL_SCALAR_NODE_TYPES = ROOT_SHARED_RESIDUAL_SCALAR_NODE_TYPES

/**
 * Residual concreteWrapped node types still served by resolveImplOrdinaryConcreteNodeId
 * under the handwritten identity path. Empty after P5-W8 (enumerations_equal shared).
 * Handwritten pin wrapping for migrated families may still use concreteWrappedNodeTypes.
 */
export const RESIDUAL_CONCRETE_WRAPPED_NODE_TYPES = [] as const

/** enumerations_equal shared enum-kind identity (P5-W8). */
export const SHARED_ENUMERATIONS_EQUAL_NODE_TYPES = ROOT_SHARED_ENUMERATIONS_EQUAL_NODE_TYPES

/** Unary residual families exercised by the shared-beta encode probe. */
export const RESIDUAL_UNARY_SCALAR_NODE_TYPES = [
  'logical_not_operation',
  'absolute_value_operation',
  'sign_operation',
  'arithmetic_square_root_operation',
  'round_to_integer_operation'
] as const

/** Binary residual families exercised by the shared-beta encode probe. */
export const RESIDUAL_BINARY_SCALAR_NODE_TYPES = [
  'modulo_operation',
  'exponentiation',
  'logical_and_operation',
  'logical_or_operation',
  'logical_xor_operation',
  'range_limiting_operation',
  'take_larger_value',
  'take_smaller_value'
] as const

/** High-risk pending families mirrored from stage3 backend diagnostics. */
export const COVERAGE_HIGH_RISK_PENDING_FAMILIES = ROOT_HIGH_RISK_PENDING_FAMILIES

/**
 * Grilling decision freeze for W1 documentation and contract tests.
 */
export const ORDINARY_COVERAGE_GRILLING_DECISIONS = {
  completionStandard: 'A-capability-on-shared-surface',
  evidenceStrategy: 'A4-layered',
  completeSurface: 'S4-shared-beta',
  coverageScope: 'P3-all-root-ordinary',
  workMethod: 'M3-shared-path-plus-matrix',
  rowPassCriteria: 'C4-structural-default-sentinel-escalate',
  matrixTruth: 'I4-root-live-surfaces',
  failureRepair: 'F4-shared-only-for-ordinary',
  firstWorkPackage: 'W1-matrix-skeleton',
  statusMethod: 'E3-static-plus-shared-beta-auto-probe'
} as const

export const ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT = {
  phase: 'P5-W8',
  workPackage: 'P5-W8',
  alias: 'W1-coverage-matrix+enumerations-equal-shared-identity',
  defaultVendorImplGraphGate: false,
  deletesLegacyBackend: false,
  /** P5-W7/W8 change ordinary concrete identity wiring (residual scalar + enumerations_equal). */
  changesProductionEncoding: true,
  completeSurface: 'shared-vendor-impl-graph-beta',
  grilling: ORDINARY_COVERAGE_GRILLING_DECISIONS,
  highRiskPendingFamilies: COVERAGE_HIGH_RISK_PENDING_FAMILIES,
  sharedResidualScalarNodeTypes: SHARED_RESIDUAL_SCALAR_NODE_TYPES,
  sharedEnumerationsEqualNodeTypes: SHARED_ENUMERATIONS_EQUAL_NODE_TYPES,
  residualConcreteWrappedNodeTypes: RESIDUAL_CONCRETE_WRAPPED_NODE_TYPES,
  /**
   * Status meanings under E3:
   * - green: auto probe passed under shared beta (or frozen prior auto evidence)
   * - red: auto probe failed / throws / composite-only fork detected
   * - unknown: no automatic sample constructed in this pack
   */
  statusMeanings: ['green', 'red', 'unknown'] as const,
  rules: {
    rowsFromRootLiveSurfaces: true,
    mapToInventoryCategory: true,
    noCompositeOnlyOrdinaryFork: true,
    notAFullGameValidationClaim: true,
    doesNotFlipDefaultGate: true
  }
} as const

function row(partial: OrdinaryCoverageRow): OrdinaryCoverageRow {
  return partial
}

/**
 * Build static matrix rows from root live surfaces (I4).
 * Status fields are placeholders; runCoverageProbes() fills them.
 */
export function listStaticOrdinaryCoverageRows(): OrdinaryCoverageRow[] {
  const rows: OrdinaryCoverageRow[] = []

  rows.push(
    row({
      id: 'generic-print_string',
      nodeType: 'print_string',
      category: 'shared-path',
      family: 'generic-ordinary',
      compositeLegacyRisk: true,
      sharedIdentity: false,
      probeKind: 'generic-encode',
      status: 'unknown',
      reason: 'pending-probe',
      evidence: ['shared-generic-ordinary-vendor', 'createOrdinaryVendorNode']
    })
  )

  for (const nodeType of ROOT_SHARED_VARIABLE_NODE_TYPES) {
    rows.push(
      row({
        id: `variable-${nodeType}`,
        nodeType,
        category: 'shared-path',
        family: 'variable',
        compositeLegacyRisk: true,
        sharedIdentity: usesSharedVariantResolution(nodeType),
        probeKind: 'shared-identity',
        status: 'unknown',
        reason: 'pending-probe',
        evidence: ['shared-variable-identity', 'resolveNodeIdentity']
      })
    )
  }

  rows.push(
    row({
      id: 'dtc-family',
      nodeType: 'data_type_conversion_*',
      category: 'shared-path',
      family: 'dtc',
      compositeLegacyRisk: true,
      sharedIdentity: true,
      probeKind: 'prior-evidence',
      status: 'unknown',
      reason: 'pending-probe',
      evidence: [
        'shared-dtc-identity',
        'tests/composite/test-stage3-p2w16-all-dtc-vendor-graph.ts'
      ]
    })
  )

  for (const nodeType of ROOT_SHARED_SCALAR_SAME_TYPE_BINARY_NODE_TYPES) {
    rows.push(
      row({
        id: `scalar-binary-${nodeType}`,
        nodeType,
        category: 'shared-path',
        family: 'scalar-binary',
        compositeLegacyRisk: true,
        sharedIdentity: usesSharedVariantResolution(nodeType),
        probeKind: 'shared-identity',
        status: 'unknown',
        reason: 'pending-probe',
        evidence: [
          'shared-scalar-same-type-binary',
          'tests/composite/test-stage3-p2w17a-scalar-arithmetic-observation.ts',
          'tests/composite/test-stage3-p2w18-scalar-comparison-observation.ts'
        ]
      })
    )
  }

  for (const nodeType of SHARED_RESIDUAL_SCALAR_NODE_TYPES) {
    rows.push(
      row({
        id: `residual-scalar-${nodeType}`,
        nodeType,
        category: 'shared-path',
        family: 'residual-scalar',
        compositeLegacyRisk: true,
        sharedIdentity: usesSharedVariantResolution(nodeType),
        probeKind: 'generic-encode',
        status: 'unknown',
        reason: 'pending-probe',
        evidence: [
          'shared-residual-scalar-identity',
          'usesSharedResidualScalarResolution',
          'P5-W7 residual scalar shared identity'
        ]
      })
    )
  }

  for (const nodeType of RESIDUAL_CONCRETE_WRAPPED_NODE_TYPES) {
    rows.push(
      row({
        id: `residual-concrete-${nodeType}`,
        nodeType,
        category: 'named-shared-adapter',
        family: 'residual-concrete',
        compositeLegacyRisk: true,
        sharedIdentity: usesSharedVariantResolution(nodeType),
        probeKind: 'static-surface',
        status: 'unknown',
        reason: 'pending-probe',
        evidence: ['resolveImplOrdinaryConcreteNodeId', 'concreteWrappedNodeTypes']
      })
    )
  }

  for (const nodeType of SHARED_ENUMERATIONS_EQUAL_NODE_TYPES) {
    rows.push(
      row({
        id: `enumerations-equal-${nodeType}`,
        nodeType,
        category: 'shared-path',
        family: 'enumerations-equal',
        compositeLegacyRisk: true,
        sharedIdentity: usesSharedVariantResolution(nodeType),
        probeKind: 'generic-encode',
        status: 'unknown',
        reason: 'pending-probe',
        evidence: [
          'shared-enumerations-equal-identity',
          'usesSharedEnumerationsEqualResolution',
          'P5-W8 enumerations_equal shared identity'
        ]
      })
    )
  }

  for (const nodeType of ROOT_NAMED_PIN_HOLE_ADAPTER_NODE_TYPES) {
    rows.push(
      row({
        id: `pin-hole-${nodeType}`,
        nodeType,
        category: 'named-shared-adapter',
        family: 'pin-hole',
        compositeLegacyRisk: true,
        sharedIdentity: usesSharedVariantResolution(nodeType),
        probeKind: 'static-surface',
        status: 'unknown',
        reason: 'pending-probe',
        evidence: ['adapter-pin-hole-layouts', 'index.ts:applySpecialArgs']
      })
    )
  }

  for (const nodeType of ROOT_NAMED_SPECIAL_ARG_ADAPTER_NODE_TYPES) {
    rows.push(
      row({
        id: `special-arg-${nodeType}`,
        nodeType,
        category: 'named-shared-adapter',
        family: 'special-arg',
        compositeLegacyRisk: true,
        sharedIdentity: usesSharedVariantResolution(nodeType),
        probeKind: 'static-surface',
        status: 'unknown',
        reason: 'pending-probe',
        evidence: ['adapter-special-arg-layouts', 'index.ts:applySpecialArgs']
      })
    )
  }

  for (const nodeType of ROOT_NAMED_TYPED_IDENTITY_ADAPTER_NODE_TYPES) {
    // Skip types already represented as residual/special-arg rows to keep one primary row.
    if (
      (RESIDUAL_CONCRETE_WRAPPED_NODE_TYPES as readonly string[]).includes(nodeType) ||
      (ROOT_NAMED_SPECIAL_ARG_ADAPTER_NODE_TYPES as readonly string[]).includes(nodeType)
    ) {
      continue
    }
    rows.push(
      row({
        id: `typed-identity-${nodeType}`,
        nodeType,
        category: 'named-shared-adapter',
        family: 'typed-identity',
        compositeLegacyRisk: true,
        sharedIdentity: usesSharedVariantResolution(nodeType),
        probeKind: 'static-surface',
        status: 'unknown',
        reason: 'pending-probe',
        evidence: ['adapter-typed-identity-root', 'node_id.ts:resolveGiaNodeId']
      })
    )
  }

  rows.push(
    row({
      id: 'mode-specific-teleport_player',
      nodeType: 'teleport_player',
      category: 'named-shared-adapter',
      family: 'mode-specific',
      compositeLegacyRisk: true,
      sharedIdentity: false,
      probeKind: 'static-surface',
      status: 'unknown',
      reason: 'pending-probe',
      evidence: ['adapter-mode-specific-identity', 'MODE_SPECIFIC_NODE_IDS']
    })
  )

  for (const nodeType of Object.keys(SPECIAL_NODE_IDS)) {
    if (nodeType === '__composite_capture__') continue
    rows.push(
      row({
        id: `special-id-${nodeType}`,
        nodeType,
        category: 'named-shared-adapter',
        family: 'special-id',
        compositeLegacyRisk: true,
        sharedIdentity: false,
        probeKind: 'static-surface',
        status: 'unknown',
        reason: 'pending-probe',
        evidence: ['adapter-special-node-ids', 'SPECIAL_NODE_IDS']
      })
    )
  }

  rows.push(
    row({
      id: 'graph-container-graphValues',
      nodeType: '*graphValues*',
      category: 'named-shared-adapter',
      family: 'graph-container',
      compositeLegacyRisk: false,
      sharedIdentity: false,
      probeKind: 'static-surface',
      status: 'unknown',
      reason: 'pending-probe',
      evidence: ['adapter-graph-values', 'highRiskPending:graphValues']
    }),
    row({
      id: 'graph-container-affiliations',
      nodeType: '*affiliations*',
      category: 'named-shared-adapter',
      family: 'graph-container',
      compositeLegacyRisk: false,
      sharedIdentity: false,
      probeKind: 'static-surface',
      status: 'unknown',
      reason: 'pending-probe',
      evidence: ['adapter-affiliations', 'highRiskPending:affiliations']
    })
  )

  rows.push(
    row({
      id: 'boundary-composite-call',
      nodeType: '__composite_call__',
      category: 'boundary',
      family: 'boundary',
      compositeLegacyRisk: false,
      sharedIdentity: false,
      probeKind: 'prior-evidence',
      status: 'unknown',
      reason: 'pending-probe',
      evidence: ['boundary-composite-call', 'lower_composite_call.ts']
    }),
    row({
      id: 'boundary-composite-capture',
      nodeType: '__composite_capture__',
      category: 'boundary',
      family: 'boundary',
      compositeLegacyRisk: false,
      sharedIdentity: false,
      probeKind: 'prior-evidence',
      status: 'unknown',
      reason: 'pending-probe',
      evidence: ['boundary-composite-capture', 'normalize_capture.ts']
    })
  )

  rows.push(
    row({
      id: 'root-unsupported-enum-signal-params',
      nodeType: 'send_signal|monitor_signal(enum-params)',
      category: 'root-unsupported',
      family: 'root-unsupported',
      compositeLegacyRisk: false,
      sharedIdentity: false,
      probeKind: 'static-surface',
      status: 'unknown',
      reason: 'pending-probe',
      evidence: ['root-unsupported-enum-signal-params']
    }),
    row({
      id: 'root-unsupported-heterogeneous-scalar-binary',
      nodeType: '*heterogeneous-scalar-binary*',
      category: 'root-unsupported',
      family: 'root-unsupported',
      compositeLegacyRisk: false,
      sharedIdentity: false,
      probeKind: 'static-surface',
      status: 'unknown',
      reason: 'pending-probe',
      evidence: ['root-unsupported-heterogeneous-scalar-binary']
    })
  )

  return rows
}

export type CoverageProbeSummary = {
  total: number
  green: number
  red: number
  unknown: number
  byFamily: Record<string, { green: number; red: number; unknown: number }>
  rows: OrdinaryCoverageRow[]
}

function summarize(rows: OrdinaryCoverageRow[]): CoverageProbeSummary {
  const byFamily: CoverageProbeSummary['byFamily'] = {}
  let green = 0
  let red = 0
  let unknown = 0
  for (const r of rows) {
    if (r.status === 'green') green++
    else if (r.status === 'red') red++
    else unknown++
    const bucket = byFamily[r.family] ?? { green: 0, red: 0, unknown: 0 }
    bucket[r.status]++
    byFamily[r.family] = bucket
  }
  return { total: rows.length, green, red, unknown, byFamily, rows }
}

/**
 * Apply static / prior-evidence classification without encoding.
 * Used by pure unit tests that should not import the full pipeline.
 */
export function classifyStaticCoverageStatuses(
  rows: readonly OrdinaryCoverageRow[] = listStaticOrdinaryCoverageRows()
): OrdinaryCoverageRow[] {
  return rows.map((r) => {
    if (r.category === 'root-unsupported') {
      return {
        ...r,
        status: 'unknown',
        reason: 'root-unsupported-excluded-from-p3-obligation',
        probeKind: 'static-surface'
      }
    }
    if (r.category === 'boundary') {
      return {
        ...r,
        status: 'green',
        reason: 'boundary-isolated-by-p4-contracts',
        probeKind: 'prior-evidence'
      }
    }
    if (r.family === 'graph-container') {
      return {
        ...r,
        status: 'unknown',
        reason: 'high-risk-pending-named-container',
        probeKind: 'static-surface'
      }
    }
    if (r.family === 'dtc') {
      return {
        ...r,
        status: 'green',
        reason: 'prior-auto-evidence-p2w16-shared-identity-and-vendor-graph',
        probeKind: 'prior-evidence'
      }
    }
    if (
      r.family === 'variable' ||
      r.family === 'scalar-binary' ||
      r.family === 'residual-scalar'
    ) {
      return {
        ...r,
        status: r.sharedIdentity ? 'green' : 'red',
        reason: r.sharedIdentity
          ? 'shared-identity-resolution-present'
          : 'missing-shared-identity',
        probeKind: 'shared-identity'
      }
    }
    if (r.family === 'residual-concrete') {
      return {
        ...r,
        status: 'unknown',
        reason: 'no-residual-concrete-identity-remaining-after-p5w8',
        probeKind: 'static-surface'
      }
    }
    if (r.family === 'enumerations-equal') {
      return {
        ...r,
        status: r.sharedIdentity ? 'green' : 'red',
        reason: r.sharedIdentity
          ? 'shared-identity-resolution-present'
          : 'missing-shared-identity',
        probeKind: 'shared-identity'
      }
    }
    if (
      r.family === 'pin-hole' ||
      r.family === 'special-arg' ||
      r.family === 'typed-identity' ||
      r.family === 'mode-specific' ||
      r.family === 'special-id'
    ) {
      return {
        ...r,
        status: 'unknown',
        reason: 'named-adapter-sample-not-auto-constructed-in-w1',
        probeKind: 'static-surface'
      }
    }
    if (r.family === 'generic-ordinary') {
      return {
        ...r,
        status: 'unknown',
        reason: 'awaiting-shared-beta-encode-probe',
        probeKind: 'generic-encode'
      }
    }
    return { ...r, status: 'unknown', reason: 'unclassified-family' }
  })
}

export function listOrdinaryCoverageRowIds(): readonly string[] {
  return listStaticOrdinaryCoverageRows().map((r) => r.id)
}

export function findOrdinaryCoverageRow(
  id: string,
  rows: readonly OrdinaryCoverageRow[] = listStaticOrdinaryCoverageRows()
): OrdinaryCoverageRow | undefined {
  return rows.find((r) => r.id === id)
}

export function assertCoverageMatrixInvariants(
  rows: readonly OrdinaryCoverageRow[] = listStaticOrdinaryCoverageRows()
): void {
  if (ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT.defaultVendorImplGraphGate !== false) {
    throw new Error('[coverage-matrix] must not flip default vendor gate')
  }
  // P5-W6 skeleton froze changesProductionEncoding=false; P5-W7 residual scalar
  // identity migration intentionally sets it true while keeping default gate false.
  if (STAGE3_BACKEND_CONTRACT.defaultVendorImplGraphGate !== false) {
    throw new Error('[coverage-matrix] stage3 default gate must remain false')
  }

  const seen = new Set<string>()
  for (const r of rows) {
    if (!r.id) throw new Error('[coverage-matrix] row missing id')
    if (seen.has(r.id)) throw new Error(`[coverage-matrix] duplicate row id ${r.id}`)
    seen.add(r.id)
    if (!r.nodeType) throw new Error(`[coverage-matrix] ${r.id} missing nodeType`)
    if (!r.evidence.length) throw new Error(`[coverage-matrix] ${r.id} missing evidence`)
  }

  // P5-W8: residual-concrete identity table empty; enumerations_equal is shared-path.
  if (RESIDUAL_CONCRETE_WRAPPED_NODE_TYPES.length !== 0) {
    throw new Error(
      `[coverage-matrix] expected 0 residual concrete types, got ${RESIDUAL_CONCRETE_WRAPPED_NODE_TYPES.length}`
    )
  }
  if (SHARED_RESIDUAL_SCALAR_NODE_TYPES.length !== 13) {
    throw new Error(
      `[coverage-matrix] expected 13 shared residual scalar types, got ${SHARED_RESIDUAL_SCALAR_NODE_TYPES.length}`
    )
  }
  if (SHARED_ENUMERATIONS_EQUAL_NODE_TYPES.length !== 1) {
    throw new Error(
      `[coverage-matrix] expected 1 shared enumerations_equal type, got ${SHARED_ENUMERATIONS_EQUAL_NODE_TYPES.length}`
    )
  }
  for (const nodeType of RESIDUAL_CONCRETE_WRAPPED_NODE_TYPES) {
    if (usesSharedVariantResolution(nodeType)) {
      throw new Error(
        `[coverage-matrix] residual ${nodeType} unexpectedly on shared identity; update residual table`
      )
    }
  }
  for (const nodeType of SHARED_RESIDUAL_SCALAR_NODE_TYPES) {
    if (!usesSharedVariantResolution(nodeType)) {
      throw new Error(
        `[coverage-matrix] shared residual scalar ${nodeType} missing shared identity`
      )
    }
  }
  for (const nodeType of SHARED_ENUMERATIONS_EQUAL_NODE_TYPES) {
    if (!usesSharedVariantResolution(nodeType)) {
      throw new Error(
        `[coverage-matrix] shared enumerations_equal ${nodeType} missing shared identity`
      )
    }
  }
  for (const nodeType of ROOT_SHARED_SCALAR_SAME_TYPE_BINARY_NODE_TYPES) {
    if (!usesSharedVariantResolution(nodeType)) {
      throw new Error(
        `[coverage-matrix] shared scalar binary ${nodeType} missing shared identity`
      )
    }
  }
}

export { summarize as summarizeOrdinaryCoverage }
