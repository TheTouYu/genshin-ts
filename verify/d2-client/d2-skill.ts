import { g } from 'genshin-ts/runtime/core'
import { CharacterSkillSlot, OriginalSlotSkillHandling } from 'genshin-ts/definitions/enum'

import { D2ClientSignal } from './signals.js'

// D2 客户端测试·服务器施放/监听图（2026-08-29，变量地图 1073741915）
//
// 职责：定时器施放技能实例（36 普通技能/瞬发，绑定客户端图 verify-d2-client）
// → 客户端图执行 D2 局部变量链 → d2lv_client 信号回传 → 本图 onSignal 打印。
//
// 施放链（官方节点知识 + 魔方参考图 1073741913 逐节点比对）：
//   角色实体 = Get All Character Entities of Specified Player → 取列表[0]
//     （魔方玩家-界面图 1073741851 Cast 链同构；**不是玩家实体**——玩家实体无角色技能组件，
//      传 player(1n) 报"实体组件不存在"）。
//   ① 添加角色技能（角色, 技能配置ID, 槽位）——create 实例的前提 = 角色实体已装配该配置
//     （魔方角色图 1073741829 的角色实体经编辑器战斗预设已装配，故直接 Create；本测试图
//      运行时补装配，规避玩家/角色资产侧未配置的问题）。
//   ② 创建自定义技能实例（角色, 配置ID）→ 实例 id
//   ③ 施放指定技能实例（角色, 实例 id, 校验 false）
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
    f.addCharacterSkill(
      character,
      configId(1228931075),
      CharacterSkillSlot.CustomSkillSlot1,
      OriginalSlotSkillHandling.Destroy
    )
    const inst = f.createCustomSkillInstance(character, configId(1228931075))
    f.castSpecifiedSkillInstance(character, inst, false)
  })
  .onSignal(D2ClientSignal.d2lv_client, (evt, f) => {
    f.printString(evt.params.tag)
    f.printString(f.dataTypeConversion(evt.params.val, 'str'))
  })
