import assert from 'node:assert'
import path from 'node:path'

import { irToGia } from '../../src/compiler/ir_to_gia_transform/index.js'
import { loadGiaProto } from '../../src/injector/proto.js'
import type { ClientIRDocument } from '../../src/runtime/IR.js'
import {
  NodePin_Index_Kind,
  type Root as GiaRoot
} from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'

const protoPath = path.resolve(
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
)
const { rootMessage } = loadGiaProto(protoPath)

function decode(document: ClientIRDocument) {
  const bytes = irToGia(document, { protoPath })
  const message = rootMessage.decode(bytes.slice(20, -4))
  return rootMessage.toObject(message, { defaults: true, longs: Number }) as GiaRoot
}

function inputPin(root: GiaRoot, genericId: number, nodeIndex: number, pinIndex: number) {
  const node = root.graph?.graph?.inner.graph?.nodes?.find(
    (candidate) =>
      Number(candidate.genericId?.nodeId) === genericId && Number(candidate.nodeIndex) === nodeIndex
  )
  assert.ok(node, `missing genericId ${genericId} node ${nodeIndex}`)
  const pin = node.pins?.find(
    (candidate) =>
      Number(candidate.i1?.kind) === NodePin_Index_Kind.InParam &&
      Number(candidate.i1?.index) === pinIndex
  )
  assert.ok(pin, `missing genericId ${genericId} node ${nodeIndex} input ${pinIndex}`)
  return pin
}

const projectile = decode({
  ir_version: 1,
  ir_type: 'node_graph',
  graph: {
    type: 'client',
    sub_type: 'character_control_skill',
    mode: 'beyond',
    id: 1082130990
  },
  nodes: [
    {
      id: 1,
      type: 'fixed_point_projectile_launch',
      args: [{ type: 'prefab_id', value: 10001 }]
    },
    {
      id: 2,
      type: 'fixed_point_projectile_launch'
    }
  ]
})

const projectileValue = inputPin(projectile, 200052, 1, 0).value
assert.strictEqual(projectileValue?.alreadySetVal, true)
assert.strictEqual(Number(projectileValue?.bId?.val), 10001)
assert.strictEqual(Number(projectileValue?.clientInlineBinding?.typeTag), 3)
assert.strictEqual(Number(projectileValue?.clientInlineBinding?.bindingInt?.val), 50000)

const projectileDefault = inputPin(projectile, 200052, 2, 0).value
assert.strictEqual(projectileDefault?.alreadySetVal, false)
assert.strictEqual(Number(projectileDefault?.bId?.val), 0)
assert.strictEqual(Number(projectileDefault?.clientInlineBinding?.typeTag), 3)
assert.strictEqual(Number(projectileDefault?.clientInlineBinding?.bindingInt?.val), 50000)

const statusId = 1082130438
const decision = decode({
  ir_version: 1,
  ir_type: 'node_graph',
  graph: {
    type: 'client',
    sub_type: 'creation_status_decision',
    mode: 'beyond',
    id: 1082130991
  },
  nodes: [
    {
      id: 1,
      type: 'switch_to_self_execution_status',
      args: [
        { type: 'bool', value: true },
        { type: 'config_id', value: statusId },
        { type: 'int', value: 1 }
      ]
    },
    {
      id: 2,
      type: 'switch_to_self_execution_status'
    }
  ]
})

const configValue = inputPin(decision, 200128, 1, 1).value
assert.strictEqual(configValue?.alreadySetVal, true)
assert.strictEqual(Number(configValue?.bId?.val), statusId)
assert.strictEqual(Number(configValue?.clientInlineBinding?.typeTag), 12)
assert.strictEqual(Number(configValue?.clientInlineBinding?.bindingEnum?.val), 1)

const configDefault = inputPin(decision, 200128, 2, 1).value
assert.strictEqual(configDefault?.alreadySetVal, false)
assert.strictEqual(Number(configDefault?.bId?.val), 0)
assert.strictEqual(Number(configDefault?.clientInlineBinding?.typeTag), 12)
assert.strictEqual(Number(configDefault?.clientInlineBinding?.bindingEnum?.val), 1)

console.log('[ok] client inline config/prefab ID encoding verified')
