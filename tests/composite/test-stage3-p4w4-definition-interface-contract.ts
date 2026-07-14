// @ts-nocheck
/**
 * P4-W4: definition interface builder independent I/O contract.
 *
 * Pure-function contract for CompositeDef ParameterFlow / ControlFlow, bool enum
 * metadata, pinIndex, and impl graphId relation. Full GIA regressions remain in
 * bool / nested / sparse fixtures.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p4w4-definition-interface-contract.ts
 */
import assert from 'node:assert/strict'

import {
  CompositeDef_Type_Kind,
  GraphUnit_Id_Class,
  GraphUnit_Id_Type,
  GraphUnit_Which,
  NodeGraph_Id_Class,
  NodeGraph_Id_Kind,
  NodeGraph_Id_Type,
  NodePin_Index_Kind,
  NodeProperty_Type,
  VarBase_Class,
  VarType
} from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'
import {
  buildCompositeDefinitionInterface,
  buildCompositeParameterType,
  COMPOSITE_DEFINITION_INTERFACE_CONTRACT,
  DEFAULT_IMPL_GRAPH_ID_OFFSET,
  resolveImplGraphId
} from '../../dist/src/compiler/ir_to_gia_transform/build_composite_definition.js'

assert.equal(
  COMPOSITE_DEFINITION_INTERFACE_CONTRACT.implGraphIdOffset,
  DEFAULT_IMPL_GRAPH_ID_OFFSET
)
assert.equal(COMPOSITE_DEFINITION_INTERFACE_CONTRACT.boolEnumIdVal, 1)
assert.equal(
  COMPOSITE_DEFINITION_INTERFACE_CONTRACT.definitionGraphUnitWhich,
  GraphUnit_Which.CompositeGraph
)
assert.equal(
  COMPOSITE_DEFINITION_INTERFACE_CONTRACT.accessoryOrder,
  'definition-before-impl'
)

assert.equal(resolveImplGraphId(1610612745), 1610612745 + DEFAULT_IMPL_GRAPH_ID_OFFSET)
assert.equal(resolveImplGraphId(1610612745, 42), 42)

assert.deepEqual(buildCompositeParameterType('bool'), {
  class: VarBase_Class.EnumBase,
  type1: VarType.Boolean,
  type2: VarType.Boolean,
  enumId: { val: 1 },
  valueId: null
})
assert.deepEqual(buildCompositeParameterType('int'), {
  class: VarBase_Class.IntBase,
  type1: VarType.Integer,
  type2: VarType.Integer,
  valueId: null
})
assert.equal(buildCompositeParameterType('int').enumId, undefined)
assert.deepEqual(buildCompositeParameterType('float'), {
  class: VarBase_Class.FloatBase,
  type1: VarType.Float,
  type2: VarType.Float,
  valueId: null
})
assert.deepEqual(buildCompositeParameterType('local_variable'), {
  class: 0,
  type1: VarType.LocalVariable,
  type2: VarType.LocalVariable,
  valueId: null
})
assert.deepEqual(buildCompositeParameterType('vec3'), {
  class: VarBase_Class.VectorBase,
  type1: VarType.Vector,
  type2: VarType.Vector,
  valueId: null
})

const def = {
  id: 9004,
  name: 'P4W4_DefinitionInterface',
  inflows: [
    { name: '左', visible: true, index: 0, pinIndex: 100 },
    { name: '右', visible: true, index: 1, pinIndex: 101 }
  ],
  outflows: [
    { name: '完成', visible: true, index: 0, pinIndex: 200 },
    { name: '失败', visible: true, index: 1, pinIndex: 201 }
  ],
  inputs: [
    { name: '条件', visible: true, index: 0, type: 'bool', pinIndex: 300 },
    { name: '计数', visible: true, index: 1, type: 'int', pinIndex: 301 },
    { name: '稀疏', visible: true, index: 2, type: 'float', pinIndex: 302 }
  ],
  outputs: [
    { name: '结果', visible: true, index: 0, type: 'bool', pinIndex: 400 },
    { name: '局部变量', visible: true, index: 1, type: 'local_variable', pinIndex: 401 }
  ]
}

const built = buildCompositeDefinitionInterface({ def })
const expectedImplGraphId = 9004 + DEFAULT_IMPL_GRAPH_ID_OFFSET

