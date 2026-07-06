import { g } from 'genshin-ts/runtime/core'

g.server({ name: 'R6-A常规链', id: 1073741890 }).on('whenEntityIsCreated', (_e, f) => {
  f.printString('R6-A 入口')
  f.printString('R6-A 第二步')
  f.printString('R6-A 第三步')
})
