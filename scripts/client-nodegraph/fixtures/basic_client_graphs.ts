import { g } from 'genshin-ts/runtime/core'

g.characterSkill({ id: 1082130433, name: 'ClientSkill' }).on('start', (_evt, f) => {
  if (gsts.ctx.ctxType !== 'client_character_skill_handler') {
    throw new Error(`unexpected character skill ctx: ${gsts.ctx.ctxType}`)
  }
  gsts.ctx.assertClientGraphCtx('character_skill')
  gsts.fCharacterSkill
  gsts.ctx.withCtx('client_character_skill_if', () => {
    gsts.ctx.assertClientGraphCtx('character_skill')
    gsts.fCharacterSkill
  })
  gsts.ctx.withCtx('client_character_skill_loop', () => {
    gsts.ctx.assertClientGraphCtx('character_skill')
    gsts.fCharacterSkill
  })
  gsts.ctx.withCtx('client_character_skill_switch', () => {
    gsts.ctx.assertClientGraphCtx('character_skill')
    gsts.fCharacterSkill
  })
  f
})

g.creationSkill({ id: 1082130434, name: 'ClientCreationSkill' }).on('start', (_evt, f) => {
  gsts.ctx.assertClientGraphCtx('creation_skill')
  gsts.fCreationSkill
  f
})

g.creationStatus({ id: 1082130435, name: 'ClientCreationStatus' }).on('start', (_evt, f) => {
  gsts.ctx.assertClientGraphCtx('creation_status')
  gsts.fCreationStatus
  f
})

g.creationStatusDecision({ id: 1082130436, name: 'ClientCreationStatusDecision' }).on(
  'start',
  (_evt, f) => {
    gsts.ctx.assertClientGraphCtx('creation_status_decision')
    gsts.fCreationStatusDecision
    f
  }
)

g.boolFilter({ id: 1082130437, name: 'ClientBoolFilter' }).on('start', () => {
  if (gsts.ctx.ctxType !== 'client_bool_filter_handler') {
    throw new Error(`unexpected bool filter ctx: ${gsts.ctx.ctxType}`)
  }
  gsts.ctx.assertClientGraphCtx('bool_filter')
  gsts.fBoolFilter
  return true
})

g.intFilter({ id: 1082130438, name: 'ClientIntFilter' }).on('start', () => {
  gsts.ctx.assertClientGraphCtx('int_filter')
  gsts.fIntFilter
  return 1n
})
