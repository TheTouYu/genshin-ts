import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 只注入 kitLoop（客户端 20008 物理内核 1082130436）——单图窄注入，不动 kitRender/kitListen。
//   cd examples/football && node ../../dist/src/cli/gsts.js --config ./gsts.kit3-loop-inject.config.ts
// （不带 --noinject 即注入；注入器自带 SHA 锁定 + 备份 + Temp 同步）
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src-fb3/kit-loop.ts'],
  outDir: './dist-fb3',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741827,
    nodeGraphId: 1082130436,
    extractSignals: false,
    extractResources: false
  }
}

export default config
