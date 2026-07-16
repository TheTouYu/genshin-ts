/**
 * Phase 5 inventory of composite ordinary handwritten backend surfaces.
 *
 * P5-W1 does not delete legacy helpers or change the default gate. It freezes a
 * reusable call-site inventory and the no-legacy boundary rules so later packs
 * can delete helpers one call-site family at a time without rediscovering them.
 *
 * Evidence class: current source observation + automatic static contract.
 * This is not a game-behavior or real-GIA claim.
 */

export const COMPOSITE_LEGACY_ORDINARY_BACKEND_FILE =
  'src/compiler/ir_to_gia_transform/composite.ts' as const

/**
 * Boundary modules that must stay free of ordinary handwritten pin/schema helpers.
 * Call lowerer may build synthetic SysGraph pins only; it must not re-create ordinary
 * concrete-wrapper / NodePin helpers for system nodes.
 */
export const COMPOSITE_BOUNDARY_MODULES = [
  'normalize_capture.ts',
  'lower_composite_call.ts',
  'build_composite_definition.ts',
  'build_composite_pins.ts',
  'build_composite_layout.ts'
] as const

export type CompositeBoundaryModule = (typeof COMPOSITE_BOUNDARY_MODULES)[number]

/**
 * Ordinary handwritten helpers that still live in composite.ts and are Phase 5
 * deletion candidates. Names are source symbols, not runtime exports.
 */
export const LEGACY_ORDINARY_HELPER_SYMBOLS = [
  'resolveImplNodeId',
  'resolveImplOrdinaryConcreteNodeId',
  // P5-W4 deleted empty typed-identity adapter symbols:
  // legacyImplValueTypeSuffix / resolveLegacyImplTypedNodeId / usesLegacyImplTypedIdentityAdapter
  'argVarBaseClass',
  'argVarType',
  'buildImplNodePins',
  'materializeLegacyImplGraphNode',
  'buildConnPin',
  'buildLiteralPin',
  'buildPlaceholderPin',
  'wrapConcreteValue',
  'wrapConcreteValueForNodeInput',
  'needsConcreteWrapping',
  'concreteInputIndex',
  'concreteOutputIndex',
  'makeVarBaseValue',
  'getDtcInParamInfo',
  'inferInputTypeFromNode',
  'isDataProducerNode',
  'varTypeNameFromVarType'
] as const

export type LegacyOrdinaryHelperSymbol = (typeof LEGACY_ORDINARY_HELPER_SYMBOLS)[number]

export type LegacyOrdinaryCallSiteFamily =
  | 'identity-resolution'
  // P5-W4 removed the empty typed-identity-adapter family from live inventory.
  | 'pin-schema'
  | 'literal-pin'
  | 'connection-pin'
  | 'concrete-wrapper'
  | 'legacy-materialize'
  | 'vendor-gate-bridge'

export type LegacyOrdinaryCallSite = {
  /** Stable inventory id for later deletion packs. */
  id: string
  family: LegacyOrdinaryCallSiteFamily
  /** Helper or orchestration symbol that owns the legacy surface. */
  symbol: string
  /**
   * What still depends on this surface. Not a complete AST call graph; it is the
   * deletion-order inventory derived from current composite.ts structure.
   */
  callers: readonly string[]
  /**
   * Shared path that should replace this surface. Empty means still handwritten-only.
   */
  sharedReplacement: string
  /** Safe to delete only after these conditions hold. */
  deletionPreconditions: readonly string[]
  notes: string
}

/**
 * Reusable inventory of ordinary legacy call-site families still present after P4.
 * Boundary modules are intentionally absent from this list.
 */
