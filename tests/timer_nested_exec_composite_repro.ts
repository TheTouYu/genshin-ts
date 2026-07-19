import { g } from 'genshin-ts/runtime/core'
import { bool as BoolValue, str } from 'genshin-ts/runtime/value'

const child = g.defineComposite('timer repro child exec', {
  outflows: ['完成'],
  build(_args, f) {
    const tail = f.registerExecNode('print_string', [new str('child tail')])
    f.outflow('完成', tail, 0)
    return {}
  }
})

const execComposite = g.defineComposite('timer repro nested exec', {
  outflows: ['完成'],
  build(_args, f) {
    f.callComposite(child, {})
    const tail = f.registerExecNode('print_string', [new str('outer tail')])
    f.outflow('完成', tail, 0)
    return {}
  }
})

g.server({ name: 'timer repro direct event', id: 1073742301 }).on(
  'whenEntityIsCreated',
  (_evt, f) => {
    f.callComposite(execComposite, {})
  }
)

g.server({ name: 'timer repro ordinary branch', id: 1073742302, variables: { flag: false } }).on(
  'whenEntityIsCreated',
  (_evt, f) => {
    f.doubleBranch(new BoolValue(true), () => {
      f.callComposite(execComposite, {})
    }, () => {})
  }
)

g.server({ name: 'timer repro nested timer branch', id: 1073742303, variables: { flag: false } }).on(
  'whenEntityIsCreated',
  (_evt, f) => {
    setInterval((_timerEvt, timerF) => {
      timerF.doubleBranch(new BoolValue(true), () => {
        timerF.callComposite(execComposite, {})
      }, () => {})
    }, 1000)
  }
)
