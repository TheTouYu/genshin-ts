// fb20d-ui.ts —— 单次释放实验的 UI 按钮服务端触发图（type 20000，2026-09-05）
//
// 职责：监听自定义按钮「跑一次」（id=1073741843）的「界面控件组触发时」，
// 收到后对**当前角色**执行一次 add→create→cast（6+瞬发配置 1098907654，
// body-f5 绑 20002 图 1082130440），并在收到 CAL_START / CAL_DONE 时打印生命周期。
//
// 挂载（注入轮执行）：**角色侧** 1090519041 def + entity。
// 依据（graph-mounting.md / camera-ui-rules.md）：屏幕 UI 按钮事件首先发给
// 该玩家对应的**角色**挂载节点图；挂角色侧 def+实体是已核验形态
// （whenSkillNodeIsCalled 3011 同族），不要挂玩家九副本。
//
// 触发链路：
//   UI 点击 → whenUiControlGroupIsTriggered(uiControlGroupIndex=按钮ID)
//   → addCharacterSkill(CustomSkillSlot1, Destroy) → createCustomSkillInstance
//   → castSpecifiedSkillInstance(实例ID, false) → 客户端 20002 图 start
//   → 客户端发 CAL_START/CAL_DONE → 本图 onSignal 打印
//
// 防重入：fb20d_busy=1 期间忽略再次点击，直到收到 CAL_DONE 才复位。
// 打印纪律：仅生命周期 3 行（cast/start/done），不 print 高频数据。
import { g } from 'genshin-ts/runtime/core'
import { CharacterSkillSlot, OriginalSlotSkillHandling } from 'genshin-ts/definitions/enum'
import { int } from 'genshin-ts/runtime/value'

import { Fb20Signal } from './signals20.js'

const BUTTON_ID = 1073741843n // 自定义按钮「跑一次」（UI CLI 候选分配 ID）
const SKILL_CFG = 1098907654n // GSTS-fb20d-calib：template 6 + 瞬发，body-f5 绑 1082130440

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
    const role = f.getSelfEntity()
    const busy = f.getNodeGraphVariable('fb20d_busy').asType('int')
    f.doubleBranch(f.equal(busy, 0n), () => {
      // 只认我们创建的按钮 ID；UI 控件组事件可能还有官方控件，名单制过滤
      f.doubleBranch(f.equal(evt.uiControlGroupIndex, BUTTON_ID), () => {
        f.setNodeGraphVariable('fb20d_busy', 1n, false)
        // 角色实体=挂载本图的角色（self），无需玩家列表动态寻址；
        // 6+瞬发装配到 CustomSkillSlot1，与 E0 状态用的槽 12 错开，互不干扰。
        f.addCharacterSkill(
          role,
          configId(SKILL_CFG),
          CharacterSkillSlot.CustomSkillSlot1,
          OriginalSlotSkillHandling.Destroy
        )
        const inst = f.createCustomSkillInstance(role, configId(SKILL_CFG))
        f.setNodeGraphVariable('fb20d_last_run', inst, false)
        f.castSpecifiedSkillInstance(role, inst, false)
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
