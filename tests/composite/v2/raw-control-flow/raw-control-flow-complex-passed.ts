import { g } from 'genshin-ts/runtime/core'
import { str as strValue } from 'genshin-ts/runtime/value'

const complexBranch = g.defineComposite('Raw控制流-复杂分支-passed', {
  inflows: [
    { name: '有限循环', pinIndex: 67 },
    { name: '开始转化事件', pinIndex: 76 },
    { name: '开始设置局部变量', pinIndex: 77 },
    { name: '开始打印字符串', pinIndex: 78 }
  ],
  outflows: [
    { name: '循环体', pinIndex: 68 },
    { name: '循环完成', pinIndex: 69 },
    { name: '打印字符串', pinIndex: 73 },
    { name: '设置局部变量', pinIndex: 74 },
    { name: '事件转发完成', pinIndex: 75 }
  ],
  outputs: {
    当前循环值: { type: 'int', pinIndex: 72 }
  },
  build(_args, f) {
    const forward = f.node('forwarding_event')
    const loop = f.node('finite_loop', [], {
      outParams: {
        当前循环值: { type: 'int', index: 0 }
      }
    })
    const setLocal = f.node('set_local_variable')
    const print = f.node('print_string', [new strValue('复杂Flow: branch impl print')])

    f.inflow('有限循环', loop)
    f.inflow('开始转化事件', forward)
    f.inflow('开始设置局部变量', setLocal)
    f.inflow('开始打印字符串', print)

    f.link(loop, 0, setLocal)
    f.link(loop, 1, forward)
    f.link(loop, 1, print)
    f.link(forward, 0, setLocal)
    f.link(setLocal, 0, print)

    f.outflow('循环体', loop, 0)
    f.outflow('循环完成', loop, 1)
    f.outflow('打印字符串', print, 0)
    f.outflow('设置局部变量', setLocal, 0)
    f.outflow('事件转发完成', forward, 0)

    return { 当前循环值: loop.当前循环值 }
  }
})

const fanInSink = g.defineComposite('Raw控制流-多入口汇聚-passed', {
  inflows: [
    { name: '入口A', pinIndex: 90 },
    { name: '入口B', pinIndex: 91 },
    { name: '入口C', pinIndex: 92 }
  ],
  outflows: [
    { name: '完成A', pinIndex: 93 },
    { name: '完成B', pinIndex: 94 }
  ],
  build(_args, f) {
    const printA = f.node('print_string', [new strValue('复杂Flow: sink A')])
    const printB = f.node('print_string', [new strValue('复杂Flow: sink B')])
    const printC = f.node('print_string', [new strValue('复杂Flow: sink C')])

    f.inflow('入口A', printA)
    f.inflow('入口B', printB)
    f.inflow('入口C', printC)

    f.link(printA, 0, printB)
    f.link(printB, 0, printC)

    f.outflow('完成A', printB, 0)
    f.outflow('完成B', printC, 0)

    return {}
  }
})

const graph = g.server({
  mode: 'beyond',
  type: 'entity',
  name: 'V2-Raw控制流-复杂Flow-passed',
  id: 1073741923
})

graph.on('whenEntityIsCreated', (e, f) => {
  const entry = f.entry()
  const forwardA = f.node('forwarding_event', [e.eventSourceEntity])
  const loopA = f.node('finite_loop')
  const setA = f.node('set_local_variable')
  const printA = f.node('print_string', [new strValue('复杂Flow: main A')])
  const printLoopValue = f.node('print_string')
  const forwardB = f.node('forwarding_event', [e.eventSourceEntity])
  const printTail = f.node('print_string', [new strValue('复杂Flow: tail')])

  const branch = f.declareDetached(complexBranch, {})
  const sink = f.declareDetached(fanInSink, {})

  f.link(entry, 0, forwardA)
  f.link(entry, 0, loopA)
  f.link(entry, 0, printA)
  f.link(entry, 0, branch, 0)
  f.link(entry, 0, sink, 0)

  f.link(forwardA, 0, setA)
  f.link(forwardA, 0, branch, 2)
  f.link(forwardA, 0, sink, 1)

  f.link(loopA, 0, setA)
  f.link(loopA, 0, branch, 1)
  f.link(loopA, 0, sink, 2)
  f.link(loopA, 1, forwardA)
  f.link(loopA, 1, printA)
  f.link(loopA, 1, branch, 3)

  f.link(setA, 0, printA)
  f.link(setA, 0, branch, 2)

  f.link(branch, 0, sink, 0)
  f.link(branch, 1, sink, 1)
  f.link(branch, 2, printLoopValue)
  f.link(branch, 3, forwardB)
  f.link(branch, 4, sink, 2)

  f.link(sink, 0, printTail)
  f.link(sink, 1, forwardB)
  f.link(forwardB, 0, printTail)
})

graph.on('whenCustomVariableChanges', (e, f) => {
  const entry = f.entry()
  const forward = f.node('forwarding_event', [e.eventSourceEntity])
  const branch = f.declareDetached(complexBranch, {})
  const sink = f.declareDetached(fanInSink, {})
  const print = f.node('print_string', [new strValue('复杂Flow: custom-variable axis')])

  f.link(entry, 0, forward)
  f.link(entry, 0, branch, 0)
  f.link(forward, 0, branch, 1)
  f.link(forward, 0, sink, 0)
  f.link(branch, 0, sink, 1)
  f.link(branch, 1, sink, 2)
  f.link(sink, 0, print)
  f.link(sink, 1, forward)
})
