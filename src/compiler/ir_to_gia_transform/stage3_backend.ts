/**
 * Stage 3 ordinary impl Graph backend selection (P5-W2).
 *
 * Default remains the handwritten legacy backend. Shared vendor-impl Graph
 * materialization is an opt-in beta surface:
 *   1. explicit option to irToGia / writeGia helpers
 *   2. CLI flag `--stage3-shared-impl-beta`
 *   3. config `options.stage3.vendorImplGraphBeta`
 *   4. env `GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` (internal / test compat)
 *
 * This module does not flip the production default and does not delete legacy.
 */

export const STAGE3_VENDOR_IMPL_GRAPH_ENV = 'GSTS_STAGE3_VENDOR_IMPL_GRAPH' as const
export const STAGE3_SHARED_IMPL_BETA_CLI_FLAG = '--stage3-shared-impl-beta' as const
export const STAGE3_SHARED_IMPL_BETA_CONFIG_PATH =
  'options.stage3.vendorImplGraphBeta' as const

export type Stage3ImplBackend = 'legacy-handwritten' | 'shared-vendor-impl-graph'

export type Stage3BackendSource =
  | 'default'
  | 'env'
  | 'config'
  | 'cli'
  | 'explicit'

export type Stage3BackendDecision = {
  backend: Stage3ImplBackend
  enabled: boolean
  source: Stage3BackendSource
  defaultEnabled: false
  envVar: typeof STAGE3_VENDOR_IMPL_GRAPH_ENV
  configPath: typeof STAGE3_SHARED_IMPL_BETA_CONFIG_PATH
  cliFlag: typeof STAGE3_SHARED_IMPL_BETA_CLI_FLAG
  /**
   * High-risk families that may generate under shared backend but are not fully
   * game-proven. Beta diagnostics must surface them when relevant.
   */
  highRiskPendingFamilies: readonly string[]
  notes: readonly string[]
}

export type ResolveStage3ImplBackendInput = {
  /** Highest precedence: direct API / focused test option. */
  explicit?: boolean
  /** CLI flag `--stage3-shared-impl-beta`. */
  cli?: boolean
  /** Config `options.stage3.vendorImplGraphBeta`. */
  config?: boolean
  /**
   * Raw env value for `GSTS_STAGE3_VENDOR_IMPL_GRAPH`.
   * When omitted, the current process env is read.
   */
  env?: string | undefined
}

export const STAGE3_BACKEND_CONTRACT = {
  phase: 'P5-W2',
  defaultBackend: 'legacy-handwritten' as const satisfies Stage3ImplBackend,
  defaultVendorImplGraphGate: false,
  deletesLegacyBackend: false,
  envVar: STAGE3_VENDOR_IMPL_GRAPH_ENV,
  configPath: STAGE3_SHARED_IMPL_BETA_CONFIG_PATH,
  cliFlag: STAGE3_SHARED_IMPL_BETA_CLI_FLAG,
  /**
   * Named, pending high-risk families (ADR-013). They may generate under beta but
   * must stay explicit in diagnostics and must not become Composite-only fallbacks.
   */
  highRiskPendingFamilies: [
    'signal',
    'dynamic-pin-payload',
    'graphValues',
    'affiliations'
  ] as const,
  precedence: ['explicit', 'cli', 'config', 'env', 'default'] as const
} as const

function envEnablesVendorImplGraph(raw: string | undefined): boolean {
  return raw === '1'
}

export function readStage3VendorImplGraphEnv(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  return env[STAGE3_VENDOR_IMPL_GRAPH_ENV]
}

/**
 * Resolve the ordinary impl Graph backend for Stage 3 composite encoding.
 *
 * Default is always handwritten. Any enablement is opt-in beta only.
 */
export function resolveStage3ImplBackend(
  input: ResolveStage3ImplBackendInput = {}
): Stage3BackendDecision {
  const envRaw =
    input.env !== undefined ? input.env : readStage3VendorImplGraphEnv(process.env)

  let enabled = false
  let source: Stage3BackendSource = 'default'

  if (input.explicit === true) {
    enabled = true
    source = 'explicit'
  } else if (input.explicit === false) {
    enabled = false
    source = 'explicit'
  } else if (input.cli === true) {
    enabled = true
    source = 'cli'
  } else if (input.cli === false) {
    enabled = false
    source = 'cli'
  } else if (input.config === true) {
    enabled = true
    source = 'config'
  } else if (input.config === false) {
    enabled = false
    source = 'config'
  } else if (envEnablesVendorImplGraph(envRaw)) {
    enabled = true
    source = 'env'
  }

  const backend: Stage3ImplBackend = enabled
    ? 'shared-vendor-impl-graph'
    : 'legacy-handwritten'

  const notes: string[] = [
    'Default production backend remains handwritten until a user-approved default switch.',
    'Shared vendor-impl Graph is opt-in beta; env GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 remains internal compat.',
    'To fall back to legacy: omit beta config/CLI and unset GSTS_STAGE3_VENDOR_IMPL_GRAPH (or set it to anything other than 1).'
  ]

  if (enabled) {
    notes.unshift(
      'BETA: composite ordinary impl nodes use shared vendor Graph materializer.',
      'High-risk families (signal / dynamic pin payload / graphValues / affiliations) may generate but are not fully game-proven; report failures with backend + source.'
    )
  }

  return {
    backend,
    enabled,
    source,
    defaultEnabled: false,
    envVar: STAGE3_VENDOR_IMPL_GRAPH_ENV,
    configPath: STAGE3_SHARED_IMPL_BETA_CONFIG_PATH,
    cliFlag: STAGE3_SHARED_IMPL_BETA_CLI_FLAG,
    highRiskPendingFamilies: STAGE3_BACKEND_CONTRACT.highRiskPendingFamilies,
    notes
  }
}

/**
 * Apply the resolved decision to process.env so child runners / focused tests that
 * still read the env gate observe the same backend. Never sets the env when disabled
 * via default (leaves pre-existing unset state alone unless an explicit source forces off).
 */
export function applyStage3ImplBackendEnv(
  decision: Stage3BackendDecision,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (decision.enabled) {
    env[STAGE3_VENDOR_IMPL_GRAPH_ENV] = '1'
    return
  }
  // Force-off only when an explicit surface chose legacy; otherwise leave env untouched
  // so nested tools can still set the internal gate independently.
  if (decision.source === 'explicit' || decision.source === 'cli' || decision.source === 'config') {
    delete env[STAGE3_VENDOR_IMPL_GRAPH_ENV]
  }
}

export function formatStage3BackendDiagnostic(decision: Stage3BackendDecision): string {
  const lines = [
    `[stage3-backend] backend=${decision.backend}`,
    `[stage3-backend] source=${decision.source}`,
    `[stage3-backend] default=${decision.defaultEnabled ? 'shared-vendor-impl-graph' : 'legacy-handwritten'}`,
    `[stage3-backend] env=${decision.envVar}`,
    `[stage3-backend] config=${decision.configPath}`,
    `[stage3-backend] cli=${decision.cliFlag}`,
    `[stage3-backend] highRiskPending=${decision.highRiskPendingFamilies.join(',')}`
  ]
  for (const note of decision.notes) {
    lines.push(`[stage3-backend] note: ${note}`)
  }
  return lines.join('\n')
}

/**
 * Convenience for production encode path: resolve from process env only.
 * Config/CLI layers write the env before encode via applyStage3ImplBackendEnv.
 */
export function isSharedVendorImplGraphEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return resolveStage3ImplBackend({ env: readStage3VendorImplGraphEnv(env) }).enabled
}
