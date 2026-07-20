import type { GstsConfig } from './src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  entries: [
    './tests',
    // tests/composite/ contains independent Stage 3/GIA harnesses; run them via focused commands.
    '!./tests/composite/**',
    '!./tests/generated/other.*.ts',
    '!./tests/generated/*.literal.ts',
    '!./tests/generated/*.wire.ts',
    '!./tests/generated/classic.events.ts',
    '!./tests/generated/events.ts',
    '!./tests/builtins_math_success_test.ts',
    '!./tests/data_type_conversion_invalid_test.ts',
    // Requires signal definitions from the player's target map/GIL; run with a matching map fixture.
    '!./tests/signal_parameters_test.ts',
    // Standalone Stage 3 boundary repro; validated by its focused harness.
    '!./tests/composite_bool_parameter_reference_repro.ts',
    '!./tests/manual_verify_post_v0_1_9_nodes.ts',
    '!./tests/layout-r6-b3-data-composite.ts',
    '!./tests/layout-r6-b3-pure-data-repro.ts',
    '!./tests/layout-r6-b4-pure-data-composite.ts',
    // Real-GIA physics reproduction; use gsts.physics-motion.config.ts as its focused harness.
    '!./tests/layout/layout-physics-motion-step0-init.ts',
    '!./tests/layout/physics-motion/**'
  ],
  outDir: './dist',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741841
  },
  options: {
    optimize: {
      precompileExpression: false,
      removeUnusedNodes: false
    }
  }
}

export default config
