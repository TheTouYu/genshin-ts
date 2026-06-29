import { g } from 'genshin-ts/runtime/core'
import { configId, faction, guid, prefabId } from 'genshin-ts/runtime/value'
import * as E from 'genshin-ts/definitions/enum'

// AUTO-GENERATED: group_07 (literal)
// Run: npx tsx scripts/generate-node-gia-tests.ts

g.server({ id: 1073741831 }).on('whenEntityIsCreated', (_evt, f) => {
  // multipleBranches :: int
  f.multipleBranches(1n, ({ 1: () => { f.printString("literal_b1_multipleBranches_1") }, default: () => { f.printString("literal_bd_multipleBranches_1") } }))
  // multipleBranches :: str
  f.multipleBranches("2", ({ 1: () => { f.printString("literal_b1_multipleBranches_1") }, default: () => { f.printString("literal_bd_multipleBranches_1") } }))
})

