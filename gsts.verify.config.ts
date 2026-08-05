import type { GstsConfig } from './src/compiler/gsts_config.js'

// 核验通道统一配置（verify-injection skill）。
// 注意：只要 inject 存在，编译阶段就会解析目标 gil（mapId=0 会报
// "target gil not found: 0.gil"），因此本文件不配 inject；注入前临时加：
//
//   inject: {
//     gameRegion: 'China',
//     playerId: 110170759,
//     mapId: <验证地图 id>,
//     nodeGraphId: <分支 placeholder 图 id>
//   }
//
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./verify'],
  outDir: './dist-verify'
}

export default config
