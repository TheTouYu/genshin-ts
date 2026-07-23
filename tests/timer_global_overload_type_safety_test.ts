import { g } from 'genshin-ts/runtime/core'

type Assert<T extends true> = T
type IsAny<T> = 0 extends 1 & T ? true : false

g.server({ id: 1073742415 }).on('whenEntityIsCreated', (_evt, _f) => {
  setTimeout((_timerEvt, timerF) => {
    type _TimerFlowIsNotAny = Assert<IsAny<typeof timerF> extends false ? true : false>
    timerF.printString('global timeout')
  }, 1000)

  gsts.timers.setInterval((_timerEvt, timerF) => {
    type _TimerFlowIsNotAny = Assert<IsAny<typeof timerF> extends false ? true : false>
    timerF.printString('namespaced interval')
  }, 1000)
})
