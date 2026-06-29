import { g } from 'genshin-ts/runtime/core'
import { configId, faction, guid, prefabId } from 'genshin-ts/runtime/value'
import * as E from 'genshin-ts/definitions/enum'

// AUTO-GENERATED: group_01 (literal)
// Run: npx tsx scripts/generate-node-gia-tests.ts

g.server({ id: 1073741828 }).on('whenEntityIsCreated', (_evt, f) => {
  // listSorting :: float
  f.listSorting(f.assemblyList([1.25, 2.25, 3.25], "float"), E.SortBy.Ascending)
  // listSorting :: int
  f.listSorting(f.assemblyList([2n, 3n, 4n], "int"), E.SortBy.Ascending)
  // multiplication :: float
  f.multiplication(1.25, 2.25)
  // multiplication :: int
  f.multiplication(3n, 4n)
  // division :: float
  f.division(1.25, 2.25)
  // division :: int
  f.division(3n, 4n)
  // rangeLimitingOperation :: float
  f.rangeLimitingOperation(1.25, 2.25, 3.25)
  // rangeLimitingOperation :: int
  f.rangeLimitingOperation(4n, 5n, 6n)
  // addition :: float
  f.addition(1.25, 2.25)
  // addition :: int
  f.addition(3n, 4n)
  // subtraction :: float
  f.subtraction(1.25, 2.25)
  // subtraction :: int
  f.subtraction(3n, 4n)
  // takeLargerValue :: float
  f.takeLargerValue(1.25, 2.25)
  // takeLargerValue :: int
  f.takeLargerValue(3n, 4n)
  // takeSmallerValue :: float
  f.takeSmallerValue(1.25, 2.25)
  // takeSmallerValue :: int
  f.takeSmallerValue(3n, 4n)
  // absoluteValueOperation :: float
  f.absoluteValueOperation(1.25)
  // absoluteValueOperation :: int
  f.absoluteValueOperation(2n)
  // exponentiation :: float
  f.exponentiation(1.25, 2.25)
  // exponentiation :: int
  f.exponentiation(3n, 4n)
  // signOperation :: float
  f.signOperation(1.25)
  // signOperation :: int
  f.signOperation(2n)
  // greaterThan :: float
  f.greaterThan(1.25, 2.25)
  // greaterThan :: int
  f.greaterThan(3n, 4n)
  // greaterThanOrEqualTo :: float
  f.greaterThanOrEqualTo(1.25, 2.25)
  // greaterThanOrEqualTo :: int
  f.greaterThanOrEqualTo(3n, 4n)
  // lessThan :: float
  f.lessThan(1.25, 2.25)
  // lessThan :: int
  f.lessThan(3n, 4n)
  // lessThanOrEqualTo :: float
  f.lessThanOrEqualTo(1.25, 2.25)
  // lessThanOrEqualTo :: int
  f.lessThanOrEqualTo(3n, 4n)
  // getMaximumValueFromList :: float
  f.getMaximumValueFromList(f.assemblyList([1.25, 2.25, 3.25], "float"))
  // getMaximumValueFromList :: int
  f.getMaximumValueFromList(f.assemblyList([2n, 3n, 4n], "int"))
  // getMinimumValueFromList :: float
  f.getMinimumValueFromList(f.assemblyList([1.25, 2.25, 3.25], "float"))
  // getMinimumValueFromList :: int
  f.getMinimumValueFromList(f.assemblyList([2n, 3n, 4n], "int"))
})

