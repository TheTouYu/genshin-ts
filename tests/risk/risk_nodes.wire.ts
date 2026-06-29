import { g } from 'genshin-ts/runtime/core'

g.server({ id: 1073741855 })
  .on('whenEntityIsCreated', (_evt, f) => {
    const e = f.getSelfEntity()
    const vInt = f.addition(1n, 2n)
    const vFloat = f.pi()
    const vGuid = f.queryGuidByEntity(e)
    const vStr = f.dataTypeConversion(1n, 'str')

    const listInt = f.assemblyList([vInt, vInt, vInt], 'int')
    const listFloat = f.assemblyList([vFloat, vFloat, vFloat], 'float')
    const listStr = f.assemblyList([vStr, vStr, vStr], 'str')

    f.assemblyDictionary([
      { k: vInt, v: vFloat },
      { k: vInt, v: vFloat }
    ])
    f.assemblyDictionary([
      { k: vStr, v: vInt },
      { k: vStr, v: vInt }
    ])

    const dictGuidStrList = f.assemblyDictionary([
      { k: vGuid, v: listStr },
      { k: vGuid, v: listStr }
    ])

    const dictIntFloat = f.createDictionary(listInt, listFloat)
    const dictStrInt = f.createDictionary(listStr, listInt)

    f.setPlayerSettlementScoreboardDataDisplay(e, vInt, vStr, vFloat)
    f.setPlayerSettlementScoreboardDataDisplay(e, vInt, vStr, vInt)
    f.setPlayerSettlementScoreboardDataDisplay(e, vInt, vStr, vStr)

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

    f.queryIfDictionaryContainsSpecificKey(dictIntFloat, vInt)
    f.queryIfDictionaryContainsSpecificKey(dictStrInt, vStr)
    f.queryIfDictionaryContainsSpecificKey(dictGuidStrList, vGuid)

    f.queryIfDictionaryContainsSpecificValue(dictIntFloat, vFloat)
    f.queryIfDictionaryContainsSpecificValue(dictStrInt, vInt)

    f.queryDictionaryValueByKey(dictIntFloat, vInt)
    f.queryDictionaryValueByKey(dictStrInt, vStr)
    f.getListLength(f.queryDictionaryValueByKey(dictGuidStrList, vGuid))

    f.removeKeyValuePairsFromDictionaryByKey(dictIntFloat, vInt)
    f.removeKeyValuePairsFromDictionaryByKey(dictStrInt, vStr)
    f.removeKeyValuePairsFromDictionaryByKey(dictGuidStrList, vGuid)

    f.setOrAddKeyValuePairsToDictionary(dictIntFloat, vInt, vFloat)
    f.setOrAddKeyValuePairsToDictionary(dictStrInt, vStr, vInt)
    f.setOrAddKeyValuePairsToDictionary(dictGuidStrList, vGuid, listStr)

    const cvInt = f.getCustomVariable(e, 'cv_int').asType('int')
    f.addition(cvInt, vInt)

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
