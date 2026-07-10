import { loadGiaProto } from '../../injector/proto.js'
import { resolveGraphIdForGraph } from '../../runtime/graph_defaults.js'
import type { ClientIRDocument } from '../../runtime/IR.js'
import { CLIENT_ERROR_CODES, clientNodegraphError } from '../../shared/client_capability_errors.js'
import {
  CLIENT_ENUM_VALUES,
  ENUM_MATCH_ROWS_BY_CLASS
} from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_enum_values.js'
import type { ClientNodeMetadata } from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.js'
import { NodePin_Index_Kind, VarBase_Class } from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'
import {
  CLIENT_REFLECT_IOC_BY_TYPE,
  client_graph_body,
  client_inline_var_value,
  client_list_literal_value,
  client_literal_value,
  client_node_body,
  client_node_connect_from,
  client_node_connect_to,
  client_signal_name_value,
  client_value_base,
  client_wrapped_value,
  getClientGraphEncoding,
  wrap_gia,
  type Root as GiaRoot
} from '../gia_vendor.js'
import {
  CLIENT_VAR_TYPE_BY_IR_TYPE,
  customVariableTypeOffset,
  DICT_REFLECT_NODE_TYPES,
  resolveClientConcreteVariant,
  resolveClientNodeMetadata
} from './client_nodes.js'
import type { IrToGiaOptions } from './index.js'
import { parseEnumValue } from './mappings.js'
import { buildExecutionGraph, layoutPositions } from './layout.js'
import { buildConnTypeIndex, type ConnTypeIndex } from './node_id.js'
import type { IRNode, NodeId } from './types.js'

const PIN_KIND_OUT_FLOW = NodePin_Index_Kind.OutFlow
const PIN_KIND_IN_PARAM = NodePin_Index_Kind.InParam
const PIN_KIND_CLIENT_EXEC = NodePin_Index_Kind.ClientExecNode
const CLIENT_VAR_TYPE_ENUM = 13
const CLIENT_SEND_SIGNAL_PLACEHOLDER_GID = 300002

/** element ClientVarType -> list ClientVarType */
const LIST_TYPE_BY_ELEM_TYPE: Record<number, number> = {
  1: 2,
  3: 4,
  5: 6,
  7: 8,
  9: 10,
  11: 12,
  13: 17,
  14: 15,
  16: 25,
  18: 20,
  19: 21
}

type ClientGiaNode = ReturnType<typeof client_node_body>
type IrArg = NonNullable<IRNode['args']>[number]
type ValueArg = Exclude<IrArg, null | { type: 'conn' }>

function isValueArg(arg: IrArg | null | undefined): arg is ValueArg {
  return arg != null && arg.type !== 'conn'
}

function toPinLiteral(clientVarType: number, value: unknown, argIndex: number, nodeType: string) {
  if (clientVarType === CLIENT_VAR_TYPE_ENUM && typeof value === 'string') {
    return CLIENT_ENUM_VALUES[value] ?? parseEnumValue(value, argIndex, nodeType).enumValue
  }
  return value
}

export function argPinIndex(metadata: ClientNodeMetadata, argIndex: number): number {
  return metadata.argPins?.[argIndex] ?? argIndex
}

function pinI2Index(
  metadata: ClientNodeMetadata,
  kind: 'output' | 'in_flow' | 'out_flow',
  index: number
): number {
  const pins = kind === 'output' ? metadata.outputs : (metadata.flows ?? [])
  const pin = pins.find((p) => p.kind === kind && p.index === index)
  return pin?.i2Index ?? index
}

function findInPin(node: ClientGiaNode, pinIndex: number) {
  return node.pins.find((p) => p.i1?.kind === PIN_KIND_IN_PARAM && p.i1.index === pinIndex)
}

function setInPinValue(
  node: ClientGiaNode,
  pinIndex: number,
  clientVarType: number,
  value: ReturnType<typeof client_literal_value>,
  ioc = 0
) {
  const pin = findInPin(node, pinIndex)
  if (!pin) throw new Error(`[error] missing input pin index ${pinIndex}`)
  pin.type = clientVarType
  pin.value = client_wrapped_value(ioc, value)
}

function irTypeOfArg(arg: IrArg | undefined): string | undefined {
  if (arg == null) return undefined
  return arg.type === 'conn' ? arg.value.type : arg.type
}

