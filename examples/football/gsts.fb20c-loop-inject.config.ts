import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 票 20 · E0 定点注入配置（2026-09-04）——**注入用**，编译仍走 gsts.fb-client.config.ts --noinject
//
// 一图一配置（2pre-b 语义：单文件注入以本配置 nodeGraphId 为目标并**覆盖该图位**，
// 指错图=把错误内容写进目标；仓库惯例见 gsts.fb-server-inject / gsts.fb-phys2-inject）。
// 本配置锚定 **1082130439**（20002 角色技能图 fb20c-loop 图位），勿用于其他 .gia。
//
// 用法：
//   node ./bin/gsts.mjs -c examples/football/gsts.fb20c-loop-inject.config.ts \
//        examples/football/dist-fb/src-fb/fb20c-loop.gia
//
// 注入序：先本图（客户端探针，靠技能配置 body-f5 绑定执行，**不经 mounts**），
//        后 fb20c-server（服务端装配图，注入完须 attach 球实体 1077936135）。
const config: GstsConfig = {
  compileRoot: '.',
  // entries 仅满足配置校验非空；单文件注入模式（positional .gia）短路编译不会真跑
  entries: ['./src-fb'],
  outDir: './dist-fb',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741908,
    nodeGraphId: 1082130439
  }
}

export default config
