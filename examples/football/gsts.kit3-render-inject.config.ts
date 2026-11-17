import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// kit-render 单图注入配置（2026-11-18 拆分）。
// 原因：同进程批量编译两图时存在跨 entry 模块态污染——kit-render Stage2 成功
// 后 kit-listen Stage2 必败（Generic parameter not matched，3/3 复现；单图配置
// 各自编译全通过）。在编译器污染修复前，渲染/监听两图必须分进程编译注入。
//   cd examples/football && node ../../dist/src/cli/gsts.js --config ./gsts.kit3-render-inject.config.ts
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src-fb3/kit-render.ts'],
  outDir: './dist-fb3',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741827,
    nodeGraphId: 1073741828,
    extractSignals: false,
    extractResources: false
  }
}

export default config
