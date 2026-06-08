import * as E from 'genshin-ts/definitions/enum'
import { g } from 'genshin-ts/runtime/core'
import { configId, faction, guid, prefabId } from 'genshin-ts/runtime/value'

// AUTO-GENERATED: group_08 (literal)
// Run: npx tsx scripts/generate-node-gia-tests.ts

g.server({ id: 1073741832 }).on('whenEntityIsCreated', (_evt, f) => {
  // dataTypeConversion :: dict<bool, int>
  f.dataTypeConversion(true, 'int')
  // dataTypeConversion :: dict<bool, str>
  f.dataTypeConversion(false, 'str')
  // dataTypeConversion :: dict<entity, str>
  f.dataTypeConversion(f.getSelfEntity(), 'str')
  // dataTypeConversion :: dict<faction, str>
  f.dataTypeConversion(f.queryEntityFaction(f.getSelfEntity()), 'str')
  // dataTypeConversion :: dict<float, int>
  f.dataTypeConversion(5.25, 'int')
  // dataTypeConversion :: dict<float, str>
  f.dataTypeConversion(6.25, 'str')
  // dataTypeConversion :: dict<guid, str>
  f.dataTypeConversion(new guid(7n), 'str')
  // dataTypeConversion :: dict<int, bool>
  f.dataTypeConversion(8n, 'bool')
  // dataTypeConversion :: dict<int, float>
  f.dataTypeConversion(9n, 'float')
  // dataTypeConversion :: dict<int, str>
  f.dataTypeConversion(10n, 'str')
  // dataTypeConversion :: dict<vec3, str>
  f.dataTypeConversion([11, 12, 13], 'str')
})
