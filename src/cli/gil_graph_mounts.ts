import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { GstsConfig, GstsInjectConfig } from '../compiler/gsts_config.js'
import { loadGstsConfig } from '../compiler/config_loader.js'
import { resolveGilTarget, syncGilToTemp } from './gil_paths.js'
import { patchGilRecord } from './static_assembly/patch.js'
import {
  emitWireMessage as emit,
  parseWireMessage as parse,
  wireRecordId,
  wireRecords
} from './static_assembly/wire.js'

/**
 * 节点图挂载（type 3 槽）记录级读写（2026-08-07）。
 *
 * 已闭合规则（真实相邻快照证据，见 docs/game-engine-knowledge/gil-structure-semantics.md
 * 「实体挂载」与挂载选题 manifest mount-case1/2/3/4）：
 * - 挂载生效节点图 = 实体槽 type 3：槽列表（def root4 f7 / 实例 root8 f6 / 场景实体 root5 f6）
 *   中 {1:3} 的槽，其 f13.f1 每条 = {1:1, 2:图GID, 501:20000}；多图 = f13.f1 按挂载顺序
 *   repeated 追加；解除最后一个图 → f13 空 message（槽保留为 08036a00）。
 * - def 挂载时编辑器双写 root4（f1=defID）+ root8 全部实例（f2.f1=defID）；
 *   场景实体挂载只写 root5（f1=场景实体 ID）。
 */

const MOUNT_SLOT = 3
const SLOT_CONTAINER = 13
const MOUNT_TYPE = 20000

/** 读目标记录的 type 3 槽挂载图列表（无槽/空槽 → []）。 */
export function readMountedGraphs(record: Uint8Array, slotField: number): number[] {
  const fields = parse(record)
  const slot = fields?.find(
    (field) =>
      field.wire === 2 &&
      field.number === slotField &&
      parse(field.value as Uint8Array)?.some(
        (child) => child.number === 1 && child.wire === 0 && child.value === MOUNT_SLOT
      )
  )
  const container = slot
    ? parse(slot.value as Uint8Array)?.find(
        (field) => field.wire === 2 && field.number === SLOT_CONTAINER
      )
    : undefined
  const entries = container ? parse(container.value as Uint8Array) : undefined
  const graphs: number[] = []
  for (const entry of entries ?? []) {
    if (entry.wire !== 2 || entry.number !== 1) continue
    const inner = parse(entry.value as Uint8Array)?.find(
      (field) => field.wire === 2 && field.number === 1
    )
    const gid = parse(inner?.value as Uint8Array)?.find(
      (field) => field.wire === 0 && field.number === 2
    )?.value
    if (typeof gid === 'number') graphs.push(gid)
  }
  return graphs
}

function mountSlotMessage(graphs: readonly number[]): Uint8Array {
  // 真实形态：f13.f1 每条 = {1: {1:1, 2:图GID, 501:20000}}（两层 f1 包装）
  const entries = graphs.map((graphId) =>
    emit([
      {
        number: 1,
        wire: 2,
        value: emit([
          { number: 1, wire: 0, value: 1 },
          { number: 2, wire: 0, value: graphId },
          { number: 501, wire: 0, value: MOUNT_TYPE }
        ])
      }
    ])
  )
  const container = emit(entries.map((value) => ({ number: 1, wire: 2, value })))
  return emit([
    { number: 1, wire: 0, value: MOUNT_SLOT },
    { number: SLOT_CONTAINER, wire: 2, value: container }
  ])
}

/** 写目标记录的 type 3 槽为指定图列表（空列表 = 编辑器空槽形态 08036a00）。 */
export function setMountedGraphs(
  record: Uint8Array,
  slotField: number,
  graphs: readonly number[]
): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] record malformed')
  const slotIndex = fields.findIndex(
    (field) =>
      field.wire === 2 &&
      field.number === slotField &&
      parse(field.value as Uint8Array)?.some(
        (child) => child.number === 1 && child.wire === 0 && child.value === MOUNT_SLOT
      )
  )
  if (slotIndex < 0) throw new Error('[error] record has no type 3 (mount) slot')
  fields[slotIndex] = { number: slotField, wire: 2, value: mountSlotMessage(graphs) }
  return emit(fields)
}

/** 挂载一个节点图（幂等：已挂载则原样返回）。 */
export function attachMountedGraph(
  bytes: Uint8Array,
  rootField: number,
  recordId: number,
  slotField: number,
  graphId: number
): Uint8Array {
  return patchGilRecord(bytes, rootField, recordId, (record) => {
    const graphs = readMountedGraphs(record, slotField)
    if (graphs.includes(graphId)) return record
    return setMountedGraphs(record, slotField, [...graphs, graphId])
  })
}

