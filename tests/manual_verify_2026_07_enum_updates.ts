import * as CE from 'genshin-ts/definitions/client_enums'
import type {
  ClientCharacterSkillExecutionFlowFunctions,
  ClientCreationStatusExecutionFlowFunctions
} from 'genshin-ts/definitions/client_nodes'
import type {
  CharacterEntity,
  CreationEntity,
  ObjectEntity,
  PlayerEntity
} from 'genshin-ts/definitions/entity_helpers'
import {
  CauseOfBeingDown,
  CharacterSkillSlot,
  ClassSwitchSkillHandling,
  ColorBlendType,
  ColorOverlayType,
  CoordinateSystemType,
  DisruptorDeviceType,
  DisruptorDeviceTypes,
  ElementalReactionType,
  EntityType,
  FillMaterial,
  FixedPointMotionDeviceMotionType,
  FixedPointMotionDeviceParameterConversionType,
  FollowCoordinateSystem,
  FollowLocationType,
  GameplayMode,
  InputDeviceType,
  InterruptStatus,
  MathematicalOperator,
  OriginalSlotSkillHandling,
  RandomOrder,
  RankSettlementStatus,
  ReasonForItemChange,
  RemovalMethod,
  RoundingMode,
  ScanScoringRules,
  SettlementStatus,
  TargetType,
  TopOfStackSkillDestructionType,
  TypeConversion,
  UnitStatusAdditionResult,
  UnitStatusRemovalReason,
  UnitStatusRemovalStrategy
} from 'genshin-ts/definitions/enum'
import { g } from 'genshin-ts/runtime/core'
import { CLIENT_DEFAULT_GRAPH_ID, SERVER_DEFAULT_GRAPH_ID } from 'genshin-ts/runtime/graph_defaults'

// Temporary real import fixture for the 2026-07 enum updates.
//
// Build only:
//   npm run build
//   node ./bin/gsts.mjs tests/manual_verify_2026_07_enum_updates.ts -c ./gsts.test.config.ts --noinject
//
// Inject into the map configured by gsts.test.config.ts:
//   node ./bin/gsts.mjs tests/manual_verify_2026_07_enum_updates.ts -c ./gsts.test.config.ts
//
// Graph IDs:
//   SERVER_DEFAULT_GRAPH_ID      ServerEnumUpdateProbe
//   CLIENT_DEFAULT_GRAPH_ID      ClientEnumUpdateCharacterProbe
//   CLIENT_DEFAULT_GRAPH_ID + 1  ClientEnumUpdateCreationStatusProbe

type ClientElementalReaction =
  | ElementalReactionType
  | import('genshin-ts/definitions/enum').ClientElementalReactionType

