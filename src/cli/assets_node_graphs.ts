import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { loadGstsConfig } from '../compiler/config_loader.js'
import type { GstsConfig, GstsInjectConfig } from '../compiler/gsts_config.js'
import { buildFile, readUint32BE } from '../injector/binary.js'
import { resolveGilTarget } from './gil_paths.js'
import { sha256Bytes } from './static_assembly/json.js'
import {
  emitWireMessage,
  parseWireMessage,
  printableWireText,
  type WireField
} from './static_assembly/wire.js'

// 依据（编辑器真实证据，见 docs/game-engine-knowledge/gil-structure-semantics.md）：
//   - root 10 追加一条 field 1 wrapper：{id:{class:10000,type:20000,kind:21001,nodeId}, name}
//   - root 6 的 "未分类页签" 聚合 record（顶层 #1=4）追加 #5 {typeValue:800, id:图ID}
//   - root 46 等长变化语义 INSUFFICIENT，不模拟
const DEFAULT_GRAPH_ID = 1073741825
const GRAPH_CLASS = 10000
const GRAPH_TYPE = 20000
const GRAPH_KIND = 21001
const FOLDER_TYPE_SERVER_GRAPH = 800 // DEFAULT_GRAPH_TYPE_VALUES: 20000 -> 800

type RootContext = { projectConfigPath?: string; projectConfig?: GstsConfig }

type Args = {
  gilPath: string | undefined
  mapId: number | undefined
  name: string
  outputPath: string | undefined
  write: boolean
}

function usage(exitCode = 1): never {
  const output = [
    'Usage: gsts assets:node-graphs [create] [options]',
    '',
    '  --config <file>   project config (for --map-id resolution)',
    '  --gil <file>      explicit GIL source',
    '  --map-id <id>     target map ID (location only; requires project config)',
    '  --name <string>   new NodeGraph name (default: 新建节点图)',
    '  --output <file>   create output without overwriting',
    '  --write           write source GIL after backup',
    '  -h, --help        show help',
    '',
    'Creates an empty NodeGraph (root 10 wrapper + root 6 folder entry) in a map GIL.',
    'The injector can only target graphs that exist with a folder entry; use this',
    'command to create a placeholder before injecting into a new map.'
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](output)
  process.exit(exitCode)
}

function value(argv: readonly string[], index: number): string {
  const result = argv[index + 1]
  if (!result || result.startsWith('--')) usage()
  return result
}

function parseArgs(argv: readonly string[]): Args {
  let gilPath: string | undefined
  let mapId: number | undefined
  let name = '新建节点图'
  let outputPath: string | undefined
  let write = false
  let index = 0
  if (argv[0] === 'create') index++
  for (; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--gil') gilPath = value(argv, index++)
    else if (arg === '--map-id') mapId = Number(value(argv, index++))
    else if (arg === '--name') name = value(argv, index++)
    else if (arg === '--output') outputPath = value(argv, index++)
    else if (arg === '--write') write = true
    else if (arg === '--help' || arg === '-h') usage(0)
    else usage()
  }
  if (gilPath && mapId !== undefined)
    throw new Error('[error] --gil and --map-id are mutually exclusive')
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  return { gilPath, mapId, name, outputPath, write }
}

// 自动分配下一个节点图 ID：扫描地图已有图 ID，取 max+1；一个都没有时用固定起始值
// （真实编辑器证据：10+ 张地图最小图 ID 均为 1073741825；1840 的 1825→1836→1856→1870
//  与 1845 删 1825 后新建从 1826 起，均为 max+1 不复用空洞）
export function nextGraphId(payload: Uint8Array): number {
  const root = readRoot(payload)
  const top10 = root.find((f) => f.number === 10 && f.wire === 2)
  if (!top10) return DEFAULT_GRAPH_ID
  const root10 = parseWireMessage(top10.value as Uint8Array)!
  const ids = root10
    .filter((f) => f.number === 1 && f.wire === 2)
    .map((f) => graphIdOf(f.value as Uint8Array))
    .filter((id): id is number => typeof id === 'number')
  return ids.length ? Math.max(...ids) + 1 : DEFAULT_GRAPH_ID
}

