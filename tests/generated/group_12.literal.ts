import { g } from 'genshin-ts/runtime/core'
import { configId, faction, guid, prefabId } from 'genshin-ts/runtime/value'
import * as E from 'genshin-ts/definitions/enum'

// AUTO-GENERATED: group_12 (literal)
// Run: npx tsx scripts/generate-node-gia-tests.ts

g.server({ id: 1073741836 }).on('whenEntityIsCreated', (_evt, f) => {
  // sortDictionaryByValue :: dict<configId, float>
  f.sortDictionaryByValue(f.assemblyDictionary([{ k: new configId(2n), v: 3.25 }, { k: new configId(4n), v: 5.25 }]), E.SortBy.Ascending)
  // sortDictionaryByValue :: dict<configId, int>
  f.sortDictionaryByValue(f.assemblyDictionary([{ k: new configId(7n), v: 8n }, { k: new configId(9n), v: 10n }]), E.SortBy.Ascending)
  // sortDictionaryByValue :: dict<entity, float>
  f.sortDictionaryByValue(f.assemblyDictionary([{ k: f.getSelfEntity(), v: 13.25 }, { k: f.getSelfEntity(), v: 15.25 }]), E.SortBy.Ascending)
  // sortDictionaryByValue :: dict<entity, int>
  f.sortDictionaryByValue(f.assemblyDictionary([{ k: f.getSelfEntity(), v: 18n }, { k: f.getSelfEntity(), v: 20n }]), E.SortBy.Ascending)
  // sortDictionaryByValue :: dict<faction, float>
  f.sortDictionaryByValue(f.assemblyDictionary([{ k: new faction(22n), v: 23.25 }, { k: new faction(24n), v: 25.25 }]), E.SortBy.Ascending)
  // sortDictionaryByValue :: dict<faction, int>
  f.sortDictionaryByValue(f.assemblyDictionary([{ k: new faction(27n), v: 28n }, { k: new faction(29n), v: 30n }]), E.SortBy.Ascending)
  // sortDictionaryByValue :: dict<guid, float>
  f.sortDictionaryByValue(f.assemblyDictionary([{ k: new guid(32n), v: 33.25 }, { k: new guid(34n), v: 35.25 }]), E.SortBy.Ascending)
  // sortDictionaryByValue :: dict<guid, int>
  f.sortDictionaryByValue(f.assemblyDictionary([{ k: new guid(37n), v: 38n }, { k: new guid(39n), v: 40n }]), E.SortBy.Ascending)
  // sortDictionaryByValue :: dict<int, float>
  f.sortDictionaryByValue(f.assemblyDictionary([{ k: 42n, v: 43.25 }, { k: 44n, v: 45.25 }]), E.SortBy.Ascending)
  // sortDictionaryByValue :: dict<int, int>
  f.sortDictionaryByValue(f.assemblyDictionary([{ k: 47n, v: 48n }, { k: 49n, v: 50n }]), E.SortBy.Ascending)
  // sortDictionaryByValue :: dict<prefabId, float>
  f.sortDictionaryByValue(f.assemblyDictionary([{ k: new prefabId(52n), v: 53.25 }, { k: new prefabId(54n), v: 55.25 }]), E.SortBy.Ascending)
  // sortDictionaryByValue :: dict<prefabId, int>
  f.sortDictionaryByValue(f.assemblyDictionary([{ k: new prefabId(57n), v: 58n }, { k: new prefabId(59n), v: 60n }]), E.SortBy.Ascending)
  // sortDictionaryByValue :: dict<str, float>
  f.sortDictionaryByValue(f.assemblyDictionary([{ k: "62", v: 63.25 }, { k: "64", v: 65.25 }]), E.SortBy.Ascending)
  // sortDictionaryByValue :: dict<str, int>
  f.sortDictionaryByValue(f.assemblyDictionary([{ k: "67", v: 68n }, { k: "69", v: 70n }]), E.SortBy.Ascending)
})

