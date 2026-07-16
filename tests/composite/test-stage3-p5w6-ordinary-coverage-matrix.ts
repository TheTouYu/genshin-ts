// @ts-nocheck
/**
 * P5-W6 / W1: root→shared-beta ordinary coverage matrix skeleton.
 *
 * Freezes grilling decisions A/A4/S4/P3/M3/C4/I4/F4/W1/E3 and builds a
 * machine-readable matrix from root live surfaces. Runs shared-beta encode
 * probes for residual concrete + generic print_string. Does not change the
 * production default backend or delete legacy helpers.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p5w6-ordinary-coverage-matrix.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  COMPOSITE_ORCHESTRATION_CONTRACT,
  ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT,
  ORDINARY_COVERAGE_GRILLING_DECISIONS,
  RESIDUAL_CONCRETE_WRAPPED_NODE_TYPES,
  SHARED_ENUMERATIONS_EQUAL_NODE_TYPES,
  SHARED_RESIDUAL_SCALAR_NODE_TYPES,
  listStaticOrdinaryCoverageRows,
  classifyStaticCoverageStatuses,
  listOrdinaryCoverageRowIds,
  assertCoverageMatrixInvariants,
  summarizeOrdinaryCoverage
} from '../../dist/src/compiler/ir_to_gia_transform/composite.js'
import { usesSharedVariantResolution } from '../../dist/src/compiler/ir_to_gia_transform/resolved_node.js'
import { runOrdinaryCoverageProbes } from '../../dist/src/compiler/ir_to_gia_transform/root_impl_ordinary_coverage_probe.js'
import { STAGE3_BACKEND_CONTRACT } from '../../dist/src/compiler/ir_to_gia_transform/stage3_backend.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const transformDir = join(root, 'src/compiler/ir_to_gia_transform')
const matrixSource = readFileSync(
  join(transformDir, 'root_impl_ordinary_coverage_matrix.ts'),
  'utf8'
)
const compositeSource = readFileSync(join(transformDir, 'composite.ts'), 'utf8')

// --- Contract freezes ---
// P5-W10 owns special-arg shared adapter; matrix contract phase advances with it.
assert.equal(ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT.phase, 'P5-W10')
assert.equal(ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT.workPackage, 'P5-W10')
assert.equal(ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT.deletesLegacyBackend, false)
assert.equal(ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT.changesProductionEncoding, true)
assert.equal(
  COMPOSITE_ORCHESTRATION_CONTRACT.ordinaryCoverageMatrix,
  ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT
)
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(STAGE3_BACKEND_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.legacyOrdinaryBackendPresent, true)

assert.deepEqual(ORDINARY_COVERAGE_GRILLING_DECISIONS, {
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
})

// --- Static matrix invariants ---
const staticRows = listStaticOrdinaryCoverageRows()
assertCoverageMatrixInvariants(staticRows)
const ids = listOrdinaryCoverageRowIds()
assert.equal(ids.length, staticRows.length)
assert.ok(ids.length >= 40, `expected broad root live surface rows, got ${ids.length}`)

const seen = new Set()
for (const row of staticRows) {
  assert.equal(seen.has(row.id), false, `duplicate ${row.id}`)
  seen.add(row.id)
  assert.ok(row.nodeType, `${row.id} needs nodeType`)
  assert.ok(row.evidence.length > 0, `${row.id} needs evidence`)
  assert.ok(
    ['shared-path', 'named-shared-adapter', 'boundary', 'root-unsupported'].includes(
      row.category
    ),
    `${row.id} bad category`
  )
}

// Residual-concrete identity empty after P5-W8; residual scalars + enumerations_equal shared.
assert.equal(RESIDUAL_CONCRETE_WRAPPED_NODE_TYPES.length, 0)
assert.deepEqual([...RESIDUAL_CONCRETE_WRAPPED_NODE_TYPES], [])
assert.equal(SHARED_RESIDUAL_SCALAR_NODE_TYPES.length, 13)
assert.deepEqual([...SHARED_ENUMERATIONS_EQUAL_NODE_TYPES], ['enumerations_equal'])
for (const nodeType of SHARED_RESIDUAL_SCALAR_NODE_TYPES) {
  assert.equal(
    usesSharedVariantResolution(nodeType),
    true,
    `${nodeType} should be on shared residual scalar identity`
  )
  assert.ok(
    ids.includes(`residual-scalar-${nodeType}`),
    `missing residual-scalar row for ${nodeType}`
  )
  assert.equal(ids.includes(`residual-concrete-${nodeType}`), false)
}
for (const nodeType of SHARED_ENUMERATIONS_EQUAL_NODE_TYPES) {
  assert.equal(usesSharedVariantResolution(nodeType), true)
  assert.ok(ids.includes(`enumerations-equal-${nodeType}`))
  assert.equal(ids.includes(`residual-concrete-${nodeType}`), false)
  assert.equal(ids.includes(`typed-identity-${nodeType}`), false)
}

// Shared binaries must not be residual
for (const nodeType of [
  'addition',
  'subtraction',
  'multiplication',
  'division',
  'equal',
  'less_than',
  'greater_than',
  'less_than_or_equal_to',
  'greater_than_or_equal_to'
]) {
  assert.equal(usesSharedVariantResolution(nodeType), true)
  assert.ok(ids.includes(`scalar-binary-${nodeType}`))
  assert.equal(ids.includes(`residual-concrete-${nodeType}`), false)
  assert.equal(ids.includes(`residual-scalar-${nodeType}`), false)
}

// Required family rows present
for (const id of [
  'generic-print_string',
  'dtc-family',
  'variable-get_node_graph_variable',
  'variable-set_node_graph_variable',
  'pin-hole-set_custom_variable',
  'special-arg-send_signal',
  'special-arg-assembly_list',
  'typed-identity-create_dictionary',
  'mode-specific-teleport_player',
  'special-id-send_signal',
  'graph-container-graphValues',
  'boundary-composite-call',
  'boundary-composite-capture',
  'root-unsupported-enum-signal-params',
  'root-unsupported-heterogeneous-scalar-binary'
]) {
  assert.ok(ids.includes(id), `missing required row ${id}`)
}

// Static classification
const classified = classifyStaticCoverageStatuses(staticRows)
const staticSummary = summarizeOrdinaryCoverage(classified)
assert.ok(staticSummary.green >= 15, `expected shared-identity greens, got ${staticSummary.green}`)
assert.equal(
  classified.find((r) => r.id === 'dtc-family')?.status,
  'green'
)
assert.equal(
  classified.find((r) => r.id === 'boundary-composite-call')?.status,
  'green'
)
assert.equal(
  classified.find((r) => r.id === 'root-unsupported-enum-signal-params')?.status,
  'unknown'
)
assert.equal(
  classified.find((r) => r.id === 'residual-scalar-modulo_operation')?.status,
  'green',
  'P5-W7 residual scalar shared identity is static green'
)
assert.equal(
  classified.find((r) => r.id === 'enumerations-equal-enumerations_equal')?.status,
  'green',
  'P5-W8 enumerations_equal shared identity is static green'
)
assert.equal(
  classified.find((r) => r.id === 'residual-concrete-enumerations_equal'),
  undefined,
  'enumerations_equal residual-concrete row must be gone'
)
assert.equal(
  classified.find((r) => r.id === 'pin-hole-set_custom_variable')?.status,
  'green',
  'P5-W9 pin-hole shared adapter is static green'
)
assert.equal(
  classified.find((r) => r.id === 'pin-hole-create_prefab')?.status,
  'green',
  'P5-W9 pin-hole create_prefab is static green'
)
assert.equal(
  classified.find((r) => r.id === 'special-arg-send_signal')?.status,
  'green',
  'P5-W10 special-arg send_signal is static green'
)
assert.equal(
  classified.find((r) => r.id === 'special-arg-assembly_list')?.status,
  'green',
  'P5-W10 special-arg assembly_list is static green'
)

// Source guards: matrix still wired through orchestration; residual table not rewritten into helper
assert.match(matrixSource, /changesProductionEncoding: true/)
assert.match(matrixSource, /P5-W10/)
assert.match(compositeSource, /ordinaryCoverageMatrix/)
assert.doesNotMatch(
  compositeSource,
  /resolveImplOrdinaryConcreteNodeId[\s\S]{0,80}RESIDUAL_CONCRETE/,
  'matrix must not rewrite residual identity path into composite helper'
)

// --- Shared-beta encode probes (E3) ---
const probeSummary = await runOrdinaryCoverageProbes({ enableSharedBeta: true })
assert.equal(probeSummary.total, staticRows.length)
assert.ok(probeSummary.green >= staticSummary.green, 'probe should not lose static greens')

const printRow = probeSummary.rows.find((r) => r.id === 'generic-print_string')
assert.ok(printRow, 'print row missing')
assert.equal(
  printRow.status,
  'green',
  `print_string probe expected green, got ${printRow.status}: ${printRow.reason}`
)

for (const nodeType of SHARED_RESIDUAL_SCALAR_NODE_TYPES) {
  const row = probeSummary.rows.find((r) => r.id === `residual-scalar-${nodeType}`)
  assert.ok(row, `missing residual-scalar row after probe: ${nodeType}`)
  assert.equal(
    row.status,
    'green',
    `residual-scalar ${nodeType} expected green under shared beta, got ${row.status}: ${row.reason}`
  )
}

const enumRow = probeSummary.rows.find((r) => r.id === 'enumerations-equal-enumerations_equal')
assert.equal(
  enumRow?.status,
  'green',
  `enumerations_equal probe expected green, got ${enumRow?.status}: ${enumRow?.reason}`
)

// Special-arg family shared in P5-W10; remaining named adapters stay unknown
for (const id of ['typed-identity-create_dictionary', 'graph-container-affiliations']) {
  const row = probeSummary.rows.find((r) => r.id === id)
  assert.equal(row?.status, 'unknown', `${id} should stay unknown`)
}
const pinHolePrefab = probeSummary.rows.find((r) => r.id === 'pin-hole-create_prefab')
assert.equal(
  pinHolePrefab?.status,
  'green',
  `pin-hole-create_prefab expected green after P5-W9, got ${pinHolePrefab?.status}`
)
const specialArgMonitor = probeSummary.rows.find((r) => r.id === 'special-arg-monitor_signal')
assert.equal(
  specialArgMonitor?.status,
  'green',
  `special-arg-monitor_signal expected green after P5-W10, got ${specialArgMonitor?.status}`
)

// Default gate unchanged after probes
assert.equal(STAGE3_BACKEND_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.defaultVendorImplGraphGate, false)

// Human-readable summary for the pack report
const byFamily = Object.entries(probeSummary.byFamily)
  .map(
    ([family, s]) =>
      `  ${family}: green=${s.green} red=${s.red} unknown=${s.unknown}`
  )
  .join('\n')
console.log(
  [
    'P5-W6/W7 ordinary coverage matrix OK',
    `total=${probeSummary.total} green=${probeSummary.green} red=${probeSummary.red} unknown=${probeSummary.unknown}`,
    byFamily,
    'defaultVendorImplGraphGate=false',
    'changesProductionEncoding=true'
  ].join('\n')
)
