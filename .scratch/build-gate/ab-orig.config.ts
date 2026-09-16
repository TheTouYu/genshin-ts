import type { GstsConfig } from '../../src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '../../',
  entries: ['./.scratch/build-gate/ab-orig/variables_definition_test.ts'],
  outDir: './ab-orig-out',
  inject: { gameRegion: 'China', playerId: 110170759, mapId: 1073741848 },
  options: {
    optimize: {
      precompileExpression: false,
      removeUnusedNodes: false
    }
  }
}

export default config