/** 解除挂载一个节点图（幂等：未挂载则原样返回）。 */
export function detachMountedGraph(
  bytes: Uint8Array,
  rootField: number,
  recordId: number,
  slotField: number,
  graphId: number
): Uint8Array {
  return patchGilRecord(bytes, rootField, recordId, (record) => {
    const graphs = readMountedGraphs(record, slotField)
    if (!graphs.includes(graphId)) return record
    return setMountedGraphs(record, slotField, graphs.filter((id) => id !== graphId))
  })
}

/** root8 实例记录是否引用给定 defID（f2.f1 = defID 全值）。 */
export function instanceReferencesDef(record: Uint8Array, defId: number): boolean {
  const f2 = parse(record)?.find((field) => field.wire === 2 && field.number === 2)
  return (
    parse(f2?.value as Uint8Array)?.some(
      (field) => field.wire === 0 && field.number === 1 && field.value === defId
    ) ?? false
  )
}

/** 对 root 容器中所有匹配记录逐一局部替换（无匹配不报错，返回替换条数）。 */
function patchAllMatching(
  bytes: Uint8Array,
  rootField: number,
  sectionField: number,
  match: (record: Uint8Array) => boolean,
  mutate: (record: Uint8Array) => Uint8Array
): { bytes: Uint8Array; count: number } {
  // patchGilRecord 总是定位容器中第一个匹配记录，因此每轮用 skip 计数
  // 跳过上一轮已处理过的匹配，逐条推进；mutate 幂等无变化时视为已处理完。
  let count = 0
  for (;;) {
    let matched = false
    let seen = 0
    try {
      bytes = patchGilRecord(bytes, rootField, -1, (record) => {
        const next = mutate(record)
        if (next !== record) matched = true
        return next
      }, sectionField, (record) => {
        if (!match(record)) return false
        if (seen++ < count) return false // 跳过本轮之前已处理的匹配记录
        return true
      })
    } catch {
      break // 无更多匹配记录
    }
    if (!matched) break // mutate 幂等无变化（如重复挂载）→ 已处理完
    count++
  }
  return { bytes, count }
}

/**
 * 挂载/解除到元件定义：root4（f1=defID，槽字段 f7）+ root8 全部引用实例
 * （f2.f1=defID 低 22 位，槽字段 f6）双写，与编辑器 def 挂载行为一致。
 */
export function mountGraphToDef(
  bytes: Uint8Array,
  defId: number,
  graphId: number,
  attach: boolean
): Uint8Array {
  const mutate = (record: Uint8Array) =>
    attach
      ? attachSlot(record, 7, graphId)
      : detachSlot(record, 7, graphId)
  bytes = patchGilRecord(bytes, 4, defId, mutate)
  const result = patchAllMatching(
    bytes,
    8,
    1,
    (record) => instanceReferencesDef(record, defId),
    (record) => (attach ? attachSlot(record, 6, graphId) : detachSlot(record, 6, graphId))
  )
  return result.bytes
}

/** 挂载/解除到场景实体（root5 f1=entityId，槽字段 f6，独立写 root5）。 */
export function mountGraphToEntity(
  bytes: Uint8Array,
  entityId: number,
  graphId: number,
  attach: boolean
): Uint8Array {
  return patchGilRecord(bytes, 5, entityId, (record) =>
    attach ? attachSlot(record, 6, graphId) : detachSlot(record, 6, graphId)
  )
}

function attachSlot(record: Uint8Array, slotField: number, graphId: number): Uint8Array {
  const graphs = readMountedGraphs(record, slotField)
  if (graphs.includes(graphId)) return record
  return setMountedGraphs(record, slotField, [...graphs, graphId])
}

function detachSlot(record: Uint8Array, slotField: number, graphId: number): Uint8Array {
  const graphs = readMountedGraphs(record, slotField)
  if (!graphs.includes(graphId)) return record
  return setMountedGraphs(record, slotField, graphs.filter((id) => id !== graphId))
}

/** 图 GID 是否存在于 root10（双层包装 field1→field1→NodeGraph.Id.f5）。 */
export function graphExists(bytes: Uint8Array, graphId: number): boolean {
  const root = parse(bytes.slice(20, -4)) ?? []
  for (const record of wireRecords(root, 10, 1)) {
    const nodeGraph = parse(record)?.find((field) => field.wire === 2 && field.number === 1)
    const id = parse(nodeGraph?.value as Uint8Array)?.find(
      (field) => field.wire === 2 && field.number === 1
    )
    const gid = parse(id?.value as Uint8Array)?.find(
      (field) => field.wire === 0 && field.number === 5
    )?.value
    if (gid === graphId) return true
  }
  return false
}

