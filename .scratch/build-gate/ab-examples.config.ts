import type { GstsConfig } from '../../src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '../../examples',
  entries: ['./rubik-game/src/rgInput.ts', './football/src-fb/fb-phys2.ts', './football/src-fb/fb20c-loop.ts'],
  outDir: './ab-ex-out',
  inject: { gameRegion: 'China', playerId: 110170759, mapId: 1073741848 }
}

export default config
