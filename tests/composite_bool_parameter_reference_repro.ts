import { g } from 'genshin-ts/runtime/core'
import { bool } from 'genshin-ts/runtime/value'

const boolParameter = g.defineComposite('创建复合节点', {
  inputs: {
    输入: { type: 'bool', pinIndex: 64 }
  },
  outputs: {
    输出: { type: 'str', pinIndex: 63 }
  },
  build({ 输入 }, f) {
    const integer = f.dataTypeConversion(输入, 'int')
    const float = f.dataTypeConversion(integer, 'float')
    const text = f.dataTypeConversion(float, 'str')
    return { 输出: text }
  }
})

g.server({
  name: 'bool参数参考复现',
  id: 1073741994
}).on('whenEntityIsCreated', (_event, f) => {
  f.fork(
    () => {
      const directInteger = f.dataTypeConversion(new bool(true), 'int')
      const directFloat = f.dataTypeConversion(directInteger, 'float')
      const directText = f.dataTypeConversion(directFloat, 'str')
      f.printString(directText)
    },
    () => {
      const result = f.callComposite(boolParameter, { 输入: new bool(true) })
      f.printString(result.输出)
    }
  )
})