/** 盘点：root10 全部节点图（双层包装 Id.f5 + NodeGraph.f2 名称，单次遍历）。 */
export function graphCatalog(bytes: Uint8Array): { id: number; name?: string }[] {
  const root = parse(bytes.slice(20, -4)) ?? []
  const out: { id: number; name?: string }[] = []
  for (const record of wireRecords(root, 10, 1)) {
    const nodeGraph = parse(record)?.find((field) => field.wire === 2 && field.number === 1)
    const fields = parse(nodeGraph?.value as Uint8Array) ?? []
    const gid = parse(
      fields.find((field) => field.wire === 2 && field.number === 1)?.value as Uint8Array
    )?.find((field) => field.wire === 0 && field.number === 5)?.value
    if (typeof gid !== 'number') continue
    const name = fields.find((field) => field.wire === 2 && field.number === 2)
    out.push({
      id: gid,
      ...(name ? { name: new TextDecoder().decode(name.value as Uint8Array) } : {})
    })
  }
  return out
}

/** 盘点：root4 全部元件定义及其挂载图（f7 槽，无槽 → []）。 */
export function listDefMounts(bytes: Uint8Array): { id: number; graphs: number[] }[] {
  const root = parse(bytes.slice(20, -4)) ?? []
  return wireRecords(root, 4, 1)
    .map((record) => ({ id: wireRecordId(record), graphs: readMountedGraphs(record, 7) }))
    .filter((d): d is { id: number; graphs: number[] } => d.id !== undefined)
}

/** 盘点：root5 全部场景实体及其挂载图（f6 槽，无槽 → []）。 */
export function listEntityMounts(bytes: Uint8Array): { id: number; graphs: number[] }[] {
  const root = parse(bytes.slice(20, -4)) ?? []
  return wireRecords(root, 5, 1)
    .map((record) => ({ id: wireRecordId(record), graphs: readMountedGraphs(record, 6) }))
    .filter((d): d is { id: number; graphs: number[] } => d.id !== undefined)
}

/** 读图名（root10 双层包装 NodeGraph.f2，无则 undefined）。 */
export function readGraphName(bytes: Uint8Array, graphId: number): string | undefined {
  const root = parse(bytes.slice(20, -4)) ?? []
  for (const record of wireRecords(root, 10, 1)) {
    const nodeGraph = parse(record)?.find((field) => field.wire === 2 && field.number === 1)
    const fields = parse(nodeGraph?.value as Uint8Array) ?? []
    const id = fields.find((field) => field.wire === 2 && field.number === 1)
    const gid = parse(id?.value as Uint8Array)?.find(
      (field) => field.wire === 0 && field.number === 5
    )?.value
    if (gid !== graphId) continue
    const name = fields.find((field) => field.wire === 2 && field.number === 2)
    if (!name) return undefined
    return new TextDecoder().decode(name.value as Uint8Array)
  }
  return undefined
}

// ---- CLI（gsts assets:mounts） ----

type Command = 'attach' | 'detach' | 'list'
type TargetKind = 'def' | 'entity'

function usage(exitCode = 1): never {
  const output = [
    'Mount or unmount a NodeGraph on a component definition or scene entity (type 3 slot).',
    '',
    'Usage: gsts assets:mounts <attach|detach> <target-id> [options]',
    '       gsts assets:mounts list [<target-id>] [options]',
    '',
    '  --graph <graph-id>   NodeGraph GID (required for attach/detach;',
    '                       with list without a target-id prints reverse lookup)',
    '  --def                target is a component definition (root4 + root8 instances)',
    '  --entity             target is a scene entity (root5; default)',
    '  --gil <file>         explicit GIL source',
    '  --map-id <id>        target map ID (location only; requires project config)',
    '  --output <file>      create output without overwriting',
    '  --write              write source GIL after backup',
    '  -h, --help           show help',
    '',
    'attach adds a graph to the mount slot (idempotent, appended in order);',
    'detach removes it (last removal leaves the empty 08036a00 slot).',
    'list <target-id> prints that target\'s mounted graphs; list without a',
    'target-id prints a full survey: every node graph (root10, with name),',
    'every definition (root4) and scene entity (root5) with their mounts,',
    'and graphs not mounted anywhere. list --graph <gid> (no target-id)',
    'prints which definitions/entities mount that graph.',
    'These commands modify .gil asset structures. They are not GIA NodeGraph',
    'injection, runtime behavior, or editor/game verification.'
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](output)
  process.exit(exitCode)
}

