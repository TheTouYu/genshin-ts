import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 票 19 · 5.2d fb-server 定点注入配置（2026-09-03）
// 用法：node ../../bin/gsts.mjs -c gsts.fb-server-inject.config.ts dist-fb/src-fb/fb-server.gia
// 单文件注入以本配置 inject.nodeGraphId 为目标并改写 .gia 图 id（2pre-b 语义）——
// 本配置锚定 1073741830（fb-server 图位），勿用于其他 .gia。
const config: GstsConfig = {
  compileRoot: '.',
  // entries 仅满足配置校验非空；单文件注入模式（positional .gia）短路编译不会真跑
  entries: ['./src-fb'],
  outDir: './dist-fb',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741908,
    nodeGraphId: 1073741830
  }
}

export default config
