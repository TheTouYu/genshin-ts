import assert from 'node:assert'

import type { VarBase } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'

export type ClientDictionaryShape = readonly [
  keyClientVarType: number,
  valueClientVarType: number,
  variableContainer?: boolean
]

export function assertClientArrayValue(
  value: VarBase | undefined,
  clientVarType: number,
  label: string
) {
  const inner = value?.bConcreteValue?.value ?? value
  assert.strictEqual(Number(inner?.class), 10002, `${label}: ArrayBase class`)
  assert.strictEqual(
    Number(inner?.itemType?.type_client?.type),
    clientVarType,
    `${label}: array item type`
  )
  assert.deepStrictEqual(inner?.bArray?.entries ?? [], [], `${label}: empty array payload`)
}

export function assertClientDictionaryValue(
  value: VarBase | undefined,
  expected: ClientDictionaryShape,
  label: string
) {
  const [keyClientVarType, valueClientVarType, variableContainer = false] = expected
  const concrete = value?.bConcreteValue
  const map = concrete?.value
  const binding = map?.itemType?.type_client?.containerBinding
  const pair = concrete?.structs?.inner?.wrapper?.mapPair

  assert.strictEqual(Number(map?.class), 10003, `${label}: MapBase class`)
  assert.strictEqual(Number(map?.itemType?.type_client?.type), 24, `${label}: dictionary type`)
  assert.strictEqual(Number(map?.itemType?.type_client?.implKind), 2, `${label}: implKind`)
  assert.strictEqual(Number(binding?.mode), keyClientVarType, `${label}: key binding`)
  assert.strictEqual(Number(binding?.kind), valueClientVarType, `${label}: value binding`)
  assert.strictEqual(Number(binding?.keyType), 1, `${label}: key binding marker`)
  assert.strictEqual(Number(binding?.valueType), 2, `${label}: value binding marker`)
  assert.deepStrictEqual(map?.bMap?.mapPairs ?? [], [], `${label}: empty map payload`)
  assert.strictEqual(Number(concrete?.structs?.class), 1, `${label}: structs class`)
  assert.strictEqual(
    Number(concrete?.structs?.inner?.wrapper?.class),
    10003,
    `${label}: structs MapBase class`
  )
  assert.strictEqual(Number(pair?.key), keyClientVarType, `${label}: pair key`)
  assert.strictEqual(Number(pair?.value), valueClientVarType, `${label}: pair value`)
  assert.strictEqual(Number(pair?.keyClientType), 1, `${label}: pair key marker`)
  assert.strictEqual(
    Number(pair?.valueClientType),
    variableContainer ? 1 : 2,
    `${label}: pair value marker`
  )
}
