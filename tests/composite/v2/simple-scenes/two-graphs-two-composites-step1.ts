import { g } from 'genshin-ts/runtime/core'

const firstComposite = g.defineComposite('简单场景-双图复合A-step1', {
  inputs: {},
  outputs: {},
  build(_args, f) {
    f.printString('简单场景 双图复合A step1')
    return {}
  }
})

const secondComposite = g.defineComposite('简单场景-双图复合B-step1', {
  inputs: {},
  outputs: {},
  build(_args, f) {
    f.printString('简单场景 双图复合B step1')
    return {}
  }
})

g.server({
  name: 'V2-简单场景-two-graphs-A-step1',
  id: 1073741915
}).on('whenEntityIsCreated', (_e, f) => {
  f.callComposite(firstComposite, {})
})

g.server({
  name: 'V2-简单场景-two-graphs-B-step1',
  id: 1073741916
}).on('whenEntityIsCreated', (_e, f) => {
  f.callComposite(secondComposite, {})
})