/** 输出类型由连线推断的反射节点（变量读取 + 字典取值/取键/取值列表） */
const OUTPUT_INFERRED_NODE_TYPES = new Set([
  'get_custom_variable',
  'get_list_of_values_from_dictionary',
  'get_list_of_keys_from_dictionary',
  'query_dictionary_value_by_key'
])

/**
 * 反射输出类型由输出连线推断（与服务器 inferTypedNodeIdFromOutputs 同思路）。
 * 无消费者的数据节点在 IR 构建阶段已被剪枝，因此这里总有连线可用。
 */
function inferredOutputIrType(irNode: IRNode, connIndex: ConnTypeIndex): string | undefined {
  if (!OUTPUT_INFERRED_NODE_TYPES.has(irNode.type)) return undefined
  const outputs = connIndex.get(irNode.id)
  if (!outputs) return undefined
  for (const info of outputs.values()) {
    return info.type
  }
  return undefined
}

function resolvedVariant(metadata: ClientNodeMetadata, concreteId: number | string) {
  return metadata.reflectMap?.find((v) => v.concreteId === concreteId)
}

/**
 * indexOfConcrete of reflective pins = rank of the resolved variant among the
 * node's concrete ids in ascending order. Corpus-proven: 200019 cids 100..109
 * -> ioc 0..9; assembly_list cids 1025..1045 -> ioc 0..8; get_custom_variable
 * ioc = cid - base.
 */
function variantRank(metadata: ClientNodeMetadata, concreteId: number | string): number {
  const cids = (metadata.reflectMap ?? []).map((v) => v.concreteId)
  const rank = [...cids].sort((a, b) => Number(a) - Number(b)).indexOf(concreteId)
  return rank >= 0 ? rank : 0
}

function findOutPin(node: ClientGiaNode, pinIndex: number) {
  return node.pins.find(
    (p) => p.i1?.kind === NodePin_Index_Kind.OutParam && p.i1.index === pinIndex
  )
}

function applyAssemblyList(
  node: ClientGiaNode,
  irNode: IRNode,
  metadata: ClientNodeMetadata,
  concreteId: number | string
) {
  const elements = irNode.args ?? []
  const countPin = findInPin(node, 0)
  // sample count pins keep alreadySetVal=false while carrying the payload
  if (countPin) countPin.value = client_value_base(3, elements.length)
  const variant = resolvedVariant(metadata, concreteId)
  const rank = variantRank(metadata, concreteId)
  let elemClientType = 0
  elements.forEach((arg, idx) => {
    const pinIndex = idx + 1
    const variantPin = variant?.pins?.find((p) => p.kind === 'input' && p.index === pinIndex)
    const clientVarType = variantPin?.clientVarType ?? 0
    if (clientVarType) elemClientType = clientVarType
    if (!isValueArg(arg)) return
    setInPinValue(
      node,
      pinIndex,
      clientVarType,
      client_literal_value(clientVarType, toPinLiteral(clientVarType, arg.value, idx, irNode.type)),
      rank
    )
  })
  const listType = LIST_TYPE_BY_ELEM_TYPE[elemClientType]
  const outPin = findOutPin(node, 0)
  if (outPin && listType) {
    outPin.type = listType
    outPin.value = client_wrapped_value(rank, client_value_base(listType))
  }
}

function applyMultipleBranches(node: ClientGiaNode, irNode: IRNode) {
  const args = irNode.args ?? []
  const controlArg = args[0]
  if (isValueArg(controlArg)) {
    setInPinValue(
      node,
      0,
      3,
      client_literal_value(3, toPinLiteral(3, controlArg.value, 0, irNode.type)),
      0
    )
  }
  const caseValues: unknown[] = []
  for (let i = 1; i < args.length; i++) {
    const a = args[i]
    if (!a || a.type === 'conn') continue
    caseValues.push(a.value)
  }
  if (caseValues.length) setInPinValue(node, 1, 4, client_list_literal_value(4, caseValues), 0)
}

/** in->out -> TypeConversion 枚举名；枚举值 800..810 由共享枚举表（parseEnumValue）解析 */
const DATA_TYPE_CONVERSION_ENUM_NAME: Record<string, string> = {
  'int->bool': 'type_conversion_integer_to_boolean',
  'int->float': 'type_conversion_integer_to_floating_point',
  'int->str': 'type_conversion_integer_to_string',
  'entity->str': 'type_conversion_entity_to_string',
  'guid->str': 'type_conversion_guid_to_string',
  'bool->int': 'type_conversion_boolean_to_integer',
  'bool->str': 'type_conversion_boolean_to_string',
  'float->int': 'type_conversion_floating_point_to_integer',
  'float->str': 'type_conversion_floating_point_to_string',
  'vec3->str': 'type_conversion_vector_3_to_string',
  'faction->str': 'type_conversion_faction_to_string'
}

