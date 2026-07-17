import {
  ComparisonOperator,
  EntityType,
  FixedMotionParameterType,
  MovementMode,
  SortBy,
  TargetType
} from 'genshin-ts/definitions/enum'
import { g } from 'genshin-ts/runtime/core'

g.server({ id: 1073741866 })
  .on('whenCharacterMovementSpdMeetsCondition', (evt, f) => {
    const litEq = SortBy.Ascending === SortBy.Descending
    const litNe = TargetType.None !== TargetType.All
    const x = evt.conditionComparisonType === ComparisonOperator.GreaterThan
    const movementModeEq = MovementMode.InstantMovement === MovementMode.UniformLinearMotion
    const fixedParameterEq =
      FixedMotionParameterType.FixedSpeed === FixedMotionParameterType.FixedTime
    f.printString(str(litEq))
    f.printString(str(litNe))
    f.printString(str(x))
    f.printString(str(movementModeEq))
    f.printString(str(fixedParameterEq))
  })
  .on('whenAggroTargetChanges', () => {})
