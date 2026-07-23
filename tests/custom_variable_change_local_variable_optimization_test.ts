import { g } from 'genshin-ts/runtime/core'

// 最小复现：事件参数被重复读取时，Stage 1 会将其提升为局部变量。
// 读取变量名两次，强制走 const repeated-read 的 LocalVariable 优化路径。
g.server({ id: 1073742462, name: 'custom-variable-change-local-variable-optimization' }).on(
  'whenCustomVariableChanges',
  (evt, f) => {
    const variableName = evt.variableName
    const isScrollEvent = f.equal(variableName, 'scroll_event')
    const isTapEvent = f.equal(variableName, 'tap_event')
    f.doubleBranch(f.logicalOrOperation(isScrollEvent, isTapEvent), () => {}, () => {})
  }
)
