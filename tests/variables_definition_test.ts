import { g } from 'genshin-ts/runtime/core'

g.server({
  id: 1073741857,
  variables: {
    v_bool: true,
    v_int: 42n,
    v_float: 3.5,
    v_str: 'hello',
    v_vec3: [1, 2, 3],
    v_guid: guid(12n),
    v_config: configId(1),
    v_prefab: prefabId(2),
    v_faction: faction(3),
    v_entity: entity(0),

    ffd: {
      a: configId(2),
      b: configId(3)
    },

    l_int: [1n, 2n, 3n],
    l_float: [1, 2, 3],
    l_config: [configId(1), configId(2)],
    l_entity_len: [entity(0), entity(0), entity(0)],
    l_str_empty: list('str', []),
    l_entity_len2: list('entity', new Array(2)),
    l_int_len: list('int', new Array(4)),

    d_str_int: dict([{ k: 'a', v: 1n }]),
    d_int_str: dict([{ k: 1n, v: 'a' }]),
    d_entity_key: dict([{ k: entity(0), v: 1n }]),
    d_str_entity: dict([{ k: 'e', v: entity(0) }]),
    d_str_float_list: dict([{ k: 'list', v: [1, 2, 3] }]),
    d_str_entity_list: dict([{ k: 'elist', v: list('entity', new Array(3)) }]),
    d_str_int_multi: dict([
      { k: 'a', v: 1n },
      { k: 'b', v: 2n },
      { k: 'c', v: 3n },
      { k: 'd', v: 4n },
      { k: 'e', v: 5n }
    ]),
    d_int_float_list_multi: dict([
      { k: 1n, v: [1, 2] },
      { k: 2n, v: [3, 4] },
      { k: 3n, v: [5, 6] },
      { k: 4n, v: [7, 8] }
    ]),
    d_str_entity_list_multi: dict([
      { k: 'a', v: list('entity', new Array(2)) },
      { k: 'b', v: list('entity', new Array(3)) },
      { k: 'c', v: list('entity', new Array(4)) },
      { k: 'd', v: list('entity', new Array(5)) }
    ]),
    d_super: dict([
      { k: 123, v: [configId(1), configId(2)] },
      { k: 345, v: [configId(3), configId(4)] }
    ]),
    d_super_2: dict([
      {
        k: 123,
        v: [
          [1, 2, 3],
          [4, 5, 6]
        ]
      },
      {
        k: 345,
        v: [
          [7, 8, 9],
          [10, 11, 12]
        ]
      }
    ])
  }
}).on('whenEntityIsCreated', (_evt, f) => {
  f.set('v_bool', false)
  f.set('v_int', 99n)
  f.set('v_float', 9.5)
  f.set('v_str', 'ok')

  const vInt = f.get('v_int')
  const vFloat = f.get('v_float')
  const vBool = f.get('v_bool')
  const vStr = f.get('v_str')

  f.printString(str(f.queryDictionarySLength(f.get('ffd'))))

  f.printString(str(f.get('v_bool') ? 4 + vFloat : 7))

  const b = 3 + float(4 % 5)
  const d = b / vFloat

  f.printString(vStr)
  f.printString(str(vInt))
  f.printString(str(vFloat))
  f.printString(str(vBool))

  const lenIntList = f.getListLength(f.get('l_int'))
  const lenEntityList = f.getListLength(f.get('l_entity_len2'))
  f.printString(str(lenIntList))
  f.printString(str(lenEntityList))

  const lenDict = f.queryDictionarySLength(f.get('d_str_int'))
  const lenStrEntityDict = f.queryDictionarySLength(f.get('d_str_entity'))
  const lenEntityKeyDict = f.queryDictionarySLength(f.get('d_entity_key'))
  const lenEntityListDict = f.queryDictionarySLength(f.get('d_str_entity_list'))
  const lenStrIntMulti = f.queryDictionarySLength(f.get('d_str_int_multi'))
  const lenIntFloatListMulti = f.queryDictionarySLength(f.get('d_int_float_list_multi'))
  const lenStrEntityListMulti = f.queryDictionarySLength(f.get('d_str_entity_list_multi'))
  f.printString(str(lenDict))
  f.printString(str(lenStrEntityDict))
  f.printString(str(lenEntityKeyDict))
  f.printString(str(lenEntityListDict))
  f.printString(str(lenStrIntMulti))
  f.printString(str(lenIntFloatListMulti))
  f.printString(str(lenStrEntityListMulti))
})
