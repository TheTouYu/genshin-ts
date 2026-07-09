import type { ValueType } from '../../runtime/IR.js'
import type { NodeType } from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/nodes.js'
import {
  VarBase_Class,
  VarType
} from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'

export type IrScalarType =
  | 'bool'
  | 'int'
  | 'float'
  | 'str'
  | 'vec3'
  | 'guid'
  | 'entity'
  | 'prefab_id'
  | 'config_id'
  | 'faction'

export type VendorBaseTag = 'Bol' | 'Int' | 'Flt' | 'Str' | 'Vec' | 'Gid' | 'Ety' | 'Fct' | 'Cfg' | 'Pfb'

const VENDOR_BASE_TAGS: Record<IrScalarType, VendorBaseTag> = {
  bool: 'Bol',
  int: 'Int',
  float: 'Flt',
  str: 'Str',
  vec3: 'Vec',
  guid: 'Gid',
  entity: 'Ety',
  faction: 'Fct',
  config_id: 'Cfg',
  prefab_id: 'Pfb'
}

const VAR_BASE_CLASSES: Record<IrScalarType, VarBase_Class> = {
  bool: VarBase_Class.EnumBase,
  int: VarBase_Class.IntBase,
  float: VarBase_Class.FloatBase,
  str: VarBase_Class.StringBase,
  vec3: VarBase_Class.VectorBase,
  guid: VarBase_Class.IdBase,
  entity: VarBase_Class.IdBase,
  faction: VarBase_Class.IdBase,
  config_id: VarBase_Class.IdBase,
  prefab_id: VarBase_Class.IdBase
}

const SCALAR_VAR_TYPES: Record<IrScalarType, VarType> = {
  bool: VarType.Boolean,
  int: VarType.Integer,
  float: VarType.Float,
  str: VarType.String,
  vec3: VarType.Vector,
  guid: VarType.GUID,
  entity: VarType.Entity,
  faction: VarType.Faction,
  config_id: VarType.Configuration,
  prefab_id: VarType.Prefab
}

const LIST_VAR_TYPES: Record<IrScalarType, VarType> = {
  bool: VarType.BooleanList,
  int: VarType.IntegerList,
  float: VarType.FloatList,
  str: VarType.StringList,
  vec3: VarType.VectorList,
  guid: VarType.GUIDList,
  entity: VarType.EntityList,
  faction: VarType.FactionList,
  config_id: VarType.ConfigurationList,
  prefab_id: VarType.PrefabList
}

const NODE_SUFFIXES: Record<IrScalarType, string> = {
  bool: 'bool',
  int: 'int',
  float: 'float',
  str: 'str',
  vec3: 'vec',
  guid: 'guid',
  entity: 'entity',
  faction: 'faction',
  config_id: 'config',
  prefab_id: 'prefab'
}

export function isListType(type: string): boolean {
  return type.endsWith('_list')
}

export function listElementType(type: string): string | null {
  if (!isListType(type)) return null
  return type.slice(0, -5)
}

function scalarType(type: string): IrScalarType | null {
  return Object.prototype.hasOwnProperty.call(VENDOR_BASE_TAGS, type) ? (type as IrScalarType) : null
}

export function irTypeToVendorBaseTag(type: string): VendorBaseTag | null {
  const elementType = listElementType(type)
  const scalar = scalarType(elementType ?? type)
  return scalar ? VENDOR_BASE_TAGS[scalar] : null
}

export function irTypeToVarBaseClass(type: string): VarBase_Class | 0 {
  const elementType = listElementType(type)
  const scalar = scalarType(elementType ?? type)
  return scalar ? VAR_BASE_CLASSES[scalar] : 0
}

export function irTypeToVarType(type: string): VarType | 0 {
  const elementType = listElementType(type)
  if (elementType) {
    const scalar = scalarType(elementType)
    return scalar ? LIST_VAR_TYPES[scalar] : 0
  }
  const scalar = scalarType(type)
  return scalar ? SCALAR_VAR_TYPES[scalar] : 0
}

export function irTypeToNodeSuffix(type: ValueType): string | undefined {
  const elementType = listElementType(type)
  if (elementType) {
    const baseSuffix = irTypeToNodeSuffix(elementType as ValueType)
    return baseSuffix ? `list_${baseSuffix}` : undefined
  }
  const scalar = scalarType(type)
  return scalar ? NODE_SUFFIXES[scalar] : undefined
}

export function irScalarTypeToNodeType(type: IrScalarType): NodeType {
  return { t: 'b', b: VENDOR_BASE_TAGS[type] }
}

export function irTypeToNodeType(type: ValueType): NodeType {
  const elementType = listElementType(type)
  if (elementType) {
    const scalar = scalarType(elementType)
    if (!scalar) throw new Error(`[error] unsupported list element type "${elementType}"`)
    return { t: 'l', i: irScalarTypeToNodeType(scalar) }
  }
  if (type === 'dict') {
    throw new Error('[error] dict type requires key/value types')
  }
  const scalar = scalarType(type)
  if (!scalar) throw new Error(`[error] unsupported value type "${type}"`)
  return irScalarTypeToNodeType(scalar)
}
