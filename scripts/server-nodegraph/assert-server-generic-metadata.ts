import assert from 'node:assert/strict'
import fs from 'node:fs'

import ts from 'typescript'

import { ENUM_ID } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/enum_id.js'
import { NODE_ID } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_id.js'
import { NODE_PIN_RECORDS } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'
import { SERVER_ENUM_TYPES_WITHOUT_EQUALITY_NODE } from '../testgen/server_enum_capabilities.js'

type GenericRule = {
  functionName: string
  genericParameters: string[]
  availableTypes: string[]
}

type GenericSummary = {
  id: number
  functionCount: number
  typeCount: number
  functions: string[]
  types: string[]
}

type StaticPin = {
  kind: string
  index: number
  connectionType?: number
  variants?: Array<{ connectionType?: number }>
}

type StaticMetadata = {
  concreteVariantNodes?: Array<{
    genericId: number
    groups: Array<{
      graphType: number
      variants: Array<{ concreteId: number; bindings: number[][] }>
    }>
  }>
  nodes: Array<{ genericId: number; pins: StaticPin[] }>
}

type EditorEnumNames = {
  enums: Array<{ id: number; nameEn: string }>
}

const SERVER_EQUALITY_TYPES_BY_ENUM_ID = [
  [1, 'ComparisonOperator'],
  [2, 'LogicalOperator'],
  [3, 'MathematicalOperator'],
  [4, 'AttackShape'],
  [5, 'SurvivalStatus'],
  [6, 'SortBy'],
  [7, 'RoundingMode'],
  [8, 'TypeConversion'],
  [9, 'MotionPathPointType'],
  [10, 'MotionType'],
  [11, 'FollowLocationType'],
  [12, 'FollowCoordinateSystem'],
  [13, 'ElementalType'],
  [14, 'EntityType'],
  [16, 'UnitStatusAdditionResult'],
  [17, 'UnitStatusRemovalReason'],
  [18, 'UnitStatusRemovalStrategy'],
  [19, 'RevivePointSelectionStrategy'],
  [20, 'CauseOfBeingDown'],
  [21, 'TrigonometricFunction'],
  [22, 'DisruptorDeviceType'],
  [23, 'DisruptorDeviceOrientation'],
  [24, 'UIControlGroupStatus'],
  [25, 'TargetType'],
  [26, 'TriggerRestriction'],
  [27, 'HitType'],
  [28, 'AttackType'],
  [29, 'HitPerformanceLevel'],
  [30, 'CharacterSkillSlot'],
  [31, 'SoundAttenuationMode'],
  [32, 'SelectCompletionReason'],
  [33, 'SettlementStatus'],
  [35, 'ReasonForItemChange'],
  [36, 'ItemLootType'],
  [37, 'DecisionRefreshMode'],
  [38, 'ElementalReactionType'],
  [39, 'InterruptStatus'],
  [40, 'GameplayMode'],
  [41, 'InputDeviceType'],
  [42, 'ColorBlendType'],
  [43, 'FillMaterial']
] as const

const TYPE_BY_VENDOR_TAG: Record<string, string> = {
  Bol: 'bool',
  Cfg: 'configId',
  Ety: 'entity',
  Fct: 'faction',
  Flt: 'float',
  Gid: 'guid',
  Int: 'int',
  Pfb: 'prefabId',
  Str: 'str',
  Vec: 'vec3'
}

const FUNCTION_NAME_BY_GENERIC_ID: Record<number, string> = {
  160: 'modifyValueInList',
  445: 'nativeSettingCustomValue',
  948: 'setOrAddKeyValuePairsToDictionary',
  1648: "queryDictionary'sLength"
}

function splitTopLevel(value: string) {
  const parts: string[] = []
  let depth = 0
  let start = 0

  for (let index = 0; index < value.length; index++) {
    const char = value[index]
    if (char === '<') depth++
    if (char === '>') depth--
    if (char === ',' && depth === 0) {
      parts.push(value.slice(start, index))
      start = index + 1
    }
  }
  parts.push(value.slice(start))
  return parts.map((part) => part.trim())
}

