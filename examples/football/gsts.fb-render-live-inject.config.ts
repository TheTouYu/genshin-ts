import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 2026-09-06 零 print 改造：渲染图定点注入配置（活槽版）
// ⚠️ 图位事实（2026-09-06 真实 .gil 回读）：地图上**活着的渲染图在 1073741830**
//   （名 _GSTS_fbRender，126 节点=含打印的旧编译；已挂载球实体 1077936135）；
//   源码 fb-render.ts 的 canonical id 1073741834 在图里是未挂载旧副本 _GSTS_fbRender_1（120 节点）。
//   为不扰动用户现行拓扑，本配置锚定 **1073741830** 注入（图 ID 注入时改写），勿用于其他 .gia。
// 用法：
//   node ./bin/gsts.mjs -c examples/football/gsts.fb-render-live-inject.config.ts \
//        examples/football/dist-fb/src-fb/fb-render.gia
const config: GstsConfig = {
  compileRoot: '.',
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
