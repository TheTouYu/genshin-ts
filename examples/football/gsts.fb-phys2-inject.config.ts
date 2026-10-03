import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 票 19 · fb-phys2 定点注入配置（2026-09-03 接管阶段启用）
// 用法：node ../../bin/gsts.mjs -c gsts.fb-phys2-inject.config.ts dist-fb/src-fb/fb-phys2.gia
// 单文件注入以本配置 inject.nodeGraphId 为目标并改写 .gia 图 id（2pre-b 语义）——
// 本配置锚定 1082130437（fb-phys2 图位），勿用于其他 .gia。
// 编译仍走 gsts.fb-client.config.ts（全图 --noinject 门禁）；本配置仅注入用。
const config: GstsConfig = {
  compileRoot: '.',
  // entries 仅满足配置校验非空；单文件注入模式（positional .gia）短路编译不会真跑
  entries: ['./src-fb'],
  outDir: './dist-fb',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741825,
    nodeGraphId: 1082130437
  }
}

export default config
