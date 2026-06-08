import { ComparisonOperator, EntityType, SortBy, TargetType } from 'genshin-ts/definitions/enum'
import { g } from 'genshin-ts/runtime/core'

g.server({ id: 1073741856 })
  .on('whenCharacterMovementSpdMeetsCondition', (evt, f) => {
    const litEq = SortBy.Ascending === SortBy.Descending
    const litNe = TargetType.None !== TargetType.All
    const x = evt.conditionComparisonType === ComparisonOperator.GreaterThan
  })
  .on('whenAggroTargetChanges', () => {})
