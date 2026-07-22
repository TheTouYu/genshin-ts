/**
 * Phase 5 root ordinary capability inventory and exception audit (P5-W3).
 *
 * Machine-readable audit of ordinary capabilities the current root Stage 3
 * compiler can already emit. Each entry is classified so later packs can delete
 * legacy composite ordinary helpers without rediscovering root/impl forks.
 *
 * Classification (ADR-013):
 * - shared-path: root and vendor-gated impl share resolver / factory / materializer
 * - named-shared-adapter: root still has a named typed / pin / schema adapter that
 *   must be lifted into shared code or vendor, not into Composite-only fallback
 * - boundary: Composite / synthetic surface, not an ordinary capability
 * - root-unsupported: editor may support it, but current root Stage 3 does not
 *
 * Evidence class: current source observation + automatic static contract.
 * This is not a full API coverage claim, real-GIA claim, or game-behavior claim.
 * Shared vendor Graph is now the default; the handwritten backend remains as an explicit fallback.
 */

import { SPECIAL_NODE_IDS } from './mappings.js'
import { usesSharedVariantResolution } from './resolved_node.js'
import { STAGE3_BACKEND_CONTRACT } from './stage3_backend.js'

export type RootOrdinaryCapabilityCategory =
  | 'shared-path'
  | 'named-shared-adapter'
  | 'boundary'
  | 'root-unsupported'

export type RootOrdinaryCapabilityLayer =
  | 'identity-resolution'
  | 'node-factory'
  | 'literal-args'
  | 'edge-materialization'
  | 'graph-container'
  | 'dynamic-payload'
  | 'composite-boundary'

export type RootOrdinaryEvidenceClass =
  | 'source-observation'
  | 'automatic-contract'
  | 'partial-editor-validation'
  | 'unproven-game-behavior'

export type RootOrdinaryCapability = {
  /** Stable inventory id. */
  id: string
  /** Human-readable capability name. */
  name: string
  category: RootOrdinaryCapabilityCategory
  layer: RootOrdinaryCapabilityLayer
  /**
   * Representative IR node types / families covered by this entry.
   * Empty for graph-container or root-unsupported rows that are not node families.
   */
  nodeTypes: readonly string[]
  /** Root call sites / modules that currently express the capability. */
  rootSurfaces: readonly string[]
  /**
   * Shared replacement already present, or the named adapter that must remain
   * shared (never Composite-only). Empty only for pure boundary / unsupported.
   */
  sharedOrAdapterPath: string
  /**
   * True when Composite impl currently has a handwritten ordinary surface for the
   * same family and must not keep it as a permanent fork.
   */
  compositeLegacyRisk: boolean
  evidenceClass: RootOrdinaryEvidenceClass
  notes: string
}

/** Scalar same-type binary families already on shared identity resolution. */
export const ROOT_SHARED_SCALAR_SAME_TYPE_BINARY_NODE_TYPES = [
  'addition',
  'subtraction',
  'multiplication',
  'division',
  'equal',
  'greater_than',
  'less_than',
  'greater_than_or_equal_to',
  'less_than_or_equal_to'
] as const

/**
 * Residual scalar families migrated onto shared identity in P5-W7.
 */
export const ROOT_SHARED_RESIDUAL_SCALAR_NODE_TYPES = [
  'modulo_operation',
  'exponentiation',
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
  'take_smaller_value'
] as const

/** enumerations_equal enum-kind identity migrated onto shared resolver in P5-W8. */
export const ROOT_SHARED_ENUMERATIONS_EQUAL_NODE_TYPES = ['enumerations_equal'] as const

/** Variable getter/setter families already on shared identity resolution. */
export const ROOT_SHARED_VARIABLE_NODE_TYPES = [
  'set_node_graph_variable',
  'get_node_graph_variable',
  'set_custom_variable',
  'get_custom_variable',
  'set_local_variable',
  'get_local_variable'
] as const

/** Root-only pin-hole / special-arg layout adapters (must become shared adapters). */
export const ROOT_NAMED_PIN_HOLE_ADAPTER_NODE_TYPES = [
  'create_prefab',
  'create_prefab_group',
  'activate_disable_follow_motion_device',
  'activate_disable_collision_trigger_source',
  'activate_disable_character_disruptor_device',
  'activate_disable_pathfinding_obstacle_feature',
  'activate_disable_pathfinding_obstacle',
  'remove_unit_status',
  'set_custom_variable'
] as const

