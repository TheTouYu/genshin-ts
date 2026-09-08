/**
 * assets:unit-status — 单位状态资产 CLI（root15/16 双写 + root6 页签登记）。
 *
 * 数据/结构依据（真实 GIL + 编辑器差分 + IPC 帧流，2026-09-05）：
 *   - root15 定义记录：{1:id, 2:1, 4[*]: 分节}
 *       4[0] = 名称节 {1:1, 11:{1:名称}}
 *       4[1] = 通用配置节 {1:6, 21:{1:{1..6 配置, 3:效果列表容器}}}
 *   - root16 平行引用：{1:id, 2:id, 3[*]: 与 root15.4[*] 同构（名称节为空）}
 *   - root6  页签登记：folderId=11 记录内的 f3「未分类页签」tab 追加 f5={1:1900, 2:id}
 *   - effect entry = repeated {1: 效果ID, 2[*]: 参数条目}，entry 的 wire 细节见
 *     `docs/game-engine-knowledge/unit-status.md` 与 `src/cli/unit_status_data.ts`。
 *
 * donor 策略（2026-09-05 用户定则：框架先定，细节按需差分补）：
 *   - 已收录 donor 的 effect：复制真实编辑器字节（最稳）。
 *   - 未收录 donor 的 effect：先生成最小结构条目 {1: effectId}，保证任意 ID 都能进列表。
 *   - 后续某个 effect 需要精确默认参数/出现不兼容时，走“编辑器最小操作 + 差分/抓包”
 *     提取该 effect entry 的真实 hex，补进 `unit_status_data.ts` 即可，不改 CLI 框架。
 *
 * 安全：默认只读/list；变更类默认 --output 生成候选，--write 才写真实地图（自动备份 + Temp 同步）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { loadGstsConfig } from '../compiler/config_loader.js'
import type { GstsConfig, GstsInjectConfig } from '../compiler/gsts_config.js'
import { buildFile, readUint32BE } from '../injector/binary.js'
import { resolveGilTarget, syncGilToTemp } from './gil_paths.js'
import { sha256Bytes } from './static_assembly/json.js'
import {
  emitWireMessage,
  parseWireMessage,
  printableWireText,
  type WireField
} from './static_assembly/wire.js'
import {
  UNIT_STATUS_BASE_R15,
  UNIT_STATUS_BASE_R16,
  UNIT_STATUS_EFFECT_DONORS
} from './unit_status_data.js'

type RootContext = { projectConfigPath?: string; projectConfig?: GstsConfig }
type Sub = 'list' | 'create' | 'add-effect'
type Args = {
  sub: Sub
  gilPath?: string
  mapId?: number
  id?: number
  name?: string
  effects: number[]
  outputPath?: string
  write: boolean
  json: boolean
}

const UNIT_STATUS_FOLDER_ID = 11 // root6 记录 f1=11：单位状态分组（含未分类页签）
const UNIT_STATUS_TYPE_VALUE = 1900 // root6 f5 条目 f1=1900

function usage(exitCode = 1): never {
  const output = [
    'Create/list unit-status assets (root15/16 + root6 folder) from real GIL donors.',
    '',
    'Usage: gsts assets:unit-status [list|create|add-effect] [options]',
    '',
    '  list: gsts assets:unit-status list [--gil <file>] [--json]',
    '  create: gsts assets:unit-status create --id <id> --name <名> --effects <id,id,...>',
    '          [--gil <file>] [--output <file>|--write]',
    '  add-effect: gsts assets:unit-status add-effect --id <状态ID> --effects <id,id,...>',
    '          [--gil <file>] [--output <file>|--write]',
    '',
    'Notes:',
    '  - effect donors are real GIL samples; known effects use donor bytes, unknown effects use a',
    '    minimal structural entry {1: effectId} and can be refined later by adding donor data.',
    '  - --write writes source GIL after backup; --output writes a new candidate file.'
  ]
  console[exitCode === 0 ? 'log' : 'error'](output.join('\n'))
  process.exit(exitCode)
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, 'hex'))
}

function parseArgv(argv: readonly string[]): Args {
  const args: Args = { sub: 'list', effects: [], write: false, json: false }
  const rest = [...argv]
  const sub = rest.shift()
  if (sub === 'list' || sub === 'create' || sub === 'add-effect') {
    args.sub = sub
  } else if (sub) {
    throw new Error(`[error] unknown subcommand: ${sub}`)
  }
  const value = (a: readonly string[], i: number): string => {
    const v = a[i]
    if (v === undefined) throw new Error(`[error] missing value for ${a[i - 1]}`)
    return v
  }
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === '--gil') args.gilPath = value(rest, ++i)
    else if (arg === '--map-id') args.mapId = Number(value(rest, ++i))
    else if (arg === '--id') args.id = Number(value(rest, ++i))
    else if (arg === '--name') args.name = value(rest, ++i)
    else if (arg === '--effects') {
      args.effects = value(rest, ++i)
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n))
    } else if (arg === '--output') args.outputPath = value(rest, ++i)
    else if (arg === '--write') args.write = true
    else if (arg === '--json') args.json = true
    else if (arg === '--help' || arg === '-h') usage(0)
    else throw new Error(`[error] unknown option: ${arg}`)
  }
  if (args.sub !== 'list' && !args.gilPath && args.mapId === undefined) {
    throw new Error('[error] need --gil <file> or --map-id for mutating commands')
  }
  if (args.sub === 'create') {
    if (args.id === undefined || !args.name || args.effects.length === 0) usage()
  }
  if (args.sub === 'add-effect') {
    if (args.id === undefined || args.effects.length === 0) usage()
  }
  if (args.write && args.outputPath) {
    throw new Error('[error] --write and --output are mutually exclusive')
  }
  return args
}

function resolveGilPath(projectConfig: GstsConfig | undefined, args: Args): string {
  if (args.gilPath) return path.resolve(args.gilPath)
  const inject: GstsInjectConfig = { ...(projectConfig?.inject ?? {}) }
  if (args.mapId !== undefined) inject.mapId = args.mapId
  if (inject.mapId === undefined) throw new Error('[error] mapId is required')
  return resolveGilTarget(inject).gilPath
}

// ==================== wire helpers ====================

const vi = (fields: WireField[], n: number): number | undefined =>
  fields.find((f) => f.number === n && f.wire === 0)?.value as number | undefined
const bs = (fields: WireField[], n: number): Uint8Array | undefined =>
  fields.find((f) => f.number === n && f.wire === 2)?.value as Uint8Array | undefined
const msg = (field: WireField): WireField[] => {
  const parsed = parseWireMessage(field.value as Uint8Array)
  if (!parsed) throw new Error(`[error] field ${field.number} is not a protobuf-like message`)
  return parsed
}
const str = (bytes?: Uint8Array): string =>
  bytes ? new TextDecoder('utf-8', { fatal: false }).decode(bytes) : ''

function recordsOf(payload: Uint8Array, rootN: number): WireField[] {
  const root = parseWireMessage(payload)
  if (!root) throw new Error('[error] malformed GIL payload')
  const container = root.find((f) => f.number === rootN && f.wire === 2)
  if (!container) return []
  return parseWireMessage(container.value as Uint8Array)?.filter((f) => f.number === 1 && f.wire === 2) ?? []
}

function recordInner(record: WireField): WireField[] {
  return parseWireMessage(record.value as Uint8Array) ?? []
}

function effectHexesOfRecord(recordBytes: Uint8Array): string[] {
  const rec = parseWireMessage(recordBytes)
  if (!rec) throw new Error('[error] malformed status record')
  const out: string[] = []
  const sectionNumbers = [3, 4] // root16 uses f3, root15 uses f4
  for (const sec of rec.filter((f) => f.wire === 2 && sectionNumbers.includes(f.number))) {
    const secMsg = parseWireMessage(sec.value as Uint8Array)
    if (!secMsg || vi(secMsg, 1) !== 6) continue
    const f21 = bs(secMsg, 21)
    const cfg = f21 ? parseWireMessage(f21)?.find((f) => f.number === 1 && f.wire === 2) : undefined
    const effC = cfg ? parseWireMessage(cfg.value as Uint8Array)?.find((f) => f.number === 3 && f.wire === 2) : undefined
    if (!effC) continue
    for (const e of parseWireMessage(effC.value as Uint8Array)?.filter((f) => f.number === 1 && f.wire === 2) ?? []) {
      out.push(Buffer.from(e.value as Uint8Array).toString('hex'))
    }
  }
  return out
}

function sectionNumber(isRoot16: boolean): number {
  return isRoot16 ? 3 : 4
}

function replaceEffectsInRecord(recordBytes: Uint8Array, effectHexes: string[]): Uint8Array {
  const rec = parseWireMessage(recordBytes)
  if (!rec) throw new Error('[error] malformed status record')
  return emitWireMessage(
    rec.map((field) => {
      if (field.wire !== 2 || (field.number !== 4 && field.number !== 3)) return field
      const sec = parseWireMessage(field.value as Uint8Array)
      if (!sec || vi(sec, 1) !== 6) return field
      return {
        ...field,
        value: emitWireMessage(
          sec.map((g) => {
            if (g.wire !== 2 || g.number !== 21) return g
            const c21 = parseWireMessage(g.value as Uint8Array)
            if (!c21) return g
            return {
              ...g,
              value: emitWireMessage(
                c21.map((h) => {
                  if (h.wire !== 2 || h.number !== 1) return h
                  const cfg = parseWireMessage(h.value as Uint8Array)
                  if (!cfg) return h
                  return {
                    ...h,
                    value: emitWireMessage(
                      cfg.map((k) => {
                        if (k.wire !== 2 || k.number !== 3) return k
                        const effC = parseWireMessage(k.value as Uint8Array)
                        if (!effC) return k
                        const tail = effC.filter((x) => x.number !== 1 || x.wire !== 2)
                        const entries = effectHexes.map((hex) => ({
                          number: 1,
                          wire: 2,
                          value: hexToBytes(hex)
                        }))
                        return { ...k, value: emitWireMessage([...entries, ...tail]) }
                      })
                    )
                  }
                })
              )
            }
          })
        )
      }
    })
  )
}

function setRecordId(recordBytes: Uint8Array, id: number, isRoot16: boolean): Uint8Array {
  const rec = parseWireMessage(recordBytes)
  if (!rec) throw new Error('[error] malformed status record')
  const next = rec.map((f) => (f.number === 1 && f.wire === 0 ? { ...f, value: id } : f))
  if (isRoot16) {
    return emitWireMessage(next.map((f) => (f.number === 2 && f.wire === 0 ? { ...f, value: id } : f)))
  }
  return emitWireMessage(next)
}

function setNameInRoot15(recordBytes: Uint8Array, name: string): Uint8Array {
  const rec = parseWireMessage(recordBytes)
  if (!rec) throw new Error('[error] malformed status record')
  const nameBytes = new TextEncoder().encode(name)
  return emitWireMessage(
    rec.map((field) => {
      if (field.wire !== 2 || field.number !== 4) return field
      const sec = parseWireMessage(field.value as Uint8Array)
      if (!sec || vi(sec, 1) !== 1) return field
      const f11 = bs(sec, 11)
      const f11Msg = f11 ? parseWireMessage(f11) : undefined
      if (!f11Msg) return field
      return {
        ...field,
        value: emitWireMessage(
          sec.map((g) => {
            if (g.wire !== 2 || g.number !== 11) return g
            return {
              ...g,
              value: emitWireMessage(
                f11Msg.map((h) => (h.number === 1 && h.wire === 2 ? { ...h, value: nameBytes } : h))
              )
            }
          })
        )
      }
    })
  )
}

/** 效果条目结构：有 donor 用真实默认字节；无 donor 用最小骨架 {1: effectId}，后续可补 donor 精修。 */
function effectEntryHex(eid: number): string {
  const donor = UNIT_STATUS_EFFECT_DONORS[eid]
  if (donor) return donor
  return Buffer.from(emitWireMessage([{ number: 1, wire: 0, value: eid }])).toString('hex')
}

