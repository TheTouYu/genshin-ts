// @ts-nocheck
/**
 * P5-W3: root ordinary capability inventory and exception audit.
 *
 * Freezes a machine-readable classification of ordinary capabilities the current
 * root Stage 3 compiler can emit:
 * - shared-path
 * - named-shared-adapter
 * - boundary
 * - root-unsupported
 *
 * Does not delete legacy backend, does not flip the production default, and is
 * not a full game-validation claim.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p5w3-root-ordinary-capability-inventory.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  COMPOSITE_ORCHESTRATION_CONTRACT,
  ROOT_ORDINARY_CAPABILITY_CONTRACT,
  ROOT_ORDINARY_CAPABILITIES,
  ROOT_HIGH_RISK_PENDING_FAMILIES,
  ROOT_NAMED_PIN_HOLE_ADAPTER_NODE_TYPES,
  ROOT_NAMED_SPECIAL_ARG_ADAPTER_NODE_TYPES,
  ROOT_NAMED_TYPED_IDENTITY_ADAPTER_NODE_TYPES,
  ROOT_SHARED_SCALAR_SAME_TYPE_BINARY_NODE_TYPES,
  ROOT_SHARED_VARIABLE_NODE_TYPES,
  assertSharedVariantInventoryConsistency,
  findRootOrdinaryCapability,
  listRootOrdinaryCapabilitiesByCategory,
  listRootOrdinaryCapabilityIds
} from '../../dist/src/compiler/ir_to_gia_transform/composite.js'
import {
  usesSharedScalarSameTypeBinaryResolution,
  usesSharedVariantResolution
} from '../../dist/src/compiler/ir_to_gia_transform/resolved_node.js'
import { STAGE3_BACKEND_CONTRACT } from '../../dist/src/compiler/ir_to_gia_transform/stage3_backend.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const transformDir = join(root, 'src/compiler/ir_to_gia_transform')
const inventorySource = readFileSync(
  join(transformDir, 'root_ordinary_capability_inventory.ts'),
  'utf8'
)
const indexSource = readFileSync(join(transformDir, 'index.ts'), 'utf8')
const nodeIdSource = readFileSync(join(transformDir, 'node_id.ts'), 'utf8')
const compositeSource = readFileSync(join(transformDir, 'composite.ts'), 'utf8')
const resolvedSource = readFileSync(join(transformDir, 'resolved_node.ts'), 'utf8')

// --- Contract freezes ---
assert.equal(ROOT_ORDINARY_CAPABILITY_CONTRACT.phase, 'P5-W3')
assert.equal(ROOT_ORDINARY_CAPABILITY_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(ROOT_ORDINARY_CAPABILITY_CONTRACT.deletesLegacyBackend, false)
assert.deepEqual(ROOT_ORDINARY_CAPABILITY_CONTRACT.categories, [
  'shared-path',
  'named-shared-adapter',
  'boundary',
  'root-unsupported'
])
assert.equal(
  COMPOSITE_ORCHESTRATION_CONTRACT.defaultVendorImplGraphGate,
  false,
  'P5-W3 must not flip default vendor gate'
)
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.legacyOrdinaryBackendPresent, true)
assert.equal(
  COMPOSITE_ORCHESTRATION_CONTRACT.rootOrdinaryCapabilities,
  ROOT_ORDINARY_CAPABILITY_CONTRACT
)
assert.deepEqual(
  [...ROOT_HIGH_RISK_PENDING_FAMILIES],
  [...STAGE3_BACKEND_CONTRACT.highRiskPendingFamilies]
)

// --- Inventory completeness ---
const ids = listRootOrdinaryCapabilityIds()
assert.deepEqual(
  [...ids],
  ROOT_ORDINARY_CAPABILITIES.map((entry) => entry.id)
)
assert.ok(ids.length >= 15, 'inventory must cover main root ordinary families')
assert.ok(ids.includes('shared-generic-ordinary-vendor'))
assert.ok(ids.includes('shared-ordinary-edges'))
assert.ok(ids.includes('shared-variable-identity'))
assert.ok(ids.includes('shared-dtc-identity'))
assert.ok(ids.includes('shared-scalar-same-type-binary'))
assert.ok(ids.includes('adapter-typed-identity-root'))
assert.ok(ids.includes('adapter-pin-hole-layouts'))
assert.ok(ids.includes('adapter-special-arg-layouts'))
assert.ok(ids.includes('adapter-graph-values'))
assert.ok(ids.includes('boundary-composite-call'))
assert.ok(ids.includes('boundary-composite-capture'))
assert.ok(ids.includes('root-unsupported-enum-signal-params'))

const seen = new Set<string>()
for (const entry of ROOT_ORDINARY_CAPABILITIES) {
  assert.ok(entry.id.length > 0, 'capability id required')
  assert.equal(seen.has(entry.id), false, `duplicate capability id: ${entry.id}`)
  seen.add(entry.id)
  assert.ok(entry.name.length > 0, `${entry.id} needs name`)
  assert.ok(
    ROOT_ORDINARY_CAPABILITY_CONTRACT.categories.includes(entry.category),
    `${entry.id} has unknown category ${entry.category}`
  )
  assert.ok(entry.rootSurfaces.length > 0, `${entry.id} must list root surfaces`)
  assert.ok(entry.notes.length > 0, `${entry.id} must explain scope`)
  if (entry.category === 'shared-path' || entry.category === 'named-shared-adapter') {
    assert.ok(
      entry.sharedOrAdapterPath.length > 0,
      `${entry.id} must name shared/adapter path`
    )
  }
  if (entry.category === 'boundary') {
    assert.equal(
      entry.compositeLegacyRisk,
      false,
      `${entry.id}: boundary is not an ordinary legacy risk`
    )
    assert.equal(
      entry.sharedOrAdapterPath,
      '',
      `${entry.id}: boundary must not claim ordinary shared path`
    )
  }
  if (entry.category === 'root-unsupported') {
    assert.equal(
      entry.compositeLegacyRisk,
      false,
      `${entry.id}: unsupported root capability is not a Composite ordinary fork target`
    )
  }
}

const byCategory = {
  shared: listRootOrdinaryCapabilitiesByCategory('shared-path'),
  adapter: listRootOrdinaryCapabilitiesByCategory('named-shared-adapter'),
  boundary: listRootOrdinaryCapabilitiesByCategory('boundary'),
  unsupported: listRootOrdinaryCapabilitiesByCategory('root-unsupported')
}
assert.ok(byCategory.shared.length >= 5)
assert.ok(byCategory.adapter.length >= 5)
assert.ok(byCategory.boundary.length >= 3)
assert.ok(byCategory.unsupported.length >= 2)

// --- Shared variant tables match live resolver ---
assertSharedVariantInventoryConsistency()
for (const nodeType of ROOT_SHARED_VARIABLE_NODE_TYPES) {
  assert.equal(usesSharedVariantResolution(nodeType), true)
  assert.match(resolvedSource, new RegExp(String.raw`'${nodeType}'`))
}
for (const nodeType of ROOT_SHARED_SCALAR_SAME_TYPE_BINARY_NODE_TYPES) {
  assert.equal(usesSharedVariantResolution(nodeType), true)
  assert.equal(usesSharedScalarSameTypeBinaryResolution(nodeType), true)
  assert.match(resolvedSource, new RegExp(String.raw`'${nodeType}'`))
}
assert.equal(usesSharedVariantResolution('data_type_conversion_int_to_str'), true)

// --- Named adapters still present in root sources ---
for (const nodeType of ROOT_NAMED_PIN_HOLE_ADAPTER_NODE_TYPES) {
  assert.match(
    indexSource,
    new RegExp(String.raw`['"]${nodeType}['"]`),
    `root pin-hole adapter missing live surface: ${nodeType}`
  )
}
for (const nodeType of ROOT_NAMED_SPECIAL_ARG_ADAPTER_NODE_TYPES) {
  assert.match(
    indexSource,
    new RegExp(String.raw`['"]${nodeType}['"]`),
    `root special-arg adapter missing live surface: ${nodeType}`
  )
}
for (const nodeType of ROOT_NAMED_TYPED_IDENTITY_ADAPTER_NODE_TYPES) {
  assert.match(
    nodeIdSource,
    new RegExp(String.raw`['"]${nodeType}['"]`),
    `root typed-identity adapter missing live surface: ${nodeType}`
  )
}

assert.match(indexSource, /function\s+applyGraphVariables\b/)
assert.match(indexSource, /createOrdinaryVendorNode\b/)
assert.match(indexSource, /materializeOrdinaryGraphEdges\b/)
assert.match(indexSource, /applyOrdinaryLiteralArgs\b|applyGenericArgs\b/)
assert.match(indexSource, /enum signal parameters are not supported/)
assert.match(nodeIdSource, /MODE_SPECIFIC_NODE_IDS/)
assert.match(nodeIdSource, /enumerations_equal/)

// --- Boundary rows stay boundary ---
const call = findRootOrdinaryCapability('boundary-composite-call')
const capture = findRootOrdinaryCapability('boundary-composite-capture')
assert.equal(call?.category, 'boundary')
assert.equal(capture?.category, 'boundary')
assert.ok(call?.nodeTypes.includes('__composite_call__'))
assert.ok(capture?.nodeTypes.includes('__composite_capture__'))

// --- High-risk pending families stay explicit ---
for (const family of ['signal', 'dynamic-pin-payload', 'graphValues', 'affiliations']) {
  assert.ok(
    ROOT_HIGH_RISK_PENDING_FAMILIES.includes(family),
    `high-risk pending family missing: ${family}`
  )
}
assert.match(inventorySource, /adapter-graph-values/)
assert.match(inventorySource, /adapter-affiliations/)
assert.match(inventorySource, /adapter-special-arg-layouts/)

// --- No silent claim of full game validation / default switch ---
assert.match(inventorySource, /not a full API coverage claim/i)
assert.match(inventorySource, /does not flip the default gate/i)
assert.equal(ROOT_ORDINARY_CAPABILITY_CONTRACT.rules.notAFullGameValidationClaim, true)

// --- Composite still re-exports inventory and keeps legacy present ---
assert.match(compositeSource, /ROOT_ORDINARY_CAPABILITY_CONTRACT/)
assert.match(compositeSource, /rootOrdinaryCapabilities/)
assert.match(compositeSource, /legacyOrdinaryBackendPresent:\s*true/)
assert.match(compositeSource, /defaultVendorImplGraphGate:\s*false/)

// --- Composite legacy risk rows must not invent Composite-only ordinary path ---
const risky = ROOT_ORDINARY_CAPABILITIES.filter((entry) => entry.compositeLegacyRisk)
assert.ok(risky.length >= 5, 'inventory must flag remaining composite ordinary legacy risk')
for (const entry of risky) {
  assert.notEqual(
    entry.category,
    'boundary',
    `${entry.id}: boundary cannot be ordinary legacy risk`
  )
  assert.notEqual(
    entry.category,
    'root-unsupported',
    `${entry.id}: unsupported root capability is not composite legacy risk`
  )
  assert.ok(
    entry.sharedOrAdapterPath.length > 0,
    `${entry.id}: composite risk row must name shared replacement/adapter`
  )
}

console.log('P5-W3 root ordinary capability inventory contract: PASS')
console.log(
  `  capabilities=${ROOT_ORDINARY_CAPABILITIES.length}` +
    ` shared=${byCategory.shared.length}` +
    ` adapter=${byCategory.adapter.length}` +
    ` boundary=${byCategory.boundary.length}` +
    ` unsupported=${byCategory.unsupported.length}`
)
