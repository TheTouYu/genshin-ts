import { g } from 'genshin-ts/runtime/core'
import { configId, faction, guid, prefabId, str as strValue } from 'genshin-ts/runtime/value'

const listOps_bool = g.defineComposite('TTD-列表类型-bool', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const a = f.assemblyList([true, false, true], 'bool')
    const b = f.assemblyList([true, false, true], 'bool')
    const value = false
    f.concatenateList(a as never, b as never)
    f.clearList(a as never)
    const len = f.getListLength(a as never)
    f.printString(f.dataTypeConversion(len, 'str'))
    const includes = f.listIncludesThisValue(a as never, value as never)
    f.printString(f.dataTypeConversion(includes, 'str'))
    const ids = f.searchListAndReturnValueId(a as never, value as never)
    f.printString(f.dataTypeConversion(f.getListLength(ids), 'str'))
    const item = f.getCorrespondingValueFromList(a as never, 0n)
    f.equal(item as never, item as never)
    f.insertValueIntoList(a as never, 0n, value as never)
    f.modifyValueInList(a as never, 1n, value as never)
    f.removeValueFromList(a as never, 2n)
    f.listIterationLoop(a as never, () => {
      f.printString('loop bool')
    })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue('done bool')]), 0)
    return {}
  }
})

const listOps_int = g.defineComposite('TTD-列表类型-int', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const a = f.assemblyList([1n, 2n, 3n], 'int')
    const b = f.assemblyList([3n, 2n, 1n], 'int')
    const value = 2n
    f.concatenateList(a as never, b as never)
    f.clearList(a as never)
    const len = f.getListLength(a as never)
    f.printString(f.dataTypeConversion(len, 'str'))
    const includes = f.listIncludesThisValue(a as never, value as never)
    f.printString(f.dataTypeConversion(includes, 'str'))
    const ids = f.searchListAndReturnValueId(a as never, value as never)
    f.printString(f.dataTypeConversion(f.getListLength(ids), 'str'))
    const item = f.getCorrespondingValueFromList(a as never, 0n)
    f.equal(item as never, item as never)
    f.insertValueIntoList(a as never, 0n, value as never)
    f.modifyValueInList(a as never, 1n, value as never)
    f.removeValueFromList(a as never, 2n)
    f.listIterationLoop(a as never, () => {
      f.printString('loop int')
    })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue('done int')]), 0)
    return {}
  }
})

const listOps_float = g.defineComposite('TTD-列表类型-float', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const a = f.assemblyList([1.25, 2.25, 3.25], 'float')
    const b = f.assemblyList([3.25, 2.25, 1.25], 'float')
    const value = 2.25
    f.concatenateList(a as never, b as never)
    f.clearList(a as never)
    const len = f.getListLength(a as never)
    f.printString(f.dataTypeConversion(len, 'str'))
    const includes = f.listIncludesThisValue(a as never, value as never)
    f.printString(f.dataTypeConversion(includes, 'str'))
    const ids = f.searchListAndReturnValueId(a as never, value as never)
    f.printString(f.dataTypeConversion(f.getListLength(ids), 'str'))
    const item = f.getCorrespondingValueFromList(a as never, 0n)
    f.equal(item as never, item as never)
    f.insertValueIntoList(a as never, 0n, value as never)
    f.modifyValueInList(a as never, 1n, value as never)
    f.removeValueFromList(a as never, 2n)
    f.listIterationLoop(a as never, () => {
      f.printString('loop float')
    })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue('done float')]), 0)
    return {}
  }
})

const listOps_str = g.defineComposite('TTD-列表类型-str', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const a = f.assemblyList(["a", "b", "c"], 'str')
    const b = f.assemblyList(["c", "b", "a"], 'str')
    const value = "b"
    f.concatenateList(a as never, b as never)
    f.clearList(a as never)
    const len = f.getListLength(a as never)
    f.printString(f.dataTypeConversion(len, 'str'))
    const includes = f.listIncludesThisValue(a as never, value as never)
    f.printString(f.dataTypeConversion(includes, 'str'))
    const ids = f.searchListAndReturnValueId(a as never, value as never)
    f.printString(f.dataTypeConversion(f.getListLength(ids), 'str'))
    const item = f.getCorrespondingValueFromList(a as never, 0n)
    f.equal(item as never, item as never)
    f.insertValueIntoList(a as never, 0n, value as never)
    f.modifyValueInList(a as never, 1n, value as never)
    f.removeValueFromList(a as never, 2n)
    f.listIterationLoop(a as never, () => {
      f.printString('loop str')
    })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue('done str')]), 0)
    return {}
  }
})

