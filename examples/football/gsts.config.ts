import type { GstsConfig } from '../../src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src'],
  outDir: './dist',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741908,
    nodeGraphId: 1073741825,
    // 弹球图 1073741827 是用户在编辑器手建的非空图（名字非 _GSTS*），
    // 注入 GIA 覆盖其内容需跳过非空保护（用户已授权弹球逻辑写入该图）
    skipSafeCheck: true
  }
}

export default config
