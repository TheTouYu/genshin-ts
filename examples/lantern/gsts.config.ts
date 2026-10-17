import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 灯阵（游戏②）—— mapId/nodeGraphId 由 .scratch/three-games/gen/make_map.sh 创建后填入
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src/game.ts'],
  outDir: './dist',
  inject: { gameRegion: 'China', playerId: 110170759, mapId: 0, nodeGraphId: 0 }
}

export default config
