import type { ObjectEntity, PlayerEntity } from 'genshin-ts/definitions/entity_helpers'
import { ColorBlendType, FillMaterial } from 'genshin-ts/definitions/enum'
import { g } from 'genshin-ts/runtime/core'
import { SERVER_DEFAULT_GRAPH_ID } from 'genshin-ts/runtime/graph_defaults'

// Real import/export fixture for every server node and event added in the 2026-07 update.
//
// The active code must pass ESLint and injection:
//   npm run build
//   npx eslint tests/manual_verify_2026_07_server_nodes.ts
//   npm run test:server:latest
//
// Optional negative ESLint probes are kept commented near the relevant call and at the end.
// Uncomment them only while running ESLint; their wired literal-only argument intentionally fails.

const DIRECT_CURSOR_LAYER_FILTER_ID = 10n
const HELPER_CURSOR_LAYER_FILTER_ID = 11n

g.server({
  id: SERVER_DEFAULT_GRAPH_ID,
  lang: 'en',
  mode: 'beyond'
})
  .on('whenEntityIsCreated', (_evt, f) => {
    const player = f.getSelfEntity() as unknown as PlayerEntity
    const object = f.getSelfEntity() as unknown as ObjectEntity
    const controlMotor = object
    const wiredInt = f.addition(2n, 3n)
    const wiredBool = f.equal(wiredInt, wiredInt)
    const wiredFalse = f.logicalNotOperation(wiredBool)
    const wiredFloat = f.division(3.0, 2.0)

    // ID 835: direct call, mixed literal/wired inputs, and non-first enum values.
    f.modifyModelColorAndMaterial(
      object,
      true,
      wiredBool,
      wiredInt,
      wiredFloat,
      ColorBlendType.Multiply,
      false,
      true,
      FillMaterial.Petrification
    )

    // ID 836 -> ID 835: every model output is wired back through the entity-helper form.
    const model = object.getModelColorAndMaterial()
    object.modifyModelColorAndMaterial(
      wiredBool,
      model.customColorEnabled,
      model.color,
      model.colorOpacity,
      model.colorBlendMode,
      wiredFalse,
      model.customMaterialEnabled,
      model.material
    )

    // IDs 837-841: alternate entity-helper and direct f calls.
    player.setPlayerToFollowControlMotor(controlMotor)
    f.setPlayerToLeaveControlMotor(player)
    player.setPlayerActiveControlMotors([controlMotor])

    const activeControlMotors = player.queryPlayerSCurrentActiveControlMotorList()
    const followingControlMotor = f.queryPlayerSCurrentFollowingControlMotor(player)
    f.printString(f.dataTypeConversion(f.getListLength(activeControlMotors), 'str'))
    f.printString(f.dataTypeConversion(followingControlMotor, 'str'))

    // ID 845: connect all seven outputs to consumers.
    const movement = controlMotor.queryControlMotorSCurrentMovementParameters()
    f.printString(f.dataTypeConversion(movement.forwardAcceleration, 'str'))
    f.printString(f.dataTypeConversion(movement.backwardAcceleration, 'str'))
    f.printString(f.dataTypeConversion(movement.turningRate, 'str'))
    f.printString(f.dataTypeConversion(movement.baseResistance, 'str'))
    f.printString(f.dataTypeConversion(movement.resistanceCoefficient, 'str'))
    f.printString(f.dataTypeConversion(movement.maximumForwardSpeed, 'str'))
    f.printString(f.dataTypeConversion(movement.maximumBackwardSpeed, 'str'))

    // IDs 846-849: the layer IDs stay literal while maximum target counts are wired.
    const cursorActive = player.queryWhetherPlayerSCursorIsActive()
    f.setWhetherPlayerSCursorIsPersistent(player, cursorActive)
    f.setPlayerSCursorClickSelectableTargets(player, DIRECT_CURSOR_LAYER_FILTER_ID, wiredInt)
    player.setPlayerSCursorClickSelectableTargets(HELPER_CURSOR_LAYER_FILTER_ID, f.addition(4n, 3n))
    player.setWhetherPlayerSCursorClickPenetratesUiControls(wiredFalse)

    // ID 854: public inputs map to pins 1/2/3; pin 0 remains hidden and omitted.
    object.activateDisableCursorCollisionBox(wiredInt, true)

    // ID 855: consume the query output through another node.
    f.printString(f.dataTypeConversion(f.queryWhetherPlayerIsSubscribed(player), 'str'))

    /*
    // ESLint negative probes (English direct call + entity-helper call).
    // Expected: two gsts/server-literal-arguments errors.
    const invalidWiredLayerFilterId = f.addition(40n, 2n)
    f.setPlayerSCursorClickSelectableTargets(player, invalidWiredLayerFilterId, 3n)
    player.setPlayerSCursorClickSelectableTargets(invalidWiredLayerFilterId, 3n)
    */
  })
  .on('whenPlayerSActiveControlMotorListChanges', (evt, f) => {
    // ID 842: connect all four event outputs.
    f.printString(f.dataTypeConversion(evt.eventSourceEntity, 'str'))
    f.printString(f.dataTypeConversion(evt.eventSourceGuid, 'str'))
    f.printString(f.dataTypeConversion(f.getListLength(evt.previousControlMotorEntities), 'str'))
    f.printString(
      f.dataTypeConversion(f.getListLength(evt.currentActiveControlMotorEntities), 'str')
    )
  })
  .on('whenPlayerFollowsControlMotor', (evt, f) => {
    // ID 843: connect all three event outputs.
    f.printString(f.dataTypeConversion(evt.eventSourceEntity, 'str'))
    f.printString(f.dataTypeConversion(evt.eventSourceGuid, 'str'))
    f.printString(f.dataTypeConversion(evt.followingControlMotorEntity, 'str'))
  })
  .on('whenPlayerLeavesControlMotor', (evt, f) => {
    // ID 844: connect all three event outputs.
    f.printString(f.dataTypeConversion(evt.eventSourceEntity, 'str'))
    f.printString(f.dataTypeConversion(evt.eventSourceGuid, 'str'))
    f.printString(f.dataTypeConversion(evt.leftControlMotorEntity, 'str'))
  })

