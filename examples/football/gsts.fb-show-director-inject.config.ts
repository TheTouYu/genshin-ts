import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 2026-09-07 票 23 职责拆分：演出导演图定点注入配置
// 锚定 **1073741821**（_GSTS_fbShowDir，挂球实体 1077936135）。勿用于其他 .gia。
// 用法：
//   node ./bin/gsts.mjs -c examples/football/gsts.fb-show-director-inject.config.ts \
//        examples/football/dist-fb/src-fb/fb-show-director.gia
// 注入后需 assets:mounts attach 1077936135 --graph 1073741821 --entity --write 挂到球。
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src-fb'],
  outDir: './dist-fb',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741908,
    nodeGraphId: 1073741821
  }
}

export default config