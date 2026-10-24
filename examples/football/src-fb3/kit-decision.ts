// @status: 新线（v3 客户端计算最小链路，2026-10-24）
// fb3/kit-decision.ts —— 20007 造物状态决策图（1082130438）：无条件切到 kit_status
//
// start1 分支无条件 switchToSelfExecutionStatus(execute, 状态图配置ID, 自主逻辑参数序号)。
//   状态图 = 1082130437（kit_status：executeSkill(1)）
//   第 3 参 = 编辑器「自主逻辑参数」模板序号（不填模板也可切状态，2026-10-23 实证）
import { g } from 'genshin-ts/runtime/core'

g.creationStatusDecision({ id: 1082130438, name: '_GSTS_kitDecision' }).on('start1', (_evt: any, f: any) => {
  f.switchToSelfExecutionStatus(true, configId(1082130437n), 1n)
})
