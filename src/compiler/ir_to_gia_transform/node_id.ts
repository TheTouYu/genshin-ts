import type {
  Argument,
  ConnectionArgument,
  IRDocument,
  ServerGraphMode,
  ValueType,
  Variable
} from '../../runtime/IR.js'
import type { DictKeyType, DictValueType } from '../../runtime/value.js'
import {
  getNodeIdLowerMap,
  SPECIAL_NODE_IDS,
  SPECIAL_NODE_MAPPINGS
} from './mappings.js'
import { resolveNodeIdentity, type ResolutionFallback } from './resolved_node.js'
import { IRNode } from './types.js'

export type ConnTypeInfo =
  | { type: Exclude<ValueType, 'dict' | 'enum'> }
  | { type: 'enum'; enum: string }
  | { type: 'dict'; dict: { k: DictKeyType; v: DictValueType } }

const MODE_SPECIFIC_NODE_IDS: Record<string, Partial<Record<ServerGraphMode, number>>> = {
  teleport_player: { classic: 805, beyond: 288 }
}

// node_id -> pin_index -> ConnTypeInfo
export type ConnTypeIndex = Map<number, Map<number, ConnTypeInfo>>

export const isConnectionArgument = (arg: Argument | null | undefined): arg is ConnectionArgument =>
  !!arg && arg.type === 'conn'

function requireConnType(value: ConnectionArgument['value']): ConnTypeInfo {
  const t = value.type
  if (!t) {
    throw new Error(`[error] missing conn.value.type on ${value.node_id}.${value.index}`)
  }
  if (t === 'dict') {
    if (!value.dict) {
      throw new Error(
        `[error] missing conn.value.dict on dict connection ${value.node_id}.${value.index}`
      )
    }
    return { type: 'dict', dict: value.dict }
  }
  if (t === 'enum' || t === 'enumeration') {
    if (!value.enum) {
      throw new Error(
        `[error] missing conn.value.enum on enum/enumeration connection ${value.node_id}.${value.index}`
      )
    }
    return { type: 'enum', enum: value.enum }
  }
  return { type: t }
}

export function buildConnTypeIndex(ir: IRDocument): ConnTypeIndex {
  // node_id -> pin_index -> ConnTypeInfo
  const out: ConnTypeIndex = new Map()

  const set = (srcId: number, srcPin: number, info: ConnTypeInfo) => {
    const m = out.get(srcId) ?? new Map<number, ConnTypeInfo>()
    const existing = m.get(srcPin)
    if (existing) {
      const a = JSON.stringify(existing)
      const b = JSON.stringify(info)
      if (a !== b) {
        throw new Error(`[error] conflicting conn types for ${srcId}.${srcPin}: ${a} vs ${b}`)
      }
      return
    }
    m.set(srcPin, info)
    out.set(srcId, m)
  }

  for (const node of ir.nodes ?? []) {
    for (const arg of node.args ?? []) {
      if (!isConnectionArgument(arg)) continue
      set(arg.value.node_id, arg.value.index, requireConnType(arg.value))
    }
  }

  return out
}

function suffixFromValueType(valueType: ValueType): string | undefined {
  switch (valueType) {
    case 'bool':
    case 'int':
    case 'float':
    case 'str':
    case 'guid':
    case 'entity':
    case 'faction':
      return valueType
    case 'vec3':
      return 'vec'
    case 'config_id':
      return 'config'
    case 'prefab_id':
      return 'prefab'
  }
  if (valueType.endsWith('_list')) {
    const base = valueType.slice(0, -5) as ValueType
    const baseSuffix = suffixFromValueType(base)
    return baseSuffix ? `list_${baseSuffix}` : undefined
  }
  return undefined
}

function isListValueSuffix(s: string) {
  return s.startsWith('list_')
}

