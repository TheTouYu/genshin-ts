import { g } from 'genshin-ts/runtime/core'
import { guid } from 'genshin-ts/runtime/value'

g.server({ id: 1073741855 })
  .on('whenEntityIsCreated', (_evt, f) => {
    const e = f.getSelfEntity()

    const listInt = f.assemblyList([1n, 2n, 3n], 'int')
    const listFloat = f.assemblyList([1.25, 2.5, 3.75], 'float')
    const listStr = f.assemblyList(['a', 'b', 'c'], 'str')

    f.assemblyDictionary([
      { k: 1n, v: 1.5 },
      { k: 2n, v: 2.5 }
    ])
    f.assemblyDictionary([
      { k: 'k1', v: 1n },
      { k: 'k2', v: 2n }
    ])

    const dictGuidStrList = f.assemblyDictionary([
      { k: new guid(1n), v: listStr },
      { k: new guid(2n), v: listStr }
    ])

    const dictIntFloat = f.createDictionary(listInt, listFloat)
    const dictStrInt = f.createDictionary(listStr, listInt)

    f.setPlayerSettlementScoreboardDataDisplay(e, 1n, 'score_f', 1.5)
    f.setPlayerSettlementScoreboardDataDisplay(e, 2n, 'score_i', 2n)
    f.setPlayerSettlementScoreboardDataDisplay(e, 3n, 'score_s', '3')

    f.clearDictionary(dictIntFloat)
    f.clearDictionary(dictStrInt)
    f.clearDictionary(dictGuidStrList)

    f.queryDictionarySLength(dictIntFloat)
    f.queryDictionarySLength(dictStrInt)
    f.queryDictionarySLength(dictGuidStrList)

    f.getListOfKeysFromDictionary(dictIntFloat)
    f.getListOfKeysFromDictionary(dictStrInt)
    f.getListOfKeysFromDictionary(dictGuidStrList)

    f.getListOfValuesFromDictionary(dictIntFloat)
    f.getListOfValuesFromDictionary(dictStrInt)

    f.queryIfDictionaryContainsSpecificKey(dictIntFloat, 1n)
    f.queryIfDictionaryContainsSpecificKey(dictStrInt, 'k1')
    f.queryIfDictionaryContainsSpecificKey(dictGuidStrList, new guid(1n))

    f.queryIfDictionaryContainsSpecificValue(dictIntFloat, 1.5)
    f.queryIfDictionaryContainsSpecificValue(dictStrInt, 2n)

    f.queryDictionaryValueByKey(dictIntFloat, 1n)
    f.queryDictionaryValueByKey(dictStrInt, 'k1')
    f.getListLength(f.queryDictionaryValueByKey(dictGuidStrList, new guid(2n)))

    f.removeKeyValuePairsFromDictionaryByKey(dictIntFloat, 1n)
    f.removeKeyValuePairsFromDictionaryByKey(dictStrInt, 'k2')
    f.removeKeyValuePairsFromDictionaryByKey(dictGuidStrList, new guid(2n))

    f.setOrAddKeyValuePairsToDictionary(dictIntFloat, 3n, 3.5)
    f.setOrAddKeyValuePairsToDictionary(dictStrInt, 'k3', 3n)
    f.setOrAddKeyValuePairsToDictionary(dictGuidStrList, new guid(3n), listStr)

    const cvInt = f.getCustomVariable(e, 'cv_int').asType('int')
    f.addition(cvInt, 1n)

    const cvList = f.getCustomVariable(e, 'cv_list').asType('int_list')
    f.getListLength(cvList)

    const cvDict = f.getCustomVariable(e, 'cv_dict').asDict('str', 'int')
    f.queryDictionarySLength(cvDict)
  })
  .on('whenEntityIsDestroyed', (evt, f) => {
    const snapInt = f
      .queryCustomVariableSnapshot(evt.customVariableComponentSnapshot, 'snap_int')
      .asType('int')
    f.addition(snapInt, 1n)

    const snapList = f
      .queryCustomVariableSnapshot(evt.customVariableComponentSnapshot, 'snap_list')
      .asType('int_list')
    f.getListLength(snapList)

    const snapDict = f
      .queryCustomVariableSnapshot(evt.customVariableComponentSnapshot, 'snap_dict')
      .asDict('str', 'int')
    f.queryDictionarySLength(snapDict)
  })
