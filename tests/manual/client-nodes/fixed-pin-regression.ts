/**
 * Targeted import fixture for every client-node pin mapping corrected by the
 * mihoyobin/TextMap name-alignment fix.
 *
 * Build without injection:
 *   node ./bin/gsts.mjs tests/manual/client-nodes/fixed-pin-regression.ts -c ./gsts.test.config.ts --noinject
 *
 * Inject into the existing tests/manual/features graphs:
 *   node ./bin/gsts.mjs tests/manual/client-nodes/fixed-pin-regression.ts -c ./gsts.test.config.ts
 *
 * The enum arguments deliberately avoid each enum's first member so an editor
 * import also verifies that non-default enum payloads survive serialization.
 */

import * as CE from 'genshin-ts/definitions/client_enums'
import type { ClientCharacterSkillExecutionFlowFunctions } from 'genshin-ts/definitions/client_nodes'
import * as E from 'genshin-ts/definitions/enum'
import { g } from 'genshin-ts/runtime/core'

type FixedHitboxFunctions = Pick<
  ClientCharacterSkillExecutionFlowFunctions<'beyond'>,
  | 'triggerHitboxAtSpecificLocation'
  | 'triggerHitboxAtSpecifiedAttachmentPoint'
  | 'triggerRectangularHitboxAtSpecificLocation'
  | 'triggerRectangularHitboxAtSpecifiedAttachmentPoint'
  | 'triggerSectorHitboxAtSpecificLocation'
  | 'triggerSectorHitboxAtSpecifiedAttachmentPoint'
  | 'triggerSphericalHitboxAtSpecificLocation'
  | 'triggerSphericalHitboxAtSpecifiedAttachmentPoint'
>

function vector(base: number, offset: number): [number, number, number] {
  const value = base + offset
  return [value, value + 1, value + 2]
}