function applyDataTypeConversion(node: ClientGiaNode, irNode: IRNode, metadata: ClientNodeMetadata) {
  // IR 与服务器同形：data_type_conversion_<out> + 单输入参数；枚举引脚由 in->out 反推
  const inputArg = irNode.args?.[0]
  const outIrType = irNode.type.slice('data_type_conversion_'.length)
  const inIrType = irTypeOfArg(inputArg ?? undefined)
  const enumName = inIrType ? DATA_TYPE_CONVERSION_ENUM_NAME[`${inIrType}->${outIrType}`] : undefined
  if (!enumName) {
    throw clientNodegraphError(
      CLIENT_ERROR_CODES.NODE_UNAVAILABLE,
      `${metadata.subType}.${irNode.type} unsupported conversion ${inIrType ?? 'missing'}->${outIrType}`
    )
  }
  const inClientType = CLIENT_VAR_TYPE_BY_IR_TYPE[inIrType!] ?? 0
  const outClientType = CLIENT_VAR_TYPE_BY_IR_TYPE[outIrType] ?? 0
  const inIoc = CLIENT_REFLECT_IOC_BY_TYPE[inClientType] ?? 0
  const outIoc = CLIENT_REFLECT_IOC_BY_TYPE[outClientType] ?? 0
  setInPinValue(
    node,
    0,
    13,
    client_literal_value(13, toPinLiteral(13, enumName, 0, irNode.type)),
    -1
  )
  setInPinValue(
    node,
    1,
    inClientType,
    isValueArg(inputArg)
      ? client_literal_value(
          inClientType,
          toPinLiteral(inClientType, inputArg.value, 1, irNode.type)
        )
      : client_value_base(inClientType),
    inIoc
  )
  const outPin = findOutPin(node, 0)
  if (outPin) {
    outPin.type = outClientType
    outPin.value = client_wrapped_value(outIoc, client_value_base(outClientType))
  }
}

/**
 * get_custom_variable resolves its output pin from the wired output type (the
 * cid table already fixed the variant); corpus shows type + ConcreteBase(ioc =
 * type offset) with an unset inner value. Dict output has no sample evidence
 * and keeps the unresolved placeholder.
 */
function applyCustomVariableOutPin(node: ClientGiaNode, outIrType: string | undefined) {
  if (!outIrType || outIrType === 'dict') return
  const clientVarType = CLIENT_VAR_TYPE_BY_IR_TYPE[outIrType]
  const offset = customVariableTypeOffset(outIrType)
  if (!clientVarType || offset === undefined) return
  const outPin = findOutPin(node, 0)
  if (!outPin) return
  outPin.type = clientVarType
  outPin.value = client_wrapped_value(offset, client_value_base(clientVarType))
}

/**
 * 字典反射引脚 indexOfConcrete 表（字典节点全语料普查）：
 * 键槽 ioc = 键类型序 entity/guid/int/str/faction/config_id（prefab_id 按表序推断）；
 * 值槽 ioc = 值类型序 entity/guid/int/bool/float/str/faction/vec3/config_id/prefab_id，
 * 列表值 ioc = 11 + 元素类型序（观测 t2→11、t4→13、t6→14、t8→15、t10→16、t12→18、t21→20）。
 */
const DICT_KEY_IOC_BY_IR: Record<string, number> = {
  entity: 0,
  guid: 1,
  int: 2,
  str: 3,
  faction: 4,
  config_id: 5,
  prefab_id: 6
}

const DICT_VALUE_IOC_BY_IR: Record<string, number> = {
  entity: 0,
  guid: 1,
  int: 2,
  bool: 3,
  float: 4,
  str: 5,
  faction: 6,
  vec3: 7,
  config_id: 8,
  prefab_id: 9
}

const DICT_VALUE_LIST_IOC_BASE = 11

function dictValueIoc(irType: string): number | undefined {
  if (irType.endsWith('_list')) {
    const base = DICT_VALUE_IOC_BY_IR[irType.slice(0, -'_list'.length)]
    return base === undefined ? undefined : DICT_VALUE_LIST_IOC_BASE + base
  }
  return DICT_VALUE_IOC_BY_IR[irType]
}

const DICT_SECOND_PIN_SLOT: Record<string, 'key' | 'value'> = {
  query_dictionary_value_by_key: 'key',
  query_if_dictionary_contains_specific_key: 'key',
  query_if_dictionary_contains_specific_value: 'value'
}

