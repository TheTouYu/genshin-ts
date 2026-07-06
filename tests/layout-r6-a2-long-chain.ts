import { g } from 'genshin-ts/runtime/core'

g.server({ name: 'R6-A2长链', id: 1073741891 }).on('whenEntityIsCreated', (_e, f) => {
  f.printString('R6-A2 入口')
  f.printString('R6-A2 第二步')
  f.printString('R6-A2 第三步')
  f.printString('R6-A2 第四步')
  f.printString('R6-A2 第五步')
  f.printString('R6-A2 第六步')
})