function emitFixedHitboxCases(f: FixedHitboxFunctions, base: number) {
  const entityFilter = [E.EntityType.Player, E.EntityType.Character, E.EntityType.Creation]
  const tags = list(0)

  // Fixed pins: absolute damage, knockback direction, hit level.
  f.triggerHitboxAtSpecificLocation(
    E.TargetType.AlliedFaction,
    vector(base, 1),
    vector(base, 4),
    base + 7.25,
    base + 8.25,
    entityFilter,
    E.TriggerRestriction.TriggerOnlyOncePerEntity,
    BigInt(base + 9),
    E.AttackShape.Sphere,
    vector(base, 10),
    base + 13.25,
    base + 14.25,
    base + 15.25,
    base + 16.25,
    base + 17.25,
    CE.SectorDetectionDirection.Clockwise,
    CE.AttackLayerConfig.OnlyOnHitScene,
    tags,
    E.ElementalType.Pyro,
    base + 18.25,
    E.HitType.Slash,
    E.AttackType.MeleeAttack,
    base + 19.25,
    false,
    BigInt(base + 20),
    CE.KnockbackDirectionType.HitboxOnHitDirection,
    true,
    vector(base, 21),
    vector(base, 24),
    base + 27.25,
    vector(base, 28),
    vector(base, 31),
    base + 34.25,
    base + 35.25,
    BigInt(base + 36),
    CE.HitLevel.LightTremor,
    base + 37.25,
    base + 38.25
  )

  // Same fixed fields with the attachment-point pin offset.
  f.triggerHitboxAtSpecifiedAttachmentPoint(
    E.TargetType.HostileFaction,
    `fixed-attachment-${base + 100}`,
    vector(base, 101),
    vector(base, 104),
    base + 107.25,
    base + 108.25,
    entityFilter,
    E.TriggerRestriction.TriggerOnlyOncePerEntity,
    BigInt(base + 109),
    E.AttackShape.Sector,
    vector(base, 110),
    base + 113.25,
    base + 114.25,
    base + 115.25,
    base + 116.25,
    base + 117.25,
    CE.SectorDetectionDirection.Counterclockwise,
    CE.AttackLayerConfig.HitAll,
    tags,
    E.ElementalType.Hydro,
    base + 118.25,
    E.HitType.Smash,
    E.AttackType.RangedAttack,
    base + 119.25,
    true,
    BigInt(base + 120),
    CE.KnockbackDirectionType.LineConnectingAttackersOwnerAndHitPoint,
    false,
    vector(base, 121),
    vector(base, 124),
    base + 127.25,
    vector(base, 128),
    vector(base, 131),
    base + 134.25,
    base + 135.25,
    BigInt(base + 136),
    CE.HitLevel.LightHit,
    base + 137.25,
    base + 138.25
  )

  // Fixed pins: attack layer, absolute damage, knockback direction, hit level.
  f.triggerRectangularHitboxAtSpecificLocation(
    E.TargetType.Self,
    vector(base, 201),
    vector(base, 204),
    base + 207.25,
    base + 208.25,
    entityFilter,
    E.TriggerRestriction.TriggerOnlyOncePerEntity,
    BigInt(base + 209),
    vector(base, 210),
    CE.AttackLayerConfig.OnlyOnHitScene,
    tags,
    E.ElementalType.Electro,
    base + 213.25,
    E.HitType.Projectile,
    E.AttackType.Default,
    base + 214.25,
    false,
    BigInt(base + 215),
    CE.KnockbackDirectionType.TangentLineBetweenAttackerAndHitPoint,
    true,
    vector(base, 216),
    vector(base, 219),
    base + 222.25,
    vector(base, 223),
    vector(base, 226),
    base + 229.25,
    base + 230.25,
    BigInt(base + 231),
    CE.HitLevel.KnockbackHit,
    base + 232.25,
    base + 233.25
  )

  f.triggerRectangularHitboxAtSpecifiedAttachmentPoint(
    E.TargetType.OwnFaction,
    `fixed-rectangle-${base + 300}`,
    vector(base, 301),
    vector(base, 304),
    base + 307.25,
    base + 308.25,
    entityFilter,
    E.TriggerRestriction.TriggerOnlyOncePerEntity,
    BigInt(base + 309),
    vector(base, 310),
    CE.AttackLayerConfig.HitAll,
    tags,
    E.ElementalType.Cryo,
    base + 313.25,
    E.HitType.PiercingAttack,
    E.AttackType.MeleeAttack,
    base + 314.25,
    true,
    BigInt(base + 315),
    CE.KnockbackDirectionType.OppositeDirectionToHit,
    false,
    vector(base, 316),
    vector(base, 319),
    base + 322.25,
    vector(base, 323),
    vector(base, 326),
    base + 329.25,
    base + 330.25,
    BigInt(base + 331),
    CE.HitLevel.Launch,
    base + 332.25,
    base + 333.25
  )

  f.triggerSectorHitboxAtSpecificLocation(
    E.TargetType.All,
    vector(base, 401),
    vector(base, 404),
    base + 407.25,
    base + 408.25,
    entityFilter,
    E.TriggerRestriction.TriggerOnlyOncePerEntity,
    BigInt(base + 409),
    base + 410.25,
    base + 411.25,
    base + 412.25,
    base + 413.25,
    CE.SectorDetectionDirection.Clockwise,
    CE.AttackLayerConfig.OnlyOnHitScene,
    tags,
    E.ElementalType.Geo,
    base + 414.25,
    E.HitType.Default,
    E.AttackType.RangedAttack,
    base + 415.25,
    false,
    BigInt(base + 416),
    CE.KnockbackDirectionType.AttackersFacingOrientation,
    true,
    vector(base, 417),
    vector(base, 420),
    base + 423.25,
    vector(base, 424),
    vector(base, 427),
    base + 430.25,
    base + 431.25,
    BigInt(base + 432),
    CE.HitLevel.LightTremor,
    base + 433.25,
    base + 434.25
  )

  f.triggerSectorHitboxAtSpecifiedAttachmentPoint(
    E.TargetType.AllExceptSelf,
    `fixed-sector-${base + 500}`,
    vector(base, 501),
    vector(base, 504),
    base + 507.25,
    base + 508.25,
    entityFilter,
    E.TriggerRestriction.TriggerOnlyOncePerEntity,
    BigInt(base + 509),
    base + 510.25,
    base + 511.25,
    base + 512.25,
    base + 513.25,
    CE.SectorDetectionDirection.Counterclockwise,
    CE.AttackLayerConfig.HitAll,
    tags,
    E.ElementalType.Dendro,
    base + 514.25,
    E.HitType.Slash,
    E.AttackType.Default,
    base + 515.25,
    true,
    BigInt(base + 516),
    CE.KnockbackDirectionType.OppositeDirectionToLineConnectingAttackerAndHitPoint,
    false,
    vector(base, 517),
    vector(base, 520),
    base + 523.25,
    vector(base, 524),
    vector(base, 527),
    base + 530.25,
    base + 531.25,
    BigInt(base + 532),
    CE.HitLevel.LightHit,
    base + 533.25,
    base + 534.25
  )

  f.triggerSphericalHitboxAtSpecificLocation(
    E.TargetType.AlliedFactionSelfIncluded,
    vector(base, 601),
    vector(base, 604),
    base + 607.25,
    base + 608.25,
    entityFilter,
    E.TriggerRestriction.TriggerOnlyOncePerEntity,
    BigInt(base + 609),
    base + 610.25,
    CE.AttackLayerConfig.OnlyOnHitScene,
    tags,
    E.ElementalType.Anemo,
    base + 611.25,
    E.HitType.Smash,
    E.AttackType.MeleeAttack,
    base + 612.25,
    false,
    BigInt(base + 613),
    CE.KnockbackDirectionType.HitboxOnHitDirection,
    true,
    vector(base, 614),
    vector(base, 617),
    base + 620.25,
    vector(base, 621),
    vector(base, 624),
    base + 627.25,
    base + 628.25,
    BigInt(base + 629),
    CE.HitLevel.KnockbackHit,
    base + 630.25,
    base + 631.25
  )

  f.triggerSphericalHitboxAtSpecifiedAttachmentPoint(
    E.TargetType.HostileFaction,
    `fixed-sphere-${base + 700}`,
    vector(base, 701),
    vector(base, 704),
    base + 707.25,
    base + 708.25,
    entityFilter,
    E.TriggerRestriction.TriggerOnlyOncePerEntity,
    BigInt(base + 709),
    base + 710.25,
    CE.AttackLayerConfig.HitAll,
    tags,
    E.ElementalType.Pyro,
    base + 711.25,
    E.HitType.Projectile,
    E.AttackType.RangedAttack,
    base + 712.25,
    true,
    BigInt(base + 713),
    CE.KnockbackDirectionType.LineConnectingAttackersOwnerAndHitPoint,
    false,
    vector(base, 714),
    vector(base, 717),
    base + 720.25,
    vector(base, 721),
    vector(base, 724),
    base + 727.25,
    base + 728.25,
    BigInt(base + 729),
    CE.HitLevel.Launch,
    base + 730.25,
    base + 731.25
  )
}

