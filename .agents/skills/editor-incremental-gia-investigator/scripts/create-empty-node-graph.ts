// 临时工具：给 GIL 关卡生成一个新的空 NodeGraph（基于 gil-whole-structure-readonly 分析结论）
// 依据（证据见 add-empty-node-graph-01/02 Validator ACCEPT）：
//   - root 10 追加一条 field 1 wrapper：{id:{class:10000,type:20000,kind:21001,nodeId}, name}
//   - root 6 的 "未分类页签" 聚合 record（顶层 #1=4）追加 #5 {typeValue:800, id:图ID}
//   - root 46 等长变化语义 INSUFFICIENT，不模拟
// 用法：
//   npx tsx .local/tmp/create-empty-node-graph.ts --gil <map.gil> [--graph-id <id>] [--name <name>] [--output <file>|--write]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { buildFile, readUint32BE } from '../../../../src/injector/binary.js'
import {
  emitWireMessage,
  parseWireMessage,
  printableWireText,
  type WireField
} from '../../../../src/cli/static_assembly/wire.js'
import { sha256Bytes } from '../../../../src/cli/static_assembly/json.js'

const DEFAULT_GRAPH_ID = 1073741825
const GRAPH_CLASS = 10000
const GRAPH_TYPE = 20000
const GRAPH_KIND = 21001
const FOLDER_TYPE_SERVER_GRAPH = 800 // DEFAULT_GRAPH_TYPE_VALUES: 20000 -> 800

function usage(): never {
  console.error(
    'Usage: create-empty-node-graph.ts --gil <map.gil> [--graph-id <id>] [--name <name>] [--output <file>|--write]'
  )
  process.exit(1)
}

function value(argv: readonly string[], i: number): string {
  const v = argv[i + 1]
  if (v === undefined) usage()
  return v
}

function readRoot(payload: Uint8Array): WireField[] {
  const root = parseWireMessage(payload)
  if (!root) throw new Error('[error] cannot parse gil payload root')
  return root
}

function textOf(fields: readonly WireField[], number: number): string | undefined {
  const f = fields.find((x) => x.number === number && x.wire === 2)
  return f ? printableWireText(f.value as Uint8Array) : undefined
}

function varintOf(fields: readonly WireField[], number: number): number | undefined {
  const f = fields.find((x) => x.number === number && x.wire === 0)
  return typeof f?.value === 'number' ? f.value : undefined
}

function graphIdOf(record: Uint8Array): number | undefined {
  // root10.1 记录 = {1: NodeGraph}，NodeGraph = {1: Id, 2: name}，Id.#5 = 图 ID
  const inner = parseWireMessage(record)
  const nodeGraph = inner?.find((f) => f.number === 1 && f.wire === 2)
  if (!nodeGraph) return undefined
  const ng = parseWireMessage(nodeGraph.value as Uint8Array)
  const id = ng?.find((f) => f.number === 1 && f.wire === 2)
  if (!id) return undefined
  const idMsg = parseWireMessage(id.value as Uint8Array)
  const nodeId = idMsg?.find((f) => f.number === 5 && f.wire === 0)
  return typeof nodeId?.value === 'number' ? nodeId.value : undefined
}

function appendGraphWrapper(root10: WireField[], graphId: number, name: string): WireField[] {
  const idMsg: WireField[] = [
    { number: 1, wire: 0, value: GRAPH_CLASS },
    { number: 2, wire: 0, value: GRAPH_TYPE },
    { number: 3, wire: 0, value: GRAPH_KIND },
    { number: 5, wire: 0, value: graphId }
  ]
  const nodeGraph = emitWireMessage([
    { number: 1, wire: 2, value: emitWireMessage(idMsg) },
    { number: 2, wire: 2, value: new TextEncoder().encode(name) }
  ])
  // root10.1 记录 = {1: NodeGraph}，NodeGraph = {1: Id, 2: name}
  return [
    ...root10,
    { number: 1, wire: 2, value: emitWireMessage([{ number: 1, wire: 2, value: nodeGraph }]) }
  ]
}

function appendFolderEntry(root6: WireField[], graphId: number): WireField[] {
  const records = root6.filter((f) => f.number === 1 && f.wire === 2)
  let folderRecord: WireField | undefined
  for (const rec of records) {
    const inner = parseWireMessage(rec.value as Uint8Array)
    if (!inner || varintOf(inner, 1) !== 4) continue
    const tab = inner.find((f) => f.number === 3 && f.wire === 2)
    const tabFields = tab ? parseWireMessage(tab.value as Uint8Array) : undefined
    if (tabFields && textOf(tabFields, 1) === '未分类页签') {
      folderRecord = rec
      break
    }
  }
  if (!folderRecord) {
    throw new Error('[error] root6 record #1=4 with "未分类页签" not found in this map')
  }
  const inner = parseWireMessage(folderRecord.value as Uint8Array)!
  const rebuilt = inner.map((f) => {
    if (f.number !== 3 || f.wire !== 2) return f
    const tab = parseWireMessage(f.value as Uint8Array)!
    const entry: WireField[] = [
      { number: 1, wire: 0, value: FOLDER_TYPE_SERVER_GRAPH },
      { number: 2, wire: 0, value: graphId }
    ]
    const nextTab = [...tab, { number: 5, wire: 2, value: emitWireMessage(entry) }]
    return { ...f, value: emitWireMessage(nextTab) }
  })
  const rebuiltBytes = emitWireMessage(rebuilt)
  return root6.map((f) => (f === folderRecord ? { ...f, value: rebuiltBytes } : f))
}

