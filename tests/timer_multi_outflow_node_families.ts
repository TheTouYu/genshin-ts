import { g } from 'genshin-ts/runtime/core'
import { bool, int, str } from 'genshin-ts/runtime/value'

g.server({ name: 'timer multi-outflow node families', id: 1073742412 }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    f.doubleBranch(
      new bool(true),
      () => f.printString(new str('double yes')),
      () => f.printString(new str('double no'))
    )
    f.printString(new str('double after'))

    f.multipleBranches(new int(1), {
      1: () => f.printString(new str('multiple 1')),
      2: () => f.printString(new str('multiple 2')),
      3: () => f.printString(new str('multiple 3')),
      default: () => f.printString(new str('multiple default'))
    })
    f.printString(new str('multiple after'))

    f.finiteLoop(new int(0), new int(1), () => f.printString(new str('finite body')))
    f.printString(new str('finite complete'))

    f.listIterationLoop([new int(1)] as any, () => f.printString(new str('list body')))
    f.printString(new str('list complete'))
  }
)
