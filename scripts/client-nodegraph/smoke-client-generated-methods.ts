/**
 * Phase 4 smoke: each client family builds a graph calling generated
 * (doc-named, client-only where possible) methods, then runs the full
 * IR -> GIA -> decode round trip with node identity assertions.
 */
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

import { irToGia } from '../../src/compiler/ir_to_gia_transform/index.js'
import { buildClientGraphRegistriesIRDocuments, g } from '../../src/runtime/core.js'
import type { ClientGraphSubType } from '../../src/runtime/IR.js'
import { requireClientNodeMetadata } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_helpers.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH =
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
const OUT_DIR = 'tests/client_generated'

g.characterSkill({ id: 1082130433, name: 'GenSkill' }).on('start', (_evt, f) => {
  // nested call: the outer node takes a wired input on signature index 0,
  // which must land on physical pin 1 (pin 0 is the hidden selector enum)
  const target = f._3dVectorAddition(f._3dVectorAddition([1, 2, 3], [4, 5, 6]), [7, 8, 9])
  f.doubleBranch(
    f.equal(1n, 2n),
    () => f.fixedPointDisplacement(1.5, 0.5, 8, target, true),
    () => f.forceExitAimingState()
  )
})

g.characterControlSkill({ id: 1082130439, name: 'GenControlSkill' }).on('start', (_evt, f) => {
  // zh-only doc family (pre-aiming/cursor/control-motor): query feeds exec
  const motor = f.getCurrentFollowingControlMotor()
  f.addVelocity(motor, 1.5, [0, 1, 0], 0.5)
  f.setControlMotorToUngroundedState(motor, 0.2)
})

g.creationSkill({ id: 1082130434, name: 'GenCreationSkill' }).on('start', (_evt, f) => {
  f.complexCreationTeleport([0, 1, 0], [0, 90, 0])
  f.notifyServerNodeGraph('a', 'b', 'c')
})

g.creationStatus({ id: 1082130435, name: 'GenCreationStatus' }).on('start', (_evt, f) => {
  f.executeSkill(true, 3n)
})

g.creationStatusDecision({ id: 1082130436, name: 'GenDecision' }).on('start', (_evt, f) => {
  f.doubleBranch(
    f.equal(1n, 1n),
    () => {},
    () => {}
  )
})

g.boolFilter({ id: 1082130437, name: 'GenBoolFilter' }).on('start', (_evt, f) => {
  return f.equal(1n, 2n)
})

g.intFilter({ id: 1082130438, name: 'GenIntFilter' }).on('start', (_evt, f) => {
  return f.getRandomNumber(1n, 10n)
})

const EXPECTED_NODE_TYPES: Record<ClientGraphSubType, string[]> = {
  character_skill: [
    'node_graph_begins',
    '_3d_vector_addition',
    '_3d_vector_addition',
    'equal',
    'double_branch',
    'fixed_point_displacement',
    'force_exit_aiming_state'
  ],
  character_control_skill: [
    'node_graph_begins',
    'get_current_following_control_motor',
    'add_velocity',
    'set_control_motor_to_ungrounded_state'
  ],
  creation_skill: ['node_graph_begins', 'complex_creation_teleport', 'notify_server_node_graph'],
  creation_status: ['node_graph_begins', 'execute_skill'],
  creation_status_decision: ['node_graph_begins', 'equal', 'double_branch'],
  bool_filter: ['equal', 'node_graph_end_boolean'],
  int_filter: ['get_random_number', 'node_graph_end_integer']
}

fs.mkdirSync(OUT_DIR, { recursive: true })

const docs = buildClientGraphRegistriesIRDocuments()
assert.strictEqual(docs.length, 7, 'expected 7 client IR documents')

for (const doc of docs) {
  assert.strictEqual(doc.graph.type, 'client')
  const subType = doc.graph.sub_type as ClientGraphSubType
  const expected = EXPECTED_NODE_TYPES[subType]

  const bytes = irToGia(doc, { protoPath: PROTO_PATH })
  const outFile = path.join(OUT_DIR, `generated_methods_${subType}.gia`)
  fs.writeFileSync(outFile, bytes)

  const decoded = decode_gia_file(outFile, undefined, true)
  const nodes = decoded.graph.graph?.inner.graph?.nodes ?? []
  const decodedGenericIds = new Set(nodes.map((n: any) => Number(n.genericId?.nodeId)))

  for (const nodeType of expected) {
    const metadata = requireClientNodeMetadata(subType, nodeType)
    assert.ok(
      decodedGenericIds.has(metadata.genericId),
      `${subType}: decoded graph missing ${nodeType} (genericId=${metadata.genericId})`
    )
  }
  assert.strictEqual(
    nodes.length,
    expected.length,
    `${subType}: node count ${nodes.length} != expected ${expected.length}`
  )

  console.log(`[ok] ${subType}: ${expected.length} nodes round-tripped (${expected.join(', ')})`)
}
