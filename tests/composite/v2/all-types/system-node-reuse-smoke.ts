import { g } from 'genshin-ts/runtime/core'
import { str as strValue } from 'genshin-ts/runtime/value'

const listLengthComposite = g.defineComposite('L1-复用对照-list-length', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const values = f.assemblyList([1n, 2n, 3n], 'int')
    const len = f.getListLength(values)
    f.printString(f.dataTypeConversion(len, 'str'))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue('done list length')]), 0)
    return {}
  }
})

const concatenateListComposite = g.defineComposite('L1-复用对照-concatenate-list', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const left = f.assemblyList([1n, 2n, 3n], 'int')
    const right = f.assemblyList([4n, 5n, 6n], 'int')
    f.concatenateList(left, right)
    f.outflow('完成', f.registerExecNode('print_string', [new strValue('done concatenate list')]), 0)
    return {}
  }
})

const arithmeticComposite = g.defineComposite('L1-复用对照-arithmetic', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const values = f.assemblyList([1n, 2n, 3n], 'int')
    const len = f.getListLength(values)
    const sum = f.addition(len, len)
    const same = f.equal(sum, len)
    f.printString(f.dataTypeConversion(same, 'str'))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue('done arithmetic')]), 0)
    return {}
  }
})

const graph = g.server({
  mode: 'beyond',
  type: 'entity',
  name: 'V2-L1-系统节点复用对照-smoke',
  id: 1073741930
})

graph.on('whenEntityIsCreated', (_e, f) => {
  f.printString(f.dataTypeConversion(f.getListLength(f.assemblyList([1n, 2n, 3n], 'int')), 'str'))

  f.concatenateList(
    f.assemblyList([1n, 2n, 3n], 'int'),
    f.assemblyList([4n, 5n, 6n], 'int')
  )

  f.printString(
    f.dataTypeConversion(
      f.equal(
        f.addition(
          f.getListLength(f.assemblyList([1n, 2n, 3n], 'int')),
          f.getListLength(f.assemblyList([1n, 2n, 3n], 'int'))
        ),
        f.getListLength(f.assemblyList([1n, 2n, 3n], 'int'))
      ),
      'str'
    )
  )

  f.callComposite(listLengthComposite, {})
  f.callComposite(concatenateListComposite, {})
  f.callComposite(arithmeticComposite, {})
})
