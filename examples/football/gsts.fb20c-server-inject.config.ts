import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 票 20 · E0 服务端装配图定点注入配置（2026-09-04）——**注入用**，编译走 gsts.fb-client.config.ts
// 一图一配置（2pre-b）：本配置锚定 **1073741836**（fb20c-server 图位），勿用于其他 .gia。
// 用法：
//   node ./bin/gsts.mjs -c examples/football/gsts.fb20c-server-inject.config.ts \
//        examples/football/dist-fb/src-fb/fb20c-server.gia
// ⚠️ 注入后必须挂载才执行（2c 红线）：
//   node ./bin/gsts.mjs assets:mounts attach 1077936135 --graph 1073741836 --entity \
//        --gil <map.gil> --write
// （20002 图 fb20c-loop 不挂载——执行通道=技能配置 1098907653 的 body-f5 绑定。）
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src-fb'],
  outDir: './dist-fb',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741908,
    nodeGraphId: 1073741836
  }
}

export default config