function value(argv: readonly string[], index: number): string {
  const result = argv[index + 1]
  if (!result || result.startsWith('--')) usage()
  return result
}

function nonNegativeId(raw: string, option: string): number {
  const result = Number(raw)
  if (!Number.isSafeInteger(result) || result < 0)
    throw new Error(`[error] ${option} must be a non-negative integer`)
  return result
}

function parseArgs(argv: readonly string[]) {
  let command: Command = 'list'
  let targetId: number | undefined
  let graphId: number | undefined
  let kind: TargetKind = 'entity'
  let gilPath: string | undefined
  let mapId: number | undefined
  let outputPath: string | undefined
  let write = false
  let index = 0
  if (argv[0] === 'attach' || argv[0] === 'detach' || argv[0] === 'list') {
    command = argv[0]
    index++
  }
  for (; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--graph') graphId = nonNegativeId(value(argv, index++), '--graph')
    else if (arg === '--def') kind = 'def'
    else if (arg === '--entity') kind = 'entity'
    else if (arg === '--gil') gilPath = value(argv, index++)
    else if (arg === '--map-id') mapId = nonNegativeId(value(argv, index++), '--map-id')
    else if (arg === '--output') outputPath = value(argv, index++)
    else if (arg === '--write') write = true
    else if (arg === '--help' || arg === '-h') usage(0)
    else if (targetId === undefined) targetId = nonNegativeId(arg, 'target-id')
    else usage()
  }
  if (gilPath && mapId !== undefined)
    throw new Error('[error] --gil and --map-id are mutually exclusive')
  if (targetId === undefined && command !== 'list')
    throw new Error('[error] missing <target-id> (list without a target-id prints a survey)')
  if (command !== 'list' && graphId === undefined)
    throw new Error(`[error] ${command} requires --graph <graph-id>`)
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  return { command, targetId: targetId!, graphId, kind, gilPath, mapId, outputPath, write }
}

function resolveGilPath(
  projectConfig: GstsConfig | undefined,
  args: ReturnType<typeof parseArgs>
): { path: string; locator: string } {
  if (args.gilPath) {
    const absolute = path.resolve(args.gilPath)
    return { path: absolute, locator: path.basename(absolute) }
  }
  const inject: GstsInjectConfig = { ...(projectConfig?.inject ?? {}) }
  if (args.mapId !== undefined) inject.mapId = args.mapId
  if (inject.mapId === undefined) {
    throw new Error(
      '[error] mapId is required; use --gil, or provide --map-id with a project config'
    )
  }
  const target = resolveGilTarget(inject)
  return { path: target.gilPath, locator: String(target.mapId) }
}

function writeNew(outputPath: string, contents: Uint8Array): string {
  const absolute = path.resolve(outputPath)
  if (fs.existsSync(absolute)) throw new Error(`[error] output already exists: ${absolute}`)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, contents)
  return absolute
}

