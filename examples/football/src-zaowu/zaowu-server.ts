import { g } from 'genshin-ts/runtime/core'

import { ZaowuSignal } from './signals.js'

// 服务端监听图（20000）。造物链全在客户端；服务端只收 20008 图回传的信号。
// 图 ID = 1073741825（CLI 2026-10-24 创建：assets:node-graphs create --type 20000）；
// 挂载：关卡实体 1094713345（assets:mounts attach）。
// 期望日志：zaowu-listener-armed（就绪）+ creation-skill-fired / v1（每次施放）
g
  .server({ id: 1073741825, name: 'zaowuListen' })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('zaowu-listener-armed')
  })
  .onSignal(ZaowuSignal.zaowu_probe, (evt, f) => {
    f.printString(evt.params.tag)
    f.printString(evt.params.val)
  })