const DICT_OUT_IOC_BY_NODE_TYPE: Record<string, (irType: string) => number | undefined> = {
  get_list_of_keys_from_dictionary: (t) =>
    t.endsWith('_list') ? DICT_KEY_IOC_BY_IR[t.slice(0, -'_list'.length)] : undefined,
  get_list_of_values_from_dictionary: (t) =>
    t.endsWith('_list') ? DICT_VALUE_IOC_BY_IR[t.slice(0, -'_list'.length)] : undefined,
  query_dictionary_value_by_key: dictValueIoc
}

/**
 * 字典节点 cid 恒定，键/值类型只体现在引脚 type + ConcreteBase.ioc 上：
 * 键/值输入引脚按参数 IR 类型定型，出参按输出连线类型定型（与自定义变量同思路）。
 */
function applyDictReflectNode(
  node: ClientGiaNode,
  irNode: IRNode,
  metadata: ClientNodeMetadata,
  outIrType: string | undefined
) {
  const fail = (msg: string) =>
    clientNodegraphError(CLIENT_ERROR_CODES.NODE_UNAVAILABLE, `${metadata.subType}.${irNode.type} ${msg}`)

  const dictPin = findInPin(node, 0)
  if (dictPin) {
    dictPin.type = 24
    dictPin.value = client_wrapped_value(0, client_value_base(24))
  }

  const slot = DICT_SECOND_PIN_SLOT[irNode.type]
  if (slot) {
    const arg = irNode.args?.[1]
    const irType = irTypeOfArg(arg ?? undefined)
    const clientVarType = irType ? CLIENT_VAR_TYPE_BY_IR_TYPE[irType] : undefined
    const ioc =
      irType === undefined
        ? undefined
        : slot === 'key'
          ? DICT_KEY_IOC_BY_IR[irType]
          : dictValueIoc(irType)
    if (!clientVarType || ioc === undefined) {
      throw fail(`cannot resolve ${slot} pin type from "${irType ?? 'missing'}"`)
    }
    const pin = findInPin(node, 1)
    if (pin) {
      pin.type = clientVarType
      pin.value = client_wrapped_value(
        ioc,
        isValueArg(arg)
          ? client_literal_value(
              clientVarType,
              toPinLiteral(clientVarType, arg.value, 1, irNode.type)
            )
          : client_value_base(clientVarType)
      )
    }
  }

  const outIocOf = DICT_OUT_IOC_BY_NODE_TYPE[irNode.type]
  if (!outIocOf) return
  if (!outIrType) throw fail('cannot infer output type from connections')
  const outClientType = CLIENT_VAR_TYPE_BY_IR_TYPE[outIrType]
  const outIoc = outIocOf(outIrType)
  if (!outClientType || outIoc === undefined) {
    throw fail(`unsupported output type "${outIrType}"`)
  }
  const outPin = findOutPin(node, 0)
  if (outPin) {
    outPin.type = outClientType
    outPin.value = client_wrapped_value(outIoc, client_value_base(outClientType))
  }
}

/** 键/值槽定型 + ioc；字面量带 payload（innerSet=true），连线/空槽保持 unset */
function dictSlotValue(clientVarType: number, ioc: number, arg: IrArg | undefined, nodeType: string) {
  if (isValueArg(arg)) {
    const literal =
      Array.isArray(arg.value) && arg.type.endsWith('_list')
        ? client_list_literal_value(clientVarType, arg.value)
        : client_literal_value(clientVarType, toPinLiteral(clientVarType, arg.value, 0, nodeType))
    return client_wrapped_value(ioc, literal)
  }
  return client_wrapped_value(ioc, client_value_base(clientVarType))
}

/**
 * 拼装字典：cid 恒定 1048，in#0 = kv 参数总数（plain int，与 assembly_list 同款），
 * in#1..#100 键/值槽交替（奇=键、偶=值），未用槽位也按键/值类型定型（全语料一致）。
 */
