// Layout regression for ordinary (non-composite) data-flow density.
// Purpose: compare two sibling attack branches with different ordinary input data-flow counts
// before tuning:
// 2. slightly reduce per-row vertical spacing between ordinary data nodes;
// 3. slightly increase whole data-block height estimation as data-node count grows.

import { g } from 'genshin-ts/runtime/core'

g.server({
  name: 'R6-C数据流数量回归-step12-count-height',
  id: 1073741900,
  variables: {
    locationOffset: vec3([1, 2, 3]),
    locationOffsetDelta: vec3([0, 0, 0]),
    locationOffsetDeltaB: vec3([4, 5, 6]),
    rotationOffset: vec3([2, 3, 4]),
    rotationOffsetDelta: vec3([0.5, 0.5, 0.5]),
    locationOffsetScaleBase: 1,
    overwriteAbilityUnitConfig: false,
    overwriteAbilityUnitConfigFallback: true
  }
}).on('whenEntityIsCreated', (e, f) => {
  f.fork(
    () => {
      f.printString('数据流数量回归：起始分支')

      f.fork(
        () => {
          const abilityUnit = f.dataTypeConversion(e.eventSourceGuid, 'str')
          const computedLocationOffset = f._3dVectorAddition(
            f.get('locationOffset'),
            f.get('locationOffsetDelta')
          )
          f.initiateAttack(
            e.eventSourceEntity,
            999,
            1.2,
            computedLocationOffset,
            f.get('rotationOffset'),
            abilityUnit,
            f.get('overwriteAbilityUnitConfig'),
            e.eventSourceEntity
          )
        },
        () => {
          const abilityUnit = f.dataTypeConversion(e.eventSourceGuid, 'str')
          const locationOffsetA = f._3dVectorAddition(
            f.get('locationOffset'),
            f.get('locationOffsetDelta')
          )
          const locationOffsetB = f._3dVectorSubtraction(
            locationOffsetA,
            f.get('locationOffsetDeltaB')
          )
          const locationOffsetLength = f._3dVectorModuloOperation(locationOffsetB)
          const locationOffsetScale = f.addition(
            locationOffsetLength,
            f.get('locationOffsetScaleBase')
          )
          const computedLocationOffset = f._3dVectorZoom(locationOffsetB, locationOffsetScale)
          const rotationOffsetA = f._3dVectorAddition(
            f.get('rotationOffset'),
            f.get('rotationOffsetDelta')
          )
          const computedRotationOffset = f._3dVectorCrossProduct(
            rotationOffsetA,
            computedLocationOffset
          )
          const computedOverwriteAbilityUnitConfig = f.logicalOrOperation(
            f.get('overwriteAbilityUnitConfig'),
            f.get('overwriteAbilityUnitConfigFallback')
          )
          f.initiateAttack(
            e.eventSourceEntity,
            999,
            1.2,
            computedLocationOffset,
            computedRotationOffset,
            abilityUnit,
            computedOverwriteAbilityUnitConfig,
            e.eventSourceEntity
          )
        },
        () => {
          f.printString('观察分支：检查上方两组不同数量数据流是否压到这里')
        }
      )
    },
    () => {
      f.printString('外层下方分支：检查整体高度估算')
      f.printString('外层下方分支：保持同一条线继续平移')
    }
  )
})
