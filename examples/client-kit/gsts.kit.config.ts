import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// client-kit 编译验证配置（**只编译，不注入**）——抽离库的自证入口。
//
// 用法：
//   npx tsx src/cli/gsts.ts --config examples/client-kit/gsts.kit.config.ts --noinject
//   或 scripts/check-client-kit.sh（含产物断言）
//
// 说明：
//   · entries 必须整目录（单文件 entry 编客户端图会报 ctxType 错——技能三-1）；
//   · inject.mapId 只用于解析信号注册表；本 kit 自证图**不发信号**，所以任意现役地图都行；
//   · 占位图 ID（1082130499）**禁止注入**，只用于编译自证。
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./channels.ts', './protocol.ts', './loop.ts', './selfcheck.ts'],
  outDir: './dist',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741827,
    nodeGraphId: 1073741836
  }
}

export default config