function buildStatusRecord(isRoot16: boolean, id: number, name: string, effects: number[]): Uint8Array {
  const effectHexes = effects.map((eid) => effectEntryHex(eid))
  const base = hexToBytes(isRoot16 ? UNIT_STATUS_BASE_R16 : UNIT_STATUS_BASE_R15)
  let rec = setRecordId(base, id, isRoot16)
  if (!isRoot16) rec = setNameInRoot15(rec, name)
  return replaceEffectsInRecord(rec, effectHexes)
}

function appendRootRecord(payload: Uint8Array, rootN: number, record: Uint8Array): Uint8Array {
  const root = parseWireMessage(payload)
  if (!root) throw new Error('[error] malformed GIL payload')
  if (!root.some((f) => f.number === rootN && f.wire === 2)) {
    const created: WireField = {
      number: rootN,
      wire: 2,
      value: emitWireMessage([{ number: 1, wire: 2, value: record }])
    }
    const insertAt = root.findIndex((f) => f.number > rootN)
    const next =
      insertAt === -1 ? [...root, created] : [...root.slice(0, insertAt), created, ...root.slice(insertAt)]
    return emitWireMessage(next)
  }
  return emitWireMessage(
    root.map((f) => {
      if (f.number !== rootN || f.wire !== 2) return f
      const inner = parseWireMessage(f.value as Uint8Array)
      if (!inner) return f
      return { ...f, value: emitWireMessage([...inner, { number: 1, wire: 2, value: record }]) }
    })
  )
}

