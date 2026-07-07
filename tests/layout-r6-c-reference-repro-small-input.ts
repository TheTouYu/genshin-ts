// Regression layout check for R6-C topology without composite nodes.
// Purpose: verify ordinary small data-input layouts are not regressed by composite-call
// footprint padding changes.

import { g } from 'genshin-ts/runtime/core'

g.server({
  name: 'R6-C参考复刻-small-input-regression-step8',
  id: 1073741899,
  variables: {
    locationOffset: vec3([1, 2, 3]),
    locationOffsetDelta: vec3([0, 0, 0]),
    rotationOffset: vec3([2, 3, 4]),
    overwriteAbilityUnitConfig: false
  }
}).on('whenEntityIsCreated', (e, f) => {
  f.fork(
    () => {
      f.printString('基础场景')

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
          f.printString('普通少量数据输入：下方分支用于回归检查')
        }
      )
    },
    () => {
      f.printString('基础场景')
      f.printString('普通布局回归：上方分支占位后继续下移')
      f.printString('普通布局回归：保持同一条线继续平移')
    }
  )
})
