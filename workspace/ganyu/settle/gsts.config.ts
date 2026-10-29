import type { GstsConfig } from '../../../src/compiler/gsts_config.js'

// 霜华纪官方结算服务端图：监听 ganyu_settle → 设结算状态 → 结算关卡
// 目标地图 1073741856；图 id 1073741825（assets:node-graphs create 分配）
const config: GstsConfig = {
  compileRoot: './src',
  entries: ['.'],
  outDir: './dist',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741856,
    nodeGraphId: 1073741825
  }
}

export default config
