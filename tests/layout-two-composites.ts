// 两个复合节点 — 对应编辑器"两个复合节点.gia"的布局模式
// 多事件 + 独立子图共存
import { g } from 'genshin-ts/runtime/core'

// 第一个复合
const comp1 = g.defineComposite('复合1', {
  inputs: {}, outputs: {},
  build(_inputs, f) {
    f.printString('复合1')
    return {}
  }
})

// 第二个复合（作为独立子图中的调用目标）
const comp2 = g.defineComposite('复合2', {
  inputs: {}, outputs: {},
  build(_inputs, f) {
    f.printString('复合2')
    return {}
  }
})

// 事件1：调用复合1
g.server({ name: 'R3两复合A', id: 1073741828 })
  .on('whenEntityIsCreated', (_e, f) => {
    f.callComposite(comp1, {})
  })

// 事件2：调用复合2（独立子图）
g.server({ name: 'R3两复合B', id: 1073741829 })
  .on('whenEntityIsCreated', (_e, f) => {
    f.callComposite(comp2, {})
  })
