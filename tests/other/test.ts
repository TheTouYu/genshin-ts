import { SortBy } from 'genshin-ts/definitions/enum'
import { g } from 'genshin-ts/runtime/core'

g.server({ id: 1073741913 })
  .on('whenEntityIsCreated', (evt, f) => {
    f.printString('WhenNodeGraphVariableChanges fired')

    const ret = f.queryCharacterSCurrentMovementSpd(f.queryEntityByGuid(evt.eventSourceGuid))
    f.create3dVector(
      ret.currentSpeed,
      ret.currentSpeed,
      f.split3dVector(ret.velocityVector).zComponent
    )
    const dotP = f._3dVectorDotProduct(ret.velocityVector, ret.velocityVector)
    // f.logarithmOperation(dotP, ret.currentSpeed)
    const l = f.assemblyList([1, 2, 3])
    f.getLocalVariable([1, 2, 3])
    f.listSorting(l, SortBy.Descending)
    const d = f.assemblyDictionary([{ k: 1, v: 'test' }])
    void f.getListOfKeysFromDictionary(d)
    void f.createDictionary(f.assemblyList([1, 2, 3], 'int'), f.assemblyList([4, 5, 6], 'float'))
    f.mountLoopingSpecialEffect(
      124,
      f.queryEntityByGuid(evt.eventSourceGuid),
      'root',
      false,
      false,
      [2, 3, 4],
      f.create3dVector(0, 0, 0),
      f.logarithmOperation(dotP, ret.currentSpeed),
      false
    )
    f.removeEntity(f.queryEntityByGuid(4343242))
  })
  .on('whenEntityIsCreated', (evt, f) => {
    f.printString('WhenNodeGraphVariableChanges fired')

    const ret = f.queryCharacterSCurrentMovementSpd(f.queryEntityByGuid(evt.eventSourceGuid))
    f.create3dVector(
      ret.currentSpeed,
      ret.currentSpeed,
      f.split3dVector(ret.velocityVector).zComponent
    )
    const dotP = f._3dVectorDotProduct(ret.velocityVector, ret.velocityVector)
    // f.logarithmOperation(dotP, ret.currentSpeed)
    f.mountLoopingSpecialEffect(
      124343,
      f.queryEntityByGuid(evt.eventSourceGuid),
      'ggg',
      true,
      true,
      f.create3dVector(0, 0, 0),
      f.create3dVector(0, 0, 0),
      f.logarithmOperation(dotP, ret.currentSpeed),
      false
    )
    f.removeEntity(f.queryEntityByGuid(4343242))
    f.teleportPlayer(f.queryEntityByGuid(evt.eventSourceGuid), [1, 2, 3], [2, 3, 4])
    f.initiateAttack(
      f.queryEntityByGuid(evt.eventSourceGuid),
      1,
      2,
      [1, 2, 3],
      [2, 3, 4],
      'attack',
      false,
      f.queryEntityByGuid(evt.eventSourceGuid)
    )
    f.setEnvironmentTimePassageSpeed(5)
    f.modifyEnvironmentSettings(
      0,
      f.assemblyList([f.queryEntityByGuid(evt.eventSourceGuid)]),
      true,
      0
    )
    f.addUniformBasicLinearMotionDevice(
      f.queryEntityByGuid(evt.eventSourceGuid),
      'test',
      7,
      [45431, 4352, 3]
    )
    void f.addition(1, 2)
  })