/** Root special-arg families beyond simple pin holes. */
export const ROOT_NAMED_SPECIAL_ARG_ADAPTER_NODE_TYPES = [
  'send_signal',
  'monitor_signal',
  'assembly_list',
  'assembly_dictionary',
  'multiple_branches'
] as const

/** Root typed-identity adapters still outside usesSharedVariantResolution. */
export const ROOT_NAMED_TYPED_IDENTITY_ADAPTER_NODE_TYPES = [
  'when_custom_variable_changes',
  'when_node_graph_variable_changes',
  'set_player_settlement_scoreboard_data_display',
  'assembly_list',
  'assembly_dictionary',
  'create_dictionary',
  'query_custom_variable_snapshot',
  'clear_dictionary',
  'get_list_of_keys_from_dictionary',
  'get_list_of_values_from_dictionary',
  'query_dictionary_s_length',
  'query_dictionary_value_by_key',
  'query_if_dictionary_contains_specific_key',
  'query_if_dictionary_contains_specific_value',
  'remove_key_value_pairs_from_dictionary_by_key',
  'set_or_add_key_value_pairs_to_dictionary',
  'sort_dictionary_by_key',
  'sort_dictionary_by_value'
] as const

/** High-risk families that may generate under beta but are not fully game-proven. */
export const ROOT_HIGH_RISK_PENDING_FAMILIES =
  STAGE3_BACKEND_CONTRACT.highRiskPendingFamilies

/**
 * Inventory of current root ordinary capabilities and exceptions.
 * Rows are intentionally coarse families, not every vendor node id.
 */
