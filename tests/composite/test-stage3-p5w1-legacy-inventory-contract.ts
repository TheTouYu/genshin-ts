// @ts-nocheck
/**
 * P5-W1: no-legacy assertions / legacy ordinary call-site inventory.
 *
 * Freezes the reusable inventory of handwritten ordinary helpers still living in
 * composite.ts, and asserts boundary modules do not rebuild ordinary pin/schema
 * helpers or hand-write ordinary bConcreteValue shells.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p5w1-legacy-inventory-contract.ts
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  COMPOSITE_ORCHESTRATION_CONTRACT,
  COMPOSITE_LEGACY_INVENTORY_CONTRACT,
  listLegacyOrdinaryCallSiteIds,
  listLegacyOrdinaryHelperSymbols
} from '../../dist/src/compiler/ir_to_gia_transform/composite.js'
import {
  BOUNDARY_NO_LEGACY_FORBIDDEN_PATTERNS,
  CALL_BOUNDARY_ALLOWED_SYNTHETIC_PIN_HELPERS,
  COMPOSITE_BOUNDARY_MODULES,
  COMPOSITE_LEGACY_ORDINARY_BACKEND_FILE,
  LEGACY_ORDINARY_CALL_SITES,
  LEGACY_ORDINARY_HELPER_SYMBOLS
} from '../../dist/src/compiler/ir_to_gia_transform/legacy_ordinary_inventory.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const transformDir = join(root, 'src/compiler/ir_to_gia_transform')
const compositeSourcePath = join(root, COMPOSITE_LEGACY_ORDINARY_BACKEND_FILE)
const compositeSource = readFileSync(compositeSourcePath, 'utf8')

assert.equal(COMPOSITE_LEGACY_INVENTORY_CONTRACT.phase, 'P5-W1')
assert.equal(COMPOSITE_LEGACY_INVENTORY_CONTRACT.deletesLegacyBackend, false)
assert.equal(COMPOSITE_LEGACY_INVENTORY_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(
  COMPOSITE_ORCHESTRATION_CONTRACT.legacyOrdinaryBackendPresent,
  true,
  'P5-W1 must not claim legacy backend already removed'
)
assert.equal(
  COMPOSITE_ORCHESTRATION_CONTRACT.defaultVendorImplGraphGate,
  false,
  'P5-W1 must not flip default vendor gate'
)
assert.equal(
  COMPOSITE_ORCHESTRATION_CONTRACT.legacyInventory,
  COMPOSITE_LEGACY_INVENTORY_CONTRACT
)

const helperSymbols = listLegacyOrdinaryHelperSymbols()
assert.deepEqual([...helperSymbols], [...LEGACY_ORDINARY_HELPER_SYMBOLS])
assert.ok(helperSymbols.length >= 15, 'inventory must cover the main handwritten helpers')

for (const symbol of LEGACY_ORDINARY_HELPER_SYMBOLS) {
  if (symbol === 'argVarType') {
    assert.match(
      compositeSource,
      /function\s+argVarType\s*\(/,
      `composite.ts must still define ${symbol} until a later deletion pack`
    )
    continue
  }
  if (symbol === 'argVarBaseClass') {
    assert.match(
      compositeSource,
      /function\s+argVarBaseClass\s*\(/,
      `composite.ts must still define ${symbol} until a later deletion pack`
    )
    continue
  }
  if (symbol.includes('/')) {
    continue
  }
  // Combined inventory rows use slash names; individual helpers are plain identifiers.
  if (symbol === 'argVarType/argVarBaseClass/makeVarBaseValue') continue
  assert.match(
    compositeSource,
    new RegExp(String.raw`\b${symbol}\b`),
    `composite.ts inventory symbol missing: ${symbol}`
  )
}

// Combined type-map row is inventory metadata only.
assert.match(compositeSource, /function\s+makeVarBaseValue\s*\(/)

const callSiteIds = listLegacyOrdinaryCallSiteIds()
assert.deepEqual(
  [...callSiteIds],
  LEGACY_ORDINARY_CALL_SITES.map((site) => site.id)
)
assert.ok(callSiteIds.includes('legacy-pin-builder-entry'))
assert.ok(callSiteIds.includes('legacy-materialize-node'))
assert.ok(callSiteIds.includes('legacy-vendor-gate-bridge'))

for (const site of LEGACY_ORDINARY_CALL_SITES) {
  assert.ok(site.id.length > 0)
  assert.ok(site.callers.length > 0, `${site.id} must list callers`)
  assert.ok(site.deletionPreconditions.length > 0, `${site.id} must list deletion gates`)
  assert.ok(site.sharedReplacement.length > 0, `${site.id} must name shared replacement`)
}

// Every inventoried helper family still has a live symbol or known combined surface.
const requiredLiveHelpers = [
  'resolveImplNodeId',
  'buildImplNodePins',
  'materializeLegacyImplGraphNode',
  'buildConnPin',
  'buildLiteralPin',
  'wrapConcreteValueForNodeInput',
  'needsConcreteWrapping',
  'materializeImplOrdinaryGraphWithVendor'
]
for (const helper of requiredLiveHelpers) {
  assert.match(
    compositeSource,
    new RegExp(String.raw`\bfunction\s+${helper}\s*\(|\b${helper}\b`),
    `live legacy helper missing from composite.ts: ${helper}`
  )
}

// Boundary modules: no ordinary handwritten pin/schema rebuild.
assert.deepEqual(
  [...COMPOSITE_BOUNDARY_MODULES],
  [
    'normalize_capture.ts',
    'lower_composite_call.ts',
    'build_composite_definition.ts',
    'build_composite_pins.ts',
    'build_composite_layout.ts'
  ]
)

const boundaryFiles = COMPOSITE_BOUNDARY_MODULES.map((name) => ({
  name,
  source: readFileSync(join(transformDir, name), 'utf8')
}))

for (const file of boundaryFiles) {
  for (const rule of BOUNDARY_NO_LEGACY_FORBIDDEN_PATTERNS) {
    assert.equal(
      rule.pattern.test(file.source),
      false,
      `${file.name}: ${rule.message} (${rule.id})`
    )
  }
}

// Synthetic call pin helpers remain allowed and expected in call lowerer only.
const callSource = boundaryFiles.find((file) => file.name === 'lower_composite_call.ts')?.source
assert.ok(callSource)
for (const helper of CALL_BOUNDARY_ALLOWED_SYNTHETIC_PIN_HELPERS) {
  assert.match(
    callSource,
    new RegExp(String.raw`\b${helper}\b`),
    `call lowerer must keep synthetic helper ${helper}`
  )
  for (const file of boundaryFiles) {
    if (file.name === 'lower_composite_call.ts') continue
    assert.equal(
      new RegExp(String.raw`\b${helper}\b`).test(file.source),
      false,
      `${file.name} must not host call synthetic helper ${helper}`
    )
  }
}

// Inventory module itself must not become another ordinary pin backend.
const inventorySource = readFileSync(
  join(transformDir, 'legacy_ordinary_inventory.ts'),
  'utf8'
)
assert.equal(/\bbConcreteValue\b/.test(inventorySource), true) // mentioned as forbidden pattern text
assert.equal(/\bfunction\s+buildLiteralPin\b/.test(inventorySource), false)
assert.equal(/\bfunction\s+buildConnPin\b/.test(inventorySource), false)
assert.equal(/\bfunction\s+buildImplNodePins\b/.test(inventorySource), false)

// Guard against accidental new boundary modules that reintroduce ordinary helpers:
// every *.ts boundary builder named build_composite_* / lower_composite_* / normalize_capture
// under transform dir is covered by COMPOSITE_BOUNDARY_MODULES.
const transformFiles = readdirSync(transformDir).filter((name) => name.endsWith('.ts'))
const discoveredBoundary = transformFiles.filter((name) =>
  /^(normalize_capture|lower_composite_|build_composite_)/.test(name)
)
assert.deepEqual(
  discoveredBoundary.sort(),
  [...COMPOSITE_BOUNDARY_MODULES].sort(),
  'boundary module inventory must match transform directory boundary files'
)

console.log('P5-W1 legacy inventory / no-legacy contract: PASS')
console.log(`  helpers=${helperSymbols.length} callSites=${callSiteIds.length}`)
console.log(`  boundaryModules=${COMPOSITE_BOUNDARY_MODULES.length}`)
