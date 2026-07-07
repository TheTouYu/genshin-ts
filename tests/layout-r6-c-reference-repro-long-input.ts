// Layout C variant: same topology as layout-r6-c-reference-repro, but one attack input
// uses a longer data chain: Get Node Graph Variable -> 3D Vector Addition -> Initiate Attack.

import { g } from 'genshin-ts/runtime/core'

g.server({
  name: 'R6-C参考复刻-long-input-step2',
  id: 1073741898,
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
