import { g } from 'genshin-ts/runtime/core'
import { configId, faction, guid, prefabId } from 'genshin-ts/runtime/value'
import * as E from 'genshin-ts/definitions/enum'

// AUTO-GENERATED enum coverage for SettlementStatus
// Run: npx tsx scripts/generate-enum-gia-tests.ts

g.server({ id: 1073741847 }).on('whenEntityIsCreated', (_evt, f) => {
  const e = f.getSelfEntity()
  f.setPlayerSettlementSuccessStatus(e, E.SettlementStatus.Undefined)
  f.setPlayerSettlementSuccessStatus(e, E.SettlementStatus.Victory)
  f.setPlayerSettlementSuccessStatus(e, E.SettlementStatus.Defeat)
})
