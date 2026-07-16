import { g } from 'genshin-ts/runtime/core'
import { bool } from 'genshin-ts/runtime/value'

g.server({ name: 'invalid-data-type-conversion', id: 1073742193 }).on(
  'whenEntityIsCreated',
  (_evt, f) => {
    f.dataTypeConversion(new bool(true), 'float')
  }
)
