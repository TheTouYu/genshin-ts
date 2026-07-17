/** Regression coverage for client reflective pin specialization. */

import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

import { client_list_literal_value, client_value_base } from '../../src/compiler/gia_vendor.js'
import { irToGia } from '../../src/compiler/ir_to_gia_transform/index.js'
import { TargetEntity } from '../../src/definitions/client_enums.js'
import { buildClientGraphRegistriesIRDocuments, g } from '../../src/runtime/core.js'
import { prefabId } from '../../src/runtime/value.js'
import { requireClientNodeMetadata } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_helpers.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH =
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
const OUT_DIR = 'tests/client_generated'

for (const clientVarType of [2, 4, 6, 8, 10, 12, 15, 17, 20, 21, 25]) {
  const value = client_value_base(clientVarType)
  assert.strictEqual(value.class, 10002, `client list type ${clientVarType} uses ArrayBase`)
  assert.strictEqual(value.itemType?.type_client?.type, clientVarType)
  assert.deepStrictEqual(value.bArray?.entries ?? [], [])
}
const prefabListLiteral = client_list_literal_value(21, [1001])
assert.strictEqual(prefabListLiteral.bArray?.entries[0]?.class, 1)
assert.strictEqual(prefabListLiteral.bArray?.entries[0]?.itemType?.type_client?.type, 19)

g.characterSkill({ id: 1082130710, name: 'Generic_Character_Skill' }).on('start', (_evt, f) => {
  const values = f.assemblyList([1n, 2n], 'int')
  const prefabs = f.assemblyList([new prefabId(1001n)], 'prefab_id')
  f.setLocalVariable('prefabs', prefabs)
  const firstValue = f.getCorrespondingValueFromList(0n, values)
  const lookup = dict([{ k: 1n, v: firstValue }])
  const lookupValue = f.queryDictionaryValueByKey(lookup, 1n)
  f.doubleBranch(
    f.equal(lookupValue, 1n),
    () => f.forceExitAimingState(),
    () => f.forceExitAimingState()
  )
})

g.creationStatus({ id: 1082130711, name: 'Generic_Creation_Status' }).on('start1', (_evt, f) => {
  const sameEntity = f.equal(f.getStageEntity(), f.getStageEntity())
  f.executeSkill(sameEntity, 1n)
  const customValue = f.getCustomVariable(TargetEntity.Self, 'score').asType('int')
  f.executeSkill(f.greaterThan(customValue, 0n), 2n)
  f.multipleBranches('ready', {
    ready: () => {},
    default: () => {}
  })
})

g.creationStatus({ id: 1082130714, name: 'Generic_Default_Only_Branches' }).on(
  'start1',
  (_evt, f) => {
    f.multipleBranches(1n, {
      default: () => f.executeSkill(true, 1n)
    })
  }
)

g.creationStatusDecision({ id: 1082130712, name: 'Generic_Status_Decision' }).on(
  'start1',
  (_evt, f) => {
    const helperValue = f.addition(f.getRandomNumber(0n, 2n), 1n)
    const ready = f.greaterThan(float(helperValue), 0)
    f.doubleBranch(
      ready,
      () => {},
      () => {}
    )
  }
)

g.boolFilter({ id: 1082130713, name: 'Generic_Bool_Filter' }).on('start', (_evt, f) => {
  return f.greaterThan(f.addition(1.5, 2.5), 0)
})

type DecodedNode = NonNullable<
  ReturnType<typeof decode_gia_file>['graph']['graph']
>['inner']['graph']['nodes'][number]

function decodeGraph(name: string): DecodedNode[] {
  const doc = buildClientGraphRegistriesIRDocuments().find((candidate) =>
    candidate.graph.name?.includes(name)
  )
  assert.ok(doc, `missing client graph ${name}`)
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const outFile = path.join(OUT_DIR, `smoke_${name.toLowerCase()}.gia`)
  fs.writeFileSync(outFile, irToGia(doc, { protoPath: PROTO_PATH }))
  const nodes = decode_gia_file(outFile, undefined, true).graph.graph?.inner.graph?.nodes ?? []
  fs.rmSync(outFile, { force: true })
  return nodes
}

function findNode(
  nodes: DecodedNode[],
  subType: Parameters<typeof requireClientNodeMetadata>[0],
  nodeType: string,
  nth = 0
) {
  const metadata = requireClientNodeMetadata(subType, nodeType)
  const node = nodes.filter(
    (candidate) => Number(candidate.genericId?.nodeId) === metadata.genericId
  )[nth]
  assert.ok(node, `${subType}.${nodeType}: missing gid ${metadata.genericId}`)
  return node
}

function checkPin(
  node: DecodedNode,
  kind: number,
  index: number,
  clientVarType: number,
  indexOfConcrete: number,
  connected = false
) {
  const pin = (node.pins ?? []).find(
    (candidate) => Number(candidate.i1?.kind) === kind && Number(candidate.i1?.index) === index
  )
  assert.ok(pin, `missing pin k${kind}#${index}`)
  assert.strictEqual(Number(pin.type ?? 0), clientVarType, `pin k${kind}#${index} type`)
  assert.strictEqual(
    Number(pin.value?.bConcreteValue?.indexOfConcrete ?? 0),
    indexOfConcrete,
    `pin k${kind}#${index} indexOfConcrete`
  )
  if (connected) assert.ok((pin.connects ?? []).length > 0, `pin k${kind}#${index} connection`)
}

