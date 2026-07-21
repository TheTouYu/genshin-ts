import { DecisionRefreshMode, EntityType, ItemLootType, SortBy } from 'genshin-ts/definitions/enum'
import type { ServerExecutionFlowFunctions } from 'genshin-ts/definitions/nodes'
import { g } from 'genshin-ts/runtime/core'

// Auto-generated from src/definitions/nodes.ts for list(0)/dict(0) placeholder checks.
function testListDictPlaceholders(f: ServerExecutionFlowFunctions) {
  let n = 1
  const nextNum = () => n++
  const nextBool = () => Boolean(nextNum())
  const nextStr = () => str(nextNum())
  const nextVec3 = (): [number, number, number] => [nextNum(), nextNum(), nextNum()]

  // queryDictionaryValueByKey
  f.queryDictionaryValueByKey(dict('str', 'float', 0), nextStr())
  // createDictionary
  f.createDictionary(list('faction', 0), list('int', 0))
  // queryIfDictionaryContainsSpecificValue
  f.queryIfDictionaryContainsSpecificValue(dict('str', 'float', 0), nextNum())
  // getListOfValuesFromDictionary
  f.getListOfValuesFromDictionary(dict('str', 'float', 0))
  // sortDictionaryByKey
  f.sortDictionaryByKey(dict('int', 'float', 0), SortBy.Ascending)
  // sortDictionaryByValue
  f.sortDictionaryByValue(dict('int', 'float', 0), SortBy.Descending)
  // listIterationLoop / breakLoop
  f.listIterationLoop(list('int', 0), (value, breakLoop) => {
    void value
    breakLoop()
  })
  // insertValueIntoList
  f.insertValueIntoList(list('int', 0), nextNum(), nextNum())
  // modifyValueInList
  f.modifyValueInList(list('int', 0), nextNum(), nextNum())
  // removeValueFromList
  f.removeValueFromList(list('int', 0), nextNum())
  // listSorting
  f.listSorting(list('int', 0), SortBy.Ascending)
  // concatenateList
  f.concatenateList(list('int', 0), list('int', 0))
  // clearList
  f.clearList(list('int', 0))
  // createEntity
  f.createEntity(nextNum(), list(0))
  // createPrefab
  f.createPrefab(nextNum(), nextVec3(), nextVec3(), entity(0), nextBool(), nextNum(), list(0))
  // createPrefabGroup
  f.createPrefabGroup(nextNum(), nextVec3(), nextVec3(), entity(0), nextNum(), list(0), nextBool())
  // modifyEnvironmentSettings
  f.modifyEnvironmentSettings(nextNum(), list(0), nextBool(), nextNum())
  // recoverHpDirectly
  f.recoverHpDirectly(entity(0), entity(0), nextNum(), nextBool(), nextNum(), nextNum(), list(0))
  // createProjectile
  f.createProjectile(
    nextNum(),
    nextVec3(),
    nextVec3(),
    entity(0),
    entity(0),
    nextBool(),
    nextNum(),
    list(0)
  )
  // startTimer
  f.startTimer(entity(0), nextStr(), nextBool(), list(0))
  // switchMainCameraTemplate
  f.switchMainCameraTemplate(list(0), nextStr())
  // addUnitStatus
  f.addUnitStatus(entity(0), entity(0), nextNum(), nextNum(), dict(0))
  // setEntityActiveNameplate
  f.setEntityActiveNameplate(entity(0), list(0))
  // invokeDeckSelector
  f.invokeDeckSelector(
    entity(0),
    nextNum(),
    nextNum(),
    list(0),
    list(0),
    nextNum(),
    nextNum(),
    DecisionRefreshMode.CannotRefresh,
    nextNum(),
    nextNum(),
    list(0)
  )
  // randomDeckSelectorSelectionList
  f.randomDeckSelectorSelectionList(list(0))
  // setOrAddKeyValuePairsToDictionary
  f.setOrAddKeyValuePairsToDictionary(dict('int', 'float', 0), nextNum(), nextNum())
  // clearDictionary
  f.clearDictionary(dict(0))
  // removeKeyValuePairsFromDictionaryByKey
  f.removeKeyValuePairsFromDictionaryByKey(dict('int', 'float', 0), nextNum())
  // addNewItemToInventoryShopSalesList
  f.addNewItemToInventoryShopSalesList(
    entity(0),
    nextNum(),
    nextNum(),
    dict(0),
    nextNum(),
    nextNum(),
    nextBool()
  )
  // addItemsToThePurchaseList
  f.addItemsToThePurchaseList(entity(0), nextNum(), nextNum(), dict(0), nextBool())
  // addNewItemToCustomShopSalesList
  f.addNewItemToCustomShopSalesList(
    entity(0),
    nextNum(),
    nextNum(),
    dict(0),
    nextNum(),
    nextBool(),
    nextNum(),
    nextNum(),
    nextBool()
  )
  // modifyInventoryShopItemSalesInfo
  f.modifyInventoryShopItemSalesInfo(
    entity(0),
    nextNum(),
    nextNum(),
    dict(0),
    nextNum(),
    nextNum(),
    nextBool()
  )
  // modifyItemPurchaseInfoInThePurchaseList
  f.modifyItemPurchaseInfoInThePurchaseList(entity(0), nextNum(), nextNum(), dict(0), nextBool())
  // modifyCustomShopItemSalesInfo
  f.modifyCustomShopItemSalesInfo(
    entity(0),
    nextNum(),
    nextNum(),
    nextNum(),
    dict(0),
    nextNum(),
    nextBool(),
    nextNum(),
    nextNum(),
    nextBool()
  )
  // setInventoryItemDropContents
  f.setInventoryItemDropContents(entity(0), dict(0), ItemLootType.SharedReward)
  // setLootDropContent
  f.setLootDropContent(entity(0), dict(0))
  // modifyPlayerListForVisibleMiniMapMarkers
  f.modifyPlayerListForVisibleMiniMapMarkers(entity(0), nextNum(), list(0))
  // modifyMiniMapMarkerActivationStatus
  f.modifyMiniMapMarkerActivationStatus(entity(0), list(0), nextBool())
  // modifyPlayerListForTrackingMiniMapMarkers
  f.modifyPlayerListForTrackingMiniMapMarkers(entity(0), nextNum(), list(0))
  // setPlayerLeaderboardScoreAsAFloat
  f.setPlayerLeaderboardScoreAsAFloat(list(0), nextNum(), nextNum())
  // setPlayerLeaderboardScoreAsAnInteger
  f.setPlayerLeaderboardScoreAsAnInteger(list(0), nextNum(), nextNum())
  // setPlayerSCurrentChannel
  f.setPlayerSCurrentChannel(nextNum(), list(0))
  // weightedRandom
  f.weightedRandom(list(0))
  // searchListAndReturnValueId
  f.searchListAndReturnValueId(list('int', 0), nextNum())
  // getCorrespondingValueFromList
  f.getCorrespondingValueFromList(list('int', 0), nextNum())
  // getListLength
  f.getListLength(list('int', 0))
  // getMaximumValueFromList
  f.getMaximumValueFromList(list('int', 0))
  // getMinimumValueFromList
  f.getMinimumValueFromList(list('int', 0))
  // listIncludesThisValue
  f.listIncludesThisValue(list('int', 0), nextNum())
  // getEntityListBySpecifiedRange
  f.getEntityListBySpecifiedRange(list(0), nextVec3(), nextNum())
  // getEntityListBySpecifiedType
  f.getEntityListBySpecifiedType(list(0), EntityType.Stage)
  // getEntityListBySpecifiedPrefabId
  f.getEntityListBySpecifiedPrefabId(list(0), nextNum())
  // getEntityListBySpecifiedFaction
  f.getEntityListBySpecifiedFaction(list(0), nextNum())
  // queryIfDictionaryContainsSpecificKey
  f.queryIfDictionaryContainsSpecificKey(dict('int', 'float', 0), nextNum())
  // queryDictionarySLength
  f.queryDictionarySLength(dict(0))
  // getListOfKeysFromDictionary
  f.getListOfKeysFromDictionary(dict('int', 'float', 0))
}

g.server({ id: 1073741827 }).on('whenEntityIsCreated', (evt, f) => {
  testListDictPlaceholders(f as never)
  void evt
})
