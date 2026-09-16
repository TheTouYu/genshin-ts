import type { GstsConfig } from '../../src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '../../',
  entries: ['./tests/variables_definition_test.ts'],
  outDir: './ab-cur-out',
  inject: { gameRegion: 'China', playerId: 110170759, mapId: 1073741848 },
  options: {
    optimize: {
      precompileExpression: false,
      removeUnusedNodes: false
    }
  }
}

export default config
