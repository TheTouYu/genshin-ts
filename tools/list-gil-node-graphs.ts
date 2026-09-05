import { readFileSync } from 'node:fs'

import { readGilPayloadFields } from '../src/cli/gil_extract_utils.js'
import { parseWireMessage } from '../src/cli/static_assembly/wire.js'
import { parseMessage } from '../src/injector/binary.js'
import { loadGiaProto } from '../src/injector/proto.js'
import type { LenField } from '../src/injector/types.js'

function usage(): never {
  console.error('Usage: npx tsx tools/list-gil-node-graphs.ts <map.gil|file.gia>')
  process.exit(1)
}

function listGiaGraphs(giaPath: string) {
  const bytes = readFileSync(giaPath)
  const payload = bytes.subarray(20, bytes.length - 4)
  const top = parseWireMessage(payload)
  if (!top) throw new Error(`[error] malformed GIA payload: ${giaPath}`)
  const proto = loadGiaProto()
  const GraphUnit = proto.root.lookupType('GraphUnit')
  const graphs: { id?: number; type?: number; name?: string; nodeCount?: number }[] = []
  for (const field of top) {
    if (field.wire !== 2 || field.number !== 1) continue
    const unit = GraphUnit.decode(field.value) as {
      which?: number
      graph?: { inner?: { graph?: { id?: { id?: number; type?: number }; name?: string; nodes?: unknown[] } } }
    }
    const graph = unit.graph?.inner?.graph
    if (!graph) continue
    graphs.push({
      id: graph.id?.id,
      type: graph.id?.type,
      name: graph.name,
      nodeCount: graph.nodes?.length ?? 0
    })
  }
  console.log(JSON.stringify({ gilPath: giaPath, graphs }, null, 2))
}

const [inputPath] = process.argv.slice(2)
if (!inputPath) usage()

if (/\.gia$/i.test(inputPath)) {
  listGiaGraphs(inputPath)
} else {
  const { payload } = readGilPayloadFields(inputPath)
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
  console.log(JSON.stringify({ gilPath: inputPath, graphs }, null, 2))
}