const listOps_vec3 = g.defineComposite('TTD-列表类型-vec3', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const a = f.assemblyList([[1, 2, 3], [4, 5, 6], [7, 8, 9]], 'vec3')
    const b = f.assemblyList([[7, 8, 9], [4, 5, 6], [1, 2, 3]], 'vec3')
    const value = [4, 5, 6]
    f.concatenateList(a as never, b as never)
    f.clearList(a as never)
    const len = f.getListLength(a as never)
    f.printString(f.dataTypeConversion(len, 'str'))
    const includes = f.listIncludesThisValue(a as never, value as never)
    f.printString(f.dataTypeConversion(includes, 'str'))
    const ids = f.searchListAndReturnValueId(a as never, value as never)
    f.printString(f.dataTypeConversion(f.getListLength(ids), 'str'))
    const item = f.getCorrespondingValueFromList(a as never, 0n)
    f.equal(item as never, item as never)
    f.insertValueIntoList(a as never, 0n, value as never)
    f.modifyValueInList(a as never, 1n, value as never)
    f.removeValueFromList(a as never, 2n)
    f.listIterationLoop(a as never, () => {
      f.printString('loop vec3')
    })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue('done vec3')]), 0)
    return {}
  }
})

const listOps_guid = g.defineComposite('TTD-列表类型-guid', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const a = f.assemblyList([new guid(1n), new guid(2n), new guid(3n)], 'guid')
    const b = f.assemblyList([new guid(3n), new guid(2n), new guid(1n)], 'guid')
    const value = new guid(2n)
    f.concatenateList(a as never, b as never)
    f.clearList(a as never)
    const len = f.getListLength(a as never)
    f.printString(f.dataTypeConversion(len, 'str'))
    const includes = f.listIncludesThisValue(a as never, value as never)
    f.printString(f.dataTypeConversion(includes, 'str'))
    const ids = f.searchListAndReturnValueId(a as never, value as never)
    f.printString(f.dataTypeConversion(f.getListLength(ids), 'str'))
    const item = f.getCorrespondingValueFromList(a as never, 0n)
    f.equal(item as never, item as never)
    f.insertValueIntoList(a as never, 0n, value as never)
    f.modifyValueInList(a as never, 1n, value as never)
    f.removeValueFromList(a as never, 2n)
    f.listIterationLoop(a as never, () => {
      f.printString('loop guid')
    })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue('done guid')]), 0)
    return {}
  }
})

const listOps_entity = g.defineComposite('TTD-列表类型-entity', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const a = f.assemblyList([f.getSelfEntity(), f.getSelfEntity(), f.getSelfEntity()], 'entity')
    const b = f.assemblyList([f.getSelfEntity(), f.getSelfEntity(), f.getSelfEntity()], 'entity')
    const value = f.getSelfEntity()
    f.concatenateList(a as never, b as never)
    f.clearList(a as never)
    const len = f.getListLength(a as never)
    f.printString(f.dataTypeConversion(len, 'str'))
    const includes = f.listIncludesThisValue(a as never, value as never)
    f.printString(f.dataTypeConversion(includes, 'str'))
    const ids = f.searchListAndReturnValueId(a as never, value as never)
    f.printString(f.dataTypeConversion(f.getListLength(ids), 'str'))
    const item = f.getCorrespondingValueFromList(a as never, 0n)
    f.equal(item as never, item as never)
    f.insertValueIntoList(a as never, 0n, value as never)
    f.modifyValueInList(a as never, 1n, value as never)
    f.removeValueFromList(a as never, 2n)
    f.listIterationLoop(a as never, () => {
      f.printString('loop entity')
    })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue('done entity')]), 0)
    return {}
  }
})

