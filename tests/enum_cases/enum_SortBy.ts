import { g } from 'genshin-ts/runtime/core'
import { configId, faction, guid, prefabId } from 'genshin-ts/runtime/value'
import * as E from 'genshin-ts/definitions/enum'

// AUTO-GENERATED enum coverage for SortBy
// Run: npx tsx scripts/generate-enum-gia-tests.ts

g.server({ id: 1073741841 }).on('whenEntityIsCreated', (_evt, f) => {
  const e = f.getSelfEntity()
  f.sortDictionaryByKey(f.assemblyDictionary([{ k: 1, v: 1 }]) as any, E.SortBy.Ascending)
  f.sortDictionaryByKey(f.assemblyDictionary([{ k: 1, v: 1 }]) as any, E.SortBy.Descending)
})
