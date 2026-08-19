// @ts-nocheck
import assert from 'node:assert/strict'
import { resolveArgumentTypes, resolveNodeIdentity } from '../../dist/src/compiler/ir_to_gia_transform/resolved_node.js'
import { resolveGiaNodeId } from '../../dist/src/compiler/ir_to_gia_transform/node_id.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

const dtcVariants = [
  ['int', 'bool', 180],
  ['int', 'float', 181],
  ['int', 'str', 182],
  ['entity', 'str', 183],
  ['guid', 'str', 184],
  ['bool', 'int', 185],
  ['bool', 'str', 186],
  ['float', 'int', 187],
  ['float', 'str', 188],
  ['vec3', 'str', 189],
  ['faction', 'str', 255]
]
for (const [inputType, outputType, concreteNodeId] of dtcVariants) {
  const node = {
    id: 100 + concreteNodeId,
    type: `data_type_conversion_${outputType}`,
    args: [{ type: inputType, value: null }]
  }
  assert.deepEqual(resolveNodeIdentity(node, context), {
    logicalType: node.type,
    genericNodeId: 180,
    concreteNodeId
  })
  assert.equal(resolveGiaNodeId(node, context.connectionTypes, context.variablesByName), concreteNodeId)
}

const scalarArithmeticVariants = [
  ['addition', 200, 201],
  ['subtraction', 202, 203],
  ['multiplication', 204, 205],
  ['division', 206, 207]
]
for (const [type, intConcreteNodeId, floatConcreteNodeId] of scalarArithmeticVariants) {
  for (const [valueType, concreteNodeId] of [
    ['int', intConcreteNodeId],
    ['float', floatConcreteNodeId]
  ]) {
    const node = {
      id: 300 + concreteNodeId,
      type,
      args: [{ type: valueType, value: 8 }, { type: valueType, value: 2 }]
    }
    assert.deepEqual(resolveNodeIdentity(node, context), {
      logicalType: type,
      genericNodeId: intConcreteNodeId,
      concreteNodeId
    })
    assert.equal(resolveGiaNodeId(node, context.connectionTypes, context.variablesByName), concreteNodeId)
  }
}

const scalarComparisonVariants = [
  ['equal', 14, 370, 371],
  ['less_than', 230, 230, 235],
  ['less_than_or_equal_to', 231, 231, 236],
  ['greater_than', 232, 232, 237],
  ['greater_than_or_equal_to', 233, 233, 238]
]
for (const [type, genericNodeId, intConcreteNodeId, floatConcreteNodeId] of scalarComparisonVariants) {
  for (const [valueType, concreteNodeId] of [
    ['int', intConcreteNodeId],
    ['float', floatConcreteNodeId]
  ]) {
    const node = {
      id: 400 + concreteNodeId,
      type,
      args: [{ type: valueType, value: 8 }, { type: valueType, value: 2 }]
    }
    assert.deepEqual(resolveNodeIdentity(node, context), {
      logicalType: type,
      genericNodeId,
      concreteNodeId
    })
    assert.equal(resolveGiaNodeId(node, context.connectionTypes, context.variablesByName), concreteNodeId)
  }
}

// P5-W7 residual scalar shared identity (typed + generic-only samples)
const residualTypedVariants = [
  ['exponentiation', 209, 210],
  ['absolute_value_operation', 216, 217],
  ['take_larger_value', 211, 212]
]
for (const [type, intConcreteNodeId, floatConcreteNodeId] of residualTypedVariants) {
  for (const [valueType, concreteNodeId] of [
    ['int', intConcreteNodeId],
    ['float', floatConcreteNodeId]
  ]) {
    const args =
      type === 'absolute_value_operation'
        ? [{ type: valueType, value: 8 }]
        : [{ type: valueType, value: 8 }, { type: valueType, value: 2 }]
    const node = { id: 500 + concreteNodeId, type, args }
    assert.deepEqual(resolveNodeIdentity(node, context), {
      logicalType: type,
      genericNodeId: intConcreteNodeId,
      concreteNodeId
    })
    assert.equal(resolveGiaNodeId(node, context.connectionTypes, context.variablesByName), concreteNodeId)
  }
}
const residualGenericOnly = { id: 560, type: 'modulo_operation', args: [
  { type: 'int', value: 8 },
  { type: 'int', value: 3 }
] }
const residualGenericIdentity = resolveNodeIdentity(residualGenericOnly, context)
assert.equal(residualGenericIdentity.logicalType, 'modulo_operation')
assert.equal(residualGenericIdentity.genericNodeId, 208)
assert.equal(residualGenericIdentity.concreteNodeId, undefined)
assert.equal(
  resolveGiaNodeId(residualGenericOnly, context.connectionTypes, context.variablesByName),
  208
)