function applyAssemblyDictionary(node: ClientGiaNode, irNode: IRNode, metadata: ClientNodeMetadata) {
  const fail = (msg: string) =>
    clientNodegraphError(CLIENT_ERROR_CODES.NODE_UNAVAILABLE, `${metadata.subType}.${irNode.type} ${msg}`)
  const args = irNode.args ?? []
  if (args.length === 0 || args.length % 2 !== 0 || args.length > 100) {
    throw fail(`expects 1-50 key/value pairs, got ${args.length} args`)
  }
  const keyIr = irTypeOfArg(args[0] ?? undefined)
  const valueIr = irTypeOfArg(args[1] ?? undefined)
  const keyType = keyIr ? CLIENT_VAR_TYPE_BY_IR_TYPE[keyIr] : undefined
  const valueType = valueIr ? CLIENT_VAR_TYPE_BY_IR_TYPE[valueIr] : undefined
  const keyIoc = keyIr ? DICT_KEY_IOC_BY_IR[keyIr] : undefined
  const valueIoc = valueIr ? dictValueIoc(valueIr) : undefined
  if (!keyType || keyIoc === undefined) throw fail(`unsupported key type "${keyIr ?? 'missing'}"`)
  if (!valueType || valueIoc === undefined) {
    throw fail(`unsupported value type "${valueIr ?? 'missing'}"`)
  }

  const countPin = findInPin(node, 0)
  if (countPin) countPin.value = client_value_base(3, args.length)
  for (let pinIndex = 1; pinIndex <= 100; pinIndex++) {
    const pin = findInPin(node, pinIndex)
    if (!pin) continue
    const isKeySlot = (pinIndex - 1) % 2 === 0
    const arg = pinIndex - 1 < args.length ? args[pinIndex - 1] : undefined
    pin.type = isKeySlot ? keyType : valueType
    pin.value = isKeySlot
      ? dictSlotValue(keyType, keyIoc, arg, irNode.type)
      : dictSlotValue(valueType, valueIoc, arg, irNode.type)
  }
  const outPin = findOutPin(node, 0)
  if (outPin) {
    outPin.type = 24
    outPin.value = client_wrapped_value(0, client_value_base(24))
  }
}

/**
 * 建立字典：cid 恒定 1049，in#0 键列表 / in#1 值列表按元素类型定型
 * （键槽 ioc 用键表、值槽 ioc 用值表），出参 t24 ioc0。
 */
function applyCreateDictionary(node: ClientGiaNode, irNode: IRNode, metadata: ClientNodeMetadata) {
  const fail = (msg: string) =>
    clientNodegraphError(CLIENT_ERROR_CODES.NODE_UNAVAILABLE, `${metadata.subType}.${irNode.type} ${msg}`)
  const pins: Array<{ index: number; iocOfElem: (elem: string) => number | undefined }> = [
    { index: 0, iocOfElem: (elem) => DICT_KEY_IOC_BY_IR[elem] },
    { index: 1, iocOfElem: (elem) => DICT_VALUE_IOC_BY_IR[elem] }
  ]
  for (const { index, iocOfElem } of pins) {
    const arg = irNode.args?.[index]
    const irType = irTypeOfArg(arg ?? undefined)
    const elem = irType?.endsWith('_list') ? irType.slice(0, -'_list'.length) : undefined
    const clientVarType = irType ? CLIENT_VAR_TYPE_BY_IR_TYPE[irType] : undefined
    const ioc = elem ? iocOfElem(elem) : undefined
    if (!clientVarType || ioc === undefined) {
      throw fail(`cannot resolve ${index === 0 ? 'key' : 'value'} list type from "${irType ?? 'missing'}"`)
    }
    const pin = findInPin(node, index)
    if (pin) {
      pin.type = clientVarType
      pin.value = dictSlotValue(clientVarType, ioc, arg, irNode.type)
    }
  }
  const outPin = findOutPin(node, 0)
  if (outPin) {
    outPin.type = 24
    outPin.value = client_wrapped_value(0, client_value_base(24))
  }
}

/**
 * 枚举匹配字面量的类反推：值 key 以类名 snake 前缀开头（如
 * scan_status_candidate_target）；折叠下划线比较以磨平 conn.enum 逐字母
 * snake（u_i_control_group_status）与值 key（ui_control_group_status_*）的差异，
 * 键按长度降序保证取最长匹配（如 hit_performance_level 优先于 hit_type）。
 */
const ENUM_MATCH_CLASS_KEYS = Object.keys(ENUM_MATCH_ROWS_BY_CLASS).sort(
  (a, b) => b.length - a.length
)

function enumMatchClassOfLiteral(valueKey: string): string | undefined {
  const collapsed = valueKey.replace(/_/g, '')
  return ENUM_MATCH_CLASS_KEYS.find((cls) => collapsed.startsWith(cls.replace(/_/g, '')))
}

