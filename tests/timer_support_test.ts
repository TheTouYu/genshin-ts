import { g } from 'genshin-ts/runtime/core'

// Expected:
// - compile warning for setInterval(100)
// - timer prints from setTimeout/setInterval and loop captures
g.server({
  id: 1073741858
}).on('whenEntityIsCreated', (evt, f) => {
  const tag = 'timeout_a'
  const idx = 7n
  const ids = [configId(1), configId(2), configId(3)]
  const self = f.getSelfEntity()

  const h1 = setTimeout(() => {
    f.printString(tag)
    f.printString(str(idx))
    f.printString(str(f.getListLength(ids)))
    f.printString(str(self))
  }, 500)

  setTimeout(() => {
    f.printString('outer')
    setTimeout(() => {
      f.printString('nested')
      setTimeout(() => {
        f.printString('nested nested')
      }, 1000)
    }, 3000)
  }, 3000)

  const h2 = setTimeout((timerEvt, timerF) => {
    timerF.printString(timerEvt.timerName)
  }, 300)

  for (let i = 0; i < 3; i += 1) {
    // @gsts:timerPool=4
    setTimeout(() => {
      f.printString('loop')
      f.printString(str(i))
    }, 200)
  }

  const intervalHandle = setInterval(() => {
    f.printString('tick')
  }, 250)

  setTimeout(() => {
    clearInterval(intervalHandle)
    clearTimeout(h1)
  }, 1000)

  const fast = setInterval(() => {
    f.printString('fast')
  }, 100)
  setTimeout(() => {
    clearInterval(fast)
  }, 1000)
  f.printString(h2)
})
