import { g } from 'genshin-ts/runtime/core'

g.server({
  name: 'R6-B1短数据流',
  id: 1073741892,
  variables: {
    score: 100n
  }
}).on('whenEntityIsCreated', (_e, f) => {
  f.printString('R6-B1 开始')

  const value = f.get('score') + 999n
  f.printString(str(value))

  f.printString('R6-B1 结束')
})