{
  const nodes = decodeGraph('Generic_Character_Skill')
  const listNode = findNode(nodes, 'character_skill', 'assembly_list')
  const listCountPin = listNode.pins?.find(
    (pin) => Number(pin.i1?.kind) === 3 && Number(pin.i1?.index) === 0
  )
  assert.strictEqual(Number(listCountPin?.value?.bInt?.val), 2, 'two-element list count')
  assert.strictEqual(
    Boolean(listCountPin?.value?.alreadySetVal),
    true,
    'non-default list count must be marked as explicitly set'
  )
  checkPin(listNode, 4, 0, 4, 1)
  assert.strictEqual(
    Number(
      listNode.pins?.find((pin) => Number(pin.i1?.kind) === 4 && Number(pin.i1?.index) === 0)?.value
        ?.bConcreteValue?.value?.class
    ),
    10002,
    'int assembly_list output uses ArrayBase'
  )

  const prefabListNode = findNode(nodes, 'character_skill', 'assembly_list', 1)
  assert.strictEqual(Number(prefabListNode.concreteId?.nodeId), 1045)
  const prefabCountPin = prefabListNode.pins?.find(
    (pin) => Number(pin.i1?.kind) === 3 && Number(pin.i1?.index) === 0
  )
  assert.strictEqual(Number(prefabCountPin?.value?.bInt?.val), 1, 'one-element list count')
  assert.strictEqual(
    Boolean(prefabCountPin?.value?.alreadySetVal),
    false,
    'default list count remains unset'
  )
  checkPin(prefabListNode, 4, 0, 21, 8)
  const prefabListValue = prefabListNode.pins?.find(
    (pin) => Number(pin.i1?.kind) === 4 && Number(pin.i1?.index) === 0
  )?.value?.bConcreteValue?.value
  assert.strictEqual(Number(prefabListValue?.class), 10002, 'prefab assembly_list ArrayBase')
  assert.strictEqual(
    Number(prefabListValue?.itemType?.type_client?.type),
    21,
    'prefab assembly_list item type'
  )
  assert.deepStrictEqual(prefabListValue?.bArray?.entries ?? [], [], 'prefab assembly_list payload')

  const listValueNode = findNode(nodes, 'character_skill', 'get_corresponding_value_from_list')
  assert.strictEqual(Number(listValueNode.concreteId?.nodeId), 61)
  checkPin(listValueNode, 3, 1, 4, 1, true)
  checkPin(listValueNode, 4, 0, 3, 1)

  const dictionaryNode = findNode(nodes, 'character_skill', 'assembly_dictionary')
  const countPin = (dictionaryNode.pins ?? []).find(
    (pin) => Number(pin.i1?.kind) === 3 && Number(pin.i1?.index) === 0
  )
  assert.strictEqual(Number(countPin?.value?.bInt?.val), 2, 'dictionary key/value argument count')
  assert.strictEqual(
    Boolean(countPin?.value?.alreadySetVal),
    false,
    'one-pair dictionary uses the default count'
  )
  checkPin(dictionaryNode, 3, 1, 3, 2)
  checkPin(dictionaryNode, 3, 2, 3, 2, true)
}

{
  const nodes = decodeGraph('Generic_Creation_Status')
  const equalNode = findNode(nodes, 'creation_status', 'equal')
  assert.strictEqual(Number(equalNode.concreteId?.nodeId), 16)
  checkPin(equalNode, 3, 1, 1, 5, true)
  checkPin(equalNode, 3, 2, 1, 5, true)

  const branchesNode = findNode(nodes, 'creation_status', 'multiple_branches')
  assert.strictEqual(Number(branchesNode.concreteId?.nodeId), 4002)
  checkPin(branchesNode, 3, 0, 9, 1)
  checkPin(branchesNode, 3, 1, 10, 1)

  const customVariableNode = findNode(nodes, 'creation_status', 'get_custom_variable')
  assert.strictEqual(Number(customVariableNode.concreteId?.nodeId), 4201)
  const targetEntityPin = (customVariableNode.pins ?? []).find(
    (pin) => Number(pin.i1?.kind) === 3 && Number(pin.i1?.index) === 0
  )
  assert.strictEqual(Number(targetEntityPin?.type), 13)
  assert.strictEqual(Number(targetEntityPin?.value?.bEnum?.val), 6003)
  assert.strictEqual(targetEntityPin?.connects?.length ?? 0, 0)
}

{
  const nodes = decodeGraph('Generic_Default_Only_Branches')
  const branchesNode = findNode(nodes, 'creation_status', 'multiple_branches')
  assert.strictEqual(Number(branchesNode.concreteId?.nodeId), 4002)
  checkPin(branchesNode, 3, 0, 3, 0)
  checkPin(branchesNode, 3, 1, 4, 0)
}

{
  const nodes = decodeGraph('Generic_Status_Decision')
  const additionNode = findNode(nodes, 'creation_status_decision', 'addition')
  checkPin(additionNode, 4, 0, 3, 0)

  const greaterNode = findNode(nodes, 'creation_status_decision', 'greater_than')
  assert.strictEqual(Number(greaterNode.concreteId?.nodeId), 13)
  checkPin(greaterNode, 3, 1, 7, 1, true)
  checkPin(greaterNode, 3, 2, 7, 1)
}

{
  const nodes = decodeGraph('Generic_Bool_Filter')
  const additionNode = findNode(nodes, 'bool_filter', 'addition')
  assert.strictEqual(Number(additionNode.concreteId?.nodeId), 31)
  checkPin(additionNode, 3, 1, 7, 1)
  checkPin(additionNode, 3, 2, 7, 1)
  checkPin(additionNode, 4, 0, 7, 1)
}

console.log('[ok] client generic input/output specialization verified')
