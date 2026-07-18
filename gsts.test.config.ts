import type { GstsConfig } from './src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./tests', '!./tests/manual/**/*.ts'],
  outDir: './dist',
  inject: {
    gameRegion: 'China',
    playerId: 100431567,
    mapId: 1073741851
  },
  options: {
    optimize: {
      precompileExpression: false,
      removeUnusedNodes: false
    }
  }
}

export default config
