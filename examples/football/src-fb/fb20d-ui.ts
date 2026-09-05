// fb20d-ui.ts —— 单次释放实验的 UI 按钮服务端触发图（type 20000，2026-09-05）
//
// 职责：
//   1. 角色就绪后**一次性 createCustomSkillInstance**（6+瞬发配置 1098907654，
//      body-f5 绑 20002 图 1082130440），把返回的技能实例 ID 存进图变量；
//   2. 监听自定义按钮「跑一次」（id=1073741843）的「界面控件组触发时」，
//      只调用 castSpecifiedSkillInstance(角色, 已存ID, false) —— **不在点击时再创建**。
//
// ⚠️ 2026-09-05 用户实测/指正（已写入技能知识）：
//   · UI 控件事件只有挂载在【玩家模板/玩家实体】上的节点图能收到，不是角色侧。
//   · 正确技能用法 = **先创建好技能实例、拿到 ID**；后续 UI 事件只 castSpecifiedSkillInstance。
//     不是“每次点击 add+create+cast 一条龙”，也不是“完全不创建实例只按槽位 cast”。
//   · 不需要 addCharacterSkill（技能已预置在角色上时）。
//
// 挂载（用户已修改）：玩家模板 1086324737 def + 1086324737..745 entity 副本。
//
// 触发链路：
//   whenEntityIsCreated → 2s 一次性定时器 → createCustomSkillInstance(1098907654) → 存 ID
//   UI 点击 → whenUiControlGroupIsTriggered(按钮ID) → castSpecifiedSkillInstance(已存ID, false)
//   → 客户端 20002 图 start → 客户端发 CAL_START/CAL_DONE → 本图 onSignal 打印
//
// 防重入：fb20d_busy=1 期间忽略再次点击，直到收到 CAL_DONE 才复位。
// 打印纪律：仅生命周期 4 行（created/cast/start/done），不 print 高频数据。
import { g } from 'genshin-ts/runtime/core'
import { int } from 'genshin-ts/runtime/value'

import { Fb20Signal } from './signals20.js'

const BUTTON_ID = 1073741843n // 自定义按钮「跑一次」（UI CLI 候选分配 ID）
const SKILL_CFG = 1098907654n // GSTS-fb20d-calib：template 6 + 瞬发，body-f5 绑 1082130440

g.server({
  id: 1073741837,
  name: '_GSTS_fb20dUi',
  variables: {
    fb20d_armed: new int(0),
    fb20d_skill_id: new int(0),
    fb20d_busy: new int(0),
    fb20d_last_run: new int(0),
    fb20d_last_k: new int(0)
  }
})
  .on('whenEntityIsCreated', (_evt, f) => {
    const player = f.getSelfEntity()
    f.startTimer(player, 'fb20d_arm_once', false, [2])
  })
  .on('whenTimerIsTriggered', (evt, f) => {
    const player = f.getSelfEntity()
    // 名单制分发：只认本图定时器名，else 一律空分支
    f.doubleBranch(f.equal(evt.timerName, 'fb20d_arm_once'), () => {
      const armed = f.getNodeGraphVariable('fb20d_armed').asType('int')
      f.doubleBranch(f.equal(armed, 0n), () => {
        const role = f.getCorrespondingValueFromList(
          f.getAllCharacterEntitiesOfSpecifiedPlayer(player),
          0n
        )
        // 一次性创建实例并保存 ID；技能已预置到角色，不需要 addCharacterSkill
        const inst = f.createCustomSkillInstance(role, configId(SKILL_CFG))
        f.setNodeGraphVariable('fb20d_skill_id', inst, false)
        f.setNodeGraphVariable('fb20d_armed', 1n, false)
        f.printString('fb20d:created')
        f.printString(f.dataTypeConversion(inst, 'str'))
      }, () => {})
    }, () => {})
  })
  .on('whenUiControlGroupIsTriggered', (evt, f) => {
    const player = f.getSelfEntity()
    const busy = f.getNodeGraphVariable('fb20d_busy').asType('int')
    f.doubleBranch(f.equal(busy, 0n), () => {
      // 只认我们创建的按钮 ID；UI 控件组事件可能还有官方控件，名单制过滤
      f.doubleBranch(f.equal(evt.uiControlGroupIndex, BUTTON_ID), () => {
        const armed = f.getNodeGraphVariable('fb20d_armed').asType('int')
        f.doubleBranch(f.equal(armed, 1n), () => {
          const role = f.getCorrespondingValueFromList(
            f.getAllCharacterEntitiesOfSpecifiedPlayer(player),
            0n
          )
          const skillId = f.getNodeGraphVariable('fb20d_skill_id').asType('int')
          f.setNodeGraphVariable('fb20d_busy', 1n, false)
          // 只用已创建的实例 ID 触发，不再创建
          f.castSpecifiedSkillInstance(role, skillId, false)
          f.printString('fb20d:cast')
        }, () => {})
      }, () => {})
    }, () => {})
  })
  .onSignal(Fb20Signal.fb20d_echo, (evt, f) => {
    const tag = evt.params.tag
    f.doubleBranch(f.equal(tag, 'CAL_START'), () => {
      f.setNodeGraphVariable('fb20d_last_run', evt.params.e, false)
      f.printString('fb20d:start')
      f.printString(f.dataTypeConversion(evt.params.e, 'str'))
    }, () => {
      f.doubleBranch(f.equal(tag, 'CAL_DONE'), () => {
        f.setNodeGraphVariable('fb20d_last_k', evt.params.e, false)
        f.setNodeGraphVariable('fb20d_busy', 0n, false)
        f.printString('fb20d:done')
        f.printString(f.dataTypeConversion(evt.params.e, 'str'))
      }, () => {})
    })
  })
