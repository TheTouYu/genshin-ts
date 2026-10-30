import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 测试版物理图（**独立图 + 独立技能配置**，仅测试会话启用）
//   src-fb3/kit-loop-test.ts 由 scripts/gen-kit-loop-test.mjs 从生产内核生成
//   cd examples/football && node ../../dist/src/cli/gsts.js --config ./gsts.kit3-test.config.ts
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src-fb3/kit-loop-test.ts'],
  outDir: './dist-fb3',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741827,
    nodeGraphId: 1082130440,
    extractSignals: false,
    extractResources: false
  }
}

export default config
