import type { GstsConfig } from './src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./tests/timer_explicit_multi_outflow_join_no_warning.ts'],
  outDir: './dist-timer-explicit-multi-outflow-join-no-warning',
  options: {
    optimize: {
      precompileExpression: false,
      removeUnusedNodes: false
    }
  }
}

export default config