function decodeVendorType(value: string): string {
  const baseType = TYPE_BY_VENDOR_TAG[value]
  if (baseType) return baseType

  const enumMatch = /^E<(\d+)>$/.exec(value)
  if (enumMatch) return `e<${enumMatch[1]}>`

  if (value.startsWith('L<') && value.endsWith('>')) {
    return `list<${decodeVendorType(value.slice(2, -1))}>`
  }

  if (value.startsWith('D<') && value.endsWith('>')) {
    const types = splitTopLevel(value.slice(2, -1))
    assert.equal(types.length, 2, `invalid vendor dictionary type: ${value}`)
    return `dict<${decodeVendorType(types[0])}, ${decodeVendorType(types[1])}>`
  }

  throw new Error(`unsupported vendor generic type: ${value}`)
}

function decodeReflectType(value: string): string {
  assert.ok(value.startsWith('S<') && value.endsWith('>'), `invalid reflect type: ${value}`)
  const parameters = new Map(
    splitTopLevel(value.slice(2, -1)).map((parameter) => {
      const separator = parameter.indexOf(':')
      assert.notEqual(separator, -1, `invalid reflect parameter: ${parameter}`)
      return [parameter.slice(0, separator), parameter.slice(separator + 1)]
    })
  )

  const type = parameters.get('T')
  if (type) return decodeVendorType(type)

  const key = parameters.get('K')
  const dictionaryValue = parameters.get('V')
  assert.ok(key && dictionaryValue, `unsupported reflect parameters: ${value}`)
  return `dict<${decodeVendorType(key)}, ${decodeVendorType(dictionaryValue)}>`
}

function toFunctionName(displayName: string) {
  const words = displayName
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
  return words
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join('')
}

function normalizeFunctionName(functionName: string) {
  return functionName.replace(/[^A-Za-z0-9]/g, '').toLowerCase()
}

function assertSameTypes(label: string, actual: string[], expected: string[]) {
  const actualSet = new Set(actual)
  const expectedSet = new Set(expected)
  const missing = [...expectedSet].filter((type) => !actualSet.has(type))
  const extra = [...actualSet].filter((type) => !expectedSet.has(type))

  assert.deepEqual(
    { missing, extra },
    { missing: [], extra: [] },
    `${label} generic types do not match the vendor reflect map`
  )
  assert.equal(actual.length, actualSet.size, `${label} contains duplicate generic types`)
}

const rules = JSON.parse(fs.readFileSync('resources/node_generics.json', 'utf8')) as GenericRule[]
const summaries = JSON.parse(
  fs.readFileSync('resources/node_generics_summary.json', 'utf8')
) as GenericSummary[]
const staticMetadata = JSON.parse(
  fs.readFileSync('resources/server_node_static_metadata.json', 'utf8')
) as StaticMetadata
const editorEnumNames = JSON.parse(
  fs.readFileSync('resources/mihoyo_editor_names.json', 'utf8')
) as EditorEnumNames
const officialEnumById = new Map(editorEnumNames.enums.map((entry) => [entry.id, entry]))
const ruleByName = new Map(rules.map((rule) => [rule.functionName, rule]))
const ruleByNormalizedName = new Map(
  rules.map((rule) => [normalizeFunctionName(rule.functionName), rule])
)
const matchedRules = new Set<string>()

for (const node of NODE_PIN_RECORDS) {
  if (!('reflectMap' in node) || !node.reflectMap) continue

  const functionName = FUNCTION_NAME_BY_GENERIC_ID[node.id] ?? toFunctionName(node.name ?? '')
  const rule =
    ruleByName.get(functionName) ?? ruleByNormalizedName.get(normalizeFunctionName(functionName))
  assert.ok(rule, `missing generic metadata for ${node.name} (${node.id}) as ${functionName}`)
  matchedRules.add(rule.functionName)

  const reflectedTypes = [...new Set(node.reflectMap.map(([, type]) => decodeReflectType(type)))]
  assertSameTypes(rule.functionName, rule.availableTypes, reflectedTypes)
}

assert.deepEqual(
  rules.map((rule) => rule.functionName).filter((name) => !matchedRules.has(name)),
  [],
  'generic metadata contains functions without a vendor reflect map'
)

for (const summary of summaries) {
  assert.equal(
    summary.functionCount,
    summary.functions.length,
    `generic summary ${summary.id} functionCount is stale`
  )
  assert.equal(
    summary.typeCount,
    summary.types.length,
    `generic summary ${summary.id} typeCount is stale`
  )
  for (const functionName of summary.functions) {
    const rule = ruleByName.get(functionName)
    assert.ok(rule, `generic summary ${summary.id} references unknown function ${functionName}`)
    assertSameTypes(
      `generic summary ${summary.id}/${functionName}`,
      summary.types,
      rule.availableTypes
    )
  }
}