g.server({
  id: SERVER_DEFAULT_GRAPH_ID + 1,
  lang: 'en',
  mode: 'beyond'
}).on('whenEntityIsCreated', (_evt, f) => {
  const player = f.getSelfEntity() as unknown as PlayerEntity
  const object = f.getSelfEntity() as unknown as ObjectEntity
  const wiredInt = f.addition(6n, 7n)
  const wiredBool = f.equal(wiredInt, wiredInt)
  const wiredFloat = f.division(7.0, 4.0)

  // Dual-mode IDs 835/836: non-first enums plus mixed literal/wired parameters.
  f.modifyModelColorAndMaterial(
    object,
    true,
    wiredBool,
    wiredInt,
    wiredFloat,
    ColorBlendType.Multiply,
    false,
    true,
    FillMaterial.Petrification
  )
  const model = object.getModelColorAndMaterial()
  object.modifyModelColorAndMaterial(
    wiredBool,
    model.customColorEnabled,
    model.color,
    model.colorOpacity,
    model.colorBlendMode,
    false,
    model.customMaterialEnabled,
    model.material
  )

  // Dual-mode ID 855.
  f.printString(f.dataTypeConversion(player.queryWhetherPlayerIsSubscribed(), 'str'))
})

/*
// ESLint negative probe for the Chinese alias path.
// Expected: one Chinese gsts/server-literal-arguments error.
g.server({
  id: SERVER_DEFAULT_GRAPH_ID + 2,
  lang: 'zh',
  mode: 'beyond'
}).on('实体创建时', (_evt, f) => {
  const player = f.获取自身实体() as unknown as PlayerEntity
  const invalidWiredLayerFilterId = f.加法运算(50n, 2n)
  f.设置玩家光标点击可选取目标(player, invalidWiredLayerFilterId, 3n)
})
*/
