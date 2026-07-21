import assert from 'node:assert/strict'
import fs from 'node:fs'

import { parseEnumValue } from '../../src/compiler/ir_to_gia_transform/mappings.js'
import type { ClientGraphMode, ClientGraphSubType } from '../../src/runtime/IR.js'
import { CLIENT_ENUM_VALUES } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_enum_values.js'
import { CLIENT_NODE_METADATA } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { NodePin_Index_Kind } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'

type IrArg = {
  type: string
  value?: unknown
}

type IrNode = {
  id: number
  type: string
  args?: Array<IrArg | null>
}

type IrDocument = {
  graph: {
    id: number
    name: string
    mode: ClientGraphMode
    sub_type: ClientGraphSubType
  }
  nodes: IrNode[]
}

type FlowMetadataEntry = {
  nodeType: string
  subTypes: ClientGraphSubType[]
  params: Array<{ docZh: string }>
}

type StaticMetadata = {
  nodes: Array<{
    genericId: number
    pins: Array<{ kind: string; index: number; name?: string }>
  }>
}

type StaticPin = StaticMetadata['nodes'][number]['pins'][number]

type GiaValue = {
  alreadySetVal?: boolean
  bEnum?: { val?: number }
  bInt?: { val?: number }
  bConcreteValue?: { value?: GiaValue }
}

type GiaConnection = {
  id?: number
}

type GiaPin = {
  i1: { kind: number; index: number }
  connects?: GiaConnection[]
  value?: GiaValue
}

const HITBOX_NODE_TYPES = [
  'trigger_hitbox_at_specific_location',
  'trigger_hitbox_at_specified_attachment_point',
  'trigger_rectangular_hitbox_at_specific_location',
  'trigger_rectangular_hitbox_at_specified_attachment_point',
  'trigger_sector_hitbox_at_specific_location',
  'trigger_sector_hitbox_at_specified_attachment_point',
  'trigger_spherical_hitbox_at_specific_location',
  'trigger_spherical_hitbox_at_specified_attachment_point'
] as const

const GRAPH_SPECS = [
  {
    id: 1082130435,
    name: '_GSTS_FixedPinsCharacterSkillBeyond',
    mode: 'beyond',
    subType: 'character_skill'
  },
  {
    id: 1082130436,
    name: '_GSTS_FixedPinsCharacterControlSkillBeyond',
    mode: 'beyond',
    subType: 'character_control_skill'
  },
  {
    id: 1082130437,
    name: '_GSTS_FixedPinsCreationSkillBeyond',
    mode: 'beyond',
    subType: 'creation_skill'
  },
  {
    id: 1082130438,
    name: '_GSTS_FixedPinsCreationStatusBeyond',
    mode: 'beyond',
    subType: 'creation_status'
  }
] as const

const FIRST_ENUM_VALUES = new Set([
  'attack_layer_config_only_on_hit_hurtbox',
  'attack_shape_rectangle',
  'attack_type_none',
  'elemental_type_none',
  'entity_type_stage',
  'hit_level_no_effect',
  'hit_type_none',
  'knockback_direction_type_line_connecting_attacker_and_hit_point',
  'sector_detection_direction_from_inside_out',
  'target_type_none',
  'trigger_restriction_trigger_only_once'
])

const ENUM_VARIETY = [
  { prefix: 'attack_layer_config_', minimum: 2 },
  { prefix: 'attack_shape_', minimum: 2 },
  { prefix: 'attack_type_', minimum: 3 },
  { prefix: 'elemental_type_', minimum: 7 },
  { prefix: 'entity_type_', minimum: 3 },
  { prefix: 'hit_level_', minimum: 4 },
  { prefix: 'hit_type_', minimum: 5 },
  { prefix: 'knockback_direction_type_', minimum: 6 },
  { prefix: 'sector_detection_direction_', minimum: 2 },
  { prefix: 'target_type_', minimum: 7 }
] as const

const flowMetadata = JSON.parse(
  fs.readFileSync('resources/client_execution_flow_metadata.json', 'utf8')
) as FlowMetadataEntry[]
const staticMetadata = JSON.parse(
  fs.readFileSync('resources/client_node_static_metadata.json', 'utf8')
) as StaticMetadata
const documents = JSON.parse(
  fs.readFileSync('dist/tests/manual/client-nodes/fixed-pin-regression.json', 'utf8')
) as IrDocument[]

