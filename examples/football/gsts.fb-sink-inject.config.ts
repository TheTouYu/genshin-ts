import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// fb-sink 单文件注入配置（票 24-C 重建：地图 1073741825；图位 1073741833 挂球实体）。
// 单文件注入以本配置 inject.nodeGraphId 为目标并改写 .gia 图 id（2pre-b 语义）——
// entries 仅满足配置校验非空；单文件注入模式（positional .gia）短路编译不会真跑。
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src-fb'],
  outDir: './dist-fb',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741825,
    nodeGraphId: 1073741833
  }
}

export default config