// P5-W8 enumerations_equal shared enum-kind identity (literal + connection)
const enumLiteralNode = {
  id: 570,
  type: 'enumerations_equal',
  args: [
    { type: 'enum', value: 'comparison_operator_equal_to' },
    { type: 'enum', value: 'comparison_operator_equal_to' }
  ]
}
assert.deepEqual(resolveNodeIdentity(enumLiteralNode, context), {
  logicalType: 'enumerations_equal',
  genericNodeId: 475,
  concreteNodeId: 476
})
assert.equal(
  resolveGiaNodeId(enumLiteralNode, context.connectionTypes, context.variablesByName),
  476
)
const disruptorAliasNode = {
  id: 572,
  type: 'enumerations_equal',
  args: [
    { type: 'enum', value: 'disruptor_device_type_tractor_device' },
    { type: 'enum', value: 'disruptor_device_type_ejector' }
  ]
}
assert.deepEqual(resolveNodeIdentity(disruptorAliasNode, context), {
  logicalType: 'enumerations_equal',
  genericNodeId: 475,
  concreteNodeId: 497
})
const enumConnContext = {
  ...context,
  connectionTypes: new Map([
    [900, new Map([[0, { type: 'enum', enum: 'comparison_operator' }]])]
  ])
}
const enumConnNode = {
  id: 571,
  type: 'enumerations_equal',
  args: [
    { type: 'conn', value: { node_id: 900, index: 0, type: 'enum', enum: 'comparison_operator' } },
    { type: 'conn', value: { node_id: 900, index: 0, type: 'enum', enum: 'comparison_operator' } }
  ]
}
assert.deepEqual(resolveNodeIdentity(enumConnNode, enumConnContext), {
  logicalType: 'enumerations_equal',
  genericNodeId: 475,
  concreteNodeId: 476
})
assert.equal(
  resolveGiaNodeId(enumConnNode, enumConnContext.connectionTypes, enumConnContext.variablesByName),
  476
)

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

const localSetter = { id: 10, type: 'set_local_variable', args: [
  { type: 'local_variable', value: 0 },
  { type: 'float', value: 0 }
] }
const localGetter = { id: 11, type: 'get_local_variable', args: [{ type: 'float', value: 0 }] }
const localContext = {
  ...context,
  connectionTypes: new Map([[11, new Map([[1, { type: 'float' }]])]])
}
assert.deepEqual(resolveNodeIdentity(localSetter, localContext), {
  logicalType: 'set_local_variable', genericNodeId: 19, concreteNodeId: 2677
})
assert.deepEqual(resolveNodeIdentity(localGetter, localContext), {
  logicalType: 'get_local_variable', genericNodeId: 18, concreteNodeId: 2659
})

// P5-W4: empty legacy typed-identity adapter surface is deleted.
const compositeSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../src/compiler/ir_to_gia_transform/composite.ts'),
  'utf8'
)
assert.equal(/\busesLegacyImplTypedIdentityAdapter\b/.test(compositeSource), false)
assert.equal(/\bresolveLegacyImplTypedNodeId\b/.test(compositeSource), false)
assert.equal(/\bLEGACY_IMPL_TYPED_IDENTITY_NODE_TYPES\b/.test(compositeSource), false)
assert.equal(/\blegacyImplValueTypeSuffix\b/.test(compositeSource), false)

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
assert.equal(rootIdentity(customSetter), 26)
assert.equal(resolveGiaNodeId(customGetter, customContext.connectionTypes, context.variablesByName), 54)
assert.equal(resolveGiaNodeId(localSetter, localContext.connectionTypes, context.variablesByName), 2677)
assert.equal(resolveGiaNodeId(localGetter, localContext.connectionTypes, context.variablesByName), 2659)

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
  logicalType: 'set_node_graph_variable', genericNodeId: 323, concreteNodeId: 2902
})
// 2026-08-19 对齐：dict KV 变体族统一（0388e87, 08-14）后，复合路径与根路径（上方 rootFallbacks 同为 2902）
// 一致解析 dict 具体变体；成功解析后不再记录 unsupported-resolved-type。
assert.deepEqual(unsupportedFallbacks, [{
  reason: 'missing-variable-declaration',
  nodeId: 6,
  nodeType: 'set_node_graph_variable',
  variableName: 'dictValue'
}])

console.log('PASS P1-W6 custom-variable identity uses value/output type contracts')
