// Scenario D from layout round 6: complex flow summarized as composite nodes.
// The composite impl intentionally contains both exec flow and data flow, with nested forks,
// so game-side validation can inspect the main graph and the composite window.

import { g } from 'genshin-ts/runtime/core'
import { str as strValue } from 'genshin-ts/runtime/value'

const complexStep = g.defineComposite('R6-D复杂流程摘要节点', {
  inputs: {
    eventSourceGuid: { type: 'guid' },
    locationOffset: { type: 'vec3' },
    locationOffsetDelta: { type: 'vec3' },
    rotationOffset: { type: 'vec3' },
    rotationOffsetDelta: { type: 'vec3' },
    locationOffsetScaleBase: { type: 'float' },
    enabled: { type: 'bool' },
    enabledFallback: { type: 'bool' }
  },
  outputs: {
    abilityUnit: { type: 'str' },
    computedLocationOffset: { type: 'vec3' },
    computedRotationOffset: { type: 'vec3' },
    shouldAttack: { type: 'bool' }
  },
  outflows: [{ name: '完成' }],
  build(args, f) {
    const abilityUnit = f.dataTypeConversion(args.eventSourceGuid, 'str')
    const locationOffsetA = f._3dVectorAddition(args.locationOffset, args.locationOffsetDelta)
    const locationOffsetLength = f._3dVectorModuloOperation(locationOffsetA)
    const locationOffsetScale = f.addition(locationOffsetLength, args.locationOffsetScaleBase)
    const computedLocationOffset = f._3dVectorZoom(locationOffsetA, locationOffsetScale)
    const rotationOffsetA = f._3dVectorAddition(args.rotationOffset, args.rotationOffsetDelta)
    const computedRotationOffset = f._3dVectorCrossProduct(rotationOffsetA, computedLocationOffset)
    const shouldAttack = f.logicalOrOperation(args.enabled, args.enabledFallback)

    f.printString('D复合内部：入口')
    f.fork(
      () => {
        f.printString(abilityUnit)
        f.printString('D复合内部：上方执行线使用 guid 转字符串')
      },
      () => {
        f.printString(str(locationOffsetScale))
        f.printString('D复合内部：下方执行线使用数据流计算结果')
      },
      () => {
        f.printString('D复合内部：第三条观察线')
      }
    )
    const done = f.registerExecNode('print_string', [new strValue('D复合内部：汇合后的后续节点')])
    f.outflow('完成', done, 0)

    return {
      abilityUnit,
      computedLocationOffset,
      computedRotationOffset,
      shouldAttack
    }
  }
})

g.server({
  name: 'R6-D复合摘要-physics-R8-step3-exec-lanes60pct',
  id: 1073741901,
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
  f.printString('D主图：开始')

  const first = f.callComposite(complexStep, {
    eventSourceGuid: e.eventSourceGuid,
    locationOffset: f.get('locationOffset'),
    locationOffsetDelta: f.get('locationOffsetDelta'),
    rotationOffset: f.get('rotationOffset'),
    rotationOffsetDelta: f.get('rotationOffsetDelta'),
    locationOffsetScaleBase: f.get('locationOffsetScaleBase'),
    enabled: f.get('enabled'),
    enabledFallback: f.get('enabledFallback')
  })

  f.printString(first.abilityUnit)

  const second = f.callComposite(complexStep, {
    eventSourceGuid: e.eventSourceGuid,
    locationOffset: first.computedLocationOffset,
    locationOffsetDelta: f.get('locationOffsetDelta'),
    rotationOffset: first.computedRotationOffset,
    rotationOffsetDelta: f.get('rotationOffsetDelta'),
    locationOffsetScaleBase: f.get('locationOffsetScaleBase'),
    enabled: first.shouldAttack,
    enabledFallback: f.get('enabledFallback')
  })

  f.initiateAttack(
    e.eventSourceEntity,
    999,
    1.2,
    second.computedLocationOffset,
    second.computedRotationOffset,
    second.abilityUnit,
    second.shouldAttack,
    e.eventSourceEntity
  )

  f.printString('D主图：结束')
})
