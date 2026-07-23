import type { GstsConfig } from './src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./tests/custom_variable_change_local_variable_optimization_test.ts'],
  outDir: './dist-custom-variable-change-local-variable-optimization',
  options: {
    optimize: {
      precompileExpression: false,
      removeUnusedNodes: false
    }
  }
}

export default config