function lookupTypedNodeId(
  lower: string,
  suffix: string,
  nodeIdLower: Map<string, number>
): number | undefined {
  // 1) Exact match: `${node}__${suffix}` (e.g. get_local_variable__list_int)
  const direct = nodeIdLower.get(`${lower}__${suffix}`)
  if (direct) return direct

  // Vendor node IDs abbreviate config_id/prefab_id as config/prefab, including list variants.
  // IR value types retain the public API names, so try the vendor spelling before falling back
  // to the element suffix lookup.
  const vendorSuffix = suffix.replace('_config_id', '_config').replace('_prefab_id', '_prefab')
  if (vendorSuffix !== suffix) {
    const vendorTyped = nodeIdLower.get(`${lower}__${vendorSuffix}`)
    if (vendorTyped) return vendorTyped
  }

  // 2) Fallback for list types: try element suffix (e.g. clear_list__int)
  if (isListValueSuffix(suffix)) {
    const elem = suffix.slice(5)
    const elementTyped = nodeIdLower.get(`${lower}__${elem}`)
    if (elementTyped) return elementTyped
  }

  return undefined
}

function connTypeFromArgument(arg: Argument | null | undefined): ConnTypeInfo | undefined {
  if (!arg) return undefined
  if (isConnectionArgument(arg)) return requireConnType(arg.value)
  if (arg.type === 'dict') {
    if (!arg.dict) {
      throw new Error(`[error] dict literal args must include "dict" type info`)
    }
    return { type: 'dict', dict: arg.dict }
  }
  // literal enum/enumeration doesn't carry the enum "kind" here; only connections do.
  if (arg.type === 'enum' || arg.type === 'enumeration') return undefined
  return { type: arg.type }
}

function inferSuffixCandidatesFromArgs(node: IRNode): string[] {
  const out: string[] = []
  for (const a of node.args ?? []) {
    const t = connTypeFromArgument(a)
    if (!t) continue
    const s = suffixFromValueType(t.type)
    if (s) out.push(s)
  }
  return out
}

function inferProducedValueSuffix(nodeId: number, connIndex: ConnTypeIndex): string | undefined {
  const outputs = connIndex.get(nodeId)
  if (!outputs) return undefined
  for (const info of outputs.values()) {
    // 字典已在之前处理
    if (info.type === 'dict') continue
    if (info.type === 'local_variable') continue
    const s = suffixFromValueType(info.type)
    if (s) return s
  }
  return undefined
}

function inferKVSuffixes(node: IRNode): { k: string; v: string } | undefined {
  const kArg = node.args?.[0]
  const vArg = node.args?.[1]
  const kt = connTypeFromArgument(kArg)
  const vt = connTypeFromArgument(vArg)
  if (!kt || !vt) return undefined
  const k = suffixFromValueType(kt.type)
  const v = suffixFromValueType(vt.type)
  if (!k || !v) return undefined
  return { k, v }
}

function inferVarSuffix(node: IRNode, varsByName: Map<string, Variable>): string | undefined {
  if (node.type !== 'get_node_graph_variable') return undefined
  const nameArg = node.args?.[0]
  if (!nameArg || nameArg.type !== 'str') return undefined
  const v = varsByName.get(nameArg.value)
  if (!v) return undefined
  if (v.type === 'dict' && v.dict) {
    const k = suffixFromValueType(v.dict.k as unknown as ValueType)
    const vv = suffixFromValueType(v.dict.v as unknown as ValueType)
    if (!k || !vv) return undefined
    return `dict_${k}_${vv}`
  }
  return suffixFromValueType(v.type)
}

function inferDictTypedSuffixFromConn(info: ConnTypeInfo): string | undefined {
  if (info.type !== 'dict') return undefined
  const k = suffixFromValueType(info.dict.k as unknown as ValueType)
  const v = suffixFromValueType(info.dict.v as unknown as ValueType)
  if (!k || !v) return undefined
  return `dict_${k}_${v}`
}

type KVSuffix = { k: string; v: string }

function lookupTypedNodeIdByKV(
  lower: string,
  kv: KVSuffix,
  nodeIdLower: Map<string, number>
): number | undefined {
  const key = `${kv.k}_${kv.v}`
  const normalizedKey = key.replaceAll('config_id', 'config').replaceAll('prefab_id', 'prefab')
  return (
    nodeIdLower.get(`${lower}__${key}`) ??
    nodeIdLower.get(`${lower}__${normalizedKey}`) ??
    nodeIdLower.get(`${lower}__dict_${key}`) ??
    nodeIdLower.get(`${lower}__dict_${normalizedKey}`)
  )
}

