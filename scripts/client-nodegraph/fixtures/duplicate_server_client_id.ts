import { g } from 'genshin-ts/runtime/core'

g.server({ id: 1073741900 }).on('whenEntityIsCreated', (_evt, _f) => {})

g.characterSkill({ id: 1073741900, name: 'DuplicateClientSkill' }).on('start', (_evt, _f) => {})
