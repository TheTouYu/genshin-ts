import { g } from 'genshin-ts/runtime/core'
import { str as strValue } from 'genshin-ts/runtime/value'

const calc = g.defineComposite('R6数据流复合节点', {
  inputs: {
    score: { type: 'int' }
  },
  outputs: {
    result: { type: 'int' }
  },
  outflows: [{ name: '完成' }],
  build(args, f) {
    const plusA = f.addition(args.score, 999n)
    const plusB = f.addition(plusA, 123n)
    const times = f.multiplication(plusB, 2n)
    const finalValue = f.addition(times, 7n)
    const marker = f.node('print_string', [new strValue('R6数据流复合内部完成')])
    f.outflow('完成', marker, 0)
    return { result: finalValue }
  }
})

g.server({
  name: 'R6-B3数据复合',
  id: 1073741894,
  variables: {
    score: 100n
  }
}).on('whenEntityIsCreated', (_e, f) => {
  f.printString('R6-B3 开始')

  const { result } = f.callComposite(calc, { score: f.get('score') })
  f.printString(str(result))

  f.printString('R6-B3 结束')
})
