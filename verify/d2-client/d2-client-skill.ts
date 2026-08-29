import { g } from 'genshin-ts/runtime/core'

import { D2ClientSignal } from './signals.js'

// D2 对象式局部变量 API 客户端图核验·20002 角色技能图版（2026-08-30）
//
// 链路：服务器图 verify-d2-skill 定时器 → addCharacterSkill(角色, 配置 1098907653)
// → createCustomSkillInstance → Set 玩家变量"技能实例ID" → castSpecifiedSkillInstance
// → 本客户端图（20002 角色技能图，6 模板自定义技能绑定）「节点图开始」执行
// → D2 局部变量链 → sendSignalToServerNodeGraph 回传 → 服务器图 onSignal 打印。
//
// 每 tick 期望日志签名（服务器日志 f22）：
//   set → 100   客户端显式名 localVariable('int', 42n, {name:'score'}) + set(100n) 后
//               score.value（Get 值 pin）读回 = 100（客户端按名字：Set 写槽 → Get 读槽）
//   len → 3     客户端列表字面量 [1n,2n,3n] → getListLength = 3
g.characterSkill({ id: 1082130437, name: 'verify-d2-client-skill' }).on('start', (_evt, f) => {
  // ① 显式名 + 常量 init + set 后读 value
  const score = f.localVariable('int', 42n, { name: 'score' })
  score.set(100n)
  // ② 列表字面量 + 长度
  const list = f.localVariable('int_list', [1n, 2n, 3n], { name: 'seq' })
  // 回传服务器（tag 区分语义）
  f.sendSignalToServerNodeGraph(D2ClientSignal.d2lv_client, 'set', score.value)
  f.sendSignalToServerNodeGraph(D2ClientSignal.d2lv_client, 'len', f.getListLength(list.value))
})