function backupPath(gilPath: string): string {
  const directory = path.join(path.dirname(gilPath), '.gsts', 'backups')
  fs.mkdirSync(directory, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(directory, `${path.basename(gilPath)}.${stamp}.bak`)
}

/** 盘点输出：全量（无 --graph）或反向查询（--graph <gid>）。 */
function printSurvey(bytes: Uint8Array, graphFilter?: number): void {
  const catalog = graphCatalog(bytes)
  const names = new Map(catalog.map((g) => [g.id, g.name]))
  const nameOf = (id: number) => (names.get(id) ? ` name=${names.get(id)}` : '')
  const defs = listDefMounts(bytes)
  const entities = listEntityMounts(bytes)
  if (graphFilter !== undefined) {
    console.log(`graph=${graphFilter}${nameOf(graphFilter)}`)
    for (const d of defs) if (d.graphs.includes(graphFilter)) console.log(`target=${d.id} kind=def`)
    for (const e of entities) if (e.graphs.includes(graphFilter)) console.log(`target=${e.id} kind=entity`)
    return
  }
  console.log(`== node graphs (${catalog.length}) ==`)
  for (const g of catalog) {
    console.log(`graph=${g.id}${g.name !== undefined ? ` name=${g.name}` : ''}`)
  }
  console.log(`== definitions (${defs.length}) ==`)
  for (const d of defs) {
    console.log(`target=${d.id} kind=def graphs=${d.graphs.join(',') || '(none)'}`)
  }
  console.log(`== entities (${entities.length}) ==`)
  for (const e of entities) {
    console.log(`target=${e.id} kind=entity graphs=${e.graphs.join(',') || '(none)'}`)
  }
  const mounted = new Set([...defs, ...entities].flatMap((t) => t.graphs))
  const unmounted = catalog.filter((g) => !mounted.has(g.id))
  console.log(`== graphs not mounted anywhere (${unmounted.length}) ==`)
  for (const g of unmounted) {
    console.log(`graph=${g.id}${g.name !== undefined ? ` name=${g.name}` : ''}`)
  }
}

async function runMounts(
  args: ReturnType<typeof parseArgs>,
  projectConfig: GstsConfig | undefined
): Promise<void> {
  const source = resolveGilPath(projectConfig, args)
  if (!fs.existsSync(source.path) || !fs.statSync(source.path).isFile())
    throw new Error(`[error] gil not found: ${source.path}`)
  let bytes: Uint8Array = new Uint8Array(fs.readFileSync(source.path))
  if (args.command === 'list') {
    if (args.targetId === undefined) {
      if (args.graphId !== undefined && !graphExists(bytes, args.graphId)) {
        throw new Error(`[error] graph ${args.graphId} not found in root 10`)
      }
      printSurvey(bytes, args.graphId)
      return
    }
    const graphs = args.kind === 'def'
      ? mountedDefGraphs(bytes, args.targetId)
      : mountedEntityGraphs(bytes, args.targetId)
    const names = graphs.map((id) => `${id}${readGraphName(bytes, id) ? `(${readGraphName(bytes, id)})` : ''}`)
    console.log(`target=${args.targetId} kind=${args.kind} graphs=${graphs.join(',') || '(none)'}`)
    if (names.length) console.log(`names=${names.join(' ')}`)
    return
  }
  if (args.graphId !== undefined && !graphExists(bytes, args.graphId)) {
    throw new Error(`[error] graph ${args.graphId} not found in root 10`)
  }
  if (args.command === 'attach') {
    bytes = args.kind === 'def'
      ? mountGraphToDef(bytes, args.targetId, args.graphId!, true)
      : mountGraphToEntity(bytes, args.targetId, args.graphId!, true)
  } else {
    bytes = args.kind === 'def'
      ? mountGraphToDef(bytes, args.targetId, args.graphId!, false)
      : mountGraphToEntity(bytes, args.targetId, args.graphId!, false)
  }
  const graphs = args.kind === 'def'
    ? mountedDefGraphs(bytes, args.targetId)
    : mountedEntityGraphs(bytes, args.targetId)
  if (args.outputPath) {
    writeNew(args.outputPath, bytes)
    console.log(`candidate=${path.resolve(args.outputPath)}`)
  } else if (args.write) {
    const backup = backupPath(source.path)
    fs.copyFileSync(source.path, backup)
    fs.writeFileSync(source.path, bytes)
    try {
      syncGilToTemp(path.dirname(source.path), path.basename(source.path))
    } catch {
      // best-effort temp sync
    }
    console.log(`backup=${backup}`)
    console.log(`writePerformed=true`)
  } else {
    console.log('preview only; use --write to apply after backup, or --output for a candidate')
  }
  console.log(`target=${args.targetId} kind=${args.kind} graphs=${graphs.join(',') || '(none)'}`)
  console.log('editorOrGameValidation=not-performed; editor memory ignores disk writes, reload map before saving')
}

/** 读 def 当前挂载图（root4 + root8 引用实例合并去重）。 */
function mountedDefGraphs(bytes: Uint8Array, defId: number): number[] {
  const payload = bytes.slice(20, -4)
  const root = parse(payload) ?? []
  const defRecord = wireRecords(root, 4, 1).find((record) => wireRecordId(record) === defId)
  if (!defRecord) throw new Error(`[error] definition ${defId} not found in root 4`)
  return readMountedGraphs(defRecord, 7)
}

/** 读场景实体当前挂载图（root5）。 */
function mountedEntityGraphs(bytes: Uint8Array, entityId: number): number[] {
  const payload = bytes.slice(20, -4)
  const root = parse(payload) ?? []
  const record = wireRecords(root, 5, 1).find((record) => wireRecordId(record) === entityId)
  if (!record) throw new Error(`[error] entity ${entityId} not found in root 5`)
  return readMountedGraphs(record, 6)
}

export async function runAssetsMounts(
  argv: readonly string[] = process.argv.slice(2),
  rootContext: { projectConfigPath?: string; projectConfig?: GstsConfig } = {}
) {
  const args = parseArgs(argv)
  let projectConfig = rootContext.projectConfig
  if (!projectConfig && rootContext.projectConfigPath) {
    projectConfig = await loadGstsConfig(rootContext.projectConfigPath, { profile: 'project' })
  }
  await runMounts(args, projectConfig)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsMounts().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