/**
 * 枚举匹配（cid 恒定 10）：双枚举引脚 indexOfConcrete = 枚举类在编辑器下拉
 * 中的行号（两族 census，见 ENUM_MATCH_ROWS_BY_CLASS）。字面量由值命中的行
 * 定行（区分 状态添加结果 14/15 两半），连线由 conn.enum 类名取该类首行；
 * 两引脚共享同一行号（编辑器下拉是节点级单选）。
 */
function applyEnumerationMatch(node: ClientGiaNode, irNode: IRNode, metadata: ClientNodeMetadata) {
  const fail = (msg: string) =>
    clientNodegraphError(
      CLIENT_ERROR_CODES.VALUE_TYPE_UNAVAILABLE,
      `${metadata.subType}.${irNode.type} ${msg}`
    )
  const args = [irNode.args?.[0], irNode.args?.[1]]
  const infos = args.map((arg, i) => {
    if (isValueArg(arg)) {
      const key = String(arg.value)
      const cls = enumMatchClassOfLiteral(key)
      if (!cls) throw fail(`enum value "${key}" (arg #${i}) is not selectable in this node`)
      const rows = ENUM_MATCH_ROWS_BY_CLASS[cls]
      const numeric = Number(toPinLiteral(13, key, i, irNode.type))
      return { cls, literalIoc: (rows.find((r) => r.values.includes(numeric)) ?? rows[0]).ioc }
    }
    if (arg?.type === 'conn') {
      const cls = arg.value.enum
      if (!cls) return undefined
      if (!ENUM_MATCH_ROWS_BY_CLASS[cls]) {
        throw fail(`enum class "${cls}" (arg #${i}) is not selectable in this node`)
      }
      return { cls, literalIoc: undefined }
    }
    return undefined
  })

  const resolved = infos.filter((info) => info !== undefined)
  if (resolved.length === 0) {
    throw fail('cannot resolve the enum class from either pin')
  }
  if (resolved.length === 2 && resolved[0].cls !== resolved[1].cls) {
    throw fail(`enum classes differ between pins ("${resolved[0].cls}" vs "${resolved[1].cls}")`)
  }
  const literalIocs = [...new Set(resolved.flatMap((r) => r.literalIoc ?? []))]
  if (literalIocs.length > 1) {
    throw fail(
      `enum values map to different editor dropdown rows (ioc ${literalIocs[0]} vs ${literalIocs[1]})`
    )
  }
  const ioc = literalIocs[0] ?? ENUM_MATCH_ROWS_BY_CLASS[resolved[0].cls][0].ioc

  args.forEach((arg, i) => {
    const pin = findInPin(node, argPinIndex(metadata, i))
    if (!pin) return
    pin.type = 13
    pin.value = client_wrapped_value(
      ioc,
      isValueArg(arg)
        ? client_literal_value(13, toPinLiteral(13, arg.value, i, irNode.type))
        : client_value_base(13)
    )
  })
}

function applySendSignalToServer(node: ClientGiaNode, irNode: IRNode, metadata: ClientNodeMetadata) {
  const nameArg = irNode.args?.[0]
  if (nameArg?.type === 'conn') {
    throw clientNodegraphError(
      CLIENT_ERROR_CODES.VALUE_TYPE_UNAVAILABLE,
      `${metadata.subType}.send_signal_to_server_node_graph does not accept wired signal name`
    )
  }
  if (!isValueArg(nameArg)) {
    throw clientNodegraphError(
      CLIENT_ERROR_CODES.VALUE_TYPE_UNAVAILABLE,
      `${metadata.subType}.send_signal_to_server_node_graph expects a literal signal name`
    )
  }
  node.genericId!.nodeId = CLIENT_SEND_SIGNAL_PLACEHOLDER_GID
  // corpus: signal name lives on the client_exec (kind 5) str pin
  const signalPin = node.pins.find((p) => p.i1?.kind === PIN_KIND_CLIENT_EXEC && p.type === 9)
  if (signalPin) signalPin.value = client_signal_name_value(String(nameArg.value))
}

