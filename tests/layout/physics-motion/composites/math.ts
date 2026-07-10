import { g } from 'genshin-ts/runtime/core'
import { asRuntimeValue } from 'genshin-ts/runtime/value'

export const mul3 = g.defineComposite('mul3', {
  inputs: {
    a: { type: 'float' },
    b: { type: 'float' },
    c: { type: 'float' }
  },
  outputs: {
    result: { type: 'float' }
  },
  build(args, f) {
    const ab = f.multiplication(args.a as unknown as number, args.b as unknown as number)
    const result = f.multiplication(ab, args.c as unknown as number)
    return { result: asRuntimeValue(result) }
  }
})
