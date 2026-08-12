import type { GstsConfig } from '../../../src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src'],
  outDir: './dist',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741882,
    nodeGraphId: 1073741825
  }
}

export default config
