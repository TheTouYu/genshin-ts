// fb20d-ui.ts —— 单次释放实验的 UI 按钮服务端触发图（type 20000，2026-09-05）
//
// 职责：监听自定义按钮「跑一次」（id=1073741843）的「界面控件组触发时」，
// 收到后**直接触发角色 CustomSkillSlot1 上已预置的技能**（6+瞬发配置
// 1098907654，body-f5 绑 20002 图 1082130440），并在收到 CAL_START/CAL_DONE 时打印。
//
// ⚠️ 2026-09-05 用户实测修正（已写入技能知识）：
//   · UI 控件事件只有挂载在【玩家模板/玩家实体】上的节点图能收到，不是角色侧。
//   · 技能应先“创建/保存为节点图”并预置到角色技能槽；收到 UI 事件时用
//     castSkillFromSpecifiedPanelSlot 直接触发，**不要**每次点击 addCharacterSkill
//     + createCustomSkillInstance + castSpecifiedSkillInstance，也不需要 addCharacterSkill。
//
// 挂载（用户已修改）：玩家模板 1086324737 def + 1086324737..745 entity 副本。
//
// 触发链路：
//   UI 点击 → whenUiControlGroupIsTriggered(uiControlGroupIndex=按钮ID)
//   → castSkillFromSpecifiedPanelSlot(CustomSkillSlot1, false) → 客户端 20002 图 start
//   → 客户端发 CAL_START/CAL_DONE → 本图 onSignal 打印
//
// 防重入：fb20d_busy=1 期间忽略再次点击，直到收到 CAL_DONE 才复位。
// 打印纪律：仅生命周期 3 行（cast/start/done），不 print 高频数据。
import { g } from 'genshin-ts/runtime/core'
import { CharacterSkillSlot } from 'genshin-ts/definitions/enum'
import { int } from 'genshin-ts/runtime/value'

import { Fb20Signal } from './signals20.js'

const BUTTON_ID = 1073741843n // 自定义按钮「跑一次」（UI CLI 候选分配 ID）

g.server({
  id: 1073741837,
  name: '_GSTS_fb20dUi',
  variables: {
    fb20d_busy: new int(0),
    fb20d_last_run: new int(0),
    fb20d_last_k: new int(0)
  }
})
  .on('whenUiControlGroupIsTriggered', (evt, f) => {
    // 图已挂玩家模板/玩家实体：self=玩家实体，需取该玩家当前角色来 cast
    const player = f.getSelfEntity()
    const busy = f.getNodeGraphVariable('fb20d_busy').asType('int')
    f.doubleBranch(f.equal(busy, 0n), () => {
      // 只认我们创建的按钮 ID；UI 控件组事件可能还有官方控件，名单制过滤
      f.doubleBranch(f.equal(evt.uiControlGroupIndex, BUTTON_ID), () => {
        const role = f.getCorrespondingValueFromList(
          f.getAllCharacterEntitiesOfSpecifiedPlayer(player),
          0n
        )
        f.setNodeGraphVariable('fb20d_busy', 1n, false)
        // 直接触发槽位技能：技能已“创建保存为节点图”并预置在 CustomSkillSlot1；
        // 不在事件里创建实例，也不 addCharacterSkill。
        f.castSkillFromSpecifiedPanelSlot(role, CharacterSkillSlot.CustomSkillSlot1, false)
        f.printString('fb20d:cast')
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