const CLIENT_ELEMENTAL_REACTION_CHECKS = [
  // Shared values added in 5a6fffd: all five appear in both client graph families.
  [ElementalReactionType.Shatter, ElementalReactionType.LunarCharged],
  [ElementalReactionType.LunarBloom, ElementalReactionType.LunarCrystallize],
  [ElementalReactionType.StellarConduct, ElementalReactionType.Shatter],

  // Client editor aliases: every pair should point to the same enum value.
  [ElementalReactionType.Explode, ElementalReactionType.Overloaded],
  [ElementalReactionType.Stream, ElementalReactionType.Vaporize],
  [ElementalReactionType.Overgrow, ElementalReactionType.Bloom],
  [ElementalReactionType.Freeze, ElementalReactionType.Frozen],
  [ElementalReactionType.Shock, ElementalReactionType.ElectroCharged],
  [ElementalReactionType.Superconductor, ElementalReactionType.Superconduct],
  [ElementalReactionType.SwirlFire, ElementalReactionType.SwirlPyro],
  [ElementalReactionType.SwirlWater, ElementalReactionType.SwirlHydro],
  [ElementalReactionType.SwirlElectric, ElementalReactionType.SwirlElectro],
  [ElementalReactionType.SwirlIce, ElementalReactionType.SwirlCryo],
  [ElementalReactionType.CrystallizeFire, ElementalReactionType.CrystallizePyro],
  [ElementalReactionType.CrystallizeWater, ElementalReactionType.CrystallizeHydro],
  [ElementalReactionType.CrystallizeElectric, ElementalReactionType.CrystallizeElectro],
  [ElementalReactionType.CrystallizeIce, ElementalReactionType.CrystallizeCryo],
  [ElementalReactionType.FrozenBroken, ElementalReactionType.Shatter],
  [ElementalReactionType.Overdose, ElementalReactionType.Catalyze],
  [ElementalReactionType.OverdoseElectric, ElementalReactionType.Aggravate],
  [ElementalReactionType.OverdoseGrass, ElementalReactionType.Spread],
  [ElementalReactionType.OvergrowMushroomFire, ElementalReactionType.Burgeon],
  [ElementalReactionType.OvergrowMushroomElectric, ElementalReactionType.Hyperbloom],

  // Client-only editor values: all 16 values appear on a real enum-match input.
  [ElementalReactionType.Burned, ElementalReactionType.AntiFire],
  [ElementalReactionType.Rock, ElementalReactionType.SlowDown],
  [ElementalReactionType.Wind, ElementalReactionType.Electric],
  [ElementalReactionType.Fire, ElementalReactionType.SwirlFireAccu],
  [ElementalReactionType.SwirlWaterAccu, ElementalReactionType.SwirlElectricAccu],
  [ElementalReactionType.SwirlIceAccu, ElementalReactionType.StickRock],
  [ElementalReactionType.StickWater, ElementalReactionType.StickGrass],
  [
    ElementalReactionType.PhlogistonSolidification,
    ElementalReactionType.PhlogistonSolidificationEnd
  ],

  // Shared/client cross-brand input on the same official ElementalReactionType row.
  [ElementalReactionType.LunarBloom, ElementalReactionType.PhlogistonSolidification]
] as const satisfies ReadonlyArray<readonly [ClientElementalReaction, ClientElementalReaction]>

type CharacterReactionFunctions = Pick<
  ClientCharacterSkillExecutionFlowFunctions<'beyond'>,
  'enumerationMatch' | 'removeSpecifiedCharacterDisruptorDevice' | 'sendSignalToServerNodeGraph'
>

type CreationStatusReactionFunctions = Pick<
  ClientCreationStatusExecutionFlowFunctions<'beyond'>,
  'enumerationMatch' | 'executeSkill'
>