function applySpecialArgs(
  node: ClientGiaNode,
  irNode: IRNode,
  metadata: ClientNodeMetadata,
  concreteId: number | string,
  inferredOutType: string | undefined
): boolean {
  if (irNode.type === 'assembly_list') {
    applyAssemblyList(node, irNode, metadata, concreteId)
    return true
  }
  if (irNode.type === 'multiple_branches') {
    applyMultipleBranches(node, irNode)
    return true
  }
  if (metadata.nodeType === 'data_type_conversion') {
    applyDataTypeConversion(node, irNode, metadata)
    return true
  }
  if (irNode.type === 'get_custom_variable') {
    applyLiteralArgs(node, irNode, metadata, concreteId)
    applyCustomVariableOutPin(node, inferredOutType)
    return true
  }
  if (DICT_REFLECT_NODE_TYPES.has(irNode.type)) {
    applyDictReflectNode(node, irNode, metadata, inferredOutType)
    return true
  }
  if (irNode.type === 'assembly_dictionary') {
    applyAssemblyDictionary(node, irNode, metadata)
    return true
  }
  if (irNode.type === 'create_dictionary') {
    applyCreateDictionary(node, irNode, metadata)
    return true
  }
  if (irNode.type === 'enumeration_match') {
    applyEnumerationMatch(node, irNode, metadata)
    return true
  }
  if (irNode.type === 'send_signal_to_server_node_graph') {
    applySendSignalToServer(node, irNode, metadata)
    return true
  }
  return false
}

function applyLiteralArgs(
  node: ClientGiaNode,
  irNode: IRNode,
  metadata: ClientNodeMetadata,
  concreteId: number | string
) {
  for (const [argIndex, arg] of (irNode.args ?? []).entries()) {
    if (arg == null || arg.type === 'conn') continue
    const pinIndex = argPinIndex(metadata, argIndex)
    const pinMeta = metadata.inputs.find((p) => p.index === pinIndex)
    if (!pinMeta) continue
    if (Array.isArray(arg.value) && arg.type.endsWith('_list')) {
      const pin = findInPin(node, pinIndex)
      if (!pin) continue
      const variantPin = pinMeta.reflective
        ? resolvedVariant(metadata, concreteId)?.pins?.find(
            (p) => p.kind === 'input' && p.index === pinIndex
          )
        : undefined
      const clientVarType =
        variantPin?.clientVarType ?? pinMeta.clientVarType ?? CLIENT_VAR_TYPE_BY_IR_TYPE[arg.type] ?? 0
      const elements =
        clientVarType === 17
          ? arg.value.map((v) => toPinLiteral(13, v, argIndex, irNode.type))
          : arg.value
      const inner =
        elements.length === 0
          ? client_value_base(clientVarType)
          : client_list_literal_value(clientVarType, elements)
      pin.type = clientVarType
      pin.value = pinMeta.reflective
        ? client_wrapped_value(variantRank(metadata, concreteId), inner)
        : inner
      continue
    }
    const pin = findInPin(node, pinIndex)
    if (!pin) continue
    if (
      metadata.specialKind === 'inline_var_type_hint' &&
      (pinMeta.clientVarType === 18 || pinMeta.clientVarType === 19)
    ) {
      // only 200052/200128 store t18/t19 dropdowns in the field#3 inline
      // binding; ordinary t18/t19 pins carry plain bId literals
      pin.type = pinMeta.clientVarType
      pin.value = client_inline_var_value(pinMeta.clientVarType as 18 | 19, Number(arg.value))
      continue
    }
    if (pinMeta.reflective) {
      const variant = resolvedVariant(metadata, concreteId)
      const variantPin = variant?.pins?.find((p) => p.kind === 'input' && p.index === pinIndex)
      if (!variantPin?.clientVarType) {
        throw clientNodegraphError(
          CLIENT_ERROR_CODES.NODE_UNAVAILABLE,
          `${metadata.subType}.${metadata.nodeType} input #${argIndex}: no variant pin type for literal`
        )
      }
      pin.type = variantPin.clientVarType
      pin.value = client_wrapped_value(
        variantRank(metadata, concreteId),
        client_literal_value(
          variantPin.clientVarType,
          toPinLiteral(variantPin.clientVarType, arg.value, argIndex, irNode.type)
        )
      )
    } else {
      const clientVarType = pinMeta.clientVarType ?? 0
      pin.type = clientVarType
      pin.value = client_literal_value(
        clientVarType,
        toPinLiteral(clientVarType, arg.value, argIndex, irNode.type)
      )
    }
  }
}

