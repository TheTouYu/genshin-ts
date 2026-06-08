import { g } from 'genshin-ts/runtime/core'
import { configId, faction, guid, prefabId } from 'genshin-ts/runtime/value'
import * as E from 'genshin-ts/definitions/enum'

// AUTO-GENERATED enum coverage for CharacterSkillSlot
// Run: npx tsx scripts/generate-enum-gia-tests.ts

g.server({ id: 1073741845 }).on('whenEntityIsCreated', (_evt, f) => {
  const e = f.getSelfEntity()
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.NormalAttack)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.Skill1E)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.Skill2Q)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.Skill3R)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.Skill4T)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.CustomSkillSlot1)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.CustomSkillSlot2)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.CustomSkillSlot3)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.CustomSkillSlot4)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.CustomSkillSlot5)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.CustomSkillSlot6)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.CustomSkillSlot7)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.CustomSkillSlot8)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.CustomSkillSlot9)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.CustomSkillSlot10)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.CustomSkillSlot11)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.CustomSkillSlot12)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.CustomSkillSlot13)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.CustomSkillSlot14)
  f.initializeCharacterSkill(e, E.CharacterSkillSlot.CustomSkillSlot15)
})
