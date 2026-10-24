import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 足球 v3 客户端计算链路（src-fb3）编译配置——**用 dist CLI 跑**：
//   cd examples/football && node ../../dist/src/cli/gsts.js --config ./gsts.kit3.config.ts --noinject
// （npx tsx src/cli 会踩 src/dist 双副本 ⇒ IR 恒空）
//
// 地图 1073741827「真实足球v3」；本线资产（2026-10-24 已建）：
//   技能变量 1207959557..568 │ 信号 kit_state(1610612744/745/746)
//   图 1082130436 kit_loop(20008) / 1082130437 kit_status(20009) / 1082130438 kit_decision(20007) /
//      1073741826 kit_listen(20000) │ 技能配置 1191182338(kit_loop技能, 28+瞬发)
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src-fb3'],
  outDir: './dist-fb3',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741827,
    nodeGraphId: 1073741826,
    // 本线注入不重抽项目级信号/资源声明（v5 老代码仍用 src/resources 的旧表；默认重抽会覆盖它）
    extractSignals: false,
    extractResources: false
  }
}

export default config