function replaceRecordInRoot(
  payload: Uint8Array,
  rootN: number,
  id: number,
  newRecord: Uint8Array
): Uint8Array {
  const root = parseWireMessage(payload)
  if (!root) throw new Error('[error] malformed GIL payload')
  return emitWireMessage(
    root.map((f) => {
      if (f.number !== rootN || f.wire !== 2) return f
      const inner = parseWireMessage(f.value as Uint8Array)
      if (!inner) return f
      return {
        ...f,
        value: emitWireMessage(
          inner.map((rec) => {
            if (rec.wire !== 2 || rec.number !== 1) return rec
            const rid = vi(parseWireMessage(rec.value as Uint8Array) ?? [], 1)
            return rid === id ? { ...rec, value: newRecord } : rec
          })
        )
      }
    })
  )
}

function appendUnitStatusFolder(payload: Uint8Array, id: number): Uint8Array {
  const root = parseWireMessage(payload)
  if (!root) throw new Error('[error] malformed GIL payload')
  const root6 = root.find((f) => f.number === 6 && f.wire === 2)
  if (!root6) throw new Error('[error] root6 缺失，无法登记单位状态页签')
  const r6 = parseWireMessage(root6.value as Uint8Array)
  if (!r6) throw new Error('[error] root6 解析失败')
  const folder = r6.find((f) => f.wire === 2 && f.number === 1 && vi(parseWireMessage(f.value as Uint8Array) ?? [], 1) === UNIT_STATUS_FOLDER_ID)
  if (!folder) throw new Error('[error] root6 缺少单位状态分组 folderId=11（请先在编辑器创建至少一个单位状态）')
  const folderInner = parseWireMessage(folder.value as Uint8Array)!
  const rebuilt = folderInner.map((f) => {
    // f3 = 「未分类页签」tab；把新状态追加到未分类页签
    if (f.wire !== 2 || f.number !== 3) return f
    const tab = parseWireMessage(f.value as Uint8Array)!
    return {
      ...f,
      value: emitWireMessage([
        ...tab,
        {
          number: 5,
          wire: 2,
          value: emitWireMessage([
            { number: 1, wire: 0, value: UNIT_STATUS_TYPE_VALUE },
            { number: 2, wire: 0, value: id }
          ])
        }
      ])
    }
  })
  const newR6 = r6.map((rec) => (rec === folder ? { ...rec, value: emitWireMessage(rebuilt) } : rec))
  return emitWireMessage(
    root.map((f) => (f.number === 6 && f.wire === 2 ? { ...f, value: emitWireMessage(newR6) } : f))
  )
}

