// @ts-nocheck
import assert from 'node:assert/strict'
import { resolveArgumentTypes, resolveNodeIdentity } from '../../dist/src/compiler/ir_to_gia_transform/resolved_node.js'

const context = {
  scope: { kind: 'composite-impl', name: 'contract-fixture' },
  variablesByName: new Map([
    ['floatValue', { name: 'floatValue', type: 'float' }],
    ['vecValue', { name: 'vecValue', type: 'vec3' }]
  ]),
  connectionTypes: new Map()
}

const floatNode = { id: 1, type: 'set_node_graph_variable', args: [
  { type: 'str', value: 'floatValue' },
  { type: 'float', value: 0 }
] }
const vecNode = { id: 2, type: 'set_node_graph_variable', args: [
  { type: 'str', value: 'vecValue' },
  { type: 'vec3', value: [0, 1, 0] }
] }

assert.deepEqual(resolveArgumentTypes(floatNode, context)[1].type, { kind: 'scalar', name: 'float' })
assert.deepEqual(resolveArgumentTypes(vecNode, context)[1].type, { kind: 'scalar', name: 'vec3' })
assert.deepEqual(resolveNodeIdentity(floatNode, context), {
  logicalType: 'set_node_graph_variable', genericNodeId: 323, concreteNodeId: 324
})
assert.deepEqual(resolveNodeIdentity(vecNode, context), {
  logicalType: 'set_node_graph_variable', genericNodeId: 323, concreteNodeId: 334
})

assert.throws(() => resolveNodeIdentity({
  id: 3,
  type: 'set_node_graph_variable',
  args: [{ type: 'str', value: 'floatValue' }, { type: 'int', value: 0 }]
}, context), /E_TYPED_INPUT_CONFLICT/)

console.log('PASS P1-W1 resolved node contract: float/vec variants and typed conflict')
