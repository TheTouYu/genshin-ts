import type { GstsConfig } from '../../src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '../../examples/rubik-game',
  entries: ['./src'],
  outDir: './rg-full',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741920,
    nodeGraphId: 1073741825
  }
}

export default config
