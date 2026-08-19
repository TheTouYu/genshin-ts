import type { GstsConfig } from '../../src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src/game-level1.ts'],
  outDir: './dist-sigtest',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741891,
    nodeGraphId: 1073741825
  }
}

export default config