function emitCharacterReactionChecks(f: CharacterReactionFunctions) {
  f.removeSpecifiedCharacterDisruptorDevice(DisruptorDeviceTypes.TractorDevice)

  for (const [enumeration1, enumeration2] of CLIENT_ELEMENTAL_REACTION_CHECKS) {
    const result = f.enumerationMatch(enumeration1, enumeration2)
    f.sendSignalToServerNodeGraph('gsts_enum_probe', result)
  }

  const checks = [
    // MathematicalOperator was split into the basic and quick editor rows.
    f.enumerationMatch(MathematicalOperator.Addition, MathematicalOperator.Subtraction),
    f.enumerationMatch(MathematicalOperator.Multiplication, MathematicalOperator.Division),
    f.enumerationMatch(MathematicalOperator.ModuloOperation, MathematicalOperator.Exponentiation),
    f.enumerationMatch(MathematicalOperator.GetMaximumValue, MathematicalOperator.GetMinimumValue),
    f.enumerationMatch(MathematicalOperator.Logarithm, MathematicalOperator.ModuloOperation),

    // The client row accepts three rounding values; Truncate remains server-only.
    f.enumerationMatch(RoundingMode.RoundToNearest, RoundingMode.RoundUp),
    f.enumerationMatch(RoundingMode.RoundDown, RoundingMode.RoundToNearest),

    // Failure and success results are two separate client rows.
    f.enumerationMatch(
      UnitStatusAdditionResult.FailedUnexpectedError,
      UnitStatusAdditionResult.FailedOperationPausedForAnotherProcess
    ),
    f.enumerationMatch(
      UnitStatusAdditionResult.FailedMaximumCoexistenceLimitReached,
      UnitStatusAdditionResult.FailedUnableToAddAdditionalStack
    ),
    f.enumerationMatch(
      UnitStatusAdditionResult.SuccessNewStatusApplied,
      UnitStatusAdditionResult.SuccessSlotStacking
    ),
    f.enumerationMatch(
      UnitStatusRemovalReason.AffixExpired,
      UnitStatusRemovalReason.ShieldDepletedToZero
    ),

    // Full conversion row 7 and every value of the new row 34 type.
    f.enumerationMatch(TypeConversion.FactionToString, TypeConversion.FloatingPointToString),
    f.enumerationMatch(
      CE.TypeConversionSame.IntegerToBoolean,
      CE.TypeConversionSame.IntegerToFloatingPoint
    ),
    f.enumerationMatch(CE.TypeConversionSame.IntegerToString, CE.TypeConversionSame.EntityToString),
    f.enumerationMatch(CE.TypeConversionSame.GuidToString, CE.TypeConversionSame.BooleanToInteger),
    f.enumerationMatch(
      CE.TypeConversionSame.BooleanToString,
      CE.TypeConversionSame.FloatingPointToInteger
    ),
    f.enumerationMatch(
      CE.TypeConversionSame.FloatingPointToString,
      CE.TypeConversionSame.Vector3ToString
    ),

    // Full target row 24 and every value of the new camera-target row 39 type.
    f.enumerationMatch(TargetType.AlliedFactionSelfIncluded, TargetType.Self),
    f.enumerationMatch(
      CE.TargetTypeForCameraOrientationNode.None,
      CE.TargetTypeForCameraOrientationNode.AlliedFaction
    ),
    f.enumerationMatch(
      CE.TargetTypeForCameraOrientationNode.HostileFaction,
      CE.TargetTypeForCameraOrientationNode.OwnFaction
    ),
    f.enumerationMatch(
      CE.TargetTypeForCameraOrientationNode.AllExceptSelf,
      CE.TargetTypeForCameraOrientationNode.HostileFaction
    ),

    // Skill-family-specific row 42.
    f.enumerationMatch(CE.PreAimingEndReason.Completed, CE.PreAimingEndReason.Cancelled)
  ] as const

  for (const result of checks) {
    f.sendSignalToServerNodeGraph('gsts_enum_probe', result)
  }
}

