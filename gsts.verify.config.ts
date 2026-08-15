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
  entries: [
    './verify',
    '!./verify/verify-signal/**'
  ],
  outDir: './dist-verify'
  // 注入段见 SKILL.md 关键点 1（非信号 case 不配 inject；信号 case 编译时临时配
  // inject 指向验证地图 + --noinject，编译完再单文件注入）
  // verify-signal 分支属于历史地图 1073741853（verify_signal 信号），当前验证地图
  // 1073741888 无该信号，编译时排除（2026-08-15）。
}

export default config
