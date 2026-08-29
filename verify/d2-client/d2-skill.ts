import { g } from 'genshin-ts/runtime/core'

import { D2ClientSignal } from './signals.js'

// D2 客户端测试·服务器施放/监听图（2026-08-29，变量地图 1073741915）
//
// 职责：定时器施放技能实例（36 普通技能/瞬发，绑定客户端图 verify-d2-client）
// → 客户端图执行 D2 局部变量链 → d2lv_client 信号回传 → 本图 onSignal 打印。
//
// 施放链（魔方-客户端优化版本实证，retrospective-2026-08-28-client-server-call-chain）：
//   Create Custom Skill Instance(配置 1228931075) → 实例 id → Cast Specified Skill Instance
//   ——cast 的 IN1 必须是**技能实例 id**（非配置 id；传配置 id 报"实体组件不存在"）。
//
// 每 5s tick 期望日志签名（服务器日志 f22）：
//   set → 100   客户端 score.set(100n) 后读回
//   len → 3     客户端列表字面量长度
g.server({ id: 1073741841, name: 'verify-d2-skill' })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.startTimer(f.getSelfEntity(), 'd2skill_tick', true, [5])
  })
  .on('whenTimerIsTriggered', (_evt, f) => {
    const inst = f.createCustomSkillInstance(player(1n), configId(1228931075))
    f.castSpecifiedSkillInstance(player(1n), inst, false)
  })
  .onSignal(D2ClientSignal.d2lv_client, (evt, f) => {
    f.printString(evt.params.tag)
    f.printString(f.dataTypeConversion(evt.params.val, 'str'))
  })
