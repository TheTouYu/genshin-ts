// 顺序执行 — 对应编辑器"顺序执行.gia"
// 复合内部有4个分支，4个出口(OutFlow)；主图中2个出口连接终端
import { g } from 'genshin-ts/runtime/core'

const comp = g.defineComposite('顺序执行', {
  inputs: {},
  outputs: {},
  build(_inputs, f) {
    // 4个分支从entry并行出发，每个分支标记为不同OutFlow出口
    f.fork(
      () => { f.printString('第一'); f.leaf(0); },
      () => { f.printString('第二'); f.leaf(1); },
      () => { f.printString('第三'); f.leaf(2); },
      () => { f.printString('第四'); f.leaf(3); }
    )
    return {}
  }
})

g.server({ name: 'main', id: 1073741828 })
  .on('whenEntityIsCreated', (_e, f) => {
    f.callComposite(comp, {})
  })
