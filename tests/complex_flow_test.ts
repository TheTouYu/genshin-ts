import { g } from 'genshin-ts/runtime/core'

g.server({
  id: 1073741857
}).on('whenEntityIsCreated', (_evt, f) => {
  f.printString('complex: start')

  let sum = 0
  let mode = 0n
  let tag = 'a'
  const limit = 4

  for (let i = 0; i < 5; i++) {
    f.printString('for: top')
    sum = sum + i
    if (i === 1) {
      f.printString('for: continue')
      continue
    }
    if (i === 3) {
      f.printString('for: break')
      break
    }
    f.printString('for: tail')
  }

  let j = 0
  while (j < 6) {
    j = j + 1
    if (j === 2) {
      mode = 1n
      tag = 'b'
    }
    if (j === 5) {
      mode = 2n
    }

    switch (mode) {
      case 0n:
        sum = sum + 10
        f.printString('switch: 0')
        break
      case 1n:
        sum = sum + 20
        f.printString('switch: 1')
        if (j === 3) {
          f.printString('switch: 1 -> continue')
          continue
        }
        break
      case 2n:
        f.printString('switch: 2 -> return')
        return
      default:
        sum = sum + 1
        f.printString('switch: default')
        break
    }

    if (sum > 40) {
      f.printString('while: break')
      break
    }
    if (j === limit) {
      f.printString('while: continue')
      continue
    }

    f.printString('while: tail')
  }

  if (sum > 0) {
    const bonus = sum + 7
    sum = sum + bonus
    f.printString('if: bonus')
  } else {
    f.printString('if: no bonus')
  }

  f.printString(str(sum))

  switch (tag) {
    case 'a':
      f.printString('switch: tag a')
      break
    case 'b':
      f.printString('switch: tag b')
      break
    default:
      f.printString('switch: tag default')
      break
  }

  if (sum < 0) {
    f.printString('return: end')
    return
  }

  f.printString('complex: end')
})
