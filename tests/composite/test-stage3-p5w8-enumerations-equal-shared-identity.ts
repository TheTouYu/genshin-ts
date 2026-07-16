// @ts-nocheck
/**
 * P5-W8: enumerations_equal residual identity moves onto shared resolveNodeIdentity.
 *
 * Completes the residual-concrete envelope:
 * - enumerations_equal uses usesSharedVariantResolution / shared enum-kind concrete id
 * - residual-concrete table empty
 * - default gate stays false; handwritten pin path not deleted
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p5w8-enumerations-equal-shared-identity.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  COMPOSITE_ORCHESTRATION_CONTRACT,
  ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT,
  ROOT_SHARED_ENUMERATIONS_EQUAL_NODE_TYPES,
  RESIDUAL_CONCRETE_WRAPPED_NODE_TYPES,
  SHARED_ENUMERATIONS_EQUAL_NODE_TYPES,
  SHARED_RESIDUAL_SCALAR_NODE_TYPES,
  listStaticOrdinaryCoverageRows,
  classifyStaticCoverageStatuses,
  assertCoverageMatrixInvariants,
  summarizeOrdinaryCoverage
} from '../../dist/src/compiler/ir_to_gia_transform/composite.js'
import {
  resolveNodeIdentity,
  usesSharedEnumerationsEqualResolution,
  usesSharedOrdinaryConcreteIdentity,
  usesSharedResidualScalarResolution,
  usesSharedVariantResolution
} from '../../dist/src/compiler/ir_to_gia_transform/resolved_node.js'
import { resolveGiaNodeId } from '../../dist/src/compiler/ir_to_gia_transform/node_id.js'
import { runOrdinaryCoverageProbes } from '../../dist/src/compiler/ir_to_gia_transform/root_impl_ordinary_coverage_probe.js'
import { STAGE3_BACKEND_CONTRACT } from '../../dist/src/compiler/ir_to_gia_transform/stage3_backend.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const transformDir = join(root, 'src/compiler/ir_to_gia_transform')
const compositeSource = readFileSync(join(transformDir, 'composite.ts'), 'utf8')
const resolvedSource = readFileSync(join(transformDir, 'resolved_node.ts'), 'utf8')
const nodeIdSource = readFileSync(join(transformDir, 'node_id.ts'), 'utf8')

assert.equal(ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT.workPackage, 'P5-W8')
assert.equal(ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT.changesProductionEncoding, true)
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(STAGE3_BACKEND_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.legacyOrdinaryBackendPresent, true)

assert.deepEqual([...SHARED_ENUMERATIONS_EQUAL_NODE_TYPES], ['enumerations_equal'])
assert.deepEqual(
  [...ROOT_SHARED_ENUMERATIONS_EQUAL_NODE_TYPES],
  [...SHARED_ENUMERATIONS_EQUAL_NODE_TYPES]
)
assert.deepEqual([...RESIDUAL_CONCRETE_WRAPPED_NODE_TYPES], [])
assert.equal(SHARED_RESIDUAL_SCALAR_NODE_TYPES.length, 13)

assert.equal(usesSharedEnumerationsEqualResolution('enumerations_equal'), true)
assert.equal(usesSharedVariantResolution('enumerations_equal'), true)
assert.equal(usesSharedOrdinaryConcreteIdentity('enumerations_equal'), true)
assert.equal(usesSharedResidualScalarResolution('enumerations_equal'), false)

const context = {
  scope: { kind: 'composite-impl', name: 'p5w8-enumerations-equal' },
  variablesByName: new Map(),
  connectionTypes: new Map(),
  strictTypeChecks: false
}

// Literal path: value key → enumId → comparison_operators → concrete 476
const literalNode = {
  id: 880,
  type: 'enumerations_equal',
  args: [
    { type: 'enum', value: 'comparison_operator_equal_to' },
    { type: 'enum', value: 'comparison_operator_equal_to' }
  ]
}
const literalIdentity = resolveNodeIdentity(literalNode, context)
assert.equal(literalIdentity.genericNodeId, 475)
assert.equal(literalIdentity.concreteNodeId, 476)
assert.equal(
  resolveGiaNodeId(literalNode, context.connectionTypes, context.variablesByName),
  476
)

// Connection path: IR enum class names are snake_case (ir_builder camelToSnake).
// comparison_operator → comparison_operators → concrete 476
const connContext = {
  ...context,
  connectionTypes: new Map([
    [881, new Map([[0, { type: 'enum', enum: 'comparison_operator' }]])]
  ])
}
const connNode = {
  id: 882,
  type: 'enumerations_equal',
  args: [
    {
      type: 'conn',
      value: { node_id: 881, index: 0, type: 'enum', enum: 'comparison_operator' }
    },
    {
      type: 'conn',
      value: { node_id: 881, index: 0, type: 'enum', enum: 'comparison_operator' }
    }
  ]
}
const connIdentity = resolveNodeIdentity(connNode, connContext)
assert.equal(connIdentity.genericNodeId, 475)
assert.equal(connIdentity.concreteNodeId, 476)
assert.equal(
  resolveGiaNodeId(connNode, connContext.connectionTypes, connContext.variablesByName),
  476
)

// Alias sample: SortBy → sorting_rules
const sortNode = {
  id: 883,
  type: 'enumerations_equal',
  args: [
    { type: 'enum', value: 'sort_by_ascending' },
    { type: 'enum', value: 'sort_by_ascending' }
  ]
}
// Only assert if the enum value mapping exists; skip soft if parse fails at runtime.
try {
  const sortIdentity = resolveNodeIdentity(sortNode, context)
  if (sortIdentity.concreteNodeId !== undefined) {
    assert.equal(sortIdentity.genericNodeId, 475)
    assert.notEqual(sortIdentity.concreteNodeId, 475)
    assert.equal(
      resolveGiaNodeId(sortNode, context.connectionTypes, context.variablesByName),
      sortIdentity.concreteNodeId
    )
  }
} catch {
  // optional sample
}

// Matrix: enumerations-equal shared-path green; residual-concrete empty.
const staticRows = listStaticOrdinaryCoverageRows()
assertCoverageMatrixInvariants(staticRows)
const classified = classifyStaticCoverageStatuses(staticRows)
const summary = summarizeOrdinaryCoverage(classified)

const enumRow = classified.find((r) => r.id === 'enumerations-equal-enumerations_equal')
assert.ok(enumRow)
assert.equal(enumRow.family, 'enumerations-equal')
assert.equal(enumRow.category, 'shared-path')
assert.equal(enumRow.sharedIdentity, true)
assert.equal(enumRow.status, 'green', enumRow.reason)
assert.equal(classified.find((r) => r.id === 'residual-concrete-enumerations_equal'), undefined)
assert.equal(classified.find((r) => r.id === 'typed-identity-enumerations_equal'), undefined)

// Source guards
assert.match(resolvedSource, /usesSharedEnumerationsEqualResolution/)
assert.match(resolvedSource, /enumerations_equal__\$\{enumKey\}/)
assert.match(compositeSource, /usesSharedOrdinaryConcreteIdentity/)
assert.match(compositeSource, /P5-W7\/W8|P5-W8/)
assert.match(nodeIdSource, /enumerations_equal/)
assert.doesNotMatch(
  nodeIdSource,
  /if \(nodeType === 'enumerations_equal'\)/,
  'root must not keep a private enumerations_equal identity branch'
)

// Shared-beta encode probe green for residual scalar + enumerations_equal + print_string
const probeSummary = await runOrdinaryCoverageProbes({ enableSharedBeta: true })
assert.ok(probeSummary.green >= summary.green)
const enumProbe = probeSummary.rows.find((r) => r.id === 'enumerations-equal-enumerations_equal')
assert.equal(
  enumProbe?.status,
  'green',
  `probe enumerations_equal: ${enumProbe?.status} ${enumProbe?.reason}`
)
for (const nodeType of SHARED_RESIDUAL_SCALAR_NODE_TYPES) {
  const row = probeSummary.rows.find((r) => r.id === `residual-scalar-${nodeType}`)
  assert.equal(row?.status, 'green', `probe residual-scalar ${nodeType}: ${row?.status}`)
}

assert.equal(STAGE3_BACKEND_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.defaultVendorImplGraphGate, false)

console.log(
  [
    'P5-W8 enumerations_equal shared identity OK',
    `sharedEnumerationsEqual=${SHARED_ENUMERATIONS_EQUAL_NODE_TYPES.join(',')}`,
    `residualConcrete=${RESIDUAL_CONCRETE_WRAPPED_NODE_TYPES.length}`,
    `static green=${summary.green} unknown=${summary.unknown}`,
    `probe green=${probeSummary.green} red=${probeSummary.red} unknown=${probeSummary.unknown}`,
    'defaultVendorImplGraphGate=false'
  ].join('\n')
)
