import type { GstsConfig } from './src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./tests/data_type_conversion_invalid_test.ts'],
  outDir: './dist-data-type-conversion-invalid'
}

export default config
