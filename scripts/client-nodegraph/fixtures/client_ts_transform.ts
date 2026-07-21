import { TargetType } from 'genshin-ts/definitions/enum'
import { g } from 'genshin-ts/runtime/core'

import { gstsClientCharacterSkillAdd } from './client_ts_transform_helpers.js'

const gstsCharacterSkillAbs = (value: number) => Number(Math.abs(value))

function gstsClientCharacterControlSkillAdd(value: bigint) {
  return value + 1n
}

const gstsCharacterControlSkillAdd = (value: bigint) => value + 1n

function gstsClientCreationSkillAdd(value: bigint) {
  return value + 1n
}

const gstsCreationSkillAdd = (value: bigint) => value + 1n

function gstsClientCreationStatusAdd(value: bigint) {
  return value + 1n
}

const gstsCreationStatusAdd = (value: bigint) => value + 1n

function gstsClientCreationStatusDecisionAdd(value: bigint) {
  return value + 1n
}

const gstsCreationStatusDecisionAdd = (value: bigint) => value + 1n

function gstsClientBoolFilterNot(value: boolean) {
  return !value
}

const gstsBoolFilterNot = (value: boolean) => Boolean(!value)

function gstsClientIntFilterAdd(value: number) {
  return value + 1
}

const gstsIntFilterAdd = (value: number) => value + 1

g.characterSkill({ id: 1082130601, name: 'ClientTsTransformCharacterSkill' }).on(
  'start',
  (_evt, f) => {
    let counter = 0
    if (counter >= 0) {
      counter = gstsClientCharacterSkillAdd(counter)
    } else {
      counter = gstsCharacterSkillAbs(-1)
    }
    for (let index = 0; index < 2; index++) {
      counter += index
    }
    counter = Math.sin(counter)

    const wiredInt = f.addition(1n, 2n)
    const convertedFloat = float(wiredInt)
    const convertedString = str(wiredInt)
    const convertedBool = bool(wiredInt)
    const convertedInt = int(f.division(1, 2))
    const indexedValues = list('int', [wiredInt, 2n, 3n, 4n])
    const firstIndexedValue = indexedValues[0]
    const secondIndexedValue = indexedValues[idx(1n)]
    const directIndexedValue = f.getCorrespondingValueFromList(0n, indexedValues)
    const ordinaryEqual = wiredInt === convertedInt
    const enumEqual = TargetType.None === TargetType.AlliedFaction
    const enumNotEqual = TargetType.None !== TargetType.AlliedFaction
    const maximum = Math.max(1, 2)
    f.setAttackWeight(convertedFloat, convertedBool)
    f.sendSignalToServerNodeGraph(
      'client_transform_values',
      convertedString,
      str(firstIndexedValue),
      str(secondIndexedValue),
      str(directIndexedValue),
      str(maximum),
      ordinaryEqual,
      enumEqual,
      enumNotEqual
    )
  }
)

g.characterControlSkill({
  id: 1082130602,
  name: 'ClientTsTransformCharacterControlSkill'
}).on('start', (_evt, _f) => {
  let value = 0n
  switch (1n) {
    case 1n:
      value = gstsClientCharacterControlSkillAdd(value)
      break
    default:
      value = gstsCharacterControlSkillAdd(value)
  }
})

g.creationSkill({ id: 1082130603, name: 'ClientTsTransformCreationSkill' }).on(
  'start',
  (_evt, _f) => {
    let remaining = gstsClientCreationSkillAdd(0n)
    while (remaining > 0n) {
      remaining -= gstsCreationSkillAdd(0n)
    }
  }
)

const creationStatusGraph = g.creationStatus({
  id: 1082130604,
  name: 'ClientTsTransformCreationStatus'
})

creationStatusGraph.on('start1', (_evt) => {
  String('status')
  if (1n === 1n) {
    gstsClientCreationStatusAdd(-1n)
  } else {
    gstsCreationStatusAdd(-1n)
  }
  switch ('ready') {
    case 'ready':
      gstsClientCreationStatusAdd(-1n)
      break
    default:
      gstsCreationStatusAdd(-1n)
  }
})

creationStatusGraph.on('start2', (_evt, f) => {
  f.continueExecutingPreviousFrameBehavior()
})

g.creationStatusDecision({
  id: 1082130605,
  name: 'ClientTsTransformCreationStatusDecision'
}).on('start1', (_evt, f) => {
  if (f.equal(1n, 1n)) {
    f.absoluteValueOperation(gstsClientCreationStatusDecisionAdd(-1n))
  } else {
    f.absoluteValueOperation(gstsCreationStatusDecisionAdd(-1n))
  }
})

g.boolFilter({ id: 1082130606, name: 'ClientTsTransformBoolFilter' }).on('start', (_evt, f) => {
  if (f.equal(1n, 1n)) return gstsBoolFilterNot(gstsClientBoolFilterNot(true))
  return gstsClientBoolFilterNot(gstsBoolFilterNot(false))
})

g.intFilter({
  id: 1082130607,
  name: 'ClientTsTransformIntFilter',
  evaluationInterval: 0.75
}).on('start', (_evt, f) => {
  if (f.greaterThan(1, 0)) return gstsIntFilterAdd(gstsClientIntFilterAdd(0))
  return gstsClientIntFilterAdd(gstsIntFilterAdd(1))
})