export const ROOT_ORDINARY_CAPABILITIES: readonly RootOrdinaryCapability[] = [
  {
    id: 'shared-generic-ordinary-vendor',
    name: 'Generic ordinary system node via vendor factory',
    category: 'shared-path',
    layer: 'node-factory',
    nodeTypes: ['*generic-ordinary*'],
    rootSurfaces: [
      'index.ts:createOrdinaryVendorNode',
      'ordinary_node_factory.ts',
      'node_id.ts:resolveGiaNodeId (generic / typed lookup)'
    ],
    sharedOrAdapterPath:
      'createOrdinaryVendorNode + normalizeOrdinaryVendorPins + resolveGiaNodeId',
    compositeLegacyRisk: true,
    evidenceClass: 'source-observation',
    notes:
      'Default root path for ordinary system nodes. Composite still has handwritten pin/materialize under default gate; vendor-gated impl reuses the factory.'
  },
  {
    id: 'shared-ordinary-edges',
    name: 'Ordinary data/flow edge materialization',
    category: 'shared-path',
    layer: 'edge-materialization',
    nodeTypes: ['*ordinary-edges*'],
    rootSurfaces: [
      'index.ts:materializeOrdinaryGraphEdges',
      'ordinary_graph_materializer.ts'
    ],
    sharedOrAdapterPath: 'materializeOrdinaryGraphEdges',
    compositeLegacyRisk: true,
    evidenceClass: 'automatic-contract',
    notes:
      'Root and vendor-gated impl closed ordinary subgraphs share the materializer. Synthetic call/capture edges stay outside.'
  },
  {
    id: 'shared-literal-args',
    name: 'Generic ordinary literal argument application',
    category: 'shared-path',
    layer: 'literal-args',
    nodeTypes: ['*generic-literals*'],
    rootSurfaces: [
      'index.ts:applyGenericArgs',
      'ordinary_node_factory.ts:applyOrdinaryLiteralArgs',
      'pins.ts:setLiteralArgValue / setEnumArgValue'
    ],
    sharedOrAdapterPath: 'applyOrdinaryLiteralArgs + pins helpers',
    compositeLegacyRisk: true,
    evidenceClass: 'source-observation',
    notes:
      'Root generic path already uses the shared literal helper. Special-arg families bypass it via named adapters.'
  },
  {
    id: 'shared-variable-identity',
    name: 'Variable getter/setter shared identity resolution',
    category: 'shared-path',
    layer: 'identity-resolution',
    nodeTypes: ROOT_SHARED_VARIABLE_NODE_TYPES,
    rootSurfaces: [
      'resolved_node.ts:resolveNodeIdentity',
      'node_id.ts:resolveGiaNodeId (delegates when concrete)',
      'resolved_node.ts:usesSharedVariantResolution'
    ],
    sharedOrAdapterPath: 'usesSharedVariantResolution + resolveNodeIdentity',
    compositeLegacyRisk: true,
    evidenceClass: 'partial-editor-validation',
    notes:
      'Scalar/list variable identities share root/impl resolution. Dict and unresolved types still fall through root named adapters / legacy impl helpers.'
  },
  {
    id: 'shared-dtc-identity',
    name: 'Data type conversion shared identity resolution',
    category: 'shared-path',
    layer: 'identity-resolution',
    nodeTypes: ['data_type_conversion_*'],
    rootSurfaces: [
      'resolved_node.ts:resolveNodeIdentity',
      'node_id.ts:resolveGiaNodeId',
      'resolved_node.ts:usesSharedVariantResolution'
    ],
    sharedOrAdapterPath: 'usesSharedVariantResolution + resolveNodeIdentity',
    compositeLegacyRisk: true,
    evidenceClass: 'partial-editor-validation',
    notes: 'DTC concrete variants are shared; not every conversion pair is game-proven.'
  },
  {
    id: 'shared-scalar-same-type-binary',
    name: 'Same-type int/float arithmetic and comparison',
    category: 'shared-path',
    layer: 'identity-resolution',
    nodeTypes: ROOT_SHARED_SCALAR_SAME_TYPE_BINARY_NODE_TYPES,
    rootSurfaces: [
      'resolved_node.ts:resolveNodeIdentity',
      'resolved_node.ts:usesSharedScalarSameTypeBinaryResolution',
      'node_id.ts:resolveGiaNodeId'
    ],
    sharedOrAdapterPath:
      'usesSharedScalarSameTypeBinaryResolution + resolveNodeIdentity',
    compositeLegacyRisk: true,
    evidenceClass: 'partial-editor-validation',
    notes:
      'Same-type int/float only. Heterogeneous arithmetic/comparison and non-int/float equal remain unclaimed.'
  },
  {
    id: 'shared-residual-scalar-identity',
    name: 'Residual scalar ordinary shared identity resolution',
    category: 'shared-path',
    layer: 'identity-resolution',
    nodeTypes: ROOT_SHARED_RESIDUAL_SCALAR_NODE_TYPES,
    rootSurfaces: [
      'resolved_node.ts:resolveNodeIdentity',
      'resolved_node.ts:usesSharedResidualScalarResolution',
      'node_id.ts:resolveGiaNodeId'
    ],
    sharedOrAdapterPath:
      'usesSharedResidualScalarResolution + resolveNodeIdentity',
    compositeLegacyRisk: true,
    evidenceClass: 'automatic-contract',
    notes:
      'P5-W7: residual scalar ops share root/impl concrete identity. Typed int/float variants use primary input suffix; generic-only ops stay on generic. Handwritten pin wrapping may still exist under default backend.'
  },
  {
    id: 'shared-enumerations-equal-identity',
    name: 'enumerations_equal shared enum-kind identity resolution',
    category: 'shared-path',
    layer: 'identity-resolution',
    nodeTypes: ROOT_SHARED_ENUMERATIONS_EQUAL_NODE_TYPES,
    rootSurfaces: [
      'resolved_node.ts:resolveNodeIdentity',
      'resolved_node.ts:usesSharedEnumerationsEqualResolution',
      'node_id.ts:resolveGiaNodeId'
    ],
    sharedOrAdapterPath:
      'usesSharedEnumerationsEqualResolution + resolveNodeIdentity',
    compositeLegacyRisk: true,
    evidenceClass: 'automatic-contract',
    notes:
      'P5-W8: enumerations_equal concrete id selected by enum kind (literal value key or connection enum metadata). Must not fall back to generic(475). Handwritten pin wrapping may still exist under default backend.'
  },
  {
    id: 'adapter-special-node-ids',
    name: 'Hard-coded SPECIAL_NODE_IDS ordinary identities',
    category: 'named-shared-adapter',
    layer: 'identity-resolution',
    nodeTypes: Object.keys(SPECIAL_NODE_IDS).filter(
      (type) => type !== '__composite_capture__'
    ),
    rootSurfaces: ['mappings.ts:SPECIAL_NODE_IDS', 'node_id.ts:resolveGiaNodeId'],
    sharedOrAdapterPath:
      'SPECIAL_NODE_IDS shared map (must not become Composite-only ids)',
    compositeLegacyRisk: true,
    evidenceClass: 'source-observation',
    notes:
      'Signal/structure special ids and capture id live in one map. Capture itself is boundary; signal/structure remain ordinary high-risk adapters.'
  },
  {
    id: 'adapter-special-node-mappings',
    name: 'IR node type alias mappings',
    category: 'named-shared-adapter',
    layer: 'identity-resolution',
    nodeTypes: ['*SPECIAL_NODE_MAPPINGS*'],
    rootSurfaces: ['mappings.ts:SPECIAL_NODE_MAPPINGS', 'node_id.ts', 'resolved_node.ts'],
    sharedOrAdapterPath: 'SPECIAL_NODE_MAPPINGS shared alias table',
    compositeLegacyRisk: false,
    evidenceClass: 'source-observation',
    notes: 'Alias table is already shared; keep maintenance in mappings, not Composite.'
  },
  {
    id: 'adapter-mode-specific-identity',
    name: 'Mode-specific node identity (classic/beyond)',
    category: 'named-shared-adapter',
    layer: 'identity-resolution',
    nodeTypes: ['teleport_player'],
    rootSurfaces: ['node_id.ts:MODE_SPECIFIC_NODE_IDS'],
    sharedOrAdapterPath: 'MODE_SPECIFIC_NODE_IDS shared adapter',
    compositeLegacyRisk: true,
    evidenceClass: 'source-observation',
    notes: 'Root-only mode table today; Composite must not invent a second mode map.'
  },
  {
    id: 'adapter-typed-identity-root',
    name: 'Root typed-identity adapters outside shared variant set',
    category: 'named-shared-adapter',
    layer: 'identity-resolution',
    nodeTypes: ROOT_NAMED_TYPED_IDENTITY_ADAPTER_NODE_TYPES,
    rootSurfaces: ['node_id.ts:resolveGiaNodeId typed branches'],
    sharedOrAdapterPath:
      'root typed-identity helpers in node_id.ts (lift into shared resolver later)',
    compositeLegacyRisk: true,
    evidenceClass: 'source-observation',
    notes:
      'Dict/list/event typed identities still live primarily in root resolveGiaNodeId. enumerations_equal moved to shared path in P5-W8. Composite handwritten identity must not permanently diverge.'
  },
  {
    id: 'adapter-pin-hole-layouts',
    name: 'Hidden pin / null-hole argument layout adapters',
    category: 'named-shared-adapter',
    layer: 'literal-args',
    nodeTypes: ROOT_NAMED_PIN_HOLE_ADAPTER_NODE_TYPES,
    rootSurfaces: [
      'pin_hole_adapter.ts',
      'index.ts:applySpecialArgs',
      'index.ts:remapInputIndexForHiddenPin',
      'composite.ts:pinHoleInputPinIndex'
    ],
    sharedOrAdapterPath:
      'pin_hole_adapter.ts (shared IR→physical hole remap + null-hole literal apply)',
    compositeLegacyRisk: false,
    evidenceClass: 'source-observation',
    notes:
      'P5-W9: full 9-node pin-hole family shared. Root applySpecialArgs and composite vendor/legacy paths call remapPinHoleInputIndex / applyPinHoleLiteralArgs. special-arg and typed-identity remain separate.'
  },
  {
    id: 'adapter-special-arg-layouts',
    name: 'Special argument layout families',
    category: 'named-shared-adapter',
    layer: 'literal-args',
    nodeTypes: ROOT_NAMED_SPECIAL_ARG_ADAPTER_NODE_TYPES,
    rootSurfaces: [
      'special_arg_adapter.ts',
      'index.ts:applySpecialArgs',
      'ordinary_node_factory.ts:applyOrdinaryLiteralArgs',
      'composite.ts:specialArgInputPinIndex'
    ],
    sharedOrAdapterPath:
      'special_arg_adapter.ts (shared signal / assembly / multiple_branches layouts)',
    compositeLegacyRisk: false,
    evidenceClass: 'source-observation',
    notes:
      'P5-W10: full 5-node special-arg family shared. Root applySpecialArgs and composite vendor/legacy paths call applySpecialArgLiteralArgs / remapSpecialArgInputIndex. Signal game behavior still high-risk pending; get_node_graph_variable name pin is separate.'
  },
  {
    id: 'adapter-graph-values',
    name: 'Graph variable container (graphValues)',
    category: 'named-shared-adapter',
    layer: 'graph-container',
    nodeTypes: [],
    rootSurfaces: ['index.ts:applyGraphVariables'],
    sharedOrAdapterPath: 'applyGraphVariables shared graph-container adapter',
    compositeLegacyRisk: false,
    evidenceClass: 'unproven-game-behavior',
    notes:
      'Cross-scope graphValues encoding is a named high-risk pending family (ADR-013 / P5-W2 diagnostics).'
  },
  {
    id: 'adapter-affiliations',
    name: 'Graph affiliations container',
    category: 'named-shared-adapter',
    layer: 'graph-container',
    nodeTypes: [],
    rootSurfaces: ['stage3_backend.ts:highRiskPendingFamilies'],
    sharedOrAdapterPath: 'named affiliations adapter (pending explicit shared surface)',
    compositeLegacyRisk: false,
    evidenceClass: 'unproven-game-behavior',
    notes:
      'Listed as high-risk pending; no Composite-only affiliations ordinary fallback is allowed.'
  },
  {
    id: 'boundary-composite-call',
    name: 'Synthetic composite call node',
    category: 'boundary',
    layer: 'composite-boundary',
    nodeTypes: ['__composite_call__'],
    rootSurfaces: [
      'index.ts:__composite_call__ branch',
      'lower_composite_call.ts',
      'composite.ts orchestration'
    ],
    sharedOrAdapterPath: '',
    compositeLegacyRisk: false,
    evidenceClass: 'automatic-contract',
    notes:
      'Boundary-only. Must not enter ordinary vendor Graph as a system node.'
  },
  {
    id: 'boundary-composite-capture',
    name: 'Synthetic composite capture node',
    category: 'boundary',
    layer: 'composite-boundary',
    nodeTypes: ['__composite_capture__'],
    rootSurfaces: [
      'normalize_capture.ts',
      'mappings.ts:SPECIAL_NODE_IDS.__composite_capture__',
      'build_composite_pins.ts'
    ],
    sharedOrAdapterPath: '',
    compositeLegacyRisk: false,
    evidenceClass: 'automatic-contract',
    notes: 'Boundary-only capture route; ordinary lowerer must not see capture nodes.'
  },
  {
    id: 'boundary-composite-definition-pins-layout',
    name: 'Composite definition / pins / layout overlay',
    category: 'boundary',
    layer: 'composite-boundary',
    nodeTypes: [],
    rootSurfaces: [
      'build_composite_definition.ts',
      'build_composite_pins.ts',
      'build_composite_layout.ts'
    ],
    sharedOrAdapterPath: '',
    compositeLegacyRisk: false,
    evidenceClass: 'automatic-contract',
    notes:
      'Composite incremental boundary (definition, compositePins, layout). Not ordinary capability.'
  },
  {
    id: 'root-unsupported-enum-signal-params',
    name: 'Enum-typed signal parameters',
    category: 'root-unsupported',
    layer: 'dynamic-payload',
    nodeTypes: ['send_signal', 'monitor_signal'],
    rootSurfaces: ['index.ts:connTypeInfoToNodeType'],
    sharedOrAdapterPath: '',
    compositeLegacyRisk: false,
    evidenceClass: 'source-observation',
    notes:
      'Current root throws: enum signal parameters are not supported in GIA conversion. Independent of Composite.'
  },
  {
    id: 'root-unsupported-heterogeneous-scalar-binary',
    name: 'Heterogeneous arithmetic / comparison',
    category: 'root-unsupported',
    layer: 'identity-resolution',
    nodeTypes: ROOT_SHARED_SCALAR_SAME_TYPE_BINARY_NODE_TYPES,
    rootSurfaces: ['resolved_node.ts:resolveNodeIdentity (same-type only)'],
    sharedOrAdapterPath: '',
    compositeLegacyRisk: false,
    evidenceClass: 'source-observation',
    notes:
      'Shared resolver only materializes same-type int/float concrete variants. Heterogeneous cases are not claimed as supported ordinary capability.'
  }
] as const

