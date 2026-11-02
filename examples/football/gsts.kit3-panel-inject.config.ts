import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 只注入调参面板图 _GSTS_aimPanel（服务端 20000 / 1073741834）——单图窄注入。
// 面板键（F5~F10/0）由 Lua 发 fb_input 信号，panel 图累加 fb_t_pow/right/up 三个
// 载体变量，客户端内核每拍读取。改动 bump 的夹紧后需要单独注这一张。
//   cd examples/football && node ../../dist/src/cli/gsts.js --config ./gsts.kit3-panel-inject.config.ts
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src-fb3/zz-aim-panel.ts'],
  outDir: './dist-fb3',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741827,
    nodeGraphId: 1073741834,
    extractSignals: false,
    extractResources: false
  }
}

export default config