function build(payload: Uint8Array, graphId: number, name: string): Uint8Array {
  const root = readRoot(payload)
  const nextRoot = root.map((field) => {
    if (field.wire !== 2) return field
    if (field.number === 10) {
      const root10 = parseWireMessage(field.value as Uint8Array)!
      const hasId = root10.some((f) => f.number === 1 && f.wire === 2 && graphIdOf(f.value as Uint8Array) === graphId)
      if (hasId) throw new Error(`[error] graph ${graphId} already exists in root 10`)
      return { ...field, value: emitWireMessage(appendGraphWrapper(root10, graphId, name)) }
    }
    if (field.number === 6) {
      const root6 = parseWireMessage(field.value as Uint8Array)!
      return { ...field, value: emitWireMessage(appendFolderEntry(root6, graphId)) }
    }
    return field
  })
  return emitWireMessage(nextRoot)
}

function main(argv: readonly string[]): void {
  let gilPath: string | undefined
  let graphId = DEFAULT_GRAPH_ID
  let name = '新建节点图'
  let outputPath: string | undefined
  let write = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--gil') gilPath = value(argv, i++)
    else if (a === '--graph-id') graphId = Number(value(argv, i++))
    else if (a === '--name') name = value(argv, i++)
    else if (a === '--output') outputPath = value(argv, i++)
    else if (a === '--write') write = true
    else usage()
  }
  if (!gilPath) usage()
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  const gil = path.resolve(gilPath)
  const sourceBytes = new Uint8Array(fs.readFileSync(gil))
  const sourceSha = sha256Bytes(sourceBytes)
  const payload = sourceBytes.slice(20, -4)
  const result = build(payload, graphId, name)
  const header = {
    schema: readUint32BE(sourceBytes, 4),
    headTag: readUint32BE(sourceBytes, 8),
    fileType: readUint32BE(sourceBytes, 12),
    tailTag: readUint32BE(sourceBytes, sourceBytes.length - 4)
  }
  const newFile = buildFile(result, header)
  const candidateSha = sha256Bytes(newFile)

  // 候选结构回读：root10 有图、root6 有 folder 条目
  const verify = (bytes: Uint8Array): void => {
    const root = readRoot(bytes.slice(20, -4))
    const top10 = parseWireMessage(root.find((f) => f.number === 10 && f.wire === 2)!.value as Uint8Array)!
    const found = top10.filter((f) => f.number === 1 && f.wire === 2).some((f) => graphIdOf(f.value as Uint8Array) === graphId)
    if (!found) throw new Error('[error] read-back: graph wrapper missing in root 10')
    const top6 = parseWireMessage(root.find((f) => f.number === 6 && f.wire === 2)!.value as Uint8Array)!
    const hasFolder = top6.filter((f) => f.number === 1 && f.wire === 2).some((f) => {
      const inner = parseWireMessage(f.value as Uint8Array)
      if (varintOf(inner ?? [], 1) !== 4) return false
      const tab = inner?.find((g) => g.number === 3 && g.wire === 2)
      const tabMsg = tab ? parseWireMessage(tab.value as Uint8Array) : undefined
      return tabMsg?.some(
        (g) => g.number === 5 && g.wire === 2 && parseWireMessage(g.value as Uint8Array)?.some(
          (e) => e.number === 2 && e.wire === 0 && e.value === graphId
        )
      )
    })
    if (!hasFolder) throw new Error('[error] read-back: folder entry missing in root 6')
  }
  verify(newFile)

  if (write) {
    const nowSha = sha256Bytes(new Uint8Array(fs.readFileSync(gil)))
    if (nowSha !== sourceSha) throw new Error('[error] source GIL changed since read; aborting write')
    const backupDir = path.join(path.dirname(gil), '.gsts', 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = path.join(backupDir, `${path.basename(gil)}.${stamp}.new-graph.bak`)
    fs.copyFileSync(gil, backup)
    fs.writeFileSync(gil, newFile)
    console.log(`backup=${backup}`)
    console.log(`written=${gil}`)
  } else if (outputPath) {
    const absolute = path.resolve(outputPath)
    if (fs.existsSync(absolute)) throw new Error(`[error] output already exists: ${absolute}`)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, newFile)
    console.log(`written=${absolute}`)
  } else {
    console.log(`preview=${gil}`)
  }
  console.log(
    `graphId=${graphId} name=${name} sourceSha256=${sourceSha} ` +
      `candidateSha256=${candidateSha} size=${sourceBytes.length}->${newFile.length}`
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main(process.argv.slice(2))
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