function readRoot(payload: Uint8Array): WireField[] {
  const root = parseWireMessage(payload)
  if (!root) throw new Error('[error] malformed GIL payload')
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

export function buildEmptyNodeGraph(
  payload: Uint8Array,
  graphId: number,
  name: string
): Uint8Array {
  const root = readRoot(payload)
  const nextRoot = root.map((field) => {
    if (field.wire !== 2) return field
    if (field.number === 10) {
      const root10 = parseWireMessage(field.value as Uint8Array)!
      const hasId = root10.some(
        (f) => f.number === 1 && f.wire === 2 && graphIdOf(f.value as Uint8Array) === graphId
      )
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

function verifyNodeGraphReadBack(bytes: Uint8Array, graphId: number): void {
  const root = readRoot(bytes.slice(20, -4))
  const top10 = parseWireMessage(
    root.find((f) => f.number === 10 && f.wire === 2)!.value as Uint8Array
  )!
  const found = top10
    .filter((f) => f.number === 1 && f.wire === 2)
    .some((f) => graphIdOf(f.value as Uint8Array) === graphId)
  if (!found) throw new Error('[error] read-back: graph wrapper missing in root 10')
  const top6 = parseWireMessage(
    root.find((f) => f.number === 6 && f.wire === 2)!.value as Uint8Array
  )!
  const hasFolder = top6
    .filter((f) => f.number === 1 && f.wire === 2)
    .some((f) => {
      const inner = parseWireMessage(f.value as Uint8Array)
      if (varintOf(inner ?? [], 1) !== 4) return false
      const tab = inner?.find((g) => g.number === 3 && g.wire === 2)
      const tabMsg = tab ? parseWireMessage(tab.value as Uint8Array) : undefined
      return tabMsg?.some(
        (g) =>
          g.number === 5 &&
          g.wire === 2 &&
          parseWireMessage(g.value as Uint8Array)?.some(
            (e) => e.number === 2 && e.wire === 0 && e.value === graphId
          )
      )
    })
  if (!hasFolder) throw new Error('[error] read-back: folder entry missing in root 6')
}

function resolveGilPath(
  projectConfig: GstsConfig | undefined,
  args: Args
): { path: string; mapId: number } {
  if (args.gilPath) {
    const absolute = path.resolve(args.gilPath)
    return { path: absolute, mapId: args.mapId ?? Number(path.basename(absolute, '.gil')) }
  }
  const inject: GstsInjectConfig = { ...(projectConfig?.inject ?? {}) }
  if (args.mapId !== undefined) inject.mapId = args.mapId
  if (inject.mapId === undefined) {
    throw new Error(
      '[error] mapId is required; use --gil, or provide --map-id with a project config'
    )
  }
  const target = resolveGilTarget(inject)
  return { path: target.gilPath, mapId: target.mapId }
}

export async function runAssetsNodeGraphs(
  argv: readonly string[] = process.argv.slice(2),
  rootContext: RootContext = {}
): Promise<void> {
  const args = parseArgs(argv)
  let projectConfig = rootContext.projectConfig
  if (!projectConfig && rootContext.projectConfigPath) {
    projectConfig = await loadGstsConfig(rootContext.projectConfigPath, { profile: 'project' })
  }
  const source = resolveGilPath(projectConfig, args)
  const gil = source.path
  const sourceBytes = new Uint8Array(fs.readFileSync(gil))
  const sourceSha = sha256Bytes(sourceBytes)
  const payload = sourceBytes.slice(20, -4)
  const graphId = nextGraphId(payload)
  const result = buildEmptyNodeGraph(payload, graphId, args.name)
  const header = {
    schema: readUint32BE(sourceBytes, 4),
    headTag: readUint32BE(sourceBytes, 8),
    fileType: readUint32BE(sourceBytes, 12),
    tailTag: readUint32BE(sourceBytes, sourceBytes.length - 4)
  }
  const newFile = buildFile(result, header)
  const candidateSha = sha256Bytes(newFile)
  verifyNodeGraphReadBack(newFile, graphId)

  if (args.write) {
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
  } else if (args.outputPath) {
    const absolute = path.resolve(args.outputPath)
    if (fs.existsSync(absolute)) throw new Error(`[error] output already exists: ${absolute}`)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, newFile)
    console.log(`written=${absolute}`)
  } else {
    console.log(`preview=${gil}`)
  }
  console.log(
    `graphId=${graphId} name=${args.name} sourceSha256=${sourceSha} ` +
      `candidateSha256=${candidateSha} size=${sourceBytes.length}->${newFile.length}`
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsNodeGraphs().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
