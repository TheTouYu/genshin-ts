import type { GstsConfig } from './src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./tests/composite_bool_parameter_reference_repro.ts'],
  outDir: './dist-composite-bool-boundary-dtc'
}

export default config
