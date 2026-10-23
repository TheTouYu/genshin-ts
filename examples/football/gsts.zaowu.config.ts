import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 造物技能路径（地图 1073741827「真实足球v3」）编译配置：--noinject 只出 .gia，不碰真实地图。
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src-zaowu'],
  outDir: './dist-zaowu',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741827
  }
}

export default config