export const ROOT_ORDINARY_CAPABILITY_CONTRACT = {
  phase: 'P5-W3',
  /**
   * Inventory only. Does not delete handwritten backend.
   */
  defaultVendorImplGraphGate: true,
  deletesLegacyBackend: false,
  categories: [
    'shared-path',
    'named-shared-adapter',
    'boundary',
    'root-unsupported'
  ] as const satisfies readonly RootOrdinaryCapabilityCategory[],
  highRiskPendingFamilies: ROOT_HIGH_RISK_PENDING_FAMILIES,
  sharedVariantNodeTypes: [
    ...ROOT_SHARED_VARIABLE_NODE_TYPES,
    ...ROOT_SHARED_SCALAR_SAME_TYPE_BINARY_NODE_TYPES,
    ...ROOT_SHARED_RESIDUAL_SCALAR_NODE_TYPES,
    ...ROOT_SHARED_ENUMERATIONS_EQUAL_NODE_TYPES,
    'data_type_conversion_*'
  ] as const,
  capabilities: ROOT_ORDINARY_CAPABILITIES,
  /**
   * Audit rules frozen by P5-W3.
   */
  rules: {
    everyCapabilityMustBeClassified: true,
    sharedPathMustNameSharedSurface: true,
    namedAdapterMustNotBeCompositeOnly: true,
    boundaryMustNotClaimOrdinarySharedPath: true,
    highRiskPendingMustStayExplicit: true,
    notAFullGameValidationClaim: true
  }
} as const

