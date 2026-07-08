import { g } from 'genshin-ts/runtime/core'
import { float } from 'genshin-ts/runtime/value'

const multiplyThree = g.defineComposite('简单场景-三数相乘-step1', {
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

g.server({
  name: 'V2-简单场景-mul3-step1',
  id: 1073741917
}).on('whenEntityIsCreated', (_e, f) => {
  const { result } = f.callComposite(multiplyThree, {
    a: new float(2),
    b: new float(3),
    c: new float(4)
  })
  f.printString(f.dataTypeConversion(result, 'str'))
})
