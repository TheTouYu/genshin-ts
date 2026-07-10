// Round 15 layout robustness coverage.
// Purpose: keep the R6-D data/control-lane fix from overfitting one screenshot.
// Shape:
// - a composite impl with multiple root control lanes;
// - data chains at different X/Y regions;
// - lower control lanes should avoid nearby data blocks without pushing unrelated root lanes
//   back to the Round 14 bottom-heavy regression.

import { g } from 'genshin-ts/runtime/core'
import { str as strValue } from 'genshin-ts/runtime/value'

const laneStress = g.defineComposite('R6-E控制流覆盖-数据区避让', {
  inputs: {
    eventSourceGuid: { type: 'guid' },
    locationOffset: { type: 'vec3' },
    locationOffsetDelta: { type: 'vec3' },
    rotationOffset: { type: 'vec3' },
    rotationOffsetDelta: { type: 'vec3' },
    scaleBase: { type: 'float' },
    enabled: { type: 'bool' },
    fallback: { type: 'bool' }
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
    const locationA = f._3dVectorAddition(args.locationOffset, args.locationOffsetDelta)
    const locationLen = f._3dVectorModuloOperation(locationA)
    const locationScale = f.addition(locationLen, args.scaleBase)
    const computedLocationOffset = f._3dVectorZoom(locationA, locationScale)
    const rotationA = f._3dVectorAddition(args.rotationOffset, args.rotationOffsetDelta)
    const computedRotationOffset = f._3dVectorCrossProduct(rotationA, computedLocationOffset)
    const shouldAttack = f.logicalOrOperation(args.enabled, args.fallback)

    f.printString('E复合内部：入口')
    f.fork(
      () => {
        f.printString(abilityUnit)
        f.printString('E复合内部：第一条控制线')
      },
      () => {
        f.printString(str(locationScale))
        f.printString('E复合内部：第二条控制线靠近 float 数据链')
      },
      () => {
        f.printString(str(shouldAttack))
        f.printString('E复合内部：第三条控制线靠近 bool 数据链')
      },
      () => {
        f.printString('E复合内部：第四条纯控制线')
      }
    )

    const done = f.registerExecNode('print_string', [new strValue('E复合内部：汇合后的后续节点')])
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
  name: 'R6-E控制流覆盖-physics-R8-step3-exec-lanes60pct',
  id: 1073741903,
  variables: {
    locationOffset: vec3([1, 2, 3]),
    locationOffsetDelta: vec3([0, 0, 0]),
    rotationOffset: vec3([2, 3, 4]),
    rotationOffsetDelta: vec3([0.5, 0.5, 0.5]),
    scaleBase: 1,
    enabled: false,
    fallback: true
  }
}).on('whenEntityIsCreated', (e, f) => {
  f.printString('E主图：开始')

  const result = f.callComposite(laneStress, {
    eventSourceGuid: e.eventSourceGuid,
    locationOffset: f.get('locationOffset'),
    locationOffsetDelta: f.get('locationOffsetDelta'),
    rotationOffset: f.get('rotationOffset'),
    rotationOffsetDelta: f.get('rotationOffsetDelta'),
    scaleBase: f.get('scaleBase'),
    enabled: f.get('enabled'),
    fallback: f.get('fallback')
  })

  f.initiateAttack(
    e.eventSourceEntity,
    999,
    1.2,
    result.computedLocationOffset,
    result.computedRotationOffset,
    result.abilityUnit,
    result.shouldAttack,
    e.eventSourceEntity
  )

  f.printString('E主图：结束')
})
