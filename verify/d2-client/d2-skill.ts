import { g } from 'genshin-ts/runtime/core'
import { CharacterSkillSlot, OriginalSlotSkillHandling } from 'genshin-ts/definitions/enum'

import { D2ClientSignal } from './signals.js'

// D2 客户端测试·服务器施放/监听图（2026-08-29，变量地图 1073741915）
//
// 职责：定时器施放技能实例（36 普通技能/瞬发，绑定客户端图 verify-d2-client）
// → 客户端图执行 D2 局部变量链 → d2lv_client 信号回传 → 本图 onSignal 打印。
//
// 施放链（官方节点知识，miliastra-knowledge 执行节点文档）：
//   ① 添加角色技能（目标角色, 技能配置ID, 槽位）——"为指定目标角色的某个技能槽位添加技能"；
//      create 实例的前提 = 角色实体上有该配置对应的技能（缺此步报"实体组件不存在"）。
//   ② 创建自定义技能实例（角色, 配置ID）→ 实例 id
//   ③ 施放指定技能实例（角色, 实例 id, 校验 false）
// 魔方版本（1073741914）角色图 = Create(配置 1228931073) + 玩家图 Cast(实例变量)，
// 其角色实体经编辑器战斗预设已装配技能；本测试图运行时 addCharacterSkill 补装配。
//
// 每 5s tick 期望日志签名（服务器日志 f22）：
//   set → 100   客户端 score.set(100n) 后读回
//   len → 3     客户端列表字面量长度
g.server({ id: 1073741841, name: 'verify-d2-skill' })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.startTimer(f.getSelfEntity(), 'd2skill_tick', true, [5])
  })
  .on('whenTimerIsTriggered', (_evt, f) => {
    f.addCharacterSkill(
      player(1n),
      configId(1228931075),
      CharacterSkillSlot.CustomSkillSlot1,
      OriginalSlotSkillHandling.Destroy
    )
    const inst = f.createCustomSkillInstance(player(1n), configId(1228931075))
    f.castSpecifiedSkillInstance(player(1n), inst, false)
  })
  .onSignal(D2ClientSignal.d2lv_client, (evt, f) => {
    f.printString(evt.params.tag)
    f.printString(f.dataTypeConversion(evt.params.val, 'str'))
  })