// ==================== list ====================

export type UnitStatusView = { id: number; name: string; effects: number[] }

export function listUnitStatuses(payload: Uint8Array): UnitStatusView[] {
  const out: UnitStatusView[] = []
  for (const rec of recordsOf(payload, 15)) {
    const inner = recordInner(rec)
    if (vi(inner, 2) !== 1) continue // 1 = 单位状态类型码
    const id = vi(inner, 1)
    if (id === undefined) continue
    let name = ''
    const effects: number[] = []
    for (const sec of inner.filter((f) => f.wire === 2 && f.number === 4)) {
      const secMsg = parseWireMessage(sec.value as Uint8Array)
      if (!secMsg) continue
      const kind = vi(secMsg, 1)
      if (kind === 1) {
        const f11 = bs(secMsg, 11)
        const nameMsg = f11 ? parseWireMessage(f11) : undefined
        const textField = nameMsg?.find((f) => f.number === 1 && f.wire === 2)
        if (textField) name = printableWireText(textField.value as Uint8Array) ?? ''
      } else if (kind === 6) {
        const c21 = bs(secMsg, 21)
        const cfg = c21 ? parseWireMessage(c21)?.find((f) => f.number === 1 && f.wire === 2) : undefined
        const effC = cfg ? parseWireMessage(cfg.value as Uint8Array)?.find((f) => f.number === 3 && f.wire === 2) : undefined
        if (!effC) continue
        for (const e of parseWireMessage(effC.value as Uint8Array)?.filter((f) => f.number === 1 && f.wire === 2) ?? []) {
          const ef = parseWireMessage(e.value as Uint8Array)
          const eid = ef ? vi(ef, 1) : undefined
          if (eid !== undefined) effects.push(eid)
        }
      }
    }
    out.push({ id, name, effects })
  }
  return out
}

// ==================== mutators ====================

