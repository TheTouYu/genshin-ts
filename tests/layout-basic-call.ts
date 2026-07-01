// 最简单的复合调用 — 对应编辑器"基本调用节点.gia"
import { g } from 'genshin-ts/runtime/core'
import { guid } from 'genshin-ts/runtime/value'

const handle = g.defineComposite('简单复合', {
  inputs: {},
  outputs: {},
  build(_inputs, f) {
    f.printString('测试')
    return {}
  }
})

g.server({ name: 'main', id: 1073741828 })
  .on('whenEntityIsCreated', (_e, f) => {
    f.callComposite(handle, {})
  })
