// rbVDecision.ts —— 造物状态决策图（20007，1082130445，票 06）
// 无条件切换到状态图 _GSTS_rbVStatus（1082130444），自主逻辑模板序号 1（用户编辑器配）。
// 照 rbDecision（票 03）模板。
import { g } from 'genshin-ts/runtime/core'

g.creationStatusDecision({ id: 1082130445, name: '_GSTS_rbVDecision' }).on('start1', (_evt: any, f: any) => {
  f.switchToSelfExecutionStatus(true, configId(1082130444n), 1n)
})

export default g