function inferSuffixFromArg(arg: Argument | undefined): string | undefined {
  if (!arg) return undefined
  const info = connTypeFromArgument(arg)
  if (!info || info.type === 'dict') return undefined
  return suffixFromValueType(info.type)
}

function inferKVSuffixFromDictArg(arg: Argument | undefined): KVSuffix | undefined {
  if (!arg) return undefined
  const info = connTypeFromArgument(arg)
  if (!info || info.type !== 'dict') return undefined
  const k = suffixFromValueType(info.dict.k as unknown as ValueType)
  const v = suffixFromValueType(info.dict.v as unknown as ValueType)
  if (!k || !v) return undefined
  return { k, v }
}

function inferKVSuffixFromValueArgs(
  keyArg: Argument | undefined,
  valueArg: Argument | undefined
): KVSuffix | undefined {
  if (!keyArg || !valueArg) return undefined
  const keyInfo = connTypeFromArgument(keyArg)
  const valueInfo = connTypeFromArgument(valueArg)
  if (!keyInfo || !valueInfo) return undefined
  if (keyInfo.type === 'dict' || valueInfo.type === 'dict') return undefined
  const k = suffixFromValueType(keyInfo.type)
  const v = suffixFromValueType(valueInfo.type)
  if (!k || !v) return undefined
  return { k, v }
}

function inferKVSuffixFromListArgs(
  keyListArg: Argument | undefined,
  valueListArg: Argument | undefined
): KVSuffix | undefined {
  if (!keyListArg || !valueListArg) return undefined
  const keyInfo = connTypeFromArgument(keyListArg)
  const valueInfo = connTypeFromArgument(valueListArg)
  if (!keyInfo || !valueInfo) return undefined
  if (keyInfo.type === 'dict' || valueInfo.type === 'dict') return undefined
  if (!keyInfo.type.endsWith('_list') || !valueInfo.type.endsWith('_list')) return undefined
  const keyBase = keyInfo.type.slice(0, -5) as ValueType
  const valueBase = valueInfo.type.slice(0, -5) as ValueType
  const k = suffixFromValueType(keyBase)
  const v = suffixFromValueType(valueBase)
  if (!k || !v) return undefined
  return { k, v }
}

function inferTypedNodeIdFromOutputs(
  nodeId: number,
  lower: string,
  nodeIdLower: Map<string, number>,
  connIndex: ConnTypeIndex
): number | undefined {
  const outputs = connIndex.get(nodeId)
  if (!outputs) return undefined
  for (const info of outputs.values()) {
    if (info.type === 'dict') {
      const kv = inferKVSuffixFromDictArg({
        type: 'conn',
        value: { node_id: 0, index: 0, type: 'dict', dict: info.dict }
      })
      if (kv) {
        const typed = lookupTypedNodeIdByKV(lower, kv, nodeIdLower)
        if (typed) return typed
      }
      continue
    }
    const suffix = suffixFromValueType(info.type)
    if (!suffix) continue
    const typed = lookupTypedNodeId(lower, suffix, nodeIdLower)
    if (typed) return typed
  }
  return undefined
}

function inferChangeEventNodeId(
  nodeId: number,
  lower: string,
  nodeIdLower: Map<string, number>,
  connIndex: ConnTypeIndex
): number | undefined {
  const outputs = connIndex.get(nodeId)
  if (!outputs) return undefined

  const typePins = [3, 4]
  const pinNames: Record<number, string> = {
    3: 'preChangeValue',
    4: 'postChangeValue'
  }
  let selected: ConnTypeInfo | undefined
  let selectedPin: number | undefined
  for (const pin of typePins) {
    const info = outputs.get(pin)
    if (!info) continue
    if (!selected) {
      selected = info
      selectedPin = pin
      continue
    }
    const a = JSON.stringify(selected)
    const b = JSON.stringify(info)
    if (a !== b) {
      throw new Error(
        `[error] ${lower} requires pre/post change values to share the same type: ${pinNames[selectedPin ?? -1] ?? selectedPin}=${a}, ${pinNames[pin] ?? pin}=${b}`
      )
    }
  }

  if (!selected) return undefined
  if (selected.type === 'dict') {
    const k = suffixFromValueType(selected.dict.k as unknown as ValueType)
    const v = suffixFromValueType(selected.dict.v as unknown as ValueType)
    if (!k || !v) return undefined
    return lookupTypedNodeIdByKV(lower, { k, v }, nodeIdLower)
  }
  const suffix = suffixFromValueType(selected.type)
  if (!suffix) return undefined
  return lookupTypedNodeId(lower, suffix, nodeIdLower)
}

