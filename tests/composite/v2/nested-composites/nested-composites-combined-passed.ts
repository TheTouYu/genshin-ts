import { g } from 'genshin-ts/runtime/core'
import { int, str as strValue } from 'genshin-ts/runtime/value'

const addTwo = g.defineComposite('嵌套复合-两数相加-passed', {
  inputs: {
    a: { type: 'int' },
    b: { type: 'int' }
  },
  outputs: {
    result: { type: 'int' }
  },
  build(args, f) {
    return { result: f.addition(args.a, args.b) }
  }
})

const addThreeNested = g.defineComposite('嵌套复合-三数相加-passed', {
  inputs: {
    a: { type: 'int' },
    b: { type: 'int' },
    c: { type: 'int' }
  },
  outputs: {
    result: { type: 'int' }
  },
  build(args, f) {
    const first = f.callComposite(addTwo, { a: args.a, b: args.b })
    const second = f.callComposite(addTwo, { a: first.result, b: args.c })
    return { result: second.result }
  }
})

const innerExec = g.defineComposite('嵌套复合-内部执行-passed', {
  inputs: {
    message: { type: 'str' }
  },
  outputs: {},
  outflows: [{ name: '完成' }],
  build(args, f) {
    const marker = f.node('print_string', [args.message])
    f.outflow('完成', marker, 0)
    return {}
  }
})

const outerExec = g.defineComposite('嵌套复合-外部执行-passed', {
  inputs: {
    message: { type: 'str' }
  },
  outputs: {},
  outflows: [{ name: '完成' }],
  build(args, f) {
    const start = f.node('print_string', [new strValue('嵌套复合 外部执行开始')])
    const inner = f.callComposite(innerExec, { message: args.message })
    f.link(start, 0, inner)
    f.outflow('完成', { id: inner.__markerNodeId }, 0)
    return {}
  }
})

const graph = g.server({
  name: 'V2-嵌套复合-passed',
  id: 1073741920
})

graph.on('whenEntityIsCreated', (_e, f) => {
  f.printString('嵌套复合 轴1: 数据嵌套')
  const result = f.callComposite(addThreeNested, {
    a: new int(10n),
    b: new int(20n),
    c: new int(30n)
  })
  f.printString(f.dataTypeConversion(result.result, 'str'))
})

graph.on('whenEntityIsDestroyed', (_e, f) => {
  f.printString('嵌套复合 轴2: 执行嵌套')
  f.callComposite(outerExec, {
    message: new strValue('嵌套复合 内部执行')
  })
  f.printString('嵌套复合 轴2: 执行嵌套结束')
})
