import { g } from 'genshin-ts/runtime/core'

const complexBranch = g.defineComposite('Raw控制流-复杂分支-step2', {
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
    const print = f.node('print_string')

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

const graph = g.server({
  mode: 'beyond',
  type: 'entity',
  name: 'V2-Raw控制流-debug56-step2',
  id: 1073741922
})

graph.on('whenCustomVariableChanges', (e, f) => {
  const entry = f.entry()
  const forward = f.node('forwarding_event', [e.eventSourceEntity])
  const loop = f.node('finite_loop')
  const setLocal = f.node('set_local_variable')
  const print = f.node('print_string')

  f.link(entry, 0, forward)
  f.link(entry, 0, loop)
  f.link(entry, 0, print)
  f.link(forward, 0, setLocal)
  f.link(loop, 0, setLocal)
  f.link(loop, 1, forward)
  f.link(loop, 1, print)
  f.link(setLocal, 0, print)
})

graph.on('whenEntityIsCreated', (e, f) => {
  const entry = f.entry()
  const forward = f.node('forwarding_event', [e.eventSourceEntity])
  const loop = f.node('finite_loop')
  const setLocal = f.node('set_local_variable')
  const print = f.node('print_string')
  const branch = f.declareDetached(complexBranch, {})

  f.link(entry, 0, forward)
  f.link(entry, 0, loop)
  f.link(entry, 0, print)
  f.link(entry, 0, branch, 0)

  f.link(forward, 0, setLocal)
  f.link(forward, 0, branch, 2)

  f.link(loop, 0, setLocal)
  f.link(loop, 0, branch, 1)
  f.link(loop, 1, forward)
  f.link(loop, 1, print)
  f.link(loop, 1, branch, 1)

  f.link(setLocal, 0, print)
  f.link(setLocal, 0, branch, 2)
})