function emitCreationStatusReactionChecks(f: CreationStatusReactionFunctions) {
  for (const [enumeration1, enumeration2] of CLIENT_ELEMENTAL_REACTION_CHECKS) {
    const result = f.enumerationMatch(enumeration1, enumeration2)
    f.executeSkill(result, 2n)
  }

  const checks = [
    f.enumerationMatch(MathematicalOperator.Addition, MathematicalOperator.Subtraction),
    f.enumerationMatch(MathematicalOperator.Multiplication, MathematicalOperator.Division),
    f.enumerationMatch(MathematicalOperator.ModuloOperation, MathematicalOperator.Exponentiation),
    f.enumerationMatch(MathematicalOperator.GetMaximumValue, MathematicalOperator.GetMinimumValue),
    f.enumerationMatch(MathematicalOperator.Logarithm, MathematicalOperator.ModuloOperation),
    f.enumerationMatch(RoundingMode.RoundToNearest, RoundingMode.RoundUp),
    f.enumerationMatch(RoundingMode.RoundDown, RoundingMode.RoundToNearest),
    f.enumerationMatch(
      UnitStatusAdditionResult.FailedUnexpectedError,
      UnitStatusAdditionResult.FailedOperationPausedForAnotherProcess
    ),
    f.enumerationMatch(
      UnitStatusAdditionResult.FailedMaximumCoexistenceLimitReached,
      UnitStatusAdditionResult.FailedUnableToAddAdditionalStack
    ),
    f.enumerationMatch(
      UnitStatusAdditionResult.SuccessNewStatusApplied,
      UnitStatusAdditionResult.SuccessSlotStacking
    ),
    f.enumerationMatch(
      UnitStatusRemovalReason.AffixExpired,
      UnitStatusRemovalReason.ShieldDepletedToZero
    ),
    f.enumerationMatch(TypeConversion.FactionToString, TypeConversion.FloatingPointToString),
    f.enumerationMatch(
      CE.TypeConversionSame.IntegerToBoolean,
      CE.TypeConversionSame.IntegerToFloatingPoint
    ),
    f.enumerationMatch(CE.TypeConversionSame.IntegerToString, CE.TypeConversionSame.EntityToString),
    f.enumerationMatch(CE.TypeConversionSame.GuidToString, CE.TypeConversionSame.BooleanToInteger),
    f.enumerationMatch(
      CE.TypeConversionSame.BooleanToString,
      CE.TypeConversionSame.FloatingPointToString
    ),
    f.enumerationMatch(
      CE.TypeConversionSame.Vector3ToString,
      CE.TypeConversionSame.IntegerToBoolean
    ),
    f.enumerationMatch(TargetType.AlliedFactionSelfIncluded, TargetType.Self),
    f.enumerationMatch(
      CE.TargetTypeForCameraOrientationNode.None,
      CE.TargetTypeForCameraOrientationNode.AlliedFaction
    ),
    f.enumerationMatch(
      CE.TargetTypeForCameraOrientationNode.HostileFaction,
      CE.TargetTypeForCameraOrientationNode.OwnFaction
    ),
    f.enumerationMatch(
      CE.TargetTypeForCameraOrientationNode.AllExceptSelf,
      CE.TargetTypeForCameraOrientationNode.HostileFaction
    ),
    // Status-family-specific row 42.
    f.enumerationMatch(CE.TacticType.GroundPursuit, CE.TacticType.GroundEscape)
  ]

  for (const result of checks) {
    f.executeSkill(result, 2n)
  }
}

