import { g } from 'genshin-ts/runtime/core'

type Assert<T extends true> = T
type IsAny<T> = 0 extends 1 & T ? true : false

g.server({ id: 1073742415 }).on('whenEntityIsCreated', (_evt, _f) => {
  setTimeout((_timerEvt, timerF) => {
    type _TimerFlowIsNotAny = Assert<IsAny<typeof timerF> extends false ? true : false>
    type _TimerEvtIsNotAny = Assert<IsAny<typeof _timerEvt> extends false ? true : false>
    type _TimerNameIsString = Assert<typeof _timerEvt.timerName extends string ? true : false>
    timerF.printString(_timerEvt.timerName)
  }, 1000)

  gsts.timers.setInterval((_timerEvt, timerF) => {
    type _TimerFlowIsNotAny = Assert<IsAny<typeof timerF> extends false ? true : false>
    type _TimerEvtIsNotAny = Assert<IsAny<typeof _timerEvt> extends false ? true : false>
    type _TimerNameIsString = Assert<typeof _timerEvt.timerName extends string ? true : false>
    timerF.printString(_timerEvt.timerName)
  }, 1000)
})
