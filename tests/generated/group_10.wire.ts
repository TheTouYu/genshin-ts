import { g } from 'genshin-ts/runtime/core'
import { configId, faction, guid, prefabId } from 'genshin-ts/runtime/value'
import * as E from 'genshin-ts/definitions/enum'

// AUTO-GENERATED: group_10 (wire)
// Run: npx tsx scripts/generate-node-gia-tests.ts

g.server({ id: 1073741834 }).on('whenEntityIsCreated', (_evt, f) => {
const e = f.getSelfEntity()
const vInt = f.addition(1n, 2n)
const vFloat = f.pi()
const vBool = f.equal(1n, 1n)
const vGuid = f.queryGuidByEntity(e)
const vFaction = f.queryEntityFaction(e)
const vVec3 = f.create3dVector(1, 2, 3)
const vStr = f.dataTypeConversion(1n, 'str')
const vConfig = f.queryPlayerClass(e)
  // setPlayerSettlementScoreboardDataDisplay :: float
  f.setPlayerSettlementScoreboardDataDisplay(e, vInt, vStr, vFloat)
  // setPlayerSettlementScoreboardDataDisplay :: int
  f.setPlayerSettlementScoreboardDataDisplay(e, vInt, vStr, vInt)
  // setPlayerSettlementScoreboardDataDisplay :: str
  f.setPlayerSettlementScoreboardDataDisplay(e, vInt, vStr, vStr)
})

