import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 俄罗斯方块「真结算」服务端图：监听 tetris_settle → 设胜利状态 → 结算关卡
// 目标地图 hl 1073741834；图 id 1082130480（避开 1073741825–1938 的 UI/脚本段与 1082130433+ 造物段）
const config: GstsConfig = {
  compileRoot: './src',
  entries: ['.'],
  outDir: './dist',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741834,
    nodeGraphId: 1082130480
  }
}

export default config