export function clientIrToGia(ir: ClientIRDocument, opts: IrToGiaOptions): Uint8Array {
  const graphId = opts.graphId ?? resolveGraphIdForGraph(ir.graph)
  const name = opts.name ?? ir.graph.name ?? '_GSTS_Generated_Client_Graph'
  const uid = opts.uid ?? 100000001
  const nodes = ir.nodes ?? []
  if (!nodes.length) throw new Error('IR document must have at least one node')

  const graphInfo = buildExecutionGraph(nodes)
  const positions = layoutPositions(nodes, graphInfo)
  const connIndex = buildConnTypeIndex(ir)
  const builtById = new Map<NodeId, ClientGiaNode>()
  const metadataById = new Map<NodeId, ClientNodeMetadata>()
  const concreteById = new Map<NodeId, number | string>()

  for (const irNode of nodes) {
    const metadata = resolveClientNodeMetadata(ir.graph.sub_type, irNode)
    metadataById.set(irNode.id, metadata)
    const inferredOutType = inferredOutputIrType(irNode, connIndex)
    const concreteId = resolveClientConcreteVariant(metadata, irNode, inferredOutType)
    concreteById.set(irNode.id, concreteId)
    const pos = positions.get(irNode.id) ?? [0, 0]
    const node = client_node_body({
      metadata,
      unique_index: irNode.id,
      x: pos[0] / 300,
      y: pos[1] / 200,
      concrete_id: concreteId
    })
    if (!applySpecialArgs(node, irNode, metadata, concreteId, inferredOutType)) {
      applyLiteralArgs(node, irNode, metadata, concreteId)
    }
    builtById.set(irNode.id, node)
  }

  for (const { fromId, toId, fromIndex, toIndex } of graphInfo.flowConnections) {
    const from = builtById.get(fromId)
    const to = builtById.get(toId)
    if (!from || !to) throw new Error(`[error] bad client flow connection ${fromId}->${toId}`)
    const toIndex2 = pinI2Index(metadataById.get(toId)!, 'in_flow', toIndex)
    const connect = client_node_connect_to(to.nodeIndex, toIndex, toIndex2)
    const existing = from.pins.find(
      (p) => p.i1?.kind === PIN_KIND_OUT_FLOW && p.i1.index === fromIndex
    )
    if (existing) existing.connects.push(connect)
    else {
      const fromIndex2 = pinI2Index(metadataById.get(fromId)!, 'out_flow', fromIndex)
      from.pins.push({
        i1: { kind: PIN_KIND_OUT_FLOW, index: fromIndex },
        i2: { kind: PIN_KIND_OUT_FLOW, index: fromIndex2 },
        connects: [connect]
      } as (typeof from.pins)[number])
    }
  }

  for (const { fromId, toId, fromIndex, toIndex } of graphInfo.dataConnections) {
    const from = builtById.get(fromId)
    const to = builtById.get(toId)
    if (!from || !to) throw new Error(`[error] bad client data connection ${fromId}->${toId}`)
    const toMeta = metadataById.get(toId)!
    // data_type_conversion 的 IR 与服务器同形（省略转换枚举参数），输入参数对应 GIA pin 1
    const toPinIndex =
      toMeta.nodeType === 'data_type_conversion' ? toIndex + 1 : argPinIndex(toMeta, toIndex)
    const pin = findInPin(to, toPinIndex)
    if (!pin) throw new Error(`[error] missing client input pin ${toId}.${toPinIndex}`)
    const fromIndex2 = pinI2Index(metadataById.get(fromId)!, 'output', fromIndex)
    pin.connects = [client_node_connect_from(from.nodeIndex, fromIndex, fromIndex2)]
    // wired reflective pins keep a typed ConcreteBase placeholder
    // (ioc = variant rank, inner unset) instead of the unresolved -1 marker
    const pinMeta = toMeta.inputs.find((p) => p.index === toPinIndex)
    if (
      pinMeta?.reflective &&
      pin.value?.class === VarBase_Class.ConcreteBase &&
      pin.value.bConcreteValue?.indexOfConcrete === -1
    ) {
      const toConcreteId = concreteById.get(toId)!
      const variantPin = resolvedVariant(toMeta, toConcreteId)?.pins?.find(
        (p) => p.kind === 'input' && p.index === toPinIndex
      )
      if (variantPin?.clientVarType) {
        pin.type = variantPin.clientVarType
        pin.value = client_wrapped_value(
          variantRank(toMeta, toConcreteId),
          client_value_base(variantPin.clientVarType)
        )
      }
    }
  }

  const encoding = getClientGraphEncoding(ir.graph.sub_type)
  const root: GiaRoot = client_graph_body({
    uid,
    graph_id: graphId,
    graph_name: name,
    graphType: encoding.graphType,
    graphWhich: encoding.graphWhich,
    nodes: [...builtById.values()]
  })

  const { rootMessage } = loadGiaProto(opts.protoPath)
  return new Uint8Array(wrap_gia(rootMessage, root))
}