g.server({
  id: SERVER_DEFAULT_GRAPH_ID,
  lang: 'en',
  mode: 'beyond'
})
  .on('whenEntityIsCreated', (_evt, f) => {
    const self = f.getSelfEntity()
    const character = self as unknown as CharacterEntity
    const creation = self as unknown as CreationEntity
    const object = self as unknown as ObjectEntity
    const player = self as unknown as PlayerEntity
    const wiredInt = f.addition(5n, 7n)
    const wiredBool = f.equal(wiredInt, 12n)
    const wiredFloat = f.division(3.0, 4.0)
    const rounded = f.roundToIntegerOperation(wiredFloat, RoundingMode.RoundDown)
    const statusParameters = f.createDictionary(['gsts_enum_probe'], [wiredFloat])
    const addedStatus = f.addUnitStatus(self, self, configId(700004n), 2n, statusParameters)
    const colorBlendOperator = ColorBlendType.Override === ColorBlendType.Multiply
    const fillMaterialOperator = FillMaterial.Freeze === FillMaterial.Petrification
    const splitMathematicalOperator =
      MathematicalOperator.Addition === MathematicalOperator.Logarithm
    const splitRoundingMode = RoundingMode.RoundUp === RoundingMode.Truncate
    const splitUnitStatusAdditionResult =
      UnitStatusAdditionResult.FailedUnexpectedError ===
      UnitStatusAdditionResult.SuccessNewStatusApplied

    // Type-name aliases used by their real consuming nodes, with non-first enum values.
    f.activateFixedPointMotionDevice(
      object,
      'gsts_enum_alias_probe',
      FixedPointMotionDeviceMotionType.UniformLinearMotion,
      wiredFloat,
      [1, 2, 3],
      [10, 20, 30],
      wiredBool,
      FixedPointMotionDeviceParameterConversionType.FixedTime,
      wiredFloat
    )
    f.switchFollowMotionDeviceTargetByEntity(
      object,
      character,
      '',
      [1, 0, 0],
      [0, 90, 0],
      CoordinateSystemType.WorldCoordinateSystem,
      FollowLocationType.FollowRotation
    )
    f.switchFollowMotionDeviceTargetByGuid(
      object,
      guid(700008n),
      '',
      [0, 1, 0],
      [0, 0, 90],
      CoordinateSystemType.WorldCoordinateSystem,
      FollowLocationType.FollowLocation
    )

    // Value aliases used by the actual skill/class nodes.
    const switchedSkill1 = f.addCharacterSkill(
      character,
      configId(700001n),
      CharacterSkillSlot.SprintSkill,
      TopOfStackSkillDestructionType.PreserveSlotBinding
    )
    const switchedSkill2 = f.addCharacterSkill(
      character,
      configId(700002n),
      CharacterSkillSlot.Skill3R,
      OriginalSlotSkillHandling.RemoveSlotBinding
    )
    const originalBoundSkill = f.bindCustomSkillInstanceToSpecifiedSlot(
      character,
      switchedSkill1,
      CharacterSkillSlot.CustomSkillSlot2,
      TopOfStackSkillDestructionType.RemoveSlotBinding
    )
    f.changePlayerClass(player, configId(700003n), ClassSwitchSkillHandling.PreserveUnrelatedSkills)
    f.setScanTagRules(self, ScanScoringRules.PrioritizeDistance)
    // Random Order currently has only one official value; cover both new and legacy calls.
    f.randomDeckSelectorSelectionList([wiredInt, 13n, 21n], RandomOrder.Random)
    f.randomDeckSelectorSelectionList([34n, 55n])
    f.setPlayerRankScoreChange(player, RankSettlementStatus.Escape, 17n)
    f.setPlayerRankScoreChange(player, SettlementStatus.Failed, -3n)
    const escapeScore = f.getPlayerRankScoreChange(player, RankSettlementStatus.Escape)
    const legacyVictoryScore = f.getPlayerRankScoreChange(player, SettlementStatus.Victory)
    f.printString(f.dataTypeConversion(switchedSkill1, 'str'))
    f.printString(f.dataTypeConversion(switchedSkill2, 'str'))
    f.printString(f.dataTypeConversion(originalBoundSkill, 'str'))
    f.printString(f.dataTypeConversion(escapeScore, 'str'))
    f.printString(f.dataTypeConversion(legacyVictoryScore, 'str'))

    // Official five-input Remove Unit Status calls, including the entity helper.
    f.removeUnitStatus(
      self,
      configId(700005n),
      UnitStatusRemovalStrategy.StatusWithFastestStackLoss,
      UnitStatusRemovalReason.ShieldDepletedToZero,
      self
    )
    self.removeUnitStatus(
      configId(700006n),
      UnitStatusRemovalStrategy.StatusWithFastestStackLoss,
      UnitStatusRemovalReason.AffixExpired,
      self
    )

    // Model enum literals plus query-output/literal mixed wiring.
    f.modifyModelColorAndMaterial(
      object,
      true,
      wiredBool,
      wiredInt,
      wiredFloat,
      ColorBlendType.Override,
      false,
      true,
      FillMaterial.Petrification
    )
    const model = f.getModelColorAndMaterial(object)
    const characterAttribute = f.getCharacterAttribute(character)
    const creationAttribute = f.getCreationAttribute(creation)
    const entityType = f.getEntityType(self)
    const gameMode = f.queryGameModeAndPlayerNumber()
    const inputDeviceType = f.getPlayerClientInputDeviceType(player)
    const playerSettlementStatus = f.getPlayerSettlementSuccessStatus(player)
    const factionSettlementStatus = f.getFactionSettlementSuccessStatus(f.queryEntityFaction(self))
    // Legacy shared status output wired into rank IOC 34 inputs; verifies compatibility wiring.
    f.setPlayerRankScoreChange(player, playerSettlementStatus, 5n)
    const wiredLegacyRankScore = f.getPlayerRankScoreChange(player, playerSettlementStatus)
    f.printString(f.dataTypeConversion(wiredLegacyRankScore, 'str'))

    const checks = [
      // Server enum operators remain valid across client-only row subdivisions.
      colorBlendOperator,
      fillMaterialOperator,
      splitMathematicalOperator,
      splitRoundingMode,
      splitUnitStatusAdditionResult,
      f.enumerationsEqual(MathematicalOperator.Addition, MathematicalOperator.Subtraction),
      f.enumerationsEqual(MathematicalOperator.Multiplication, MathematicalOperator.Division),
      f.enumerationsEqual(
        MathematicalOperator.ModuloOperation,
        MathematicalOperator.Exponentiation
      ),
      f.enumerationsEqual(
        MathematicalOperator.GetMaximumValue,
        MathematicalOperator.GetMinimumValue
      ),
      f.enumerationsEqual(MathematicalOperator.Logarithm, MathematicalOperator.ModuloOperation),
      f.enumerationsEqual(RoundingMode.RoundToNearest, RoundingMode.RoundUp),
      f.enumerationsEqual(RoundingMode.RoundDown, RoundingMode.Truncate),
      f.equal(rounded, 0n),
      f.enumerationsEqual(
        UnitStatusAdditionResult.FailedUnexpectedError,
        UnitStatusAdditionResult.FailedOperationPausedForAnotherProcess
      ),
      f.enumerationsEqual(
        UnitStatusAdditionResult.FailedMaximumCoexistenceLimitReached,
        UnitStatusAdditionResult.FailedUnableToAddAdditionalStack
      ),
      f.enumerationsEqual(
        UnitStatusAdditionResult.SuccessNewStatusApplied,
        UnitStatusAdditionResult.SuccessSlotStacking
      ),
      f.enumerationsEqual(
        addedStatus.applicationResult,
        UnitStatusAdditionResult.SuccessSlotStacking
      ),
      f.enumerationsEqual(
        RemovalMethod.AllCoexistingStatusesWithTheSameName,
        UnitStatusRemovalStrategy.StatusWithFastestStackLoss
      ),

      // Type aliases with different non-first values.
      f.enumerationsEqual(DisruptorDeviceTypes.TractorDevice, DisruptorDeviceType.Ejector),
      f.enumerationsEqual(
        FollowCoordinateSystem.WorldCoordinateSystem,
        CoordinateSystemType.LocalCoordinateSystem
      ),

      // Every non-elemental value alias added in this update.
      f.enumerationsEqual(ColorBlendType.Override, ColorOverlayType.Overwrite),
      f.enumerationsEqual(FillMaterial.Freeze, FillMaterial.Frozen),
      f.enumerationsEqual(FillMaterial.Petrification, FillMaterial.Petrified),
      f.enumerationsEqual(
        FollowCoordinateSystem.LocalCoordinateSystem,
        CoordinateSystemType.RelativeCoordinateSystem
      ),
      f.enumerationsEqual(CharacterSkillSlot.SprintSkill, CharacterSkillSlot.DashSkill),
      f.enumerationsEqual(
        InterruptStatus.InterruptVulnerableState,
        InterruptStatus.InterruptVulnerabilityStatus
      ),
      f.enumerationsEqual(GameplayMode.TestPlay, GameplayMode.Play),
      f.enumerationsEqual(ReasonForItemChange.Default, ReasonForItemChange.Destroy),
      f.enumerationsEqual(
        UnitStatusRemovalReason.AffixExpired,
        UnitStatusRemovalReason.ShieldDepletedToZero
      ),
      f.enumerationsEqual(ElementalReactionType.Shatter, ElementalReactionType.LunarCharged),
      f.enumerationsEqual(ElementalReactionType.LunarBloom, ElementalReactionType.LunarCrystallize),
      f.enumerationsEqual(ElementalReactionType.StellarConduct, ElementalReactionType.Shatter),

      // Real enum output + literal mixed inputs.
      f.enumerationsEqual(model.colorBlendMode, ColorOverlayType.Multiply),
      f.enumerationsEqual(model.material, FillMaterial.Petrification),
      f.enumerationsEqual(
        characterAttribute.currentInterruptStatus,
        InterruptStatus.InterruptVulnerableState
      ),
      f.enumerationsEqual(
        creationAttribute.currentInterruptStatus,
        InterruptStatus.InterruptVulnerableState
      ),
      f.enumerationsEqual(entityType, EntityType.Creation),
      f.enumerationsEqual(gameMode.playMode, GameplayMode.TestPlay),
      f.enumerationsEqual(inputDeviceType, InputDeviceType.Touchscreen),
      f.enumerationsEqual(playerSettlementStatus, SettlementStatus.Failed),
      f.enumerationsEqual(factionSettlementStatus, SettlementStatus.Victory)
    ]

    for (const check of checks) {
      f.printString(f.dataTypeConversion(check, 'str'))
    }
  })
  .on('whenElementalReactionEventOccurs', (evt, f) => {
    // Server-only mixed form: the event output is wired to a non-first shared value.
    const isLunarBloom = f.enumerationsEqual(
      evt.elementalReactionType,
      ElementalReactionType.LunarBloom
    )
    f.printString(f.dataTypeConversion(isLunarBloom, 'str'))
  })
  .on('whenUnitStatusEnds', (evt, f) => {
    // Real output-to-input wiring for the newly exposed Removal Reason pin.
    f.removeUnitStatus(
      evt.eventSourceEntity,
      evt.unitStatusConfigId,
      UnitStatusRemovalStrategy.StatusWithFastestStackLoss,
      evt.removalReason,
      evt.removerEntity
    )
    const isAffixExpired = f.enumerationsEqual(
      evt.removalReason,
      UnitStatusRemovalReason.AffixExpired
    )
    f.printString(f.dataTypeConversion(isAffixExpired, 'str'))
  })
  .on('whenTheQuantityOfInventoryItemChanges', (evt, f) => {
    const isDestroyed = f.enumerationsEqual(evt.reasonForChange, ReasonForItemChange.Destroy)
    f.printString(f.dataTypeConversion(isDestroyed, 'str'))
  })
  .on('whenAllPlayerSCharactersAreDown', (evt, f) => {
    const isAbnormalDefeat = f.enumerationsEqual(evt.reason, CauseOfBeingDown.AbnormalDefeat)
    f.printString(f.dataTypeConversion(isAbnormalDefeat, 'str'))
  })

g.characterSkill({
  id: CLIENT_DEFAULT_GRAPH_ID,
  name: 'ClientEnumUpdateCharacterProbe',
  prefix: true,
  mode: 'beyond'
}).on('start', (_evt, f) => {
  emitCharacterReactionChecks(f)

  // Related real consumer: literal-only target enum plus wired output consumption.
  const camera = f.cameraOrientationDetectionData(
    CE.TargetTypeForCameraOrientationNode.AllExceptSelf,
    [0, 1, 0],
    1.5,
    80.25
  )
  f.sendSignalToServerNodeGraph('gsts_enum_probe', f.equal(camera.targetLocation, [0, 0, 0]))
})

g.creationStatus({
  id: CLIENT_DEFAULT_GRAPH_ID + 1,
  name: 'ClientEnumUpdateCreationStatusProbe',
  prefix: true,
  mode: 'beyond'
}).on('start1', (_evt, f) => {
  emitCreationStatusReactionChecks(f)
})
