import { CLIENT_NODE_METHODS_BY_SUB_TYPE } from '../src/definitions/client_method_modes.js'
import { CLIENT_NODE_METADATA } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.js'

// keep leading underscores: `_3dVectorDotProduct` -> `_3d_vector_dot_product`
function camelToSnake(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
}

const metadataTypesBySubType = new Map<string, Set<string>>()
for (const item of CLIENT_NODE_METADATA) {
  const set = metadataTypesBySubType.get(item.subType) ?? new Set<string>()
  metadataTypesBySubType.set(item.subType, set)
  set.add(item.nodeType)
}

const missing: string[] = []
let methodCount = 0

for (const [subType, methods] of Object.entries(CLIENT_NODE_METHODS_BY_SUB_TYPE)) {
  const nodeTypes = metadataTypesBySubType.get(subType)
  for (const method of methods as readonly string[]) {
    methodCount += 1
    const nodeType = camelToSnake(method)
    if (!nodeTypes?.has(nodeType)) missing.push(`${subType}.${method} -> ${nodeType}`)
  }
}

if (missing.length) {
  throw new Error(`client definitions missing metadata:\n${missing.join('\n')}`)
}

console.log(
  `[ok] client definitions consistency (${methodCount} method entries across ${metadataTypesBySubType.size} sub types)`
)
