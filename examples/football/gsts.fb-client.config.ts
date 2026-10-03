import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 足球客户端链路编译配置（地图 1073741825「真实足球」；src-fb 主编译入口）。
// entries=./src-fb 包含：active 图、实验图、compile-only 占位图；具体图状态以各文件 @status 与 BOARD 为准。
// 产物 dist-fb；编译期 inject.mapId 指向 1825 解析信号注册表；单文件注入按各 gsts.*-inject.config.ts 锚定。
// 说明：决策图 1082130435 已实际占用（fb-decision.ts），不再“预期/待回填”。
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src-fb'],
  outDir: './dist-fb',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741825,
    nodeGraphId: 1073741830
  }
}

export default config
