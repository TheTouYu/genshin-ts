// 各种flow — 对应编辑器"各种flow.gia"
// 多复合节点 + 不同内部拓扑的 impl 图
import { g } from 'genshin-ts/runtime/core'
import { str } from 'genshin-ts/runtime/value'

// 复合A：线性链（类似各种flow.gia acc[7] 的线性拓扑）
const compLinear = g.defineComposite('线性复合', {
  inputs: {}, outputs: {},
  outflows: ['完成'],
  build(_inputs, f) {
    f.printString('第一')
    const second = f.registerExecNode('print_string', [new str('第二')])
    f.outflow('完成', second, 0)
    return {}
  }
})

// 复合B：分支拓扑（类似各种flow.gia acc[9] 的分支）
const compBranch = g.defineComposite('分支复合', {
  inputs: {}, outputs: {},
  build(_inputs, f) {
    f.fork(
      () => f.printString('分支1'),
      () => f.printString('分支2')
    )
    return {}
  }
})

// 复合C：2出口 OutFlow
const compMultiOut = g.defineComposite('多出口复合', {
  inputs: {}, outputs: {},
  build(_inputs, f) {
    f.fork(
      () => { f.printString('出0'); f.leaf(0); },
      () => { f.printString('出1'); f.leaf(1); }
    )
    return {}
  }
})

// 复合D：单节点复合
const compSingle = g.defineComposite('单节点复合', {
  inputs: {}, outputs: {},
  outflows: ['完成'],
  build(_inputs, f) {
    const single = f.registerExecNode('print_string', [new str('单一')])
    f.outflow('完成', single, 0)
    return {}
  }
})

// 主事件：调用线性复合和分支复合
g.server({ name: 'R3各种flowA', id: 1073741828 })
  .on('whenEntityIsCreated', (_e, f) => {
    f.callComposite(compLinear, {})
    f.callComposite(compBranch, {})
  })

// 第二事件：调用多出口复合和单节点复合
g.server({ name: 'R3各种flowB', id: 1073741829 })
  .on('whenEntityIsCreated', (_e, f) => {
    f.callComposite(compMultiOut, {})
    f.callComposite(compSingle, {})
  })
