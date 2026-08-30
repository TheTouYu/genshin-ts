import { g } from 'genshin-ts/runtime/core'
import { CharacterSkillSlot, OriginalSlotSkillHandling } from 'genshin-ts/definitions/enum'

import { C2sCvSignal } from './signals.js'

// C2S 变量通道核验·服务端图（2026-08-30，新地图 1073741916「GSTS核验-变量C2S」）
//
// 命题（手段 3）：服务端写玩家自定义变量 → 客户端图（20002）读同一变量 → 信号回传 →
// 服务端打印对比。cv 值 ∈ 最近写入值序列且 > 0 即通道成立。
//
// 职责：
//   whenEntityIsCreated 启动双定时器（When Timer 无名称过滤，evt.timerName 分流）：
//     cv_write 4s 循环：写玩家变量 d2c_counter = cv_write 自身序列号（动态创建，
//       PKC clm_070E：设置自定义变量可动态创建新变量），printString 记录写入值
//     cv_cast 10s 循环：施放链（对齐参考图/旧 1829 模式）触发客户端图执行
//   onSignal：打印客户端回传 tag/val
//
// 时序（tick 秒）：w 序列 = 4,8,12... 每 4s 一次（值 1,2,3...）；cast 在 10,20,30...
//   预期回传：t=10 读 w=2、t=20 读 w=4 或 5（同 tick 碰撞点，观察 When Timer 同 tick
//   执行顺序）、t=30 读 w=7、t=40 读 w=9 或 10
//
// 每 tick 期望日志签名（服务器日志 f22）：
//   d2cv|w|  → N    服务端写入值（cv_write 序列 1,2,3...）
//   cv       → M    客户端回传值（M ∈ 最近写入值，> 0 即通道成立）
g.server({ id: 1073741842, name: 'verify-c2s-cv' })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.startTimer(f.getSelfEntity(), 'cv_write', true, [4])
    f.startTimer(f.getSelfEntity(), 'cv_cast', true, [10])
  })
  .on('whenTimerIsTriggered', (evt, f) => {
    const character = f.getCorrespondingValueFromList(
      f.getAllCharacterEntitiesOfSpecifiedPlayer(player(1n)),
      0n
    )
    const owner = f.getPlayerEntityToWhichTheCharacterBelongs(character)
    f.doubleBranch(
      f.equal(evt.timerName, 'cv_write'),
      () => {
        // 写玩家自定义变量（动态创建 d2c_counter）
        f.setCustomVariable(owner, 'd2c_counter', evt.timerSequenceId, false)
        f.printString('d2cv|w|')
        f.printString(f.dataTypeConversion(evt.timerSequenceId, 'str'))
      },
      () => {
        // 施放链：角色实体 + 配置 1098907660（6 模板瞬发，绑客户端图 1082130433）
        f.addCharacterSkill(
          character,
          configId(1098907660),
          CharacterSkillSlot.CustomSkillSlot1,
          OriginalSlotSkillHandling.Destroy
        )
        const inst = f.createCustomSkillInstance(character, configId(1098907660))
        f.setCustomVariable(owner, '技能实例ID', inst, false)
        f.castSpecifiedSkillInstance(
          character,
          f.getCustomVariable(owner, '技能实例ID').asType('int'),
          false
        )
      }
    )
  })
  .onSignal(C2sCvSignal.d2cv, (evt, f) => {
    f.printString(evt.params.tag)
    f.printString(f.dataTypeConversion(evt.params.val, 'str'))
  })
  // 手段 4b 接收端（2026-08-30 第 2 轮）：客户端图 notifyServerNodeGraph 三字面量
  // → 本事件。预期每 10s 施放后 f22：nt1→c2s-nt / nt2→p2-fixed / nt3→p3-fixed；
  // evt.callerEntity/callerGuid 顺带观察（通知发起者身份）。
  .on('whenSkillNodeIsCalled', (evt, f) => {
    f.printString('nt1|')
    f.printString(evt.parameter1)
    f.printString('nt2|')
    f.printString(evt.parameter2)
    f.printString('nt3|')
    f.printString(evt.parameter3)
  })
