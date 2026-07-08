import { g } from 'genshin-ts/runtime/core'

const basicCallStep1 = g.defineComposite('简单场景-基础调用-step1', {
  inputs: {},
  outputs: {},
  build(_args, f) {
    f.printString('简单场景 基础调用 step1')
    return {}
  }
})

g.server({
  name: 'V2-简单场景-basic-call-step1',
  id: 1073741910
}).on('whenEntityIsCreated', (_e, f) => {
  f.callComposite(basicCallStep1, {})
})
