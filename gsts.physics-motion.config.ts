import type { GstsConfig } from './src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./tests/layout/physics-motion/**/*.ts'],
  outDir: './dist',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741846,
    nodeGraphId: 1073741825
  },
  options: {
    optimize: {
      precompileExpression: false,
      removeUnusedNodes: false
    }
  }
}

export default config
