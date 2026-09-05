import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 2026-09-05 单次释放大循环校准：客户端 20002 图定点注入配置
// 锚定 **1082130440**（fb20d-calib 图位），勿用于其他 .gia。
// 用法：
//   node ./bin/gsts.mjs -c examples/football/gsts.fb20d-calib-inject.config.ts \
//        examples/football/dist-fb/src-fb/fb20d-calib.gia
// 客户端图执行通道=技能配置 1098907654 的 body-f5 绑定，**不经 mounts**。
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src-fb'],
  outDir: './dist-fb',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741908,
    nodeGraphId: 1082130440
  }
}

export default config
