import type { ClientGraphSubType } from '../../runtime/IR.js'
import { CLIENT_ERROR_CODES, clientNodegraphError } from '../../shared/client_capability_errors.js'
import { requireClientNodeMetadata } from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_helpers.js'
import type { ClientNodeMetadata } from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.js'
import type { IRNode } from './types.js'

const UNSUPPORTED_SPECIAL_KINDS = new Set(['inline_var_type_hint', 'structure_list_unknown_binding'])

/** IR value type -> ClientVarType id, mirroring the extractor's type name table */
const CLIENT_VAR_TYPE_BY_IR_TYPE: Record<string, number> = {
  entity: 1,
  entity_list: 2,
  int: 3,
  int_list: 4,
  bool: 5,
  bool_list: 6,
  float: 7,
  float_list: 8,
  str: 9,
  str_list: 10,
  vec3: 11,
  vec3_list: 12,
  enum: 13,
  enumeration: 13,
  guid: 14,
  guid_list: 15,
  faction: 16,
  config_id: 18,
  prefab_id: 19,
  config_id_list: 20,
  prefab_id_list: 21,
  dict: 24,
  faction_list: 25
}

export function resolveClientNodeMetadata(
  subType: ClientGraphSubType,
  node: IRNode
): ClientNodeMetadata {
  const metadata = requireClientNodeMetadata(subType, node.type)
  if (metadata.specialKind && UNSUPPORTED_SPECIAL_KINDS.has(metadata.specialKind)) {
    throw clientNodegraphError(
      CLIENT_ERROR_CODES.UNSUPPORTED_SPECIAL_NODE,
      `${subType}.${node.type} uses unsupported special kind ${metadata.specialKind}`
    )
  }
  return metadata
}

/**
 * Deterministically resolve a node's concrete id.
 *
 * Non-reflective records use their single extracted concreteId. Reflective
 * records select the reflectMap entry whose variantKey (the ordered
 * ClientVarType vector of reflective input pins) matches the IR node's
 * argument types. No fallback and no closest-match: anything ambiguous throws.
 */
export function resolveClientConcreteVariant(
  metadata: ClientNodeMetadata,
  node: IRNode
): number | string {
  if (!metadata.reflectMap) {
    if (metadata.concreteId === null) {
      throw clientNodegraphError(
        CLIENT_ERROR_CODES.NODE_UNAVAILABLE,
        `${metadata.subType}.${metadata.nodeType} (genericId ${metadata.genericId}) has no concrete id`
      )
    }
    return metadata.concreteId
  }

  const reflectiveIndexes = metadata.inputs
    .filter((pin) => pin.reflective)
    .map((pin) => pin.index)
    .sort((a, b) => a - b)

  const keyParts: string[] = []
  for (const index of reflectiveIndexes) {
    const arg = node.args?.[index]
    const irType = arg == null ? undefined : arg.type === 'conn' ? arg.value.type : arg.type
    const clientVarType = irType ? CLIENT_VAR_TYPE_BY_IR_TYPE[irType] : undefined
    if (clientVarType === undefined) {
      throw clientNodegraphError(
        CLIENT_ERROR_CODES.NODE_UNAVAILABLE,
        `${metadata.subType}.${metadata.nodeType} (genericId ${metadata.genericId}) cannot derive variant key: ` +
          `input #${index} has unresolvable type "${irType ?? 'missing'}"`
      )
    }
    keyParts.push(String(clientVarType))
  }
  const key = keyParts.join(',')

  const matches = metadata.reflectMap.filter((variant) => variant.variantKey === key)
  if (matches.length !== 1) {
    const candidates = metadata.reflectMap.map((v) => v.variantKey).join(' | ')
    throw clientNodegraphError(
      CLIENT_ERROR_CODES.NODE_UNAVAILABLE,
      `${metadata.subType}.${metadata.nodeType} (genericId ${metadata.genericId}) ` +
        `${matches.length === 0 ? 'has no' : 'has multiple'} reflect variants for key "${key}" ` +
        `(candidates: ${candidates || 'none confirmed'})`
    )
  }
  return matches[0].concreteId
}
