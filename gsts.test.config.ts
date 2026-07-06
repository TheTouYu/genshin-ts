import type { GstsConfig } from './src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  entries: [
    './tests',
    '!./tests/generated/other.*.ts',
    '!./tests/generated/*.literal.ts',
    '!./tests/generated/*.wire.ts',
    '!./tests/generated/classic.events.ts',
    '!./tests/generated/events.ts',
    '!./tests/builtins_math_success_test.ts',
    '!./tests/composite/recreate-debug3.ts',
    '!./tests/composite/recreate-debug4-v2.ts',
    '!./tests/composite/recreate-debug5.ts',
    '!./tests/composite/recreate-debug6.ts',
    '!./tests/composite/exec-with-data.ts',
    '!./tests/composite/replicate-all-graph-variables.ts',
    '!./tests/composite/replicate-full-dtc-v2.ts',
    '!./tests/composite/nested-compare-test.ts',
    '!./tests/composite/nested-layout-test.ts',
    '!./tests/composite/test-phase1-system-nodes.ts',
    '!./tests/composite/test-phase2-normal-nodes.ts',
    '!./tests/composite/test-phase2-reference-patterns.ts',
    '!./tests/composite/test-composite-part1.ts',
    '!./tests/composite/test-composite-part2.ts',
    '!./tests/composite/test-composite-part3.ts',
    '!./tests/composite/test-two-exec.ts',
    '!./tests/composite/test-mixed-composite-normal.ts',
    '!./tests/composite/test-simple-ref-compare.ts',
    '!./tests/composite/test-type-conversion.ts',
    '!./tests/composite/verify-game-version.ts',
    '!./tests/manual_verify_post_v0_1_9_nodes.ts',
    '!./tests/layout-r6-b4-pure-data-composite.ts'
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
