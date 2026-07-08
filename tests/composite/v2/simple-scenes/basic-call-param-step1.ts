import { g } from 'genshin-ts/runtime/core'
import { str as strValue } from 'genshin-ts/runtime/value'

const paramPrinter = g.defineComposite('简单场景-带参打印-step1', {
  inputs: {
    message: { type: 'str' }
  },
  outputs: {},
  build(args, f) {
    f.printString(args.message)
    return {}
  }
})

g.server({
  name: 'V2-简单场景-basic-call-param-step1',
  id: 1073741911
}).on('whenEntityIsCreated', (_e, f) => {
  f.callComposite(paramPrinter, {
    message: new strValue('简单场景 带参打印 step1')
  })
})
