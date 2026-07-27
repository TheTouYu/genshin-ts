import { readGilPayloadFields } from 'genshin-ts/cli/gil_extract_utils.js'
import { parseMessage } from 'genshin-ts/injector/binary.js'
import { loadGiaProto } from 'genshin-ts/injector/proto.js'
import type { LenField } from 'genshin-ts/injector/types.js'

function usage(): never {
  console.error('Usage: npx tsx tools/list-gil-node-graphs.ts <map.gil>')
  process.exit(1)
}

const [gilPath] = process.argv.slice(2)
if (!gilPath) usage()

const { payload, fields } = readGilPayloadFields(gilPath)
const nodeGraphBlobFields: LenField[] = []
parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, [], { nodeGraphBlobFields })
const { nodeGraphMessage } = loadGiaProto()
const graphs = nodeGraphBlobFields.map((field) => {
  const graph = nodeGraphMessage.decode(payload.subarray(field.dataStart, field.dataEnd)) as {
    id?: { id?: number; type?: number }
    name?: string
    nodes?: unknown[]
  }
  return {
    id: graph.id?.id,
    type: graph.id?.type,
    name: graph.name,
    nodeCount: graph.nodes?.length ?? 0
  }
})
console.log(JSON.stringify({ gilPath, graphs }, null, 2))
