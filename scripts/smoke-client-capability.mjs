import { CLIENT_NODE_METADATA } from '../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.js'

if (!Array.isArray(CLIENT_NODE_METADATA)) {
  throw new Error('CLIENT_NODE_METADATA must be an array')
}

console.log(`[ok] client metadata imports (${CLIENT_NODE_METADATA.length} records)`)
