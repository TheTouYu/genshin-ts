import type { GstsConfig } from './src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  entries: [
    './tests',
    '!./tests/manual/**/*.ts',
    '!./tests/composite/**/*.ts',
    '!./tests/generated/other.*.ts',
    '!./tests/generated/*.literal.ts',
    '!./tests/generated/*.wire.ts',
    '!./tests/generated/classic.events.ts',
    '!./tests/generated/events.ts',
    '!./tests/layout/physics-motion/**/*.ts',
    '!./tests/builtins_math_success_test.ts',
    '!./tests/data_type_conversion_invalid_test.ts',
    '!./tests/signal_parameters_test.ts',
    '!./tests/generate-signal-min-send-monitor.ts',
    '!./tests/composite_bool_parameter_reference_repro.ts',
    '!./tests/manual_verify_post_v0_1_9_nodes.ts',
    '!./tests/manual_verify_2026_07_enum_updates.ts',
    '!./tests/layout-r6-b3-data-composite.ts',
    '!./tests/layout-r6-b3-pure-data-repro.ts',
    '!./tests/layout-r6-b4-pure-data-composite.ts',
    '!./tests/layout/layout-physics-motion-step0-init.ts',
    // Intentional invalid examples are exercised by ESLint, not batch compilation.
    '!./tests/eslint_rules_showcase.ts'
  ],
  outDir: './dist',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741848
  },
  options: {
    optimize: {
      precompileExpression: false,
      removeUnusedNodes: false
    }
  }
}

export default config
