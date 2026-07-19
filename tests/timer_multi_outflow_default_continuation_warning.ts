import { g } from 'genshin-ts/runtime/core'
import { str } from 'genshin-ts/runtime/value'

const child = g.defineComposite('timer multi-outflow warning child', {
  outflows: ['是', '否'],
  build(_args, f) {
    f.fork(
      () => {
        const yes = f.registerExecNode('print_string', [new str('yes')])
        f.outflow('是', yes, 0)
      },
      () => {
        const no = f.registerExecNode('print_string', [new str('no')])
        f.outflow('否', no, 0)
      }
    )
    return {}
  }
})

g.server({ name: 'timer multi-outflow warning', id: 1073742411 }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    f.callComposite(child, {})
    f.printString(new str('default continuation'))
  }
)
