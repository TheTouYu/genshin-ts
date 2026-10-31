import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 只注入两张服务端图（kitRender 1073741828 / kitListen 1073741826）——窄注入，
// 不碰客户端内核、也不带出 kit-loop-test（它会超出 2000 预算）。
//   cd examples/football && node ../../dist/src/cli/gsts.js --config ./gsts.kit3-server-inject.config.ts
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src-fb3/kit-render.ts', './src-fb3/kit-listen.ts'],
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
