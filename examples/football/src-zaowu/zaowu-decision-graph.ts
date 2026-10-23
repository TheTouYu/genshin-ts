import { g } from 'genshin-ts/runtime/core'

// 20007 造物状态决策图（图 ID 1082130435）。持续执行：start1 无条件切到状态图。
// switchToSelfExecutionStatus(execute, 状态图ID, 自主逻辑参数序号)
//   第三个参数 1n = 编辑器「自主逻辑参数设置」里新建并初始生效的 模板_1 的序号。
g.creationStatusDecision({ id: 1082130435, name: 'zaowuDecision' }).on('start1', (_evt, f) => {
  f.switchToSelfExecutionStatus(true, configId(1082130433n), 1n)
})
