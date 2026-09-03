// 票 14 · fb-svlisten（服务端读回图 1073741831，2026-09-03，地图 1073741908）
//
// 挂载：球实体 1077936135（getSelfEntity=球；同实体多图与 fb-server 并存——
//   本图定时器名单制：只认 fb_sv_poll/fb_hp_drain，其余（fb_dsp/fb_beat/fb_seed）一律空分支，
//   与 fb-server 及旧四图互不串扰；反向 fb-server 已核对 else 空）。
// 职责（判据 A/B 测量面，设计稿 v4）：
//   · onSignal(fb_sv_echo)：SVA→技能变量读回值计数（路线一信号到达率=判据 B 主线）；
//     SVT→客户端自读位置×100 写 fb_tp_self_x（与服务端 fb_tp_seen_x 对照=复制延迟直读=判据 A）
//   · whenHpIsRecovered（挂球=收球恢复事件）：计数+实际恢复量（探针 C 事件路径；
//     满血时恢复量=0 但事件可能仍触发——未证项 4 顺势收证）
//   · fb_sv_poll 0.06s 轮询：getEntityLocationAndRotation(1 号造物) 写 fb_tp_seen_*（路线二·瞬移）
//     + getObjectAttribute(球).currentHp 写 fb_hp_seen（路线二·HP）
//   · fb_hp_drain 2s 扣血：hpLoss 10% maxHp 非致命（保恢复空间，值通道可读）
//   · 判据 A 锚：首拍服务端自写 recoverHpDirectly(球,1)→事件应同秒（秒桶对齐基准）
// 打印纪律：本图全程零 print（数据走变量+按图详情日志）。
import { g } from 'genshin-ts/runtime/core'
import { DamagePopUpType } from 'genshin-ts/definitions/enum'

import { FbSignal } from './signals.js'

const CREATION1 = 1082130437n // 1 号造物实体（新造物=瞬移写目标；entity() 必须字面量）
const POLL_S = 0.06 // 轮询周期（判据 B 阶梯 ≥15Hz 需 ≤0.066s）
const DRAIN_S = 2 // 扣血周期

g.server({ id: 1073741831, name: '_GSTS_fbSvlisten' })
  .on('whenEntityIsCreated', (_evt, f) => {
    const ball = f.getSelfEntity()
    // 判据 A 锚：服务端自写自读（同秒基准）
    f.recoverHpDirectly(ball, ball, 1, true, 0, 0, f.assemblyList(['fbx'], 'str'))
    f.startTimer(ball, 'fb_sv_poll', true, [POLL_S])
    f.startTimer(ball, 'fb_hp_drain', true, [DRAIN_S])
  })
  .on('whenTimerIsTriggered', (evt, f) => {
    const ball = f.getSelfEntity()
    f.doubleBranch(f.equal(evt.timerName, 'fb_sv_poll'), () => {
      const cr = f.getEntityLocationAndRotation(entity(CREATION1))
      f.setCustomVariable(ball, 'fb_tp_seen_x', cr.location.x, false)
      f.setCustomVariable(ball, 'fb_tp_seen_y', cr.location.y, false)
      f.setCustomVariable(ball, 'fb_tp_seen_z', cr.location.z, false)
      f.setCustomVariable(ball, 'fb_tp_seen_ry', cr.rotate.y, false)
      f.setCustomVariable(ball, 'fb_hp_seen', f.getObjectAttribute(ball).currentHp, false)
    }, () => {
      f.doubleBranch(f.equal(evt.timerName, 'fb_hp_drain'), () => {
        const attr = f.getObjectAttribute(ball)
        f.hpLoss(ball, f.multiplication(attr.maxHp, 0.1), false, false, false, DamagePopUpType.NoPopUp)
      }, () => {}) // 名单制：其余定时器空分支（fb_dsp/fb_beat/fb_seed/旧四图广播）
    })
  })
  .on('whenHpIsRecovered', (evt, f) => {
    const ball = f.getSelfEntity()
    const cnt = f.getCustomVariable(ball, 'fb_hp_evt_count').asType('int')
    f.setCustomVariable(ball, 'fb_hp_evt_count', cnt + 1n, false)
    f.setCustomVariable(ball, 'fb_hp_evt_amt', evt.recoveryAmount, false)
  })
  .onSignal(FbSignal.fb_sv_echo, (evt, f) => {
    const ball = f.getSelfEntity()
    f.doubleBranch(f.equal(evt.params.tag, 'SVA'), () => {
      f.setCustomVariable(ball, 'fb_sv_last_a', evt.params.e, false)
      const cnt = f.getCustomVariable(ball, 'fb_sv_count_a').asType('int')
      f.setCustomVariable(ball, 'fb_sv_count_a', cnt + 1n, false)
    }, () => {
      f.setCustomVariable(ball, 'fb_tp_self_x', evt.params.e, false) // SVT：客户端自读对照
    })
  })
