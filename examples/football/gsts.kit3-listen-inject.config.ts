import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// kit-listen 单图注入配置（2026-11-18 拆分，与 gsts.kit3-render-inject.config.ts
// 成对；原因见该文件头注释：跨 entry 编译污染，两图必须分进程编译注入）。
//   cd examples/football && node ../../dist/src/cli/gsts.js --config ./gsts.kit3-listen-inject.config.ts
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src-fb3/kit-listen.ts'],
  outDir: './dist-fb3',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741827,
    nodeGraphId: 1073741826,
    extractSignals: false,
    extractResources: false
  }
}

export default config