export function listRootOrdinaryCapabilityIds(): readonly string[] {
  return ROOT_ORDINARY_CAPABILITIES.map((entry) => entry.id)
}

export function listRootOrdinaryCapabilitiesByCategory(
  category: RootOrdinaryCapabilityCategory
): readonly RootOrdinaryCapability[] {
  return ROOT_ORDINARY_CAPABILITIES.filter((entry) => entry.category === category)
}

export function findRootOrdinaryCapability(
  id: string
): RootOrdinaryCapability | undefined {
  return ROOT_ORDINARY_CAPABILITIES.find((entry) => entry.id === id)
}

export function assertSharedVariantInventoryConsistency(): void {
  for (const nodeType of ROOT_SHARED_VARIABLE_NODE_TYPES) {
    if (!usesSharedVariantResolution(nodeType)) {
      throw new Error(
        `[root-ordinary-inventory] expected shared variant resolution for ${nodeType}`
      )
    }
  }
  for (const nodeType of ROOT_SHARED_SCALAR_SAME_TYPE_BINARY_NODE_TYPES) {
    if (!usesSharedVariantResolution(nodeType)) {
      throw new Error(
        `[root-ordinary-inventory] expected shared variant resolution for ${nodeType}`
      )
    }
  }
  for (const nodeType of ROOT_SHARED_RESIDUAL_SCALAR_NODE_TYPES) {
    if (!usesSharedVariantResolution(nodeType)) {
      throw new Error(
        `[root-ordinary-inventory] expected shared residual scalar resolution for ${nodeType}`
      )
    }
  }
  for (const nodeType of ROOT_SHARED_ENUMERATIONS_EQUAL_NODE_TYPES) {
    if (!usesSharedVariantResolution(nodeType)) {
      throw new Error(
        `[root-ordinary-inventory] expected shared enumerations_equal resolution for ${nodeType}`
      )
    }
  }
  if (!usesSharedVariantResolution('data_type_conversion_int_to_str')) {
    throw new Error(
      '[root-ordinary-inventory] expected shared variant resolution for data_type_conversion_*'
    )
  }
}
