import type { GstsConfig } from '../../src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '../../examples/football',
  entries: ['./src-fb'],
  outDir: './ab-run',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741908,
    nodeGraphId: 1073741830
  }
}

export default config
