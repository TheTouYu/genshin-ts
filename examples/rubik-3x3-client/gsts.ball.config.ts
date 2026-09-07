import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 球跟随负载优化 · 测试图配置（2026-09-07）
// 与 gsts.config.ts 同源，仅 inject.mapId 指向测试图 1073741919（1073741914 的副本；
// 原图不动）。用户游戏核验通过后，把 mapId 改回 1073741914 即可正式注入原图。
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src'],
  outDir: './dist',
  options: {
    stage3: {
      vendorImplGraphBeta: true
    }
  },
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741919,
    nodeGraphId: 1073741830
  }
}

export default config
