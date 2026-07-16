// @ts-nocheck
/**
 * P5-W7: residual scalar ordinary identity moves onto shared resolveNodeIdentity.
 *
 * Completes one matrix family envelope:
 * - 13 residual scalar ops use usesSharedVariantResolution / shared concrete id
 * - residual-concrete table empty after P5-W8 (enumerations_equal moved)
 * - default gate stays false; handwritten pin path not deleted
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p5w7-residual-scalar-shared-identity.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  COMPOSITE_ORCHESTRATION_CONTRACT,
  ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT,
  ROOT_SHARED_RESIDUAL_SCALAR_NODE_TYPES,
  RESIDUAL_CONCRETE_WRAPPED_NODE_TYPES,
  SHARED_RESIDUAL_SCALAR_NODE_TYPES,
  listStaticOrdinaryCoverageRows,
  classifyStaticCoverageStatuses,
  assertCoverageMatrixInvariants,
  summarizeOrdinaryCoverage
} from '../../dist/src/compiler/ir_to_gia_transform/composite.js'
import {
  resolveNodeIdentity,
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

// Contract phase advances with later residual packs; residual scalar identity still holds.
assert.equal(ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT.changesProductionEncoding, true)
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(STAGE3_BACKEND_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.legacyOrdinaryBackendPresent, true)

assert.equal(SHARED_RESIDUAL_SCALAR_NODE_TYPES.length, 13)
assert.equal(ROOT_SHARED_RESIDUAL_SCALAR_NODE_TYPES.length, 13)
assert.deepEqual([...SHARED_RESIDUAL_SCALAR_NODE_TYPES].sort(), [...ROOT_SHARED_RESIDUAL_SCALAR_NODE_TYPES].sort())
assert.deepEqual([...RESIDUAL_CONCRETE_WRAPPED_NODE_TYPES], [])

const context = {
  scope: { kind: 'composite-impl', name: 'p5w7-residual-scalar' },
  variablesByName: new Map(),
  connectionTypes: new Map(),
  strictTypeChecks: false
}

const typedResidualVariants = [
  ['exponentiation', 209, 210],
  ['absolute_value_operation', 216, 217],
  ['sign_operation', 218, 219],
  ['range_limiting_operation', 222, 223],
  ['take_larger_value', 211, 212],
  ['take_smaller_value', 213, 214]
]

for (const [type, intConcreteNodeId, floatConcreteNodeId] of typedResidualVariants) {
  assert.equal(usesSharedResidualScalarResolution(type), true)
  assert.equal(usesSharedVariantResolution(type), true)
  assert.equal(usesSharedOrdinaryConcreteIdentity(type), true)
  for (const [valueType, concreteNodeId] of [
    ['int', intConcreteNodeId],
    ['float', floatConcreteNodeId]
  ]) {
    const args =
      type === 'absolute_value_operation' || type === 'sign_operation'
        ? [{ type: valueType, value: 8 }]
        : type === 'range_limiting_operation'
          ? [
              { type: valueType, value: 5 },
              { type: valueType, value: 0 },
              { type: valueType, value: 10 }
            ]
          : [
              { type: valueType, value: 8 },
              { type: valueType, value: 2 }
            ]
    const node = { id: 700 + concreteNodeId, type, args }
    const identity = resolveNodeIdentity(node, context)
    assert.equal(identity.genericNodeId, intConcreteNodeId)
    assert.equal(identity.concreteNodeId, concreteNodeId)
    assert.equal(
      resolveGiaNodeId(node, context.connectionTypes, context.variablesByName),
      concreteNodeId
    )
  }
}

const genericOnlyResidual = [
  ['modulo_operation', 208],
  ['logical_and_operation', 226],
  ['logical_or_operation', 227],
  ['logical_not_operation', 229],
  ['logical_xor_operation', 228],
  ['arithmetic_square_root_operation', 221],
  ['round_to_integer_operation', 224]
]

for (const [type, genericNodeId] of genericOnlyResidual) {
  assert.equal(usesSharedResidualScalarResolution(type), true)
  assert.equal(usesSharedVariantResolution(type), true)
  const args =
    type === 'logical_not_operation' ||
    type === 'arithmetic_square_root_operation' ||
    type === 'round_to_integer_operation'
      ? [{ type: type.startsWith('logical_') ? 'bool' : 'float', value: 1 }]
      : type.startsWith('logical_')
        ? [
            { type: 'bool', value: true },
            { type: 'bool', value: false }
          ]
        : [
            { type: 'int', value: 8 },
            { type: 'int', value: 3 }
          ]
  const node = { id: 800 + genericNodeId, type, args }
  const identity = resolveNodeIdentity(node, context)
  assert.equal(identity.genericNodeId, genericNodeId)
  // Generic-only residual ops do not invent typed suffixes / concreteNodeId.
  assert.equal('concreteNodeId' in identity ? identity.concreteNodeId : undefined, undefined)
  assert.equal(
    resolveGiaNodeId(node, context.connectionTypes, context.variablesByName),
    genericNodeId
  )
}

// enumerations_equal is not residual-scalar; P5-W8 owns its shared identity.
assert.equal(usesSharedResidualScalarResolution('enumerations_equal'), false)

// Matrix: residual scalar rows are shared-path green; residual-concrete table empty.
const staticRows = listStaticOrdinaryCoverageRows()
assertCoverageMatrixInvariants(staticRows)
const classified = classifyStaticCoverageStatuses(staticRows)
const summary = summarizeOrdinaryCoverage(classified)

for (const nodeType of SHARED_RESIDUAL_SCALAR_NODE_TYPES) {
  const row = classified.find((r) => r.id === `residual-scalar-${nodeType}`)
  assert.ok(row, `missing residual-scalar row ${nodeType}`)
  assert.equal(row.family, 'residual-scalar')
  assert.equal(row.category, 'shared-path')
  assert.equal(row.sharedIdentity, true)
  assert.equal(row.status, 'green', `${nodeType}: ${row.reason}`)
}

assert.equal(
  classified.find((r) => r.id === 'residual-concrete-enumerations_equal'),
  undefined
)

// Source guards: shared ordinary concrete wiring, no residual table rewrite into composite helper.
assert.match(resolvedSource, /usesSharedResidualScalarResolution/)
assert.match(resolvedSource, /usesSharedOrdinaryConcreteIdentity/)
assert.match(compositeSource, /usesSharedOrdinaryConcreteIdentity/)
assert.match(compositeSource, /P5-W7|P5-W8/)
assert.doesNotMatch(
  compositeSource,
  /resolveImplOrdinaryConcreteNodeId[\s\S]{0,120}SHARED_RESIDUAL_SCALAR/
)

// Shared-beta encode probe still green for residual scalar batch + print_string.
const probeSummary = await runOrdinaryCoverageProbes({ enableSharedBeta: true })
assert.ok(probeSummary.green >= summary.green)
for (const nodeType of SHARED_RESIDUAL_SCALAR_NODE_TYPES) {
  const row = probeSummary.rows.find((r) => r.id === `residual-scalar-${nodeType}`)
  assert.equal(
    row?.status,
    'green',
    `probe residual-scalar ${nodeType}: ${row?.status} ${row?.reason}`
  )
}
const printRow = probeSummary.rows.find((r) => r.id === 'generic-print_string')
assert.equal(printRow?.status, 'green')

assert.equal(STAGE3_BACKEND_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.defaultVendorImplGraphGate, false)

console.log(
  [
    'P5-W7 residual scalar shared identity OK',
    `sharedResidualScalars=${SHARED_RESIDUAL_SCALAR_NODE_TYPES.length}`,
    `residualConcrete=${RESIDUAL_CONCRETE_WRAPPED_NODE_TYPES.join(',')}`,
    `static green=${summary.green} unknown=${summary.unknown}`,
    `probe green=${probeSummary.green} red=${probeSummary.red} unknown=${probeSummary.unknown}`,
    'defaultVendorImplGraphGate=false'
  ].join('\n')
)
