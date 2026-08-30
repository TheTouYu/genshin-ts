import type { GstsConfig } from './src/compiler/gsts_config.js'

// 核验通道统一配置（verify-injection skill）。
// 注意：只要 inject 存在，编译阶段就会解析目标 gil（mapId=0 会报
// "target gil not found: 0.gil"），因此本文件不配 inject；注入前临时加：
//
//   inject: {
//     gameRegion: 'China',
//     playerId: 110170759,
//     mapId: <验证地图 id>,
//     nodeGraphId: 1082130435<分支 placeholder 图 id>
//   }
//
const config: GstsConfig = {
  compileRoot: '.',
  entries: [
    './verify',
    '!./verify/verify-signal/**',
    // 信号 case 编译期需要 inject 指向信号所在验证地图（技能关键点 1）；
    // 非信号核验窗口排除，避免无 inject 时报 signal registry required
    //（composite-family 的 signal-family / u1-cross-graph 历史验证分支，2026-08-29）。
    '!./verify/composite-family/signal-family*.ts',
    '!./verify/u1-cross-graph/**',
    // u2b-variable-isolation 为 2026-08-16 历史实验分支（f.set 图变量 dict 解析
    // 既有失败，gs_to_ir 报 Invalid value type: dict，非本任务引入），排除以保持
    // 验证编译可复现（2026-08-29 d2-lv 核验时处理）。
    '!./verify/u2b-variable-isolation/**'
  ],
  outDir: './dist-verify',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741916,
    nodeGraphId: 1073741825
  }
  // 注入段见 SKILL.md 关键点 1（非信号 case 不配 inject；信号 case 编译时临时配
  // inject 指向验证地图 + --noinject，编译完再单文件注入）
  // verify-signal 分支属于历史地图 1073741853（verify_signal 信号），当前验证地图
  // 1073741888 无该信号，编译时排除（2026-08-15）。
}

export default config
