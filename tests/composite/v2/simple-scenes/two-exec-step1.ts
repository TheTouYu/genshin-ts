import { g } from 'genshin-ts/runtime/core'

const firstExec = g.defineComposite('简单场景-第一个执行-step1', {
  inputs: {},
  outputs: {},
  build(_args, f) {
    f.printString('简单场景 第一个执行 step1')
    return {}
  }
})

const secondExec = g.defineComposite('简单场景-第二个执行-step1', {
  inputs: {},
  outputs: {},
  build(_args, f) {
    f.printString('简单场景 第二个执行 step1')
    return {}
  }
})

g.server({
  name: 'V2-简单场景-two-exec-step1',
  id: 1073741913
}).on('whenEntityIsCreated', (_e, f) => {
  f.callComposite(firstExec, {})
  f.callComposite(secondExec, {})
})
