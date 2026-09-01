import type { GstsConfig } from '../../src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src'],
  outDir: './dist',
  // 注：stage3 默认即 shared-vendor-impl-graph 后端（stage3_backend.ts）；
  // `vendorImplGraphBeta: true` 与默认等价（选择 vendor），`false` 才是回退 legacy。
  // 2026-08-30 44a18d8 曾在此注释称"显式回退 legacy"但值写成了 true（未实际回退）。
  // 3013 cases 丢失已由 44a18d8 的 asv 修复闭环（3067/3071 多分支正常），此开关
  // 维持 vendor 后端不变——本轮（定时器引脚语义修复）不引入后端变量。
  options: {
    stage3: {
      vendorImplGraphBeta: true
    }
  },
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741914,
    nodeGraphId: 1073741830
  }
}

export default config