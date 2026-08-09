import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { readGilPayloadFields } from '../src/cli/gil_extract_utils.js'
import { parseMessage } from '../src/injector/binary.js'
import { loadGiaProto } from '../src/injector/proto.js'
import type { LenField } from '../src/injector/types.js'
import { compareGilNodeGraph } from './compare-gil-node-graph.js'

// 文件级全量 diff（2026-08-09 turn-ctl 复盘：替代自写 compare-blobs/diff-def/compare-records/diff-roots
// 等临时脚本）。遍历 before/after 全部 NodeGraph 记录，按记录序号独立比对（同 id 双记录 def+impl
// 天然分开），输出 ADD/REMOVED/CHANGED + blob sha256 摘要；--detail <graphId> 追加节点级 diff。

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

type GraphSummary = {
  seq: number
  id: number
  type: number
  name: string
  nodeCount: number
  blobSha: string
}

function listGraphs(gilPath: string): GraphSummary[] {
  const { payload } = readGilPayloadFields(gilPath)
  const nodeGraphBlobFields: LenField[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, [], { nodeGraphBlobFields })
  const { nodeGraphMessage } = loadGiaProto()
  return nodeGraphBlobFields.map((field, seq) => {
    const blob = payload.subarray(field.dataStart, field.dataEnd)
    const graph = nodeGraphMessage.decode(blob) as {
      id?: { id?: number; type?: number }
      name?: string
      nodes?: unknown[]
    }
    return {
      seq,
      id: graph.id?.id ?? -1,
      type: graph.id?.type ?? -1,
      name: graph.name ?? '',
      nodeCount: graph.nodes?.length ?? 0,
      blobSha: sha256(blob).slice(0, 12)
    }
  })
}

function usage(): never {
  console.error(
    'Usage: npx tsx tools/diff-gil-files.ts <before.gil> <after.gil> [--detail <graphId>] [--full]'
  )
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [beforePath, afterPath, ...flags] = process.argv.slice(2)
  if (!beforePath || !afterPath || flags.some((f) => !f.startsWith('--'))) usage()
  const detailId = Number(flags[flags.indexOf('--detail') + 1] ?? NaN)
  if (flags.includes('--detail') && !Number.isFinite(detailId)) usage()
  const full = flags.includes('--full')

  const beforeBytes = readFileSync(beforePath)
  const afterBytes = readFileSync(afterPath)
  const before = listGraphs(beforePath)
  const after = listGraphs(afterPath)
  const key = (g: GraphSummary) => `#${g.seq} gid=${g.id} "${g.name}"`
  const afterBySeq = new Map(after.map((g) => [g.seq, g]))
  const added: GraphSummary[] = []
  const removed: GraphSummary[] = []
  const changed: { before: GraphSummary; after: GraphSummary }[] = []
  for (const g of after) {
    const old = before[g.seq]
    if (!old) added.push(g)
    else if (old.blobSha !== g.blobSha) changed.push({ before: old, after: g })
  }
  for (let i = after.length; i < before.length; i++) removed.push(before[i])

  const detail = Number.isFinite(detailId)
    ? compareGilNodeGraph(beforePath, afterPath, detailId, full)
    : undefined
  console.log(
    JSON.stringify(
      {
        files: {
          before: { path: beforePath, bytes: beforeBytes.length, sha256: sha256(beforeBytes) },
          after: { path: afterPath, bytes: afterBytes.length, sha256: sha256(afterBytes) }
        },
        graphs: {
          beforeCount: before.length,
          afterCount: after.length,
          added: added.map((g) => ({ ...g, key: key(g) })),
          removed: removed.map((g) => ({ ...g, key: key(g) })),
          changed: changed.map((c) => ({
            key: key(c.before),
            before: c.before,
            after: c.after
          })),
          unchanged: after.length - added.length - changed.length
        },
        ...(detail ? { detail } : {})
      },
      null,
      2
    )
  )
}
