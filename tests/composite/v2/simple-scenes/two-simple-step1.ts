import { g } from 'genshin-ts/runtime/core'
import { int } from 'genshin-ts/runtime/value'
const doubleValue = g.defineComposite('简单场景-数据翻倍-step1', {
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

const plusOne = g.defineComposite('简单场景-数据加一-step1', {
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

g.server({
  name: 'V2-简单场景-two-simple-step1',
  id: 1073741914
}).on('whenEntityIsCreated', (_e, f) => {
  const first = f.callComposite(doubleValue, { x: new int(5n) })
  const second = f.callComposite(plusOne, { x: first.result })
  f.printString(f.dataTypeConversion(second.result, 'str'))
})
