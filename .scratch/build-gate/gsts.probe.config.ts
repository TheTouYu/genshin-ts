import type { GstsConfig } from '../../src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '../../',
  entries: ['./.scratch/build-gate/probe/**/*.ts'],
  outDir: './.scratch/build-gate/probe-out',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741848,
    nodeGraphId: 1073741901
  }
}

export default config
