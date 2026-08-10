import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { readGilPayloadFields } from '../src/cli/gil_extract_utils.js'
import { parseMessage } from '../src/injector/binary.js'
import { loadGiaProto } from '../src/injector/proto.js'
import type { LenField } from '../src/injector/types.js'
import { compareGilNodeGraph } from './compare-gil-node-graph.js'
import { blobId, blobName } from '../src/cli/static_assembly/graph_edit.js'

// 文件级全量 diff（2026-08-09 turn-ctl 复盘：替代自写 compare-blobs/diff-def/compare-records/diff-roots
// 等临时脚本）。遍历 before/after 全部 NodeGraph（section 1/4）+ CompositeDef（section 2）记录，
// 按记录序号独立比对（同 id 双记录 def+impl 天然分开），输出 ADD/REMOVED/CHANGED + blob sha256 摘要；
// --detail <graphId> 追加节点级 diff。
// 2026-08-12 复盘补：新增 composites 段（section 2 CompositeDef 记录级 sha 比对）——此前只收
// section 1/4，复合 def 改动（add-input/add-inflow 等）漏检，逼子代理自写逐 section sha 探针。

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
  const fields: LenField[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields)
  // 主图(section 1) + 复合 impl 图(section 4)（2026-08-10：原来只收 section 1，impl 图变化漏检）
  const nodeGraphBlobFields = fields.filter(
    (f) => f.depth === 3 && f.p0 === 10 && (f.p1 === 1 || f.p1 === 4) && f.p2 === 1
  )
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

type DefSummary = { seq: number; id: number; name: string; blobSha: string }

/** CompositeDef（section 2）记录摘要：id/name 用 graph_edit 的纯 wire 解析（无 proto 依赖）。 */
function listDefs(gilPath: string): DefSummary[] {
  const { payload } = readGilPayloadFields(gilPath)
  const fields: LenField[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields)
  const defBlobFields = fields.filter(
    (f) => f.depth === 3 && f.p0 === 10 && f.p1 === 2 && f.p2 === 1
  )
  return defBlobFields.map((field, seq) => {
    const blob = payload.subarray(field.dataStart, field.dataEnd)
    return {
      seq,
      id: blobId(blob, 2) ?? -1,
      name: blobName(blob, 2) ?? '',
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
  const detailIdx = flags.indexOf('--detail')
  if (!beforePath || !afterPath) usage()
  // 只允许 --detail <id> / --full；--detail 的值是裸数字，不算非法 flag
  if (flags.some((f, i) => !f.startsWith('--') && i !== detailIdx + 1)) usage()
  const detailId = Number(detailIdx >= 0 ? (flags[detailIdx + 1] ?? NaN) : NaN)
  if (detailIdx >= 0 && !Number.isFinite(detailId)) usage()
  const full = flags.includes('--full')

  const beforeBytes = readFileSync(beforePath)
  const afterBytes = readFileSync(afterPath)
  const before = listGraphs(beforePath)
  const after = listGraphs(afterPath)
  const beforeDefs = listDefs(beforePath)
  const afterDefs = listDefs(afterPath)
  const key = (g: GraphSummary) => `#${g.seq} gid=${g.id} "${g.name}"`
  const defKey = (d: DefSummary) => `def#${d.seq} id=${d.id} "${d.name}"`
  // 按记录序号独立比对（同 id 双记录 def+impl 天然分开）
  const diffBySeq = <T extends { seq: number; blobSha: string }>(
    b: T[],
    a: T[],
    k: (t: T) => string
  ) => {
    const added = a.filter((x) => !b.some((y) => y.seq === x.seq))
    const removed = b.filter((x) => !a.some((y) => y.seq === x.seq))
    const changed: { before: T; after: T }[] = []
    for (const x of a) {
      const old = b.find((y) => y.seq === x.seq)
      if (old && old.blobSha !== x.blobSha) changed.push({ before: old, after: x })
    }
    return { added, removed, changed, unchanged: a.length - added.length - changed.length }
  }
  const graphsDiff = diffBySeq(before, after, key)
  const defsDiff = diffBySeq(beforeDefs, afterDefs, defKey)

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
          added: graphsDiff.added.map((g) => ({ ...g, key: key(g) })),
          removed: graphsDiff.removed.map((g) => ({ ...g, key: key(g) })),
          changed: graphsDiff.changed.map((c) => ({
            key: key(c.before),
            before: c.before,
            after: c.after
          })),
          unchanged: graphsDiff.unchanged
        },
        composites: {
          beforeCount: beforeDefs.length,
          afterCount: afterDefs.length,
          added: defsDiff.added.map((d) => ({ ...d, key: defKey(d) })),
          removed: defsDiff.removed.map((d) => ({ ...d, key: defKey(d) })),
          changed: defsDiff.changed.map((c) => ({
            key: defKey(c.before),
            before: c.before,
            after: c.after
          })),
          unchanged: defsDiff.unchanged
        },
        ...(detail ? { detail } : {})
      },
      null,
      2
    )
  )
}
