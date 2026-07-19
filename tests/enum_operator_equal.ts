import {
  ColorBlendType,
  ComparisonOperator,
  FillMaterial,
  SortBy,
  TargetType
} from 'genshin-ts/definitions/enum'
import { g } from 'genshin-ts/runtime/core'

g.server({ id: 1073741866 })
  .on('whenCharacterMovementSpdMeetsCondition', (evt, f) => {
    const litEq = SortBy.Ascending === SortBy.Descending
    const litNe = TargetType.None !== TargetType.All
    const x = evt.conditionComparisonType === ComparisonOperator.GreaterThan
    const colorBlendTypeEq = ColorBlendType.Override === ColorBlendType.Multiply
    const fillMaterialEq = FillMaterial.Freeze === FillMaterial.Petrification
    const colorBlendTypeNodeEq = f.enumerationsEqual(
      ColorBlendType.Override,
      ColorBlendType.Multiply
    )
    const fillMaterialNodeEq = f.enumerationsEqual(FillMaterial.Freeze, FillMaterial.Petrification)
    f.printString(str(litEq))
    f.printString(str(litNe))
    f.printString(str(x))
    f.printString(str(colorBlendTypeEq))
    f.printString(str(fillMaterialEq))
    f.printString(str(colorBlendTypeNodeEq))
    f.printString(str(fillMaterialNodeEq))
  })
  .on('whenAggroTargetChanges', () => {})