const listOps_prefabid = g.defineComposite('TTD-列表类型-prefab_id', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const a = f.assemblyList([new prefabId(1n), new prefabId(2n), new prefabId(3n)], 'prefab_id')
    const b = f.assemblyList([new prefabId(3n), new prefabId(2n), new prefabId(1n)], 'prefab_id')
    const value = new prefabId(2n)
    f.concatenateList(a as never, b as never)
    f.clearList(a as never)
    const len = f.getListLength(a as never)
    f.printString(f.dataTypeConversion(len, 'str'))
    const includes = f.listIncludesThisValue(a as never, value as never)
    f.printString(f.dataTypeConversion(includes, 'str'))
    const ids = f.searchListAndReturnValueId(a as never, value as never)
    f.printString(f.dataTypeConversion(f.getListLength(ids), 'str'))
    const item = f.getCorrespondingValueFromList(a as never, 0n)
    f.equal(item as never, item as never)
    f.insertValueIntoList(a as never, 0n, value as never)
    f.modifyValueInList(a as never, 1n, value as never)
    f.removeValueFromList(a as never, 2n)
    f.listIterationLoop(a as never, () => {
      f.printString('loop prefab_id')
    })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue('done prefab_id')]), 0)
    return {}
  }
})

const listOps_configid = g.defineComposite('TTD-列表类型-config_id', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const a = f.assemblyList([new configId(1n), new configId(2n), new configId(3n)], 'config_id')
    const b = f.assemblyList([new configId(3n), new configId(2n), new configId(1n)], 'config_id')
    const value = new configId(2n)
    f.concatenateList(a as never, b as never)
    f.clearList(a as never)
    const len = f.getListLength(a as never)
    f.printString(f.dataTypeConversion(len, 'str'))
    const includes = f.listIncludesThisValue(a as never, value as never)
    f.printString(f.dataTypeConversion(includes, 'str'))
    const ids = f.searchListAndReturnValueId(a as never, value as never)
    f.printString(f.dataTypeConversion(f.getListLength(ids), 'str'))
    const item = f.getCorrespondingValueFromList(a as never, 0n)
    f.equal(item as never, item as never)
    f.insertValueIntoList(a as never, 0n, value as never)
    f.modifyValueInList(a as never, 1n, value as never)
    f.removeValueFromList(a as never, 2n)
    f.listIterationLoop(a as never, () => {
      f.printString('loop config_id')
    })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue('done config_id')]), 0)
    return {}
  }
})

const listOps_faction = g.defineComposite('TTD-列表类型-faction', {
  inputs: {},
  outputs: {},
  outflows: [{ name: '完成' }],
  build(_args, f) {
    const a = f.assemblyList([new faction(1n), new faction(2n), new faction(3n)], 'faction')
    const b = f.assemblyList([new faction(3n), new faction(2n), new faction(1n)], 'faction')
    const value = new faction(2n)
    f.concatenateList(a as never, b as never)
    f.clearList(a as never)
    const len = f.getListLength(a as never)
    f.printString(f.dataTypeConversion(len, 'str'))
    const includes = f.listIncludesThisValue(a as never, value as never)
    f.printString(f.dataTypeConversion(includes, 'str'))
    const ids = f.searchListAndReturnValueId(a as never, value as never)
    f.printString(f.dataTypeConversion(f.getListLength(ids), 'str'))
    const item = f.getCorrespondingValueFromList(a as never, 0n)
    f.equal(item as never, item as never)
    f.insertValueIntoList(a as never, 0n, value as never)
    f.modifyValueInList(a as never, 1n, value as never)
    f.removeValueFromList(a as never, 2n)
    f.listIterationLoop(a as never, () => {
      f.printString('loop faction')
    })
    f.outflow('完成', f.registerExecNode('print_string', [new strValue('done faction')]), 0)
    return {}
  }
})

const graph = g.server({
  mode: 'beyond',
  type: 'entity',
  name: 'V2-TTD-列表类型操作冒烟-step1',
  id: 1073741929
})

graph.on('whenEntityIsCreated', (_e, f) => {
  f.callComposite(listOps_bool, {})
  f.callComposite(listOps_int, {})
  f.callComposite(listOps_float, {})
  f.callComposite(listOps_str, {})
  f.callComposite(listOps_vec3, {})
  f.callComposite(listOps_guid, {})
  f.callComposite(listOps_entity, {})
  f.callComposite(listOps_prefabid, {})
  f.callComposite(listOps_configid, {})
  f.callComposite(listOps_faction, {})
})
