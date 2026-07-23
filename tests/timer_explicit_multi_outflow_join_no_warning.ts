import { g } from 'genshin-ts/runtime/core'
import { bool, str } from 'genshin-ts/runtime/value'

g.server({ name: 'timer explicit multi-outflow joins', id: 1073742417 }).on(
  'whenEntityIsCreated',
  (_event, _f) => {
    setInterval((_timerEvent, timerF) => {
      timerF.doubleBranch(
        new bool(true),
        () => {
          timerF.printString(new str('timer yes'))
          timerF.return()
        },
        () => {
          timerF.printString(new str('timer no'))
          timerF.return()
        }
      )
    }, 180)
  }
)
