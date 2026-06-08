import { g } from 'genshin-ts/runtime/core'
import { guid } from 'genshin-ts/runtime/value'

g.server({
  id: 1073741857,
  variables: {
    merge_v_test: [1, 2, 3]
  }
}).on('whenEntityIsCreated', (_evt, f) => {
  // Pure literal: normal value type (int -> int).
  f.assemblyDictionary([
    { k: 1n, v: 11n },
    { k: 2n, v: 22n },
    { k: 3n, v: 33n }
  ])

  // List values have no literal form, so list cases are always wired.
  // Mixed: literal keys + wired list values (guid -> config_id_list).
  const mixedListA = f.assemblyList([1001, 1002], 'config_id')
  const mixedListB = f.assemblyList([1003, 1004], 'config_id')
  const mixedListC = f.assemblyList([1005, 1006], 'config_id')
  f.assemblyDictionary([
    { k: new guid(101), v: mixedListA },
    { k: new guid(102), v: mixedListB },
    { k: new guid(103), v: mixedListC }
  ])

  // Mixed literal + wired: normal value type (int -> int).
  const mixedKey1 = f.getLocalVariable(4n).value
  const mixedVal1 = f.getLocalVariable(44n).value
  const mixedKey2 = f.getLocalVariable(5n).value
  f.assemblyDictionary([
    { k: 7n, v: 77n },
    { k: mixedKey1, v: mixedVal1 },
    { k: mixedKey2, v: 66n }
  ])

  // Mixed literal + wired: list value type (guid -> config_id_list).
  const mixedGuid1 = f.getLocalVariable(new guid(201)).value
  const mixedGuid2 = f.getLocalVariable(new guid(202)).value
  const mixedListA2 = f.assemblyList([2101, 2102], 'config_id')
  const mixedListB2 = f.assemblyList([2201, 2202], 'config_id')
  f.assemblyDictionary([
    { k: new guid(200), v: mixedListB2 },
    { k: mixedGuid1, v: mixedListA2 },
    { k: mixedGuid2, v: mixedListB2 }
  ])

  // Pure wired: normal value type (int -> int).
  const wiredKey1 = f.getLocalVariable(8n).value
  const wiredVal1 = f.getLocalVariable(88n).value
  const wiredKey2 = f.getLocalVariable(9n).value
  const wiredVal2 = f.getLocalVariable(99n).value
  const wiredKey3 = f.getLocalVariable(10n).value
  const wiredVal3 = f.getLocalVariable(100n).value
  f.assemblyDictionary([
    { k: wiredKey1, v: wiredVal1 },
    { k: wiredKey2, v: wiredVal2 },
    { k: wiredKey3, v: wiredVal3 }
  ])

  f.assemblyDictionary([
    { k: wiredKey1, v: 2.2 },
    { k: wiredKey2, v: 3 },
    { k: wiredKey3, v: 4 }
  ])

  // Pure wired: list value type (guid -> config_id_list).
  const wiredGuid1 = f.getLocalVariable(new guid(301)).value
  const wiredGuid2 = f.getLocalVariable(new guid(302)).value
  const wiredGuid3 = f.getLocalVariable(new guid(303)).value
  const wiredList1 = f.assemblyList([3101], 'config_id')
  const wiredList2 = f.assemblyList([3201, 3202], 'config_id')
  const wiredList3 = f.assemblyList([3301, 3302, 3303], 'config_id')
  f.assemblyDictionary([
    { k: wiredGuid1, v: wiredList1 },
    { k: wiredGuid2, v: wiredList2 },
    { k: wiredGuid3, v: wiredList3 }
  ])
})