export function resolveGiaNodeId(
  node: IRNode,
  connIndex: ConnTypeIndex,
  varsByName: Map<string, Variable>,
  runtimeMode?: ServerGraphMode,
  resolutionFallbacks?: ResolutionFallback[]
): number {
  const nodeType = node.type
  const specialId = SPECIAL_NODE_IDS[nodeType]
  if (specialId) return specialId

  // Migrated DTC / scalar same-type binary / residual scalar / enumerations_equal
  // families delegate concrete identity to the shared resolver rather than
  // maintaining root and composite-impl maps.
  if (
    nodeType.startsWith('data_type_conversion_') ||
    [
      'addition',
      'subtraction',
      'multiplication',
      'division',
      'equal',
      'greater_than',
      'less_than',
      'greater_than_or_equal_to',
      'less_than_or_equal_to',
      // P5-W7 residual scalar ordinary identities
      'modulo_operation',
      'exponentiation',
      'logical_and_operation',
      'logical_or_operation',
      'logical_not_operation',
      'logical_xor_operation',
      'absolute_value_operation',
      'sign_operation',
      'arithmetic_square_root_operation',
      'round_to_integer_operation',
      'range_limiting_operation',
      'take_larger_value',
      'take_smaller_value',
      // P5-W8 enumerations_equal enum-kind identity
      'enumerations_equal'
    ].includes(nodeType)
  ) {
    const identity = resolveNodeIdentity(node, {
      scope: { kind: 'root', name: 'root-node-identity-adapter' },
      variablesByName: varsByName,
      connectionTypes: connIndex,
      strictTypeChecks: false
    })
    return identity.concreteNodeId ?? identity.genericNodeId
  }

  const key = SPECIAL_NODE_MAPPINGS[nodeType] ?? nodeType
  const modeSpecificEntry = MODE_SPECIFIC_NODE_IDS[key]
  if (modeSpecificEntry && runtimeMode) {
    const modeSpecificId = modeSpecificEntry[runtimeMode]
    if (modeSpecificId !== undefined) return modeSpecificId
  }
  const lower = key.toLowerCase()
  const nodeIdLower = getNodeIdLowerMap()

  if (
    nodeType === 'when_custom_variable_changes' ||
    nodeType === 'when_node_graph_variable_changes'
  ) {
    const typed = inferChangeEventNodeId(node.id, lower, nodeIdLower, connIndex)
    if (typed) return typed
    // fallback 继续走后续通用逻辑
  }

  if (nodeType === 'set_player_settlement_scoreboard_data_display') {
    const valueArg = node.args?.[3]
    const suffix = inferSuffixFromArg(valueArg)
    if (suffix) {
      const typed = lookupTypedNodeId(lower, suffix, nodeIdLower)
      if (typed) return typed
    }
    // fallback 继续走后续通用逻辑
  }

  if (nodeType === 'assembly_list') {
    const firstArg = node.args?.[0]
    const suffix = inferSuffixFromArg(firstArg)
    if (suffix) {
      const typed = lookupTypedNodeId(lower, suffix, nodeIdLower)
      if (typed) return typed
    }
    // fallback 继续走后续通用逻辑
  }

  if (nodeType === 'assembly_dictionary') {
    const kv = inferKVSuffixFromValueArgs(node.args?.[0], node.args?.[1])
    if (kv) {
      const typed = lookupTypedNodeIdByKV(lower, kv, nodeIdLower)
      if (typed) return typed
    }
    // fallback 继续走后续通用逻辑
  }

  if (nodeType === 'create_dictionary') {
    const kv = inferKVSuffixFromListArgs(node.args?.[0], node.args?.[1])
    if (kv) {
      const typed = lookupTypedNodeIdByKV(lower, kv, nodeIdLower)
      if (typed) return typed
    }
    // fallback 继续走后续通用逻辑
  }

  if (nodeType === 'get_custom_variable') {
    const identity = resolveNodeIdentity(node, {
      scope: { kind: 'root', name: 'root-node-identity-adapter' },
      variablesByName: varsByName,
      connectionTypes: connIndex,
      fallbacks: resolutionFallbacks,
      strictTypeChecks: false
    })
    if (identity.concreteNodeId !== undefined) return identity.concreteNodeId

    const typed = inferTypedNodeIdFromOutputs(node.id, lower, nodeIdLower, connIndex)
    if (typed) return typed
    // fallback 继续走后续通用逻辑
  }

  if (nodeType === 'query_custom_variable_snapshot') {
    const typed = inferTypedNodeIdFromOutputs(node.id, lower, nodeIdLower, connIndex)
    if (typed) return typed
    // fallback 继续走后续通用逻辑
  }

  if (nodeType === 'get_node_graph_variable') {
    // P1-W4: root and impl share scalar/list variable identity resolution. Keep the
    // legacy resolver below as the fallback for dict and other unported families.
    const identity = resolveNodeIdentity(node, {
      scope: { kind: 'root', name: 'root-node-identity-adapter' },
      variablesByName: varsByName,
      connectionTypes: connIndex,
      fallbacks: resolutionFallbacks,
      strictTypeChecks: false
    })
    if (identity.concreteNodeId !== undefined) return identity.concreteNodeId

    const varSuffix = inferVarSuffix(node, varsByName)
    if (varSuffix) {
      const typed = lookupTypedNodeId(lower, varSuffix, nodeIdLower)
      if (typed) return typed
    }
    const typed = inferTypedNodeIdFromOutputs(node.id, lower, nodeIdLower, connIndex)
    if (typed) return typed
    // fallback 继续走后续通用逻辑
  }

  if (
    nodeType === 'clear_dictionary' ||
    nodeType === 'get_list_of_keys_from_dictionary' ||
    nodeType === 'get_list_of_values_from_dictionary' ||
    nodeType === 'query_dictionary_s_length'
  ) {
    const kv = inferKVSuffixFromDictArg(node.args?.[0])
    if (kv) {
      const typed = lookupTypedNodeIdByKV(lower, kv, nodeIdLower)
      if (typed) return typed
    }
    // fallback 继续走后续通用逻辑
  }

  if (
    nodeType === 'query_dictionary_value_by_key' ||
    nodeType === 'query_if_dictionary_contains_specific_key' ||
    nodeType === 'query_if_dictionary_contains_specific_value' ||
    nodeType === 'remove_key_value_pairs_from_dictionary_by_key'
  ) {
    const kv = inferKVSuffixFromDictArg(node.args?.[0])
    if (kv) {
      const typed = lookupTypedNodeIdByKV(lower, kv, nodeIdLower)
      if (typed) return typed
    }
    // fallback 继续走后续通用逻辑
  }

  if (nodeType === 'set_or_add_key_value_pairs_to_dictionary') {
    const kv =
      inferKVSuffixFromDictArg(node.args?.[0]) ??
      inferKVSuffixFromValueArgs(node.args?.[1], node.args?.[2])
    if (kv) {
      const typed = lookupTypedNodeIdByKV(lower, kv, nodeIdLower)
      if (typed) return typed
    }
    // fallback 继续走后续通用逻辑
  }

  // special: sort_dictionary_by_key/value 的具体节点 ID 由“输入字典的 K/V 类型”决定
  if (nodeType === 'sort_dictionary_by_key' || nodeType === 'sort_dictionary_by_value') {
    const dictArg = node.args?.[0]
    const t = connTypeFromArgument(dictArg)
    if (t?.type === 'dict') {
      const k = suffixFromValueType(t.dict.k as unknown as ValueType)
      const v = suffixFromValueType(t.dict.v as unknown as ValueType)
      if (k && v) {
        const typed = nodeIdLower.get(`${lower}__${k}_${v}`)
        if (typed) return typed
      }
    }
    // fallback 继续走后续通用逻辑
  }

  // special: set_custom_variable / set_node_graph_variable 的类型由“被设置的值”决定
  if (nodeType === 'set_custom_variable') {
    const identity = resolveNodeIdentity(node, {
      scope: { kind: 'root', name: 'root-node-identity-adapter' },
      variablesByName: varsByName,
      connectionTypes: connIndex,
      fallbacks: resolutionFallbacks,
      strictTypeChecks: false
    })
    if (identity.concreteNodeId !== undefined) return identity.concreteNodeId

    const valueArg = node.args?.[2]
    const t = connTypeFromArgument(valueArg)
    if (t?.type === 'dict') {
      const dictSuffix = inferDictTypedSuffixFromConn(t)
      if (dictSuffix) {
        const typed = nodeIdLower.get(`${lower}__${dictSuffix}`)
        if (typed) return typed
      }
    } else if (t) {
      const s = suffixFromValueType(t.type)
      if (s) {
        const typed = lookupTypedNodeId(lower, s, nodeIdLower)
        if (typed) return typed
      }
    }
    // fallback 继续走后续通用逻辑
  }

  if (nodeType === 'set_local_variable') {
    const identity = resolveNodeIdentity(node, {
      scope: { kind: 'root', name: 'root-node-identity-adapter' },
      variablesByName: varsByName,
      connectionTypes: connIndex,
      fallbacks: resolutionFallbacks,
      strictTypeChecks: false
    })
    if (identity.concreteNodeId !== undefined) return identity.concreteNodeId
  }

  if (nodeType === 'get_local_variable') {
    const identity = resolveNodeIdentity(node, {
      scope: { kind: 'root', name: 'root-node-identity-adapter' },
      variablesByName: varsByName,
      connectionTypes: connIndex,
      fallbacks: resolutionFallbacks,
      strictTypeChecks: false
    })
    if (identity.concreteNodeId !== undefined) return identity.concreteNodeId
  }

  if (nodeType === 'set_node_graph_variable') {
    // P1-W4: do not let root and impl independently choose scalar/list variants.
    // The legacy branch remains the compatibility fallback for unresolved types.
    const identity = resolveNodeIdentity(node, {
      scope: { kind: 'root', name: 'root-node-identity-adapter' },
      variablesByName: varsByName,
      connectionTypes: connIndex,
      fallbacks: resolutionFallbacks,
      strictTypeChecks: false
    })
    if (identity.concreteNodeId !== undefined) return identity.concreteNodeId

    const valueArg = node.args?.[1]
    const t = connTypeFromArgument(valueArg)
    if (t?.type === 'dict') {
      const dictSuffix = inferDictTypedSuffixFromConn(t)
      if (dictSuffix) {
        const typed = nodeIdLower.get(`${lower}__${dictSuffix}`)
        if (typed) return typed
      }
    } else if (t) {
      const s = suffixFromValueType(t.type)
      if (s) {
        const typed = lookupTypedNodeId(lower, s, nodeIdLower)
        if (typed) return typed
      }
    }
    // fallback 继续走后续通用逻辑
  }

  // dict kv typed nodes (e.g. Create_Dictionary__Int_Str)
  const kv = inferKVSuffixes(node)
  if (kv) {
    const direct = nodeIdLower.get(`${lower}__${kv.k}_${kv.v}`)
    if (direct) return direct
    const prefixed = nodeIdLower.get(`${lower}__dict_${kv.k}_${kv.v}`)
    if (prefixed) return prefixed
  }

  // typed by args
  const byArgsCandidates = inferSuffixCandidatesFromArgs(node)
  for (const s of byArgsCandidates) {
    const typed = lookupTypedNodeId(lower, s, nodeIdLower)
    if (typed) return typed
  }

  // typed by produced value
  const byOut = inferProducedValueSuffix(node.id, connIndex)
  if (byOut) {
    const typed = lookupTypedNodeId(lower, byOut, nodeIdLower)
    if (typed) return typed
  }

  const direct = nodeIdLower.get(lower)
  if (direct) return direct

  const generic = nodeIdLower.get(`${lower}__generic`)
  if (generic) return generic

  throw new Error(`[error] unknown node type: ${nodeType}`)
}
