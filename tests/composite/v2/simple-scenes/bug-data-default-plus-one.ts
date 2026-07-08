import { g } from 'genshin-ts/runtime/core'
import { int } from 'genshin-ts/runtime/value'

const plusOne = g.defineComposite('BUG-数据默认值加一', {
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
  name: 'BUG-data-default-plus-one',
  id: 1073741919
}).on('whenTimerIsTriggered', (_e, f) => {
  const { result } = f.callComposite(plusOne, { x: new int(5n) })
  f.printString(f.dataTypeConversion(result, 'str'))
})
