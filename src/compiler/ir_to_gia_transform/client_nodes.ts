import type { ClientGraphSubType } from '../../runtime/IR.js'
import { CLIENT_ERROR_CODES, clientNodegraphError } from '../../shared/client_capability_errors.js'
import { requireClientNodeMetadata } from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_helpers.js'
import type { ClientNodeMetadata } from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.js'
import type { IRNode } from './types.js'

const UNSUPPORTED_SPECIAL_KINDS = new Set(['inline_var_type_hint', 'structure_list_unknown_binding'])

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
