import { g } from 'genshin-ts/runtime/core'
import { configId, faction, str as strValue } from 'genshin-ts/runtime/value'

const listBoolComposite = g.defineComposite('TTD-数据结构类型-列表bool', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    f.concatenateList(f.assemblyList([true, false, true], 'bool'), f.assemblyList([false, true, false], 'bool'))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue('done bool list')]), 0)
    return {}
  }
})

const listConfigComposite = g.defineComposite('TTD-数据结构类型-列表config', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    f.concatenateList(
      f.assemblyList([1n, 2n, 3n], 'config_id'),
      f.assemblyList([4n, 5n, 6n], 'config_id')
    )
    f.outflow('完成', f.registerExecNode('print_string', [new strValue('done config list')]), 0)
    return {}
  }
})

const dictComposite = g.defineComposite('TTD-数据结构类型-字典config-bool', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const d = f.assemblyDictionary([
      { k: new configId(1n), v: true },
      { k: new configId(2n), v: false }
    ])
    f.queryDictionaryValueByKey(d, new configId(1n))
    f.outflow('完成', f.registerExecNode('print_string', [new strValue('done dict')]), 0)
    return {}
  }
})

const graph = g.server({
  mode: 'beyond',
  type: 'entity',
  name: 'V2-TTD-数据结构类型冒烟-step1',
  id: 1073741928
})

graph.on('whenEntityIsCreated', (e, f) => {
  // Ordinary graph controls: same data-structure operations outside composite.
  f.concatenateList(f.assemblyList([true, false, true], 'bool'), f.assemblyList([false, true, false], 'bool'))
  f.concatenateList(
    f.assemblyList([1n, 2n, 3n], 'config_id'),
    f.assemblyList([4n, 5n, 6n], 'config_id')
  )
  const d = f.assemblyDictionary([
    { k: new configId(1n), v: true },
    { k: new configId(2n), v: false }
  ])
  f.queryDictionaryValueByKey(d, new configId(1n))

  // Additional representative id/list types that currently showed wrong pins in generated composite case.
  f.assemblyList([new faction(1n), new faction(2n), new faction(3n)], 'faction')
  f.assemblyList([e.eventSourceEntity, e.eventSourceEntity, e.eventSourceEntity], 'entity')

  f.callComposite(listBoolComposite, {})
  f.callComposite(listConfigComposite, {})
  f.callComposite(dictComposite, {})
})
