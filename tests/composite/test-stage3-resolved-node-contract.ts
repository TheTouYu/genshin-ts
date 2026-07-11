// @ts-nocheck
import assert from 'node:assert/strict'
import { resolveArgumentTypes, resolveNodeIdentity } from '../../dist/src/compiler/ir_to_gia_transform/resolved_node.js'
import { resolveGiaNodeId } from '../../dist/src/compiler/ir_to_gia_transform/node_id.js'

const context = {
  scope: { kind: 'composite-impl', name: 'contract-fixture' },
  variablesByName: new Map([
    ['floatValue', { name: 'floatValue', type: 'float' }],
    ['vecValue', { name: 'vecValue', type: 'vec3' }]
  ]),
  connectionTypes: new Map(),
  strictTypeChecks: true
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

const customSetter = { id: 8, type: 'set_custom_variable', args: [
  { type: 'entity', value: 0 },
  { type: 'str', value: 'customFloat' },
  { type: 'float', value: 0 }
] }
const customGetter = { id: 9, type: 'get_custom_variable', args: [
  { type: 'entity', value: 0 },
  { type: 'str', value: 'customFloat' }
] }
const customContext = {
  ...context,
  connectionTypes: new Map([[9, new Map([[0, { type: 'float' }]])]])
}
assert.deepEqual(resolveNodeIdentity(customSetter, customContext), {
  logicalType: 'set_custom_variable', genericNodeId: 22, concreteNodeId: 26
})
assert.deepEqual(resolveNodeIdentity(customGetter, customContext), {
  logicalType: 'get_custom_variable', genericNodeId: 50, concreteNodeId: 54
})

assert.throws(() => resolveNodeIdentity({
  id: 3,
  type: 'set_node_graph_variable',
  args: [{ type: 'str', value: 'floatValue' }, { type: 'int', value: 0 }]
}, context), /E_TYPED_INPUT_CONFLICT/)

const getter = { id: 4, type: 'get_node_graph_variable', args: [{ type: 'str', value: 'floatValue' }] }
assert.deepEqual(resolveNodeIdentity(getter, context), {
  logicalType: 'get_node_graph_variable', genericNodeId: 337, concreteNodeId: 341
})

const rootIdentity = (node) => resolveGiaNodeId(
  node,
  context.connectionTypes,
  context.variablesByName
)
assert.equal(rootIdentity(floatNode), 324)
assert.equal(rootIdentity(vecNode), 334)
assert.equal(rootIdentity(getter), 341)

const rootFallbacks = []
assert.equal(resolveGiaNodeId({
  id: 7,
  type: 'set_node_graph_variable',
  args: [{ type: 'str', value: 'dictValue' }, { type: 'dict', dict: { k: 'int', v: 'float' } }]
}, context.connectionTypes, context.variablesByName, undefined, rootFallbacks), 2902)
assert.deepEqual(rootFallbacks, [{
  reason: 'missing-variable-declaration',
  nodeId: 7,
  nodeType: 'set_node_graph_variable',
  variableName: 'dictValue'
}, {
  reason: 'unsupported-resolved-type',
  nodeId: 7,
  nodeType: 'set_node_graph_variable'
}])

const fallbacks = []
const missingDeclarationContext = { ...context, fallbacks }
assert.deepEqual(resolveNodeIdentity({
  id: 5,
  type: 'get_node_graph_variable',
  args: [{ type: 'str', value: 'notDeclared' }]
}, missingDeclarationContext), {
  logicalType: 'get_node_graph_variable', genericNodeId: 337
})
assert.deepEqual(fallbacks, [{
  reason: 'missing-variable-declaration',
  nodeId: 5,
  nodeType: 'get_node_graph_variable',
  variableName: 'notDeclared'
}])

const unsupportedFallbacks = []
assert.deepEqual(resolveNodeIdentity({
  id: 6,
  type: 'set_node_graph_variable',
  args: [{ type: 'str', value: 'dictValue' }, { type: 'dict', dict: { k: 'int', v: 'float' } }]
}, { ...context, fallbacks: unsupportedFallbacks }), {
  logicalType: 'set_node_graph_variable', genericNodeId: 323
})
assert.deepEqual(unsupportedFallbacks, [{
  reason: 'missing-variable-declaration',
  nodeId: 6,
  nodeType: 'set_node_graph_variable',
  variableName: 'dictValue'
}, {
  reason: 'unsupported-resolved-type',
  nodeId: 6,
  nodeType: 'set_node_graph_variable'
}])

console.log('PASS P1-W6 custom-variable identity uses value/output type contracts')