function findExistingStatus(payload: Uint8Array, id: number): void {
  const exists = listUnitStatuses(payload).some((s) => s.id === id)
  if (!exists) throw new Error(`[error] unit status ${id} not found`)
}

export function buildCreateUnitStatus(
  payload: Uint8Array,
  opts: { id: number; name: string; effects: number[] }
): Uint8Array {
  if (listUnitStatuses(payload).some((s) => s.id === opts.id)) {
    throw new Error(`[error] unit status ${opts.id} already exists in root 15`)
  }
  const r15 = buildStatusRecord(false, opts.id, opts.name, opts.effects)
  const r16 = buildStatusRecord(true, opts.id, opts.name, opts.effects)
  let next = appendRootRecord(payload, 15, r15)
  next = appendRootRecord(next, 16, r16)
  next = appendUnitStatusFolder(next, opts.id)
  return next
}

export function buildAddUnitStatusEffects(
  payload: Uint8Array,
  opts: { id: number; effects: number[] }
): Uint8Array {
  findExistingStatus(payload, opts.id)
  let next = payload
  for (const rootN of [15, 16]) {
    const rec = recordsOf(payload, rootN).find((r) => vi(recordInner(r), 1) === opts.id)
    if (!rec) throw new Error(`[error] root${rootN} missing status ${opts.id}`)
    const currentHexes = effectHexesOfRecord(rec.value as Uint8Array)
    const addHexes = opts.effects.map((eid) => effectEntryHex(eid))
    const nextRecord = replaceEffectsInRecord(rec.value as Uint8Array, [...currentHexes, ...addHexes])
    next = replaceRecordInRoot(next, rootN, opts.id, nextRecord)
  }
  return next
}

// ==================== CLI ====================

function runList(payload: Uint8Array, gil: string, json: boolean): void {
  const statuses = listUnitStatuses(payload)
  if (json) {
    console.log(JSON.stringify({ gilPath: gil, unitStatuses: statuses }, null, 2))
    return
  }
  if (statuses.length === 0) {
    console.log('(no unit statuses found)')
    return
  }
  for (const s of statuses) {
    console.log(`id=${s.id} (0x${s.id.toString(16)}) name="${s.name}" effects=[${s.effects.join(',')}]`)
  }
}

export async function runAssetsUnitStatus(
  argv: readonly string[] = process.argv.slice(2),
  rootContext: RootContext = {}
): Promise<void> {
  const args = parseArgv(argv)
  let projectConfig = rootContext.projectConfig
  if (!projectConfig && rootContext.projectConfigPath) {
    projectConfig = await loadGstsConfig(rootContext.projectConfigPath, { profile: 'project' })
  }
  const gil = resolveGilPath(projectConfig, args)
  const sourceBytes = new Uint8Array(fs.readFileSync(gil))
  const payload = sourceBytes.slice(20, -4)

  if (args.sub === 'list') {
    runList(payload, gil, args.json)
    return
  }

  const sourceSha = sha256Bytes(sourceBytes)
  const result =
    args.sub === 'create'
      ? buildCreateUnitStatus(payload, { id: args.id!, name: args.name!, effects: args.effects })
      : buildAddUnitStatusEffects(payload, { id: args.id!, effects: args.effects })
  const header = {
    schema: readUint32BE(sourceBytes, 4),
    headTag: readUint32BE(sourceBytes, 8),
    fileType: readUint32BE(sourceBytes, 12),
    tailTag: readUint32BE(sourceBytes, sourceBytes.length - 4)
  }
  const newFile = buildFile(result, header)
  const candidateSha = sha256Bytes(newFile)
  const back = listUnitStatuses(result)
  if (args.sub === 'create' && !back.some((s) => s.id === args.id)) {
    throw new Error('[error] read-back: unit status record missing after create')
  }

  if (args.write) {
    const nowSha = sha256Bytes(new Uint8Array(fs.readFileSync(gil)))
    if (nowSha !== sourceSha) throw new Error('[error] source GIL changed since read; aborting write')
    const backupDir = path.join(path.dirname(gil), '.gsts', 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = path.join(backupDir, `${path.basename(gil)}.${stamp}.unit-status.bak`)
    fs.copyFileSync(gil, backup)
    fs.writeFileSync(gil, newFile)
    try {
      syncGilToTemp(path.dirname(gil), path.basename(gil))
    } catch {
      // best-effort temp sync
    }
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
    `command=${args.sub} id=${args.id} name=${args.name ?? '-'} effects=[${args.effects.join(',')}] ` +
      `sourceSha256=${sourceSha} candidateSha256=${candidateSha} size=${sourceBytes.length}->${newFile.length}`
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsUnitStatus().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
