import { g } from 'genshin-ts/runtime/core'

const calc = g.defineComposite('R6纯数据流复合节点', {
  inputs: {
    score: { type: 'int' }
  },
  outputs: {
    result: { type: 'int' }
  },
  build(args, f) {
    const plusA = f.addition(args.score, 999n)
    const plusB = f.addition(plusA, 123n)
    const times = f.multiplication(plusB, 2n)
    const finalValue = f.addition(times, 7n)
    return { result: finalValue }
  }
})

g.server({
  name: 'R6-B4纯数据复合',
  id: 1073741896,
  variables: {
    score: 100n
  }
}).on('whenEntityIsCreated', (_e, f) => {
  f.printString('R6-B4 开始')

  const { result } = f.callComposite(calc, { score: f.get('score') })
  f.printString(str(result))

  f.printString('R6-B4 结束')
})
