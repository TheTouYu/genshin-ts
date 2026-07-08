import { g } from 'genshin-ts/runtime/core'
import { int } from 'genshin-ts/runtime/value'
const doubler = g.defineComposite('简单场景-整数翻倍-step1', {
  inputs: {
    x: { type: 'int' }
  },
  outputs: {
    result: { type: 'int' }
  },
  build(args, f) {
    const result = f.addition(args.x, args.x)
    return { result }
  }
})

g.server({
  name: 'V2-简单场景-simple-double-step1',
  id: 1073741912
}).on('whenEntityIsCreated', (_e, f) => {
  const { result } = f.callComposite(doubler, { x: new int(7n) })
  f.printString(f.dataTypeConversion(result, 'str'))
})
