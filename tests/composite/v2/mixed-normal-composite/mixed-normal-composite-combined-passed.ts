import { g } from 'genshin-ts/runtime/core'
import { int, str as strValue } from 'genshin-ts/runtime/value'

const execMessage = g.defineComposite('混合普通节点-执行打印-passed', {
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

const doubleValue = g.defineComposite('混合普通节点-数据翻倍-passed', {
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

const plusOne = g.defineComposite('混合普通节点-数据加一-passed', {
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

const graph = g.server({
  name: 'V2-混合普通与复合-passed',
  id: 1073741919
})

graph.on('whenEntityIsCreated', (_e, f) => {
  f.printString('混合普通与复合 轴1: 普通起点')
  f.callComposite(execMessage, {
    message: new strValue('混合普通与复合 轴1: 复合中段')
  })
  f.printString('混合普通与复合 轴1: 普通终点')
})

graph.on('whenEntityIsDestroyed', (_e, f) => {
  f.printString('混合普通与复合 轴2: 普通节点 -> 数据复合 -> 普通节点')
  const base = f.addition(new int(2n), new int(3n))
  const doubled = f.callComposite(doubleValue, { x: base })
  const finalValue = f.addition(doubled.result, new int(4n))
  f.printString(f.dataTypeConversion(finalValue, 'str'))
})

graph.on('whenTimerIsTriggered', (_e, f) => {
  f.printString('混合普通与复合 轴3: 数据复合串联后接普通打印')
  const doubled = f.callComposite(doubleValue, { x: new int(6n) })
  const plus = f.callComposite(plusOne, { x: doubled.result })
  f.printString(f.dataTypeConversion(plus.result, 'str'))
})
