// 最小复现：非默认目标 InFlow 的 connect/connect2 显式写 ShellIndex
// （2026-08-06 case3 真实证据：有限循环 Break FlowIn ShellIndex=1）
// breakLoop() 生成的 break_loop 节点以 target_index=1 连回 finite_loop，
// 修复前 applyEditorConnectionWireRules() 会无条件删除该 InFlow index，
// 导致游戏里 break 信号错误连到默认入口 InFlow[0]（无限循环）；
// 修复后 index=1 保留（break 正常生效）。
import { g } from 'genshin-ts/runtime/core'

const graph = g
  .server({ id: 1073741825 })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('verify-before-loop')
    f.finiteLoop(0n, 2n, (loopValue, breakLoop) => {
      f.printString('verify-loop-body')
      f.doubleBranch(f.equal(loopValue, 0n), () => breakLoop(), () => {})
    })
    f.printString('verify-after-loop')
  })

export default graph
