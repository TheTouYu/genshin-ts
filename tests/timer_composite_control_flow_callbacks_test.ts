// @ts-nocheck

import { g } from 'genshin-ts/runtime/core'
import { bool, str } from 'genshin-ts/runtime/value'

const childTimer = g.defineComposite('timer composite child branch', {
  outflows: ['完成'],
  build(_args, f) {
    f.doubleBranch(new bool(true), () => {
      setTimeout((_timerEvt, timerF) => {
        timerF.printString(new str('child timer'))
      }, 1000)
    }, () => {})
    const tail = f.registerExecNode('print_string', [new str('child tail')])
    f.outflow('完成', tail, 0)
    return {}
  }
})

const outerTimer = g.defineComposite('timer composite outer branch', {
  outflows: ['完成'],
  build(_args, f) {
    f.doubleBranch(new bool(true), () => {
      setTimeout((_timerEvt, timerF) => {
        timerF.printString(new str('outer timer'))
      }, 1000)
      const tail = f.registerExecNode('print_string', [new str('outer tail')])
      f.outflow('完成', tail, 0)
    }, () => {})
    return {}
  }
})

const nestedTimer = g.defineComposite('timer composite nested caller', {
  outflows: ['完成'],
  build(_args, f) {
    f.doubleBranch(new bool(true), () => {
      f.callComposite(childTimer, {})
    }, () => {})
    const tail = f.registerExecNode('print_string', [new str('nested caller tail')])
    f.outflow('完成', tail, 0)
    return {}
  }
})

// Case E: Timer registered from a branch callback inside a composite build.
g.server({ name: 'timer composite case E', id: 1073742411 }).on(
  'whenEntityIsCreated',
  (_evt, f) => {
    f.callComposite(outerTimer, {})
  }
)

// Case F: Nested composite call inside a composite branch; the child owns the Timer.
g.server({ name: 'timer composite case F', id: 1073742412 }).on(
  'whenEntityIsCreated',
  (_evt, f) => {
    f.callComposite(nestedTimer, {})
  }
)

// Case G: Composite branch registers a Timer and continues with ordinary tail logic.
g.server({ name: 'timer composite case G', id: 1073742413 }).on(
  'whenEntityIsCreated',
  (_evt, f) => {
    f.callComposite(outerTimer, {})
    f.printString(new str('main tail'))
  }
)

// Case H: Timer callback enters a composite branch containing another Timer.
g.server({ name: 'timer composite case H', id: 1073742414 }).on(
  'whenEntityIsCreated',
  (_evt, f) => {
    setInterval((_timerEvt, timerF) => {
      timerF.doubleBranch(new bool(true), () => {
        timerF.callComposite(nestedTimer, {})
      }, () => {})
    }, 180)
  }
)
