import { g } from 'genshin-ts/runtime/core'

g.characterSkill({ id: 1082130440, name: 'UnusedClientSkill' }).on('start', () => {})

g.boolFilter({ id: 1082130441, name: 'UsedClientBoolFilter' }).on('start', () => {
  return true
})
