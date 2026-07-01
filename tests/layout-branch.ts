// 分支场景 — 对应编辑器"分支.gia"和"分支2.gia"
// 分支.gia: event(分支条件)→2个复合调用
// 分支2.gia: seq→[comp→seq, comp→seq] 双链并行
import { g } from 'genshin-ts/runtime/core'

// ---- 场景A：简单分支扇出（类似分支.gia）----
const compA = g.defineComposite('分支A', {
  inputs: {}, outputs: {},
  build(_inputs, f) {
    f.printString('分支A')
    return {}
  }
})

const compB = g.defineComposite('分支B', {
  inputs: {}, outputs: {},
  build(_inputs, f) {
    f.printString('分支B')
    return {}
  }
})

g.server({ name: 'main_simple', id: 1073741828 })
  .on('whenEntityIsCreated', (_e, f) => {
    f.fork(
      () => f.callComposite(compA, {}),
      () => f.callComposite(compB, {})
    )
  })

// ---- 场景B：双链并行（类似分支2.gia）----
const compC1 = g.defineComposite('链1复合', {
  inputs: {}, outputs: {},
  build(_inputs, f) {
    f.printString('链1')
    return {}
  }
})

const compC2 = g.defineComposite('链2复合', {
  inputs: {}, outputs: {},
  build(_inputs, f) {
    f.printString('链2')
    return {}
  }
})

g.server({ name: 'main_chain', id: 1073741829 })
  .on('whenEntityIsCreated', (_e, f) => {
    // 双链并行：每链是一个复合调用 + 一个打印终端
    f.fork(
      () => {
        f.callComposite(compC1, {})
        f.printString('链1末')
      },
      () => {
        f.callComposite(compC2, {})
        f.printString('链2末')
      }
    )
  })
