// chan-listen.ts —— 服务端原生写通道读回图模板（从票 18 fb-svlisten 提炼去足球化）
//
// 用法：抄到 entries 目录+替换真值；挂载到 HP 探针写目标实体（whenHpIsRecovered 按挂载实体触发）。
// 四路读回：信号聚合（判据主计数）+ per-instance 计数（距离节流差异可见）+ 多实体位置轮询
// + HP 事件（计数+实际恢复量）+ 扣血维持循环（保恢复空间）+ 判据锚（服务端自写自读同秒基准）。
// 定时器名单制：只认 chan_poll/chan_drain，else 空（与同实体其它图零串扰）。
import { g } from 'genshin-ts/runtime/core'
import { DamagePopUpType } from 'genshin-ts/definitions/enum'

import { FbSignal } from './signals.js'

const E1 = 1082130447n // TODO 真值：实例 1 实体 GUID（与 chan-loop 一致）
const E2 = 1082130448n
const E3 = 1082130449n
const E4 = 1082130450n
const POLL_S = 0.06 // 轮询周期（引擎实际粒度 ~0.09s → 上限 11/s，如实判读）
const DRAIN_S = 2 // 扣血周期（保 HP 恢复空间）

g.server({ id: 1073741831, name: '_GSTS_chanListen' })
  .on('whenEntityIsCreated', (_evt, f) => {
    const self = f.getSelfEntity()
    // 判据锚：服务端自写自读（首拍同秒基准，用于送达延迟标定）
    f.recoverHpDirectly(self, self, 1, true, 0, 0, f.assemblyList(['chx'], 'str'))
    f.startTimer(self, 'chan_poll', true, [POLL_S])
    f.startTimer(self, 'chan_drain', true, [DRAIN_S])
  })
  .on('whenTimerIsTriggered', (evt, f) => {
    const self = f.getSelfEntity()
    f.doubleBranch(f.equal(evt.timerName, 'chan_poll'), () => {
      // 多实体位置轮询（entity() 必须字面量——4 实体 4 常量，不做数组）
      f.setCustomVariable(self, 'x1', f.getEntityLocationAndRotation(entity(E1)).location.x, false)
      f.setCustomVariable(self, 'x2', f.getEntityLocationAndRotation(entity(E2)).location.x, false)
      f.setCustomVariable(self, 'x3', f.getEntityLocationAndRotation(entity(E3)).location.x, false)
      f.setCustomVariable(self, 'x4', f.getEntityLocationAndRotation(entity(E4)).location.x, false)
      // 挂载实体自身 HP 读回（transform 读回注意字段名：location/rotate）
      f.setCustomVariable(self, 'hp_seen', f.getObjectAttribute(self).currentHp, false)
    }, () => {
      f.doubleBranch(f.equal(evt.timerName, 'chan_drain'), () => {
        const attr = f.getObjectAttribute(self)
        f.hpLoss(self, f.multiplication(attr.maxHp, 0.1), false, false, false, DamagePopUpType.NoPopUp)
      }, () => {})
    })
  })
  .on('whenHpIsRecovered', (evt, f) => {
    const self = f.getSelfEntity()
    const cnt = f.getCustomVariable(self, 'hp_evt_count').asType('int')
    f.setCustomVariable(self, 'hp_evt_count', cnt + 1n, false)
    f.setCustomVariable(self, 'hp_evt_amt', evt.recoveryAmount, false)
  })
  .onSignal(FbSignal.chan_echo, (evt, f) => {
    const self = f.getSelfEntity()
    // 总聚合（判据主计数：8 路 tag 全计）
    const total = f.getCustomVariable(self, 'sv_total').asType('int')
    f.setCustomVariable(self, 'sv_total', total + 1n, false)
    // per-instance 计数（SVA n 四分支；SVT 对照值从帧流取不落变量）
    f.doubleBranch(f.equal(evt.params.tag, 'SVA1'), () => {
      const c = f.getCustomVariable(self, 'c1').asType('int')
      f.setCustomVariable(self, 'c1', c + 1n, false)
    }, () => {
      f.doubleBranch(f.equal(evt.params.tag, 'SVA2'), () => {
        const c = f.getCustomVariable(self, 'c2').asType('int')
        f.setCustomVariable(self, 'c2', c + 1n, false)
      }, () => {
        f.doubleBranch(f.equal(evt.params.tag, 'SVA3'), () => {
          const c = f.getCustomVariable(self, 'c3').asType('int')
          f.setCustomVariable(self, 'c3', c + 1n, false)
        }, () => {
          f.doubleBranch(f.equal(evt.params.tag, 'SVA4'), () => {
            const c = f.getCustomVariable(self, 'c4').asType('int')
            f.setCustomVariable(self, 'c4', c + 1n, false)
          }, () => {})
        })
      })
    })
  })
