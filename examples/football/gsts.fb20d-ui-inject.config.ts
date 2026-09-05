import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 2026-09-05 单次释放大循环校准：UI 触发服务端图定点注入配置
// 锚定 **1073741837**（fb20d-ui 图位），勿用于其他 .gia。
// 用法：
//   node ./bin/gsts.mjs -c examples/football/gsts.fb20d-ui-inject.config.ts \
//        examples/football/dist-fb/src-fb/fb20d-ui.gia
// ⚠️ 注入后必须挂载才执行（角色侧 1090519041 def + entity）：
//   node ./bin/gsts.mjs assets:mounts attach 1090519041 --graph 1073741837 --def --gil <map> --write
//   node ./bin/gsts.mjs assets:mounts attach 1090519041 --graph 1073741837 --entity --gil <map> --write
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src-fb'],
  outDir: './dist-fb',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741908,
    nodeGraphId: 1073741837
  }
}

export default config
