import { g } from 'genshin-ts/runtime/core'

g.server({
  name: 'R6-B2长数据流',
  id: 1073741893,
  variables: {
    score: 100n
  }
}).on('whenEntityIsCreated', (_e, f) => {
  f.printString('R6-B2 开始')

  const base = f.get('score')
  const plusA = base + 999n
  const plusB = plusA + 123n
  const times = plusB * 2n
  const finalValue = times + 7n
  f.printString(str(finalValue))

  f.printString('R6-B2 结束')
})
