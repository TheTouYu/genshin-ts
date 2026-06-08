import { g } from 'genshin-ts/runtime/core'

// Expected:
// - multipleBranches supports aliasing cases to a shared branch body
g.server({
  id: 1073741858
}).on('whenEntityIsCreated', (_evt, f) => {
  const key = 'b'
  f.multipleBranches(key, {
    a: () => {
      f.printString('case a')
    },
    b: 'a'
  })

  const idx = 2n
  f.multipleBranches(idx, {
    1: () => {
      f.printString('int case 1')
    },
    2: 1,
    3: 1
  })
})
