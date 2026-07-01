// two_exec 对应 — 顺序调用两个 exec-only 复合
import { g } from 'genshin-ts/runtime/core'

const comp1 = g.defineComposite('第一个执行', {
  inputs: {}, outputs: {},
  build(_inputs, f) {
    f.printString('第一个')
    return {}
  }
})

const comp2 = g.defineComposite('第二个执行', {
  inputs: {}, outputs: {},
  build(_inputs, f) {
    f.printString('第二个')
    return {}
  }
})

g.server({ name: 'R1twoExec', id: 1073741870 })
  .on('whenEntityIsCreated', (_e, f) => {
    f.fork(
      () => f.callComposite(comp1, {}),
      () => f.callComposite(comp2, {})
    )
  })