const enumEqualRecord = NODE_PIN_RECORDS.find((node) => node.id === 475)
assert.ok(
  enumEqualRecord && 'reflectMap' in enumEqualRecord && enumEqualRecord.reflectMap,
  'missing server Enumerations Equal reflect map'
)
const enumEqualReflectMap = enumEqualRecord.reflectMap
const reflectedEnumIds = enumEqualReflectMap.map(([, reflectType]) => {
  const match = /^S<T:E<(\d+)>>$/.exec(reflectType)
  assert.ok(match, `invalid Enumerations Equal reflect type: ${reflectType}`)
  return Number(match[1])
})
assert.deepEqual(
  reflectedEnumIds,
  SERVER_EQUALITY_TYPES_BY_ENUM_ID.map(([enumId]) => enumId),
  'server Enumerations Equal enum ids differ from the public type mapping'
)

const enumEqualStaticNode = staticMetadata.nodes.find((node) => node.genericId === 475)
assert.ok(enumEqualStaticNode, 'missing official static metadata for Enumerations Equal (475)')
const enumEqualStaticInputs = [0, 1].map((index) => {
  const pin = enumEqualStaticNode.pins.find(
    (candidate) => candidate.kind === 'input' && candidate.index === index
  )
  assert.ok(pin?.variants, `Enumerations Equal input ${index} has no static variants`)
  return pin.variants
})
const enumEqualConnectionTypes = enumEqualStaticInputs[0].map((variant) => variant.connectionType)
assert.deepEqual(
  enumEqualStaticInputs[1].map((variant) => variant.connectionType),
  enumEqualConnectionTypes,
  'Enumerations Equal input variant lists differ'
)
assert.equal(
  enumEqualConnectionTypes.length,
  SERVER_EQUALITY_TYPES_BY_ENUM_ID.length,
  'Enumerations Equal static variant count differs from its reflect map'
)

const enumEqualConcreteNode = staticMetadata.concreteVariantNodes?.find(
  (node) => node.genericId === 475
)
assert.ok(enumEqualConcreteNode, 'missing official concrete variants for Enumerations Equal (475)')
assert.equal(enumEqualConcreteNode.groups.length, 1)
const enumEqualConcreteGroup = enumEqualConcreteNode.groups[0]
assert.equal(enumEqualConcreteGroup.graphType, 20000)
assert.equal(enumEqualConcreteGroup.variants.length, enumEqualReflectMap.length)
for (const [index, variant] of enumEqualConcreteGroup.variants.entries()) {
  const [concreteId] = enumEqualReflectMap[index]
  const [enumId] = SERVER_EQUALITY_TYPES_BY_ENUM_ID[index]
  assert.equal(variant.concreteId, concreteId, `Enumerations Equal concrete id at ${index}`)
  assert.deepEqual(
    variant.bindings,
    [
      [3, 0, enumId],
      [3, 1, enumId]
    ],
    `Enumerations Equal concrete bindings for ${concreteId}`
  )
}
const equalityNodePrefix = 'Enumerations_Equal__'
const normalizeName = (value: string) => value.replace(/[^A-Za-z0-9]/g, '').toLowerCase()
const namesMatch = (left: string, right: string) => {
  const normalizedLeft = normalizeName(left)
  const normalizedRight = normalizeName(right)
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.replace(/s$/, '') === normalizedRight.replace(/s$/, '')
  )
}
for (const [index, [concreteId]] of enumEqualReflectMap.entries()) {
  const connectionType = enumEqualConnectionTypes[index]
  if (connectionType === undefined) {
    throw new Error(`Enumerations Equal ${concreteId} has no connection type`)
  }
  const officialEnum = officialEnumById.get(connectionType - 10000)
  assert.ok(
    officialEnum,
    `Enumerations Equal ${concreteId} has no official enum for connection type ${connectionType}`
  )
  const matchingNodeIdKeys = Object.entries(NODE_ID)
    .filter(([key, nodeId]) => key.startsWith(equalityNodePrefix) && nodeId === concreteId)
    .map(([key]) => key.slice(equalityNodePrefix.length))
  assert.ok(
    matchingNodeIdKeys.some((key) => namesMatch(key, officialEnum.nameEn)),
    `Enumerations Equal ${concreteId} is ${officialEnum.nameEn}, not ` +
      `${matchingNodeIdKeys.join('/') || '(unnamed)'}`
  )
}

