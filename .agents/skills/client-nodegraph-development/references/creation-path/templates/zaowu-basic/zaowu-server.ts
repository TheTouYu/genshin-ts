import { g } from 'genshin-ts/runtime/core'

import { ZaowuSignal } from './signals.js'

// 造物技能路径探针·服务端监听图（C 线 Round 0，2026-08-31，地图 1073741915「变量」）
//
// 造物技能链全部发生在客户端 AI；服务端只负责接收 20008 图的信号回传。
// 挂载：关卡实体 1094713345（assets:mounts attach）。
//
// 期望日志签名（服务器日志 f22）：
//   zaowu-listener-armed        （本图随关卡启动，监听链就绪标记）
//   creation-skill-fired v1     （每次造物施放技能，受 CD 节流）
g
  .server({ id: 1073741830, name: '_GSTS_zaowuListen' })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('zaowu-listener-armed')
  })
  .onSignal(ZaowuSignal.zaowu_probe, (evt, f) => {
    f.printString(evt.params.tag)
    f.printString(evt.params.val)
  })