g.characterSkill({
  id: 1082130435,
  name: 'FixedPinsCharacterSkillBeyond',
  prefix: true,
  mode: 'beyond'
}).on('start', (_event, f) => {
  f.recoverCharacterSHp(f.getSelfEntity(), 1001.25, false, 1002.25, 1003n)
  emitFixedHitboxCases(f, 1100)
})

g.characterControlSkill({
  id: 1082130436,
  name: 'FixedPinsCharacterControlSkillBeyond',
  prefix: true,
  mode: 'beyond'
}).on('start', (_event, f) => {
  f.recoverCharacterSHp(f.getSelfEntity(), 2001.25, true, 2002.25, 2003n)
  emitFixedHitboxCases(f, 2100)
})

g.creationSkill({
  id: 1082130437,
  name: 'FixedPinsCreationSkillBeyond',
  prefix: true,
  mode: 'beyond'
}).on('start', (_event, f) => {
  f.recoverCreationSHp(f.getSelfEntity(), 3001.25, false)
  emitFixedHitboxCases(f, 3100)
})

g.creationStatus({
  id: 1082130438,
  name: 'FixedPinsCreationStatusBeyond',
  prefix: true,
  mode: 'beyond'
}).on('start1', (_event, f) => {
  f.tacticExecutePatrol(true, 4001n, false, true, 'fixed-patrol-beyond', false)
})
