// @ts-nocheck
/**
 * P5-W4: delete the empty legacy typed-identity adapter surface.
 *
 * Proves:
 * - composite.ts no longer hosts LEGACY_IMPL_TYPED_IDENTITY_NODE_TYPES /
 *   usesLegacyImplTypedIdentityAdapter / resolveLegacyImplTypedNodeId /
 *   legacyImplValueTypeSuffix
 * - inventory no longer lists the typed-identity adapter family
 * - node-graph variable concrete ids still come from shared resolveNodeIdentity
 * - shared backend is default; remaining legacy backend is present as fallback
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p5w4-empty-typed-identity-adapter-removal.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  COMPOSITE_ORCHESTRATION_CONTRACT,
  COMPOSITE_LEGACY_INVENTORY_CONTRACT,
  listLegacyOrdinaryCallSiteIds,
  listLegacyOrdinaryHelperSymbols
} from '../../dist/src/compiler/ir_to_gia_transform/composite.js'
import {
  LEGACY_ORDINARY_CALL_SITES,
  LEGACY_ORDINARY_HELPER_SYMBOLS
} from '../../dist/src/compiler/ir_to_gia_transform/legacy_ordinary_inventory.js'
import { resolveNodeIdentity } from '../../dist/src/compiler/ir_to_gia_transform/resolved_node.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const transformDir = join(root, 'src/compiler/ir_to_gia_transform')
const compositeSource = readFileSync(join(transformDir, 'composite.ts'), 'utf8')
const inventorySource = readFileSync(join(transformDir, 'legacy_ordinary_inventory.ts'), 'utf8')

// --- Empty adapter surface deleted ---
for (const symbol of [
  'usesLegacyImplTypedIdentityAdapter',
  'resolveLegacyImplTypedNodeId',
  'LEGACY_IMPL_TYPED_IDENTITY_NODE_TYPES',
  'legacyImplValueTypeSuffix'
]) {
  assert.equal(
    new RegExp(String.raw`\b${symbol}\b`).test(compositeSource),
    false,
    `P5-W4 must delete empty adapter symbol ${symbol} from composite.ts`
  )
  assert.equal(
    listLegacyOrdinaryHelperSymbols().includes(symbol),
    false,
    `inventory must not keep deleted helper ${symbol}`
  )
  assert.equal(
    LEGACY_ORDINARY_HELPER_SYMBOLS.includes(symbol),
    false,
    `LEGACY_ORDINARY_HELPER_SYMBOLS must not keep deleted helper ${symbol}`
  )
}

assert.equal(
  listLegacyOrdinaryCallSiteIds().includes('legacy-typed-identity-adapter'),
  false,
  'typed-identity adapter call-site must leave live inventory after deletion'
)
assert.equal(
  LEGACY_ORDINARY_CALL_SITES.some((site) => site.id === 'legacy-typed-identity-adapter'),
  false
)
assert.equal(
  LEGACY_ORDINARY_CALL_SITES.some((site) => site.family === 'typed-identity-adapter'),
  false
)
assert.match(
  inventorySource,
  /P5-W4/,
  'inventory must record the P5-W4 deletion'
)

// Node-graph concrete ids remain shared-resolution owned.
const context = {
  scope: { kind: 'composite-impl', name: 'p5w4-fixture' },
  variablesByName: new Map([
    ['floatValue', { name: 'floatValue', type: 'float' }],
    ['vecValue', { name: 'vecValue', type: 'vec3' }]
  ]),
  connectionTypes: new Map(),
  strictTypeChecks: true
}
assert.deepEqual(
  resolveNodeIdentity(
    {
      id: 1,
      type: 'set_node_graph_variable',
      args: [
        { type: 'str', value: 'floatValue' },
        { type: 'float', value: 0 }
      ]
    },
    context
  ),
  { logicalType: 'set_node_graph_variable', genericNodeId: 323, concreteNodeId: 324 }
)
assert.deepEqual(
  resolveNodeIdentity(
    {
      id: 2,
      type: 'get_node_graph_variable',
      args: [{ type: 'str', value: 'floatValue' }]
    },
    context
  ),
  { logicalType: 'get_node_graph_variable', genericNodeId: 337, concreteNodeId: 341 }
)
assert.deepEqual(
  resolveNodeIdentity(
    {
      id: 3,
      type: 'set_node_graph_variable',
      args: [
        { type: 'str', value: 'vecValue' },
        { type: 'vec3', value: [0, 1, 0] }
      ]
    },
    context
  ),
  { logicalType: 'set_node_graph_variable', genericNodeId: 323, concreteNodeId: 334 }
)

// gvConcreteNid field remains as shared concrete carrier for pin/materialize path.
assert.match(
  compositeSource,
  /const gvConcreteNid =\s*\n\s*node\.type === 'get_node_graph_variable' \|\| node\.type === 'set_node_graph_variable'/
)
assert.equal(
  /resolveLegacyImplTypedNodeId/.test(compositeSource),
  false
)

// Non-goals: do not delete the legacy backend.
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.defaultVendorImplGraphGate, true)
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.legacyOrdinaryBackendPresent, true)
assert.equal(COMPOSITE_LEGACY_INVENTORY_CONTRACT.defaultVendorImplGraphGate, true)
assert.equal(COMPOSITE_LEGACY_INVENTORY_CONTRACT.deletesLegacyBackend, false)
assert.ok(
  listLegacyOrdinaryCallSiteIds().includes('legacy-pin-builder-entry'),
  'handwritten pin builder remains after P5-W4'
)
assert.ok(
  listLegacyOrdinaryCallSiteIds().includes('legacy-materialize-node'),
  'handwritten materialize remains after P5-W4'
)
assert.match(compositeSource, /\bfunction\s+buildImplNodePins\s*\(/)
assert.match(compositeSource, /\bfunction\s+materializeLegacyImplGraphNode\s*\(/)

console.log('P5-W4 empty typed-identity adapter removal: PASS')
console.log(`  remainingHelpers=${listLegacyOrdinaryHelperSymbols().length}`)
console.log(`  remainingCallSites=${listLegacyOrdinaryCallSiteIds().length}`)
