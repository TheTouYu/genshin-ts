import assert from 'node:assert/strict'

import {
  irScalarTypeToNodeType,
  irTypeToNodeSuffix,
  irTypeToVarBaseClass,
  irTypeToVarType,
  irTypeToVendorBaseTag,
  isListType,
  listElementType
} from '../../../../src/compiler/ir_to_gia_transform/vartype_map.js'
import {
  VarBase_Class,
  VarType
} from '../../../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'

const scalarCases = [
  {
    type: 'bool',
    vendorBaseTag: 'Bol',
    varBaseClass: VarBase_Class.EnumBase,
    varType: VarType.Boolean,
    nodeSuffix: 'bool'
  },
  {
    type: 'int',
    vendorBaseTag: 'Int',
    varBaseClass: VarBase_Class.IntBase,
    varType: VarType.Integer,
    nodeSuffix: 'int'
  },
  {
    type: 'float',
    vendorBaseTag: 'Flt',
    varBaseClass: VarBase_Class.FloatBase,
    varType: VarType.Float,
    nodeSuffix: 'float'
  },
  {
    type: 'str',
    vendorBaseTag: 'Str',
    varBaseClass: VarBase_Class.StringBase,
    varType: VarType.String,
    nodeSuffix: 'str'
  },
  {
    type: 'vec3',
    vendorBaseTag: 'Vec',
    varBaseClass: VarBase_Class.VectorBase,
    varType: VarType.Vector,
    nodeSuffix: 'vec'
  },
  {
    type: 'guid',
    vendorBaseTag: 'Gid',
    varBaseClass: VarBase_Class.IdBase,
    varType: VarType.GUID,
    nodeSuffix: 'guid'
  },
  {
    type: 'entity',
    vendorBaseTag: 'Ety',
    varBaseClass: VarBase_Class.IdBase,
    varType: VarType.Entity,
    nodeSuffix: 'entity'
  },
  {
    type: 'prefab_id',
    vendorBaseTag: 'Pfb',
    varBaseClass: VarBase_Class.IdBase,
    varType: VarType.Prefab,
    nodeSuffix: 'prefab'
  },
  {
    type: 'config_id',
    vendorBaseTag: 'Cfg',
    varBaseClass: VarBase_Class.IdBase,
    varType: VarType.Configuration,
    nodeSuffix: 'config'
  },
  {
    type: 'faction',
    vendorBaseTag: 'Fct',
    varBaseClass: VarBase_Class.IdBase,
    varType: VarType.Faction,
    nodeSuffix: 'faction'
  }
] as const

for (const c of scalarCases) {
  assert.equal(isListType(c.type), false, `${c.type}: scalar should not be list type`)
  assert.equal(listElementType(c.type), null, `${c.type}: scalar should not have list element type`)
  assert.equal(irTypeToVendorBaseTag(c.type), c.vendorBaseTag, `${c.type}: vendor base tag`)
  assert.equal(irTypeToVarBaseClass(c.type), c.varBaseClass, `${c.type}: var base class`)
  assert.equal(irTypeToVarType(c.type), c.varType, `${c.type}: var type`)
  assert.equal(irTypeToNodeSuffix(c.type), c.nodeSuffix, `${c.type}: node suffix`)
  assert.deepEqual(irScalarTypeToNodeType(c.type), { t: 'b', b: c.vendorBaseTag }, `${c.type}: scalar node type`)
}

for (const c of scalarCases) {
  const listType = `${c.type}_list`
  assert.equal(isListType(listType), true, `${listType}: should be list type`)
  assert.equal(listElementType(listType), c.type, `${listType}: list element type`)
  assert.equal(irTypeToVendorBaseTag(listType), c.vendorBaseTag, `${listType}: vendor base tag`)
  assert.equal(irTypeToVarBaseClass(listType), c.varBaseClass, `${listType}: var base class`)
  assert.notEqual(c.varType, 0, `${listType}: scalar varType should never be 0`)
  assert.notEqual(irTypeToVarType(listType), 0, `${listType}: list varType should never be 0`)
  assert.equal(irTypeToNodeSuffix(listType), `list_${c.nodeSuffix}`, `${listType}: node suffix`)
}

const expectedListVarTypes = new Map<string, number>([
  ['bool_list', VarType.BooleanList],
  ['int_list', VarType.IntegerList],
  ['float_list', VarType.FloatList],
  ['str_list', VarType.StringList],
  ['vec3_list', VarType.VectorList],
  ['guid_list', VarType.GUIDList],
  ['entity_list', VarType.EntityList],
  ['prefab_id_list', VarType.PrefabList],
  ['config_id_list', VarType.ConfigurationList],
  ['faction_list', VarType.FactionList]
])

for (const [type, expected] of expectedListVarTypes) {
  assert.equal(irTypeToVarType(type), expected, `${type}: list var type`)
}

const unsupportedCases = ['dict', 'enum', 'local_variable']
for (const type of unsupportedCases) {
  assert.equal(irTypeToVendorBaseTag(type), null, `${type}: unsupported vendor base tag should be null`)
  assert.equal(irTypeToVarBaseClass(type), 0, `${type}: unsupported var base class should be 0`)
  assert.equal(irTypeToVarType(type), 0, `${type}: unsupported var type should be 0`)
  assert.equal(irTypeToNodeSuffix(type as never), undefined, `${type}: unsupported node suffix should be undefined`)
}

assert.equal(irTypeToVendorBaseTag('bool_list_list'), null, 'bool_list_list: nested list vendor base tag should be null')
assert.equal(irTypeToVarBaseClass('bool_list_list'), 0, 'bool_list_list: nested list var base class should be 0')
assert.equal(irTypeToVarType('bool_list_list'), 0, 'bool_list_list: nested list var type should be 0')

console.log(`VarType map assertions passed. Checked scalar=${scalarCases.length}, list=${expectedListVarTypes.size}`)
