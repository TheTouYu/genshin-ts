// Main-graph equivalent of layout-r6-d-composite-summary.ts.
// This keeps the same data chains and exec fork shape outside composite impl,
// so game-side validation can compare whether the shared layout issue also exists in main graphs.

import { g } from 'genshin-ts/runtime/core'

g.server({
  name: 'R6-D主图同构-step4-compact-chain',
  id: 1073741902,
  variables: {
    locationOffset: vec3([1, 2, 3]),
    locationOffsetDelta: vec3([0, 0, 0]),
    rotationOffset: vec3([2, 3, 4]),
    rotationOffsetDelta: vec3([0.5, 0.5, 0.5]),
    locationOffsetScaleBase: 1,
    enabled: false,
    enabledFallback: true
  }
}).on('whenEntityIsCreated', (e, f) => {
  const abilityUnit = f.dataTypeConversion(e.eventSourceGuid, 'str')
  const locationOffsetA = f._3dVectorAddition(f.get('locationOffset'), f.get('locationOffsetDelta'))
  const locationOffsetLength = f._3dVectorModuloOperation(locationOffsetA)
  const locationOffsetScale = f.addition(locationOffsetLength, f.get('locationOffsetScaleBase'))
  const computedLocationOffset = f._3dVectorZoom(locationOffsetA, locationOffsetScale)
  const rotationOffsetA = f._3dVectorAddition(f.get('rotationOffset'), f.get('rotationOffsetDelta'))
  const computedRotationOffset = f._3dVectorCrossProduct(rotationOffsetA, computedLocationOffset)
  const shouldAttack = f.logicalOrOperation(f.get('enabled'), f.get('enabledFallback'))

  f.printString('D主图同构：入口')
  f.fork(
    () => {
      f.printString(abilityUnit)
      f.printString('D主图同构：上方执行线使用 guid 转字符串')
    },
    () => {
      f.printString(str(locationOffsetScale))
      f.printString('D主图同构：下方执行线使用数据流计算结果')
    },
    () => {
      f.printString('D主图同构：第三条观察线')
    }
  )

  f.initiateAttack(
    e.eventSourceEntity,
    999,
    1.2,
    computedLocationOffset,
    computedRotationOffset,
    abilityUnit,
    shouldAttack,
    e.eventSourceEntity
  )

  f.printString('D主图同构：汇合后的后续节点')
})
