import { g } from 'genshin-ts/runtime/core'
import { configId, faction, guid, prefabId } from 'genshin-ts/runtime/value'
import * as E from 'genshin-ts/definitions/enum'

// AUTO-GENERATED: enumerationsEqual wired enum returns/events
// Run: npx tsx scripts/generate-enum-equal-wired-tests.ts

g.server({ id: 1073741853 }).on('whenEntityIsCreated', (_evt, f) => {
  // getEntityType :: EntityType
  const ret0 = f.getEntityType(f.getSelfEntity())
  f.enumerationsEqual(ret0, ret0)
  // getPlayerClientInputDeviceType :: InputDeviceType
  const ret1 = f.getPlayerClientInputDeviceType(f.getSelfEntity())
  f.enumerationsEqual(ret1, ret1)
  // getPlayerSettlementSuccessStatus :: SettlementStatus
  const ret2 = f.getPlayerSettlementSuccessStatus(f.getSelfEntity())
  f.enumerationsEqual(ret2, ret2)
  // getFactionSettlementSuccessStatus :: SettlementStatus
  const ret3 = f.getFactionSettlementSuccessStatus(new faction(1n))
  f.enumerationsEqual(ret3, ret3)
})

// event enum outputs -> enumerationsEqual
g.server({ id: 1073741854 }).on("whenCharacterMovementSpdMeetsCondition", (evt, f) => {
  // whenCharacterMovementSpdMeetsCondition.conditionComparisonType :: ComparisonOperator
  f.enumerationsEqual(evt.conditionComparisonType, evt.conditionComparisonType)
})

g.server({ id: 1073741854 }).on("whenEntityIsDestroyed", (evt, f) => {
  // whenEntityIsDestroyed.entityType :: EntityType
  f.enumerationsEqual(evt.entityType, evt.entityType)
})

g.server({ id: 1073741854 }).on("whenTheCharacterIsDown", (evt, f) => {
  // whenTheCharacterIsDown.reason :: CauseOfBeingDown
  f.enumerationsEqual(evt.reason, evt.reason)
})

g.server({ id: 1073741854 }).on("whenAllPlayerSCharactersAreDown", (evt, f) => {
  // whenAllPlayerSCharactersAreDown.reason :: CauseOfBeingDown
  f.enumerationsEqual(evt.reason, evt.reason)
})

g.server({ id: 1073741854 }).on("whenAttackHits", (evt, f) => {
  // whenAttackHits.elementalType :: ElementalType
  f.enumerationsEqual(evt.elementalType, evt.elementalType)
})

g.server({ id: 1073741854 }).on("whenAttacked", (evt, f) => {
  // whenAttacked.elementalType :: ElementalType
  f.enumerationsEqual(evt.elementalType, evt.elementalType)
})

g.server({ id: 1073741854 }).on("whenUnitStatusEnds", (evt, f) => {
  // whenUnitStatusEnds.removalReason :: UnitStatusRemovalReason
  f.enumerationsEqual(evt.removalReason, evt.removalReason)
})

g.server({ id: 1073741854 }).on("whenElementalReactionEventOccurs", (evt, f) => {
  // whenElementalReactionEventOccurs.elementalReactionType :: ElementalReactionType
  f.enumerationsEqual(evt.elementalReactionType, evt.elementalReactionType)
})

g.server({ id: 1073741854 }).on("whenDeckSelectorIsComplete", (evt, f) => {
  // whenDeckSelectorIsComplete.completionReason :: SelectCompletionReason
  f.enumerationsEqual(evt.completionReason, evt.completionReason)
})

g.server({ id: 1073741854 }).on("whenTheQuantityOfInventoryItemChanges", (evt, f) => {
  // whenTheQuantityOfInventoryItemChanges.reasonForChange :: ReasonForItemChange
  f.enumerationsEqual(evt.reasonForChange, evt.reasonForChange)
})
