import type { GstsConfig } from '../../src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src'],
  outDir: './dist',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741899,
    nodeGraphId: 1073741830
  },
  // 2026-08-23：shared vendor impl backend 丢复合「data 输出→复合输入」路由（日志铁证：
  // view_turn_unlock_if_last 的 Equal IN0(slot) 为空 → unlock 永不触发 → 转动后锁死）。
  // 显式回退 legacy backend。
  options: { stage3: { vendorImplGraphBeta: false } }
}

export default config