function staticInputConnectionType(genericId: number, pinIndex: number) {
  const node = staticMetadata.nodes.find((candidate) => candidate.genericId === genericId)
  assert.ok(node, `missing static server node ${genericId}`)
  const pin = node.pins.find(
    (candidate) => candidate.kind === 'input' && candidate.index === pinIndex
  )
  assert.ok(pin?.connectionType, `missing static server node ${genericId} input ${pinIndex}`)
  return pin.connectionType
}

const colorBlendConnectionType = staticInputConnectionType(835, 5)
const fillMaterialConnectionType = staticInputConnectionType(835, 8)
assert.deepEqual(
  enumEqualConnectionTypes.slice(-2),
  [colorBlendConnectionType, fillMaterialConnectionType],
  'Enumerations Equal final variants are not model color/fill-material enums'
)
assert.equal(enumEqualConnectionTypes.includes(staticInputConnectionType(775, 2)), false)
assert.equal(enumEqualConnectionTypes.includes(staticInputConnectionType(775, 7)), false)

assert.equal(ENUM_ID.Color_Overlay_Type, 42)
assert.equal(ENUM_ID.Color_Blend_Type, 42)
assert.equal(ENUM_ID.Fill_Material, 43)
assert.equal(ENUM_ID.Movement_Mode, 1042)
assert.equal(ENUM_ID.Fixed_Point_Motion_Device_Motion_Type, 1042)
assert.equal(ENUM_ID.Fixed_Motion_Parameter_Type, 1043)
assert.equal(ENUM_ID.Fixed_Point_Motion_Device_Parameter_Conversion_Type, 1043)
assert.equal(NODE_ID.Enumerations_Equal__Color_Overlay_Type, 851)
assert.equal(NODE_ID.Enumerations_Equal__Color_Blend_Type, 851)
assert.equal(NODE_ID.Enumerations_Equal__Fill_Material, 852)
assert.equal('Enumerations_Equal__Movement_Mode' in NODE_ID, false)
assert.equal('Enumerations_Equal__Fixed_Motion_Parameter_Type' in NODE_ID, false)

const fixedMotionRecord = NODE_PIN_RECORDS.find((node) => node.id === 775)
const editModelRecord = NODE_PIN_RECORDS.find((node) => node.id === 835)
const getModelRecord = NODE_PIN_RECORDS.find((node) => node.id === 836)
assert.deepEqual(fixedMotionRecord?.inputs, [
  'Ety',
  'Str',
  'E<1042>',
  'Flt',
  'Vec',
  'Vec',
  'Bol',
  'E<1043>',
  'Flt'
])
assert.deepEqual(editModelRecord?.inputs, [
  'Ety',
  'Bol',
  'Bol',
  'Int',
  'Flt',
  'E<42>',
  'Bol',
  'Bol',
  'E<43>'
])
assert.deepEqual(getModelRecord?.outputs, ['Bol', 'E<42>', 'Int', 'Flt', 'Bol', 'E<43>'])

const nodesSource = fs.readFileSync('src/definitions/nodes.ts', 'utf8')
const nodesSourceFile = ts.createSourceFile(
  'nodes.ts',
  nodesSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS
)
const serverFunctionsClass = nodesSourceFile.statements.find(
  (statement): statement is ts.ClassDeclaration =>
    ts.isClassDeclaration(statement) && statement.name?.text === 'ServerExecutionFlowFunctions'
)
assert.ok(serverFunctionsClass, 'missing ServerExecutionFlowFunctions')
const equalityOverloadTypes = serverFunctionsClass.members
  .filter(
    (member): member is ts.MethodDeclaration =>
      ts.isMethodDeclaration(member) &&
      ts.isIdentifier(member.name) &&
      member.name.text === 'enumerationsEqual' &&
      !member.body
  )
  .map((member) => member.parameters[0]?.type?.getText(nodesSourceFile))
assert.deepEqual(
  equalityOverloadTypes,
  SERVER_EQUALITY_TYPES_BY_ENUM_ID.map(([, typeName]) => typeName),
  'server enumerationsEqual overloads differ from the official concrete variants'
)
assert.deepEqual(
  [...SERVER_ENUM_TYPES_WITHOUT_EQUALITY_NODE].sort(),
  ['FixedMotionParameterType', 'MovementMode'],
  'server non-comparable enum capability list is stale'
)

console.log(
  `[ok] ${matchedRules.size} server generic rules and ${enumEqualReflectMap.length} ` +
    `Enumerations Equal variants match vendor and official mihoyobin metadata`
)
