// @ts-nocheck
/**
 * P5-W2: opt-in beta configuration surface for shared vendor-impl Graph backend.
 *
 * Freezes:
 * - default remains handwritten
 * - config / CLI / env / explicit precedence
 * - diagnostics name backend + source + high-risk pending families
 * - env compat GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 still works
 * - production encode path uses isSharedVendorImplGraphEnabled()
 *
 * Does not delete legacy backend and does not flip the production default.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p5w2-beta-config-contract.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  COMPOSITE_ORCHESTRATION_CONTRACT,
  STAGE3_BACKEND_CONTRACT,
  STAGE3_SHARED_IMPL_BETA_CLI_FLAG,
  STAGE3_SHARED_IMPL_BETA_CONFIG_PATH,
  STAGE3_VENDOR_IMPL_GRAPH_ENV,
  applyStage3ImplBackendEnv,
  formatStage3BackendDiagnostic,
  isSharedVendorImplGraphEnabled,
  resolveStage3ImplBackend
} from '../../dist/src/compiler/ir_to_gia_transform/composite.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const compositeSource = readFileSync(
  join(root, 'src/compiler/ir_to_gia_transform/composite.ts'),
  'utf8'
)
const configSource = readFileSync(join(root, 'src/compiler/gsts_config.ts'), 'utf8')
const cliSource = readFileSync(join(root, 'src/cli/gsts.ts'), 'utf8')
const zhI18n = readFileSync(join(root, 'src/i18n/locales/zh-CN/main.json'), 'utf8')
const enI18n = readFileSync(join(root, 'src/i18n/locales/en-US/main.json'), 'utf8')

// --- Contract freezes ---
assert.equal(STAGE3_BACKEND_CONTRACT.phase, 'P5-W2')
assert.equal(STAGE3_BACKEND_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(STAGE3_BACKEND_CONTRACT.deletesLegacyBackend, false)
assert.equal(STAGE3_BACKEND_CONTRACT.defaultBackend, 'legacy-handwritten')
assert.equal(STAGE3_BACKEND_CONTRACT.envVar, 'GSTS_STAGE3_VENDOR_IMPL_GRAPH')
assert.equal(STAGE3_BACKEND_CONTRACT.configPath, 'options.stage3.vendorImplGraphBeta')
assert.equal(STAGE3_BACKEND_CONTRACT.cliFlag, '--stage3-shared-impl-beta')
assert.deepEqual(STAGE3_BACKEND_CONTRACT.precedence, [
  'explicit',
  'cli',
  'config',
  'env',
  'default'
])
assert.ok(
  STAGE3_BACKEND_CONTRACT.highRiskPendingFamilies.includes('signal'),
  'high-risk pending families must stay explicit under beta'
)
assert.equal(
  COMPOSITE_ORCHESTRATION_CONTRACT.defaultVendorImplGraphGate,
  false,
  'P5-W2 must not flip default vendor gate'
)
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.legacyOrdinaryBackendPresent, true)
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.stage3Backend, STAGE3_BACKEND_CONTRACT)

// --- Default / env resolution ---
const defaultDecision = resolveStage3ImplBackend({ env: undefined })
assert.equal(defaultDecision.backend, 'legacy-handwritten')
assert.equal(defaultDecision.enabled, false)
assert.equal(defaultDecision.source, 'default')
assert.equal(defaultDecision.defaultEnabled, false)

const envOn = resolveStage3ImplBackend({ env: '1' })
assert.equal(envOn.backend, 'shared-vendor-impl-graph')
assert.equal(envOn.enabled, true)
assert.equal(envOn.source, 'env')

const envOff = resolveStage3ImplBackend({ env: '0' })
assert.equal(envOff.enabled, false)
assert.equal(envOff.source, 'default')

// --- Config / CLI / explicit precedence ---
const configOn = resolveStage3ImplBackend({ config: true, env: undefined })
assert.equal(configOn.enabled, true)
assert.equal(configOn.source, 'config')

const cliOn = resolveStage3ImplBackend({ cli: true, config: false, env: undefined })
assert.equal(cliOn.enabled, true)
assert.equal(cliOn.source, 'cli')

const explicitOffWins = resolveStage3ImplBackend({
  explicit: false,
  cli: true,
  config: true,
  env: '1'
})
assert.equal(explicitOffWins.enabled, false)
assert.equal(explicitOffWins.source, 'explicit')

const explicitOnWins = resolveStage3ImplBackend({
  explicit: true,
  cli: false,
  config: false,
  env: undefined
})
assert.equal(explicitOnWins.enabled, true)
assert.equal(explicitOnWins.source, 'explicit')

// --- Diagnostics ---
const diag = formatStage3BackendDiagnostic(envOn)
assert.match(diag, /backend=shared-vendor-impl-graph/)
assert.match(diag, /source=env/)
assert.match(diag, /highRiskPending=/)
assert.match(diag, /legacy/)
assert.match(diag, new RegExp(STAGE3_VENDOR_IMPL_GRAPH_ENV))
assert.match(diag, new RegExp(STAGE3_SHARED_IMPL_BETA_CONFIG_PATH.replace(/\./g, '\\.')))
assert.match(diag, new RegExp(STAGE3_SHARED_IMPL_BETA_CLI_FLAG))

// --- Env apply helper ---
const scratch: NodeJS.ProcessEnv = {}
applyStage3ImplBackendEnv(envOn, scratch)
assert.equal(scratch[STAGE3_VENDOR_IMPL_GRAPH_ENV], '1')
applyStage3ImplBackendEnv(configOn, scratch)
assert.equal(scratch[STAGE3_VENDOR_IMPL_GRAPH_ENV], '1')
const forceOff = resolveStage3ImplBackend({ config: false })
applyStage3ImplBackendEnv(forceOff, scratch)
assert.equal(scratch[STAGE3_VENDOR_IMPL_GRAPH_ENV], undefined)

// --- Production encode path uses resolver helper, not a raw hard-coded default true ---
assert.match(
  compositeSource,
  /isSharedVendorImplGraphEnabled\s*\(/,
  'composite.ts must select backend via isSharedVendorImplGraphEnabled()'
)
assert.doesNotMatch(
  compositeSource,
  /process\.env\.GSTS_STAGE3_VENDOR_IMPL_GRAPH\s*===\s*['"]1['"]/,
  'composite.ts must not hard-code the env compare after P5-W2'
)
assert.match(
  compositeSource,
  /stage3Backend:\s*STAGE3_BACKEND_CONTRACT/,
  'orchestration contract must expose stage3 backend contract'
)

// --- Config type surface ---
assert.match(configSource, /vendorImplGraphBeta\??:\s*boolean/)
assert.match(configSource, /stage3\??:\s*GstsStage3Options/)
assert.match(configSource, /GstsStage3Options/)

// --- CLI surface ---
assert.match(cliSource, /stage3-shared-impl-beta/)
assert.match(cliSource, /stage3SharedImplBeta/)
assert.match(cliSource, /applyStage3BackendSurfaces/)
assert.match(cliSource, /options\?\.stage3\?\.vendorImplGraphBeta/)
assert.match(zhI18n, /optStage3SharedImplBeta/)
assert.match(enI18n, /optStage3SharedImplBeta/)
assert.match(zhI18n, /warnStage3SharedImplBeta/)
assert.match(enI18n, /warnStage3SharedImplBeta/)

// --- Live env helper against process (restore after) ---
const prev = process.env[STAGE3_VENDOR_IMPL_GRAPH_ENV]
try {
  delete process.env[STAGE3_VENDOR_IMPL_GRAPH_ENV]
  assert.equal(isSharedVendorImplGraphEnabled(), false)
  process.env[STAGE3_VENDOR_IMPL_GRAPH_ENV] = '1'
  assert.equal(isSharedVendorImplGraphEnabled(), true)
} finally {
  if (prev === undefined) delete process.env[STAGE3_VENDOR_IMPL_GRAPH_ENV]
  else process.env[STAGE3_VENDOR_IMPL_GRAPH_ENV] = prev
}

console.log('PASS P5-W2 beta config contract: default handwritten; config/CLI/env/explicit opt-in')