assert.equal(built.implGraphId, expectedImplGraphId)

const { compositeDef, definitionGraphUnit } = built
assert.equal(compositeDef.name, 'P4W4_DefinitionInterface')
assert.equal(compositeDef.xxx, COMPOSITE_DEFINITION_INTERFACE_CONTRACT.compositeDefXxx)
assert.equal(compositeDef.type?.kind, CompositeDef_Type_Kind.Composite)
assert.deepEqual(compositeDef.id?.genericId, {
  class: NodeGraph_Id_Class.SystemDefined,
  type: NodeProperty_Type.Server,
  kind: NodeGraph_Id_Kind.SysGraph,
  id: 9004
})
assert.deepEqual(compositeDef.id?.concreteId, {
  class: NodeGraph_Id_Class.SystemDefined,
  type: NodeProperty_Type.Server,
  kind: NodeGraph_Id_Kind.SysGraph,
  id: 9004
})
assert.deepEqual(compositeDef.id?.graphId, {
  class: NodeGraph_Id_Class.UserDefined,
  type: NodeGraph_Id_Type.BasicNode,
  kind: NodeGraph_Id_Kind.CompositeGraph,
  id: expectedImplGraphId
})

assert.equal(compositeDef.inflows.length, 2)
assert.deepEqual(compositeDef.inflows[0], {
  name: '左',
  visible: true,
  index: { kind: NodePin_Index_Kind.InFlow, index: 0 },
  description: '',
  pinIndex: 100
})
assert.equal(compositeDef.inflows[1].pinIndex, 101)
assert.equal(compositeDef.outflows[1].pinIndex, 201)
assert.deepEqual(compositeDef.outflows[0].index, {
  kind: NodePin_Index_Kind.OutFlow,
  index: 0
})

assert.equal(compositeDef.inputs.length, 3)
assert.equal(compositeDef.inputs[0].name, '条件')
assert.equal(compositeDef.inputs[0].pinIndex, 300)
assert.deepEqual(compositeDef.inputs[0].index, {
  kind: NodePin_Index_Kind.InParam,
  index: 0
})
assert.deepEqual(compositeDef.inputs[0].type, {
  class: VarBase_Class.EnumBase,
  type1: VarType.Boolean,
  type2: VarType.Boolean,
  enumId: { val: 1 },
  valueId: null
})
assert.deepEqual(compositeDef.inputs[1].type, {
  class: VarBase_Class.IntBase,
  type1: VarType.Integer,
  type2: VarType.Integer,
  valueId: null
})
assert.equal(compositeDef.inputs[1].type?.enumId, undefined)
assert.equal(compositeDef.inputs[2].pinIndex, 302)
assert.equal(compositeDef.inputs[2].index?.index, 2)

assert.equal(compositeDef.outputs[0].pinIndex, 400)
assert.deepEqual(compositeDef.outputs[0].type, {
  class: VarBase_Class.EnumBase,
  type1: VarType.Boolean,
  type2: VarType.Boolean,
  enumId: { val: 1 },
  valueId: null
})
assert.equal(compositeDef.outputs[1].type?.type1, VarType.LocalVariable)
assert.equal(compositeDef.outputs[1].pinIndex, 401)

assert.equal(definitionGraphUnit.which, GraphUnit_Which.CompositeGraph)
assert.equal(definitionGraphUnit.name, 'P4W4_DefinitionInterface')
assert.deepEqual(definitionGraphUnit.id, {
  class: GraphUnit_Id_Class.AffiliatedNode,
  type: GraphUnit_Id_Type.ServerGraph,
  id: 9004
})
assert.deepEqual(definitionGraphUnit.relatedIds, [
  { class: GraphUnit_Id_Class.Basic, type: 0, id: expectedImplGraphId }
])
assert.equal(
  definitionGraphUnit.compositeDef?.inner?.def,
  compositeDef,
  'GraphUnit must wrap the same CompositeDef instance returned by the builder'
)

const overrideBuilt = buildCompositeDefinitionInterface({
  def,
  implGraphId: 424242
})
assert.equal(overrideBuilt.implGraphId, 424242)
assert.equal(overrideBuilt.compositeDef.id?.graphId?.id, 424242)
assert.equal(overrideBuilt.definitionGraphUnit.relatedIds?.[0]?.id, 424242)

console.log('PASS P4-W4 definition interface builder contract')
