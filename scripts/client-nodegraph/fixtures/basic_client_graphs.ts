import { g } from 'genshin-ts/runtime/core'

g.characterSkill({ id: 1082130433, name: 'ClientSkill' }).on('start', (_evt, f) => {
  f
})

g.creationSkill({ id: 1082130434, name: 'ClientCreationSkill' }).on('start', (_evt, f) => {
  f
})

g.creationStatus({ id: 1082130435, name: 'ClientCreationStatus' }).on('start', (_evt, f) => {
  f
})

g.creationStatusDecision({ id: 1082130436, name: 'ClientCreationStatusDecision' }).on(
  'start',
  (_evt, f) => {
    f
  }
)

g.boolFilter({ id: 1082130437, name: 'ClientBoolFilter' }).on('start', () => {
  return true
})

g.intFilter({ id: 1082130438, name: 'ClientIntFilter' }).on('start', () => {
  return 1n
})
