// @status: 见 BOARD（票18 服务端读回图 1073741831；2026-09-05 mounts 回读未挂载）
// 票 18 · fb-svlisten（服务端读回图 1073741831，4 造物并发版，2026-09-03，地图 1073741908）
//
// 挂载：球实体 1077936135（getSelfEntity=球；定时器名单制不变：fb_sv_poll/fb_hp_drain，
//   与 fb-server（fb_dsp/fb_beat/fb_seed）及旧四图零串扰）。
// 票 18 多实例适配（18-design.md）：
//   · onSignal：8 路 tag（SVA1..4/SVT1..4）→ per-instance 计数 fb_sv_c1..4（距离节流差异可见）
//     + fb_sv_last_a（SVA1 最近值，R1 兼容）+ fb_sv_count_a（总聚合，判据 B 主计数）
//   · fb_sv_poll 0.06s 轮询：4 实体（447..450）位置读 fb_tp_x1..4（各实体 x 变化率=判据 B 位置路）
//     + 447 旋转 fb_tp_seen_ry（保留）+ 球 HP fb_hp_seen（不变）
//   · 票 14 遗留修复：CREATION1 1082130437（旧丘丘人，误）→ **1082130447**（R1 造物实测）
//   · entity() 必须字面量（fb-server 铁律）：4 实体用 4 个独立常量，不做数组
// 打印纪律：全程零 print。
import { g } from 'genshin-ts/runtime/core'
import { DamagePopUpType } from 'genshin-ts/definitions/enum'

import { FbSignal } from './signals.js'

const E447 = 1082130447n // R1 造物（18-entity-ids.md 帧值铁证）
const E448 = 1082130448n
const E449 = 1082130449n
const E450 = 1082130450n
const POLL_S = 0.06
const DRAIN_S = 2

g.server({ id: 1073741831, name: '_GSTS_fbSvlisten' })
  .on('whenEntityIsCreated', (_evt, f) => {
    const ball = f.getSelfEntity()
    f.recoverHpDirectly(ball, ball, 1, true, 0, 0, f.assemblyList(['fbx'], 'str'))
    f.startTimer(ball, 'fb_sv_poll', true, [POLL_S])
    f.startTimer(ball, 'fb_hp_drain', true, [DRAIN_S])
  })
  .on('whenTimerIsTriggered', (evt, f) => {
    const ball = f.getSelfEntity()
    f.doubleBranch(f.equal(evt.timerName, 'fb_sv_poll'), () => {
      f.setCustomVariable(ball, 'fb_tp_x1', f.getEntityLocationAndRotation(entity(E447)).location.x, false)
      f.setCustomVariable(ball, 'fb_tp_x2', f.getEntityLocationAndRotation(entity(E448)).location.x, false)
      f.setCustomVariable(ball, 'fb_tp_x3', f.getEntityLocationAndRotation(entity(E449)).location.x, false)
      f.setCustomVariable(ball, 'fb_tp_x4', f.getEntityLocationAndRotation(entity(E450)).location.x, false)
      f.setCustomVariable(ball, 'fb_tp_seen_ry', f.getEntityLocationAndRotation(entity(E447)).rotate.y, false)
      f.setCustomVariable(ball, 'fb_hp_seen', f.getObjectAttribute(ball).currentHp, false)
    }, () => {
      f.doubleBranch(f.equal(evt.timerName, 'fb_hp_drain'), () => {
        const attr = f.getObjectAttribute(ball)
        f.hpLoss(ball, f.multiplication(attr.maxHp, 0.1), false, false, false, DamagePopUpType.NoPopUp)
      }, () => {})
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
    // 总聚合（判据 B 主计数，8 路 tag 全计）
    const total = f.getCustomVariable(ball, 'fb_sv_count_a').asType('int')
    f.setCustomVariable(ball, 'fb_sv_count_a', total + 1n, false)
    // per-instance 计数（SVA n 路四分支；SVT 值不落变量——判读按帧流 tag 精确对照）
    f.doubleBranch(f.equal(evt.params.tag, 'SVA1'), () => {
      const c = f.getCustomVariable(ball, 'fb_sv_c1').asType('int')
      f.setCustomVariable(ball, 'fb_sv_c1', c + 1n, false)
      f.setCustomVariable(ball, 'fb_sv_last_a', evt.params.e, false)
    }, () => {
      f.doubleBranch(f.equal(evt.params.tag, 'SVA2'), () => {
        const c = f.getCustomVariable(ball, 'fb_sv_c2').asType('int')
        f.setCustomVariable(ball, 'fb_sv_c2', c + 1n, false)
      }, () => {
        f.doubleBranch(f.equal(evt.params.tag, 'SVA3'), () => {
          const c = f.getCustomVariable(ball, 'fb_sv_c3').asType('int')
          f.setCustomVariable(ball, 'fb_sv_c3', c + 1n, false)
        }, () => {
          f.doubleBranch(f.equal(evt.params.tag, 'SVA4'), () => {
            const c = f.getCustomVariable(ball, 'fb_sv_c4').asType('int')
            f.setCustomVariable(ball, 'fb_sv_c4', c + 1n, false)
          }, () => {
            // SVT1..4：客户端自读对照值（判读从帧流取，不落变量）
          })
        })
      })
    })
  })
