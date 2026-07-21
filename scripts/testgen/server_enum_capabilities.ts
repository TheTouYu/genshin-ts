/**
 * Server enum families present on fixed node pins but absent from the editor's
 * Enumerations Equal concrete variants.
 */
export const SERVER_ENUM_TYPES_WITHOUT_EQUALITY_NODE = new Set([
  'DamagePopUpType',
  'MovementMode',
  'FixedMotionParameterType',
  'OriginalSlotSkillHandling',
  'ExistingSkillHandling',
  'RankSettlementStatus',
  'ScanRuleType',
  'RandomOrder'
])
