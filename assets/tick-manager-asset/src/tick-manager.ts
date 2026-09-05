// TickManager 主图（可复用资产，20000 服务端图）
//
// 职责：在专用 TickManager 空模型实体上，用单个基础心跳定时器产生多档频率信号。
//   - 基础心跳：tm_beat（默认 0.06s 循环）
//   - 每次心跳：tm_tick 自增，并分别发送 TickUpdate_60/_200/_1000。
//
// 挂载前置（资产导入到目标项目时需要满足）：
//   1. 一个专用空模型实体/定义作为 TickManager；
//   2. 本图挂载到该实体；
//   3. 可选：TickManager 实体上配置全局计时器组件 GlobalTick（用于发送 now_ms；
//      未配置时 now_ms 仍可发送，但值来自引擎计时器默认行为——建议按资产文档配置）。
//   4. 目标地图注册三档信号 TickUpdate_60/_200/_1000（本资产 .gia 自带 signal def，
//      导入后按目标项目注册流程处理）。
//
// 负载设计：低频消费方只监听对应档位，不会被 0.06s 心跳唤醒。
import { g } from 'genshin-ts/runtime/core'
import { int } from 'genshin-ts/runtime/value'

import { TickManagerSignal } from './signals.js'

const TM_GRAPH_ID = 1073743001 // 可复用资产主图 ID（目标地图冲突时在注入配置中映射）
const TM_GRAPH_NAME = '_GSTS_TickManagerAsset'
const TICKER = 'tm_beat' // 基础心跳定时器名
const BASE_INTERVAL = 0.06 // 秒；60ms 档
const GLOBAL_TIMER = 'GlobalTick'

// 各档取模周期（相对 BASE_INTERVAL）：4 → 240ms 档，17 → 1020ms 档
const MOD_200 = 4n
const MOD_1000 = 17n

g.server({
  id: TM_GRAPH_ID,
  name: TM_GRAPH_NAME,
  variables: {
    tm_tick: new int(0)
  }
})
  .on('whenEntityIsCreated', (_evt, f) => {
    const self = f.getSelfEntity()
    f.startTimer(self, TICKER, true, f.assemblyList([BASE_INTERVAL], 'float'))
  })
  .on('whenTimerIsTriggered', (evt, f) => {
    const self = f.getSelfEntity()
    f.doubleBranch(f.equal(evt.timerName, TICKER), () => {
      const oldTick = f.getNodeGraphVariable('tm_tick').asType('int')
      const tick = oldTick + 1n
      f.setNodeGraphVariable('tm_tick', tick, false)

      // now_ms：GlobalTick 秒值 × 1000 → int（供消费方做真实间隔/物理 dt）
      const sec = f.getCurrentGlobalTimerTime(self, GLOBAL_TIMER)
      const nowMs = f.dataTypeConversion(f.multiplication(sec, 1000), 'int')

      // 60ms 档：每 tick 都发
      f.sendSignal(TickManagerSignal.tick60, self, nowMs, 0.06)

      // 200ms 档：每 4 tick
      f.doubleBranch(f.equal(f.moduloOperation(tick, MOD_200), 0n), () => {
        f.sendSignal(TickManagerSignal.tick200, self, nowMs, 0.2)
      }, () => {})

      // 1000ms 档：每 17 tick（≈1020ms）
      f.doubleBranch(f.equal(f.moduloOperation(tick, MOD_1000), 0n), () => {
        f.sendSignal(TickManagerSignal.tick1000, self, nowMs, 1.0)
      }, () => {})
    }, () => {})
  })
