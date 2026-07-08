import { g } from 'genshin-ts/runtime/core'
import { float, int, str as strValue } from 'genshin-ts/runtime/value'

const basicCall = g.defineComposite('简单场景合集-基础调用-passed', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const marker = f.node('print_string', [new strValue('简单场景合集 基础调用')])
    f.outflow('完成', marker, 0)
    return {}
  }
})

const paramPrinter = g.defineComposite('简单场景合集-带参打印-passed', {
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

const firstExec = g.defineComposite('简单场景合集-第一个执行-passed', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const marker = f.node('print_string', [new strValue('简单场景合集 第一个执行')])
    f.outflow('完成', marker, 0)
    return {}
  }
})

const secondExec = g.defineComposite('简单场景合集-第二个执行-passed', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const marker = f.node('print_string', [new strValue('简单场景合集 第二个执行')])
    f.outflow('完成', marker, 0)
    return {}
  }
})

const doubleValue = g.defineComposite('简单场景合集-数据翻倍-passed', {
  inputs: {
    x: { type: 'int' }
  },
  outputs: {
    result: { type: 'int' }
  },
  build(args, f) {
    return { result: f.addition(args.x, args.x) }
  }
})

const plusOne = g.defineComposite('简单场景合集-数据加一-passed', {
  inputs: {
    x: { type: 'int' }
  },
  outputs: {
    result: { type: 'int' }
  },
  build(args, f) {
    return { result: f.addition(args.x, new int(1n)) }
  }
})

const multiplyThree = g.defineComposite('简单场景合集-三数相乘-passed', {
  inputs: {
    a: { type: 'float' },
    b: { type: 'float' },
    c: { type: 'float' }
  },
  outputs: {
    result: { type: 'float' }
  },
  build(args, f) {
    const ab = f.multiplication(args.a, args.b)
    const result = f.multiplication(ab, args.c)
    return { result }
  }
})

const graph = g.server({
  name: 'V2-简单场景合集-passed',
  id: 1073741918
})

graph.on('whenEntityIsCreated', (_e, f) => {
  f.printString('简单场景合集 轴1: 创建事件')
  f.callComposite(basicCall, {})
  f.callComposite(paramPrinter, {
    message: new strValue('简单场景合集 带参打印')
  })
})

graph.on('whenEntityIsDestroyed', (_e, f) => {
  f.printString('简单场景合集 轴2: 销毁事件')
  f.callComposite(firstExec, {})
  f.callComposite(secondExec, {})
})

graph.on('whenTimerIsTriggered', (_e, f) => {
  f.printString('简单场景合集 轴3: 计时器事件')
  const first = f.callComposite(doubleValue, { x: new int(5n) })
  const second = f.callComposite(plusOne, { x: first.result })
  f.printString(f.dataTypeConversion(second.result, 'str'))
})

graph.on('whenSkillNodeIsCalled', (_e, f) => {
  f.printString('简单场景合集 轴4: 技能节点事件')
  const doubled = f.callComposite(doubleValue, { x: new int(7n) })
  f.printString(f.dataTypeConversion(doubled.result, 'str'))

  const multiplied = f.callComposite(multiplyThree, {
    a: new float(2),
    b: new float(3),
    c: new float(4)
  })
  f.printString(f.dataTypeConversion(multiplied.result, 'str'))
})
