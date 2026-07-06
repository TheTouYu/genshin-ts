// 多执行泳道布局测试 — 对应 Round 8 场景 C
// 目标：验证同一事件分出的多条执行路径按语义区块高度排布。
// - 分支1：含长数据链和多节点执行链，应形成较大占位区块。
// - 分支2：位于分支1区块下方，后续节点保持同一 Y 右移。
// - 分支3：继续位于分支2区块下方。
//
// 验证工具：
//   npx tsx tests/composite/analyze-exec-lanes.ts <生成的.gia>
//   npx tsx tests/composite/dump-nodes.ts <生成的.gia>
//   npx tsx tests/composite/trace-exec-flow.ts <生成的.gia> --io

import { g } from 'genshin-ts/runtime/core'

g.server({
  name: 'R6-C多泳道',
  id: 1073741896,
  variables: {
    score: 100n,
    bonus: 7n
  }
}).on('whenEntityIsCreated', (_e, f) => {
  f.fork(
    () => {
      f.printString('R6-C Lane1-A')

      const base = f.get('score')
      const plusA = f.addition(base, 999n)
      const plusB = f.addition(plusA, 7n)
      const times = f.multiplication(plusB, 2n)
      const finalValue = f.addition(times, 123n)
      f.printString(str(finalValue))

      f.printString('R6-C Lane1-C')
    },
    () => {
      f.printString('R6-C Lane2-A')
      f.printString('R6-C Lane2-B')
    },
    () => {
      f.printString('R6-C Lane3')
    }
  )
})
