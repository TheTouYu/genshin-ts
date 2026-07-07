// Layout C variant: same topology as layout-r6-c-reference-repro, but one attack input
// uses a longer data chain: Get Node Graph Variable -> 3D Vector Addition -> Initiate Attack.

import { g } from 'genshin-ts/runtime/core'

g.server({
  name: 'R6-C参考复刻-long-input-step4',
  id: 1073741898,
  variables: {
    locationOffset: vec3([1, 2, 3]),
    locationOffsetDelta: vec3([0, 0, 0]),
    locationOffsetDeltaB: vec3([4, 5, 6]),
    rotationOffset: vec3([2, 3, 4]),
    rotationOffsetDelta: vec3([0.5, 0.5, 0.5]),
    overwriteAbilityUnitConfig: false,
    overwriteAbilityUnitConfigFallback: true
  }
}).on('whenEntityIsCreated', (e, f) => {
  f.fork(
    () => {
      f.printString('基础场景')

      f.fork(
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
          const locationOffsetScale = f.addition(locationOffsetLength, 1)
          const computedLocationOffset = f._3dVectorZoom(locationOffsetB, locationOffsetScale)
          const rotationOffsetA = f._3dVectorAddition(
            f.get('rotationOffset'),
            f.get('rotationOffsetDelta')
          )
          const rotationOffsetB = f._3dVectorCrossProduct(rotationOffsetA, computedLocationOffset)
          const rotationOffsetLength = f._3dVectorModuloOperation(rotationOffsetB)
          const overwriteAbilityUnitConfig = f.logicalOrOperation(
            f.get('overwriteAbilityUnitConfig'),
            f.greaterThan(rotationOffsetLength, 0)
          )
          f.initiateAttack(
            e.eventSourceEntity,
            999,
            1.2,
            computedLocationOffset,
            rotationOffsetB,
            abilityUnit,
            overwriteAbilityUnitConfig,
            e.eventSourceEntity
          )
        },
        () => {
          f.printString('上面一个节点图有比较多的参数，所以距离下移')
        }
      )
    },
    () => {
      f.printString('基础场景')
      f.printString('上面一条线的节点图已经占位了，所以距离继续下移')
      f.printString('这条线已经下移了，虽然上面有空间，也保持这条线，继续平移')
    }
  )
})
