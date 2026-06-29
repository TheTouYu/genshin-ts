import { g } from 'genshin-ts/runtime/core'
import { configId, faction, guid, prefabId } from 'genshin-ts/runtime/value'
import * as E from 'genshin-ts/definitions/enum'

// AUTO-GENERATED: group_08 (wire)
// Run: npx tsx scripts/generate-node-gia-tests.ts

g.server({ id: 1073741832 }).on('whenEntityIsCreated', (_evt, f) => {
const e = f.getSelfEntity()
const vInt = f.addition(1n, 2n)
const vFloat = f.pi()
const vBool = f.equal(1n, 1n)
const vGuid = f.queryGuidByEntity(e)
const vFaction = f.queryEntityFaction(e)
const vVec3 = f.create3dVector(1, 2, 3)
const vStr = f.dataTypeConversion(1n, 'str')
const vConfig = f.queryPlayerClass(e)
  // dataTypeConversion :: dict<bool, int>
  f.dataTypeConversion(vBool, "int")
  // dataTypeConversion :: dict<bool, str>
  f.dataTypeConversion(vBool, "str")
  // dataTypeConversion :: dict<entity, str>
  f.dataTypeConversion(e, "str")
  // dataTypeConversion :: dict<faction, str>
  f.dataTypeConversion(vFaction, "str")
  // dataTypeConversion :: dict<float, int>
  f.dataTypeConversion(vFloat, "int")
  // dataTypeConversion :: dict<float, str>
  f.dataTypeConversion(vFloat, "str")
  // dataTypeConversion :: dict<guid, str>
  f.dataTypeConversion(vGuid, "str")
  // dataTypeConversion :: dict<int, bool>
  f.dataTypeConversion(vInt, "bool")
  // dataTypeConversion :: dict<int, float>
  f.dataTypeConversion(vInt, "float")
  // dataTypeConversion :: dict<int, str>
  f.dataTypeConversion(vInt, "str")
  // dataTypeConversion :: dict<vec3, str>
  f.dataTypeConversion(vVec3, "str")
})

