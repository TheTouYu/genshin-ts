import { g } from 'genshin-ts/runtime/core'

import { D2ClientSignal } from './signals.js'

// D2 对象式局部变量 API 客户端图核验（2026-08-29，变量地图 1073741915）
//
// 链路：服务器图 verify-d2-skill 定时器 → castSpecifiedSkillInstance(技能 1228931075)
// → 本客户端图「节点图开始」执行 → D2 局部变量链 → sendSignalToServerNodeGraph 回传
// → 服务器图 onSignal → printString（服务器日志 f22 可 grep 'set'/'len'）。
//
// 每 tick 期望日志签名：
//   set → 100   客户端显式名 localVariable('int', 42n, {name:'score'}) + set(100n) 后
//               score.value（Get 值 pin）读回 = 100（客户端按名字：Set 写槽 → Get 读槽）
//   len → 3     客户端列表字面量 [1n,2n,3n]（拼装/列表值保留）→ getListLength = 3
// 另外声明 dict（{k:'str',v:'int'} 空 map，容器元数据 wire 核验——不发送值）。
g.characterControlSkill({ id: 1082130435, name: 'verify-d2-client' }).on('start', (_evt, f) => {
  // ① 显式名 + 常量 init + set 后读 value
  const score = f.localVariable('int', 42n, { name: 'score' })
  score.set(100n)
  // ② dict 只声明（空 map，容器元数据）
  f.localVariable('dict', { k: 'str', v: 'int' }, { name: 'cfg' })
  // ③ 列表字面量 + 长度
  const list = f.localVariable('int_list', [1n, 2n, 3n], { name: 'seq' })
  // 回传服务器（tag 区分语义）
  f.sendSignalToServerNodeGraph(D2ClientSignal.d2lv_client, 'set', score.value)
  f.sendSignalToServerNodeGraph(D2ClientSignal.d2lv_client, 'len', f.getListLength(list.value))
})
