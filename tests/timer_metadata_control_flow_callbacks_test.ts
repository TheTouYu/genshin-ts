// @ts-nocheck

import { g } from 'genshin-ts/runtime/core'
import { bool, str } from 'genshin-ts/runtime/value'

// Case A: Timer directly inside an event handler.
g.server({ name: 'timer metadata case A', id: 1073742401 }).on(
  'whenEntityIsCreated',
  (_evt, f) => {
    setTimeout((_timerEvt, timerF) => {
      timerF.printString(new str('direct'))
    }, 1000)
  }
)

// Case B: Timer registered from a runtime branch callback.
g.server({ name: 'timer metadata case B', id: 1073742402 }).on(
  'whenEntityIsCreated',
  (_evt, f) => {
    f.doubleBranch(new bool(true), () => {
      setTimeout((_timerEvt, timerF) => {
        timerF.printString(new str('branch'))
      }, 1000)
    }, () => {})
  }
)

// Case C: A control-flow callback inside a Timer callback.
g.server({ name: 'timer metadata case C', id: 1073742403 }).on(
  'whenEntityIsCreated',
  (_evt, f) => {
    setInterval((_timerEvt, timerF) => {
      timerF.doubleBranch(new bool(true), () => {
        timerF.printString(new str('interval branch'))
      }, () => {})
    }, 180)
  }
)

// Case D: A Timer in a branch followed by ordinary branch-tail logic.
g.server({ name: 'timer metadata case D', id: 1073742404 }).on(
  'whenEntityIsCreated',
  (_evt, f) => {
    f.doubleBranch(new bool(true), () => {
      setTimeout((_timerEvt, timerF) => {
        timerF.printString(new str('timer body'))
      }, 1000)
      f.printString(new str('branch tail'))
    }, () => {})
  }
)