const flowByKey = new Map(
  flowMetadata.flatMap((entry) =>
    entry.subTypes.map((subType) => [`${subType}.${entry.nodeType}`, entry] as const)
  )
)
const staticByGenericId = new Map(
  staticMetadata.nodes.map((node) => [node.genericId, node] as const)
)
const metadataByKey = new Map(
  CLIENT_NODE_METADATA.map((record) => [`${record.subType}.${record.nodeType}`, record] as const)
)

assert.equal(documents.length, GRAPH_SPECS.length)
const coveredMappings = new Set<string>()
const enumValues = new Set<string>()

for (const [graphIndex, spec] of GRAPH_SPECS.entries()) {
  const document = documents.find((candidate) => candidate.graph.id === spec.id)
  assert.ok(document, `missing graph ${spec.id}`)
  assert.equal(document.graph.name, spec.name)
  assert.equal(document.graph.mode, spec.mode)
  assert.equal(document.graph.sub_type, spec.subType)

  const decoded = decode_gia_file(
    `dist/tests/manual/client-nodes/fixed-pin-regression_${graphIndex}.gia`,
    undefined,
    true
  )
  const giaNodes = decoded.graph.graph?.inner.graph?.nodes ?? []
  const giaByIndex = new Map(giaNodes.map((node) => [Number(node.nodeIndex), node]))

  for (const irNode of document.nodes) {
    const isHitbox = HITBOX_NODE_TYPES.some((nodeType) => nodeType === irNode.type)
    const isRecovery =
      irNode.type === 'recover_character_s_hp' || irNode.type === 'recover_creation_s_hp'
    const isPatrol = irNode.type === 'tactic_execute_patrol'
    if (!isHitbox && !isRecovery && !isPatrol) continue

    coveredMappings.add(`${spec.subType}.${irNode.type}`)
    const metadata = metadataByKey.get(`${spec.subType}.${irNode.type}`)
    const flow = flowByKey.get(`${spec.subType}.${irNode.type}`)
    const giaNode = giaByIndex.get(irNode.id)
    assert.ok(metadata, `${spec.subType}.${irNode.type}: missing runtime metadata`)
    assert.ok(flow, `${spec.subType}.${irNode.type}: missing flow metadata`)
    assert.ok(giaNode, `${spec.subType}.${irNode.type}: missing GIA node #${irNode.id}`)

    const fixedParamNames = isHitbox
      ? ['攻击层筛选', '是否是绝对伤害', '受击击退朝向', '受击等级']
      : isRecovery
        ? ['是否忽略恢复调整效果']
        : ['结束时点位设置为出生点']

    for (const paramName of fixedParamNames) {
      const argIndex: number = flow.params.findIndex((param) => param.docZh === paramName)
      assert.notEqual(argIndex, -1, `${spec.subType}.${irNode.type}: missing ${paramName}`)
      const arg: IrArg | null | undefined = irNode.args?.[argIndex]
      assert.ok(
        arg && arg.type !== 'conn',
        `${spec.subType}.${irNode.type}.${paramName} is not literal`
      )
      const pinIndex: number = metadata.argPins?.[argIndex] ?? argIndex
      const staticPin: StaticPin | undefined = staticByGenericId
        .get(metadata.genericId)
        ?.pins.find((pin) => pin.kind === 'input' && pin.index === pinIndex)
      assert.equal(
        staticPin?.name,
        paramName,
        `${spec.subType}.${irNode.type}.${paramName} maps to physical pin #${pinIndex} "${staticPin?.name ?? ''}"`
      )

      const pin: GiaPin | undefined = (giaNode.pins as GiaPin[]).find(
        (candidate) =>
          candidate.i1.kind === NodePin_Index_Kind.InParam && candidate.i1.index === pinIndex
      )
      assert.ok(pin, `${spec.subType}.${irNode.type}.${paramName}: missing pin #${pinIndex}`)
      assert.equal(pin.connects?.length ?? 0, 0)
      const value: GiaValue | undefined = pin.value?.bConcreteValue?.value ?? pin.value
      assert.equal(
        value?.alreadySetVal,
        true,
        `${spec.subType}.${irNode.type}.${paramName} was left unset`
      )

      if (arg.type === 'bool') {
        assert.equal(Number(value?.bEnum?.val), arg.value === true ? 1 : 0)
      } else if (arg.type === 'enum') {
        const enumKey: string = String(arg.value)
        assert.equal(Number(value?.bEnum?.val), CLIENT_ENUM_VALUES[enumKey])
      }
    }

    if (!isHitbox) continue
    for (const [argIndex, arg] of (irNode.args ?? []).entries()) {
      if (arg?.type === 'enum') {
        const enumKey = String(arg.value)
        enumValues.add(enumKey)
        const pinIndex: number = metadata.argPins?.[argIndex] ?? argIndex
        const pin: GiaPin | undefined = (giaNode.pins as GiaPin[]).find(
          (candidate) =>
            candidate.i1.kind === NodePin_Index_Kind.InParam && candidate.i1.index === pinIndex
        )
        assert.ok(pin, `${spec.subType}.${irNode.type} enum arg #${argIndex}: missing pin`)
        assert.equal(pin.connects?.length ?? 0, 0)
        const value: GiaValue | undefined = pin.value?.bConcreteValue?.value ?? pin.value
        assert.equal(value?.alreadySetVal, true)
        assert.equal(
          Number(value?.bEnum?.val),
          CLIENT_ENUM_VALUES[enumKey] ?? parseEnumValue(enumKey, argIndex, irNode.type).enumValue,
          `${spec.subType}.${irNode.type} enum arg #${argIndex} ${enumKey}`
        )
      }
      if (arg?.type === 'enum_list' && Array.isArray(arg.value)) {
        const enumKeys = arg.value.map(String)
        enumKeys.forEach((value) => enumValues.add(value))
        const pinIndex: number = metadata.argPins?.[argIndex] ?? argIndex
        const pin: GiaPin | undefined = (giaNode.pins as GiaPin[]).find(
          (candidate) =>
            candidate.i1.kind === NodePin_Index_Kind.InParam && candidate.i1.index === pinIndex
        )
        assert.equal(pin?.connects?.length, 1)
        const builderId = Number(pin?.connects?.[0]?.id)
        const builder = giaByIndex.get(builderId)
        assert.ok(
          builder,
          `${spec.subType}.${irNode.type} enum-list arg #${argIndex}: missing builder #${builderId}`
        )
        const builderPins = builder.pins as GiaPin[]
        const countPin = builderPins.find(
          (candidate) =>
            candidate.i1.kind === NodePin_Index_Kind.InParam && candidate.i1.index === 0
        )
        assert.equal(countPin?.value?.bInt?.val, enumKeys.length)
        for (const [valueIndex, enumKey] of enumKeys.entries()) {
          const valuePin = builderPins.find(
            (candidate) =>
              candidate.i1.kind === NodePin_Index_Kind.InParam &&
              candidate.i1.index === valueIndex + 1
          )
          assert.equal(valuePin?.value?.alreadySetVal, true)
          assert.equal(
            Number(valuePin?.value?.bEnum?.val),
            parseEnumValue(enumKey, argIndex, irNode.type).enumValue
          )
        }
      }
    }
  }
}

assert.equal(coveredMappings.size, 28, 'fixture must cover all 28 corrected subtype/node records')
for (const firstValue of FIRST_ENUM_VALUES) {
  assert.equal(
    enumValues.has(firstValue),
    false,
    `fixture still uses first enum value ${firstValue}`
  )
}
for (const { prefix, minimum } of ENUM_VARIETY) {
  const values = [...enumValues].filter((value) => value.startsWith(prefix))
  assert.ok(
    values.length >= minimum,
    `${prefix} enum variety ${values.length} is below required ${minimum}`
  )
}

console.log(
  `[ok] fixed-pin regression: ${coveredMappings.size} corrected mappings across ` +
    `${documents.length} graphs; ${enumValues.size} distinct non-first enum values`
)
