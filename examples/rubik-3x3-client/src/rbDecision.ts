// rbDecision.ts —— 造物状态决策图（20007，1082130439，票 03）
// 无条件切换到状态图 _GSTS_rbCrossStatus（1082130438），自主逻辑模板序号 1（用户编辑器配）。
// 照 zaowu-basic/足球 fb-decision 已验证模板（20007 CLI 已支持：1da3fae）。
import { g } from 'genshin-ts/runtime/core'

g.creationStatusDecision({ id: 1082130439, name: '_GSTS_rbCrossDecision' }).on('start1', (_evt: any, f: any) => {
  f.switchToSelfExecutionStatus(true, configId(1082130438n), 1n)
})

export default g
