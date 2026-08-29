import { g } from 'genshin-ts/runtime/core'
import { CharacterSkillSlot, OriginalSlotSkillHandling } from 'genshin-ts/definitions/enum'

import { D2ClientSignal } from './signals.js'

// D2 客户端测试·服务器施放/监听图（2026-08-29，变量地图 1073741915）
//
// 职责：定时器施放技能实例（36 普通技能/瞬发，绑定客户端图 verify-d2-client）
// → 客户端图执行 D2 局部变量链 → d2lv_client 信号回传 → 本图 onSignal 打印。
//
// 施放链（对齐魔方参考图 1073741913 完整模式）：
//   角色实体 = Get All Character Entities of Specified Player → 列表[0]
//     （魔方玩家-界面图 1073741851 Cast 链同构；不是玩家实体——玩家无角色技能组件）。
//   ① addCharacterSkill（角色, 配置, 槽位）——create 前提 = 角色已装配该配置
//     （魔方角色实体经编辑器战斗预设装配；本图运行时补装配）。
//   ② createCustomSkillInstance（角色, 配置）→ 实例 id
//     → Set Custom Variable(角色所属玩家, "技能实例ID", 实例id)
//     （魔方角色图 1073741829 n=19 同构；玩家实体"技能实例ID"变量初始 0，运行时被写）
//   ③ castSpecifiedSkillInstance（角色, Get Custom Variable "技能实例ID", false）
//     （魔方玩家-界面图 n=12/14 同构——Cast 读玩家变量而非链内直传）
//
// 每 5s tick 期望日志签名（服务器日志 f22）：
//   set → 100   客户端 score.set(100n) 后读回
//   len → 3     客户端列表字面量长度
g.server({ id: 1073741841, name: 'verify-d2-skill' })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.startTimer(f.getSelfEntity(), 'd2skill_tick', true, [5])
  })
  .on('whenTimerIsTriggered', (_evt, f) => {
    const character = f.getCorrespondingValueFromList(
      f.getAllCharacterEntitiesOfSpecifiedPlayer(player(1n)),
      0n
    )
    const owner = f.getPlayerEntityToWhichTheCharacterBelongs(character)
    f.addCharacterSkill(
      character,
      configId(1098907653),
      CharacterSkillSlot.CustomSkillSlot1,
      OriginalSlotSkillHandling.Destroy
    )
    const inst = f.createCustomSkillInstance(character, configId(1098907653))
    f.setCustomVariable(owner, '技能实例ID', inst, false)
    f.castSpecifiedSkillInstance(
      character,
      f.getCustomVariable(owner, '技能实例ID').asType('int'),
      false
    )
  })
  .onSignal(D2ClientSignal.d2lv_client, (evt, f) => {
    f.printString(evt.params.tag)
    f.printString(f.dataTypeConversion(evt.params.val, 'str'))
  })
