import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 2026-09-06 零 print 改造：输入图定点注入配置
// 锚定 **1073741835**（fb-input 图位，挂球实体 1077936135），勿用于其他 .gia。
// 用法：
//   node ./bin/gsts.mjs -c examples/football/gsts.fb-input-inject.config.ts \
//        examples/football/dist-fb/src-fb/fb-input.gia
// ⚠️ 2026-09-06 真实 .gil 回读：球实体挂载 = 1833(sink)+1835(input)+1830(render 活槽)+1836(fb20c-server)；
//   注入按图 ID 覆盖内容，挂载关系不受影响。
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src-fb'],
  outDir: './dist-fb',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741825,
    nodeGraphId: 1073741835
  }
}

export default config
