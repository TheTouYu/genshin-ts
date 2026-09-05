import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// TickManager 可复用资产：只编译本资产源码，不注入真实地图。
// 信号编码需要目标地图信号注册表；这里用 .donor/BeyondLocal 下的 1073741908.gil 副本
// 作为 donor（已注册 TickUpdate_60/_200/_1000），编译时设置 GSTS_BEYOND_LOCAL_ROOT。
// 产物：assets/tick-manager-asset/dist/*.gia（单主图 + 复合 def accessories）。
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src'],
  outDir: './dist',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741908
  }
}

export default config
