// 最小核验 case 模板（已随 verify-inflow-index 实例核验通过）
// 用法：复制到 verify/<分支>/<分支>.ts，改事件、节点与断言点。
// 结构：graph id 用约定 1073741825（单文件注入会改写为目标图 id，见 SKILL.md 关键点 2）；
// 注意：./verify 下多分支共存时 DSL id 必须互不相同（merge 按图 id 合并，见关键点 10），
// 从第二个分支起用 1073741826+。
// 每个核验点 = 一个事件 + 一段逻辑；同类型多个核验点可放同一文件（同一分支图）。
import { g } from 'genshin-ts/runtime/core'

const graph = g
  .server({ id: 1073741825 })
  .on('whenEntityIsCreated', (_evt, f) => {
    // === 核验点 1：非默认目标 InFlow 的 connect/connect2 显式写 ShellIndex ===
    // breakLoop() 生成 break_loop 节点，其 next 指向 finite_loop 的 Break InFlow
    // （ShellIndex=1）。修复前 applyEditorConnectionWireRules() 无条件删除该 index，
    // 游戏里 break 信号会错误连到默认入口 InFlow[0]（无限循环）；修复后 index=1 保留。
    // GIA 断言：genericId.nodeId=6（break_loop）的 connects 中 connect/connect2
    // 均为 {kind: InFlow, index: 1}，目标 id = finite_loop 节点 index。
    f.printString('verify-before-loop')
    f.finiteLoop(0n, 2n, (loopValue, breakLoop) => {
      f.printString('verify-loop-body')
      f.doubleBranch(f.equal(loopValue, 0n), () => breakLoop(), () => {})
    })
    f.printString('verify-after-loop')
    // 正确行为：before-loop → loop-body（仅 1 次）→ after-loop
    // 错误行为（修复缺失）：loop-body 无限循环刷屏
  })

export default graph