export const LEGACY_ORDINARY_CALL_SITES: readonly LegacyOrdinaryCallSite[] = [
  {
    id: 'legacy-identity-resolveImplNodeId',
    family: 'identity-resolution',
    symbol: 'resolveImplNodeId',
    callers: ['buildImplGraphNodes'],
    sharedReplacement: 'resolveNodeIdentity / SPECIAL_NODE_IDS / getNodeIdLowerMap shared path',
    deletionPreconditions: [
      'all ordinary impl identities resolved through shared resolver',
      'no remaining SPECIAL_NODE_IDS-only branch required for impl'
    ],
    notes: 'Default generic/concrete nodeId fallback before shared-variant families take over.'
  },
  {
    id: 'legacy-identity-ordinaryConcrete',
    family: 'identity-resolution',
    symbol: 'resolveImplOrdinaryConcreteNodeId',
    callers: ['buildImplGraphNodes'],
    sharedReplacement: 'resolveNodeIdentity concreteNodeId for concrete-wrapped families',
    deletionPreconditions: [
      'scalar arithmetic/comparison residual scalar and enumerations_equal use shared identity',
      'no remaining concrete-wrapped ordinary family requires producedType suffix helper'
    ],
    notes:
      'P5-W8: residual scalar + enumerations_equal use shared identity; helper has no residual identity callers left (pin wrapping may still exist under default backend).'
  },
  // P5-W4: legacy-typed-identity-adapter removed (empty set + no production true callers).
  {
    id: 'legacy-pin-builder-entry',
    family: 'pin-schema',
    symbol: 'buildImplNodePins',
    callers: ['buildImplGraphNodes'],
    sharedReplacement: 'createOrdinaryVendorNode + normalizeOrdinaryVendorPins',
    deletionPreconditions: [
      'default backend is vendor/shared materializer',
      'arg-level capture skip preserved on shared path',
      'local/custom/getter temporary Graph branches replaced'
    ],
    notes: 'Ordinary-only after P4-W7; still the handwritten pin schema backend under default gate.'
  },
  {
    id: 'legacy-literal-pin',
    family: 'literal-pin',
    symbol: 'buildLiteralPin',
    callers: ['buildImplNodePins'],
    sharedReplacement: 'applyOrdinaryLiteralArgs / vendor Pin setters',
    deletionPreconditions: ['buildImplNodePins no longer materializes ordinary literals'],
    notes: 'Handwritten VarBase literal encoding + optional concrete wrapper.'
  },
  {
    id: 'legacy-connection-pin',
    family: 'connection-pin',
    symbol: 'buildConnPin',
    callers: ['buildImplNodePins'],
    sharedReplacement: 'vendor pin schema + shared edge materializer',
    deletionPreconditions: ['buildImplNodePins no longer materializes ordinary connection pins'],
    notes: 'Handwritten InParam placeholder for conn args.'
  },
  {
    id: 'legacy-placeholder-pin',
    family: 'pin-schema',
    symbol: 'buildPlaceholderPin',
    callers: ['buildImplNodePins'],
    sharedReplacement: 'vendor default pins for null args',
    deletionPreconditions: ['null-arg ordinary pins come from vendor node factory'],
    notes: 'Infers int/str/vec3 placeholders from node type names.'
  },
  {
    id: 'legacy-concrete-wrap-input',
    family: 'concrete-wrapper',
    symbol: 'wrapConcreteValueForNodeInput',
    callers: ['buildImplNodePins', 'buildLiteralPin'],
    sharedReplacement: 'vendor/shared concrete pin normalization',
    deletionPreconditions: [
      'needsConcreteWrapping families encoded by shared factory',
      'no handwritten bConcreteValue for ordinary system nodes'
    ],
    notes: 'Ordinary system-node concrete wrappers must leave composite.ts eventually.'
  },
  {
    id: 'legacy-concrete-wrap-output',
    family: 'concrete-wrapper',
    symbol: 'wrapConcreteValue',
    callers: ['buildImplNodePins'],
    sharedReplacement: 'vendor/shared OutParam concrete encoding',
    deletionPreconditions: ['ordinary OutParam concrete wrappers leave handwritten path'],
    notes: 'Used for DTC/data-producer OutParam concrete shells.'
  },
  {
    id: 'legacy-concrete-predicates',
    family: 'concrete-wrapper',
    symbol: 'needsConcreteWrapping',
    callers: [
      'buildImplNodePins',
      'buildLiteralPin',
      'buildPlaceholderPin',
      'isDataProducerNode',
      'resolveImplOrdinaryConcreteNodeId'
    ],
    sharedReplacement: 'shared family tables / resolved identity metadata',
    deletionPreconditions: ['concrete-wrapped node sets no longer consulted by handwritten pins'],
    notes: 'Includes concreteWrappedNodeTypes and DTC prefix checks.'
  },
  {
    id: 'legacy-type-maps',
    family: 'pin-schema',
    symbol: 'argVarType/argVarBaseClass/makeVarBaseValue',
    callers: [
      'buildConnPin',
      'buildLiteralPin',
      'buildPlaceholderPin',
      'getDtcInParamInfo',
      'buildImplNodePins'
    ],
    sharedReplacement: 'shared type maps used by root/vendor path',
    deletionPreconditions: ['no ordinary pin helper in composite.ts needs local type maps'],
    notes: 'Duplicated type maps also exist inside lower_composite_call for synthetic pins only.'
  },
  {
    id: 'legacy-materialize-node',
    family: 'legacy-materialize',
    symbol: 'materializeLegacyImplGraphNode',
    callers: ['buildImplGraphNodes'],
    sharedReplacement: 'materializeImplOrdinaryGraphWithVendor + materializeOrdinaryGraphEdges',
    deletionPreconditions: [
      'default backend switches after opt-in beta + user approval',
      'representative manifest revalidated on shared backend'
    ],
    notes: 'Default production path still assembles connects/x/y by hand.'
  },
  {
    id: 'legacy-vendor-gate-bridge',
    family: 'vendor-gate-bridge',
    symbol: 'materializeImplOrdinaryGraphWithVendor',
    callers: [
      'buildImplGraphNodes (shared-vendor-impl-graph via stage3_backend: config/CLI/env)'
    ],
    sharedReplacement: 'default shared ordinary materializer (no gate)',
    deletionPreconditions: [
      'opt-in beta configuration exists (P5-W2)',
      'default switch approved',
      'legacy backend deleted or quarantined'
    ],
    notes:
      'Opt-in beta bridge via options.stage3.vendorImplGraphBeta / --stage3-shared-impl-beta / GSTS_STAGE3_VENDOR_IMPL_GRAPH=1; not the deletion target of early P5 packs.'
  }
] as const

