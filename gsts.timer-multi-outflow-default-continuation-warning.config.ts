import type { GstsConfig } from './src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./tests/timer_multi_outflow_default_continuation_warning.ts'],
  outDir: './dist-timer-multi-outflow-default-continuation-warning',
  options: {
    optimize: {
      precompileExpression: false,
      removeUnusedNodes: false
    }
  }
}

export default config