/**
 * Source patterns that boundary modules must not reintroduce for ordinary system nodes.
 * Call lowerer's synthetic pin builders are allowed only inside lower_composite_call.ts and
 * must not use ordinary concrete-wrapper markers.
 */
export const BOUNDARY_NO_LEGACY_FORBIDDEN_PATTERNS = [
  {
    id: 'no-ordinary-buildConnPin',
    pattern: /\bfunction\s+buildConnPin\b|\bbuildConnPin\s*\(/,
    message: 'boundary module must not host ordinary buildConnPin'
  },
  {
    id: 'no-ordinary-buildLiteralPin',
    pattern: /\bfunction\s+buildLiteralPin\b|\bbuildLiteralPin\s*\(/,
    message: 'boundary module must not host ordinary buildLiteralPin'
  },
  {
    id: 'no-ordinary-buildPlaceholderPin',
    pattern: /\bfunction\s+buildPlaceholderPin\b|\bbuildPlaceholderPin\s*\(/,
    message: 'boundary module must not host ordinary buildPlaceholderPin'
  },
  {
    id: 'no-ordinary-wrapConcreteValueForNodeInput',
    pattern: /\bwrapConcreteValueForNodeInput\b/,
    message: 'boundary module must not reimplement ordinary concrete input wrappers'
  },
  {
    id: 'no-ordinary-needsConcreteWrapping',
    pattern: /\bneedsConcreteWrapping\b/,
    message: 'boundary module must not decide ordinary concrete wrapping'
  },
  {
    id: 'no-ordinary-resolveImplNodeId',
    pattern: /\bresolveImplNodeId\b/,
    message: 'boundary module must not resolve ordinary impl node ids'
  },
  {
    id: 'no-ordinary-buildImplNodePins',
    pattern: /\bbuildImplNodePins\b/,
    message: 'boundary module must not call ordinary handwritten pin builder'
  },
  {
    id: 'no-handwritten-bConcreteValue',
    pattern: /\bbConcreteValue\b/,
    message: 'boundary module must not hand-write ordinary bConcreteValue shells'
  }
] as const

/** Patterns allowed only as synthetic call pin helpers inside lower_composite_call.ts. */
export const CALL_BOUNDARY_ALLOWED_SYNTHETIC_PIN_HELPERS = [
  'buildCallConnPin',
  'buildCallLiteralPin',
  'argVarBaseClass',
  'argVarType',
  'makeVarBaseValue'
] as const

export const COMPOSITE_LEGACY_INVENTORY_CONTRACT = {
  phase: 'P5-W1',
  backendFile: COMPOSITE_LEGACY_ORDINARY_BACKEND_FILE,
  boundaryModules: COMPOSITE_BOUNDARY_MODULES,
  helperSymbols: LEGACY_ORDINARY_HELPER_SYMBOLS,
  callSites: LEGACY_ORDINARY_CALL_SITES,
  /**
   * Default production backend remains handwritten. This inventory does not flip the gate.
   */
  defaultVendorImplGraphGate: false,
  deletesLegacyBackend: false,
  noLegacyAssertions: {
    boundaryModulesMustNotRebuildOrdinaryPins: true,
    boundaryModulesMustNotHandWriteOrdinaryConcrete: true,
    callLowererSyntheticPinsAllowed: true
  }
} as const

export function listLegacyOrdinaryHelperSymbols(): readonly string[] {
  return LEGACY_ORDINARY_HELPER_SYMBOLS
}

export function listLegacyOrdinaryCallSiteIds(): readonly string[] {
  return LEGACY_ORDINARY_CALL_SITES.map((site) => site.id)
}

export function findLegacyOrdinaryCallSite(id: string): LegacyOrdinaryCallSite | undefined {
  return LEGACY_ORDINARY_CALL_SITES.find((site) => site.id === id)
}
