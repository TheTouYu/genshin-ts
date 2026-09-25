/**
 * assets:structs — 结构体（Structure）资产 CLI。
 *
 * 结构体是**地图级资产**：注册在 root6 的 folder 记录，定义在 root10 的 `f6`。
 * 与自定义元件共用 id 空间（>= 1077936129），不与节点图/模板共用（后者走 1073741824+ 段）。
 *
 * 数据依据：docs/game-engine-knowledge/struct-assets.md（真实编辑器相邻快照差分，2026-09-16）
 *   · 基础结构体     folderId 29 / typeValue 4100
 *   · 局内存档结构体 folderId 33 / typeValue 4600（f1 主块多一个 f2=2）
 *   · 成员 = { f1{类型} f3{默认值} f5/f501=名 f502=类型码 f503=序号 }
 *   · 默认值字段号 = 类型码 + 10
 *   · 编辑器整表改写：每次改写既有结构体记录 +1、新建写 2（f503）
 *   · 建结构体会向地图物化 9 条节点族记录
 *
 * 子命令：
 *   list    列出地图内的结构体（默认动作）
 *   inspect 详述单个结构体（成员 / 引用 / 注册 / 物化节点族）
 *   create  新建结构体（--archived 建局内存档结构体）
 *   update  修改既有结构体的成员
 *
 * 安全：默认只读；变更类默认 --output 出候选，--write 才写真实地图（自动备份 + Temp 同步）。
 */
import fs from 'node:fs'
import path from 'node:path'

import { loadGstsConfig } from '../compiler/config_loader.js'
import type { GstsConfig, GstsInjectConfig } from '../compiler/gsts_config.js'
import { buildFile } from '../injector/binary.js'
import { resolveGilTarget, syncGilToTemp } from './gil_paths.js'
import { sha256Bytes } from './static_assembly/json.js'
import {
  readStructDefs,
  readStructFolderEntries,
  nextStructId,
  appendStruct,
  updateStruct,
  rebuildGil,
  STRUCT_FOLDER_ARCHIVED,
  STRUCT_FOLDER_BASIC,
  STRUCT_TYPE_VALUE_ARCHIVED,
  STRUCT_TYPE_VALUE_BASIC,
  type StructDef,
  type StructMember
} from './gil_structs.js'

type RootContext = { projectConfigPath?: string; projectConfig?: GstsConfig }
type Sub = 'list' | 'inspect' | 'create' | 'update'

type MemberSpec = {
  name: string
  typeCode: number
  /** struct / struct_list 成员引用的结构体名或 id */
  ref?: string
  /** struct_list 成员的默认元素个数 */
  listLength?: number
}

type Args = {
  sub: Sub
  gilPath?: string
  mapId?: number
  name?: string
  archived: boolean
  members: MemberSpec[]
  addMembers: MemberSpec[]
  removeMembers: string[]
  rename?: [string, string]
  setDefault?: string
  outputPath?: string
  write: boolean
  json: boolean
}

/** 变量类型码空间（与 assets:custom-variables / assets:level-variables 共用，1..27） */
const TYPE_NAME_TO_CODE = new Map<string, number>([
  ['entity', 1], ['guid', 2], ['int', 3], ['bool', 4], ['float', 5], ['str', 6],
  ['vec3', 12], ['faction', 17], ['config_id', 20], ['prefab_id', 21],
  ['int_list', 8], ['bool_list', 9], ['float_list', 10], ['str_list', 11],
  ['vec3_list', 15], ['entity_list', 16], ['guid_list', 7],
  ['struct', 25], ['struct_list', 26]
])
const CODE_TO_TYPE_NAME = new Map([...TYPE_NAME_TO_CODE].map(([k, v]) => [v, k]))

/** 局内存档结构体不支持的类型（官方：实体 / 实体列表 / 所有类型的字典 / 结构体） */
const ARCHIVED_FORBIDDEN = new Set([1, 16, 25, 26, 27])

export function typeCodeOfName(name: string): number {
  const code = TYPE_NAME_TO_CODE.get(name)
  if (code === undefined) {
    throw new Error(
      `[error] unknown member type: ${name}；可用：${[...TYPE_NAME_TO_CODE.keys()].join('/')}`
    )
  }
  return code
}

export function typeNameOfCode(code: number): string {
  return CODE_TO_TYPE_NAME.get(code) ?? `#${code}`
}

function usage(exitCode = 1): never {
  const lines = [
    'usage: gsts assets:structs <list|inspect|create|update> [options]',
    '',
    '  list    [--gil <file>|--map-id <id>] [--json]',
    '  inspect --name <名> [--gil <file>|--map-id <id>] [--json]',
    '  create  --name <名> --member <名>:<类型>[=<引用>] … [--archived]',
    '          [--gil <file>|--map-id <id>] [--output <file>|--write]',
    '  update  --name <名> [--add-member <名>:<类型>]… [--remove-member <名>]…',
    '          [--rename-member <旧>=<新>] [--gil <file>|--map-id <id>]',
    '          [--output <file>|--write]',
    '',
    '  成员类型：int/bool/float/str/vec3/…（1..24）、struct/struct_list（需 =<结构体名或id>）',
    '  update 的成员增删会**重写该结构体的全部物化节点族**，既有图上的引脚可能失配。'
  ]
  const out = exitCode === 0 ? console.log : console.error
  out(lines.join('\n'))
  process.exit(exitCode)
}

/** "--set-default <成员名>=<值>" → [名, 值] */
function splitDefault(raw: string | undefined): [string, string] | undefined {
  if (!raw) return undefined
  const at = raw.indexOf('=')
  if (at <= 0) throw new Error(`[error] bad --set-default "${raw}"；格式 <成员名>=<值>`)
  return [raw.slice(0, at), raw.slice(at + 1)]
}

function parseMemberSpec(raw: string): MemberSpec {
  const [head, ref] = raw.split('=')
  const [name, typeName] = (head ?? '').split(':')
  if (!name || !typeName) {
    throw new Error(`[error] bad --member "${raw}"；格式 <名>:<类型>[=<结构体名或id>]`)
  }
  const typeCode = typeCodeOfName(typeName)
  const spec: MemberSpec = { name, typeCode }
  if (ref !== undefined) spec.ref = ref
  const listMatch = /^(.+)\[(\d+)\]$/.exec(typeName)
  if (listMatch) spec.listLength = Number(listMatch[2])
  return spec
}

function parseArgv(argv: readonly string[]): Args {
  const args: Args = {
    sub: 'list', archived: false, members: [], addMembers: [], removeMembers: [],
    write: false, json: false
  }
  const rest = [...argv]
  const sub = rest.shift()
  if (sub === 'list' || sub === 'inspect' || sub === 'create' || sub === 'update') {
    args.sub = sub
  } else if (sub === '--help' || sub === '-h') {
    usage(0)
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
    else if (arg === '--name') args.name = value(rest, ++i)
    else if (arg === '--archived') args.archived = true
    else if (arg === '--member') args.members.push(parseMemberSpec(value(rest, ++i)))
    else if (arg === '--add-member') args.addMembers.push(parseMemberSpec(value(rest, ++i)))
    else if (arg === '--remove-member') args.removeMembers.push(value(rest, ++i))
    else if (arg === '--rename-member') {
      const [from, to] = value(rest, ++i).split('=')
      if (!from || !to) throw new Error('[error] --rename-member 格式 <旧名>=<新名>')
      args.rename = [from, to]
    } else if (arg === '--set-default') args.setDefault = value(rest, ++i)
    else if (arg === '--output') args.outputPath = value(rest, ++i)
    else if (arg === '--write') args.write = true
    else if (arg === '--json') args.json = true
    else if (arg === '--help' || arg === '-h') usage(0)
    else throw new Error(`[error] unknown option: ${arg}`)
  }
  if (args.sub === 'inspect' && !args.name) usage()
  if (args.sub === 'create' && (!args.name || args.members.length === 0)) usage()
  if (args.sub === 'update' && !args.name) usage()
  if (args.sub !== 'list' && !args.gilPath && args.mapId === undefined) {
    throw new Error('[error] need --gil <file> or --map-id for this command')
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

// ==================== 展示 ====================

function memberLine(m: StructMember): string {
  const bits = [typeNameOfCode(m.typeCode)]
  if (m.listLength !== undefined) bits.push(`×${m.listLength}`)
  if (m.refStructId !== undefined) bits.push(`→ ref ${m.refStructId}`)
  return `${m.order}. ${m.name} : ${bits.join(' ')}`
}

function printList(defs: readonly StructDef[], entries: readonly { structId: number; folderId: number; typeValue: number; tabField: number }[], json: boolean): void {
  if (json) {
    console.log(JSON.stringify({
      count: defs.length,
      structs: defs.map((d) => ({
        id: d.id,
        name: d.name,
        archived: d.archived,
        rewriteCounter: d.rewriteCounter,
        folder: entries.find((e) => e.structId === d.id) ?? null,
        members: d.members.map((m) => ({
          order: m.order, name: m.name, type: typeNameOfCode(m.typeCode), typeCode: m.typeCode,
          refStructId: m.refStructId ?? null, listLength: m.listLength ?? null
        }))
      }))
    }, null, 2))
    return
  }
  if (defs.length === 0) {
    console.log('（地图内没有结构体）')
    return
  }
  console.log(`结构体 ${defs.length} 个：\n`)
  for (const d of defs) {
    const e = entries.find((x) => x.structId === d.id)
    const kind = d.archived ? '局内存档' : '基础'
    const reg = e ? `folder ${e.folderId}/${e.typeValue} 页签f${e.tabField}` : '⚠ 无 folder 注册'
    console.log(`[${d.id}] ${d.name}  (${kind}, ${d.members.length} 成员)  ${reg}`)
    for (const m of d.members) console.log(`      ${memberLine(m)}`)
  }
}

function printInspect(d: StructDef, entry: { folderId: number; typeValue: number; tabField: number } | undefined, json: boolean): void {
  if (json) {
    console.log(JSON.stringify({
      id: d.id, name: d.name, archived: d.archived, rewriteCounter: d.rewriteCounter,
      folder: entry ?? null,
      members: d.members.map((m) => ({
        order: m.order, name: m.name, type: typeNameOfCode(m.typeCode), typeCode: m.typeCode,
        defaultValueField: m.typeCode + 10,
        refStructId: m.refStructId ?? null, listLength: m.listLength ?? null
      }))
    }, null, 2))
    return
  }
  console.log(`结构体 [${d.id}] "${d.name}"`)
  console.log(`  类别        : ${d.archived ? '局内存档结构体（folder 33 / typeValue 4600）' : '基础结构体（folder 29 / typeValue 4100）'}`)
  console.log(`  注册        : ${entry ? `folderId ${entry.folderId} / typeValue ${entry.typeValue} / 页签 f${entry.tabField}` : '⚠ 未找到 folder 注册'}`)
  console.log(`  整表改写计数 : f503 = ${d.rewriteCounter}`)
  console.log(`  成员        : ${d.members.length} 个`)
  for (const m of d.members) {
    console.log(`      ${memberLine(m)}   (默认值字段 f${m.typeCode + 10})`)
  }
}

// ==================== 入口 ====================

export async function runAssetsStructs(
  argv: readonly string[],
  rootCtx: RootContext = {}
): Promise<void> {
  const args = parseArgv(argv)
  const projectConfig = rootCtx.projectConfigPath
    ? await loadGstsConfig(rootCtx.projectConfigPath, { profile: 'project' })
    : rootCtx.projectConfig
  const gil = resolveGilPath(projectConfig, args)
  const sourceBytes = new Uint8Array(fs.readFileSync(gil))
  const defs = readStructDefs(sourceBytes)
  const entries = readStructFolderEntries(sourceBytes)

  if (args.sub === 'list') {
    printList(defs, entries, args.json)
    return
  }

  if (args.sub === 'inspect') {
    const d = defs.find((x) => x.name === args.name || String(x.id) === args.name)
    if (!d) {
      throw new Error(
        `[error] structure not found: ${args.name}；本图有：${defs.map((x) => x.name).join('、') || '（无）'}`
      )
    }
    printInspect(d, entries.find((e) => e.structId === d.id), args.json)
    return
  }

  const sourceSha = sha256Bytes(sourceBytes)
  if (args.sub === 'create') {
    preflightCreate(args, defs)
    if (!args.outputPath && !args.write) {
      printCreatePlan(args, defs, gil, sourceSha)
      return
    }
    const id = nextStructId(defs)
    const structName = args.name ?? ''
    const res = appendStruct(payloadOf(sourceBytes), {
      id,
      name: structName,
      archived: args.archived,
      members: args.members.map((m) => ({ name: m.name, typeCode: m.typeCode }))
    })
    const outBytes = rebuildGil(sourceBytes, res.payload)
    // 回读断言：写出的字节必须能被自己的读侧解出同一个结构体（不是「CLI 说成功」）
    const readBack = readStructDefs(outBytes).find((d) => d.id === id)
    if (!readBack || readBack.name !== structName || readBack.members.length !== args.members.length) {
      throw new Error(
        `[error] 回读核对失败：写入后未读到 [${id}] "${structName}" 的 ${args.members.length} 个成员。已放弃写盘。`
      )
    }
    const entry = readStructFolderEntries(outBytes).find((e) => e.structId === id)
    if (!entry) throw new Error(`[error] 回读核对失败：root6 folder 里没有 [${id}] 的登记条目。已放弃写盘。`)
    console.log(`结构体创建计划 → 已写入`)
    console.log(`  目标地图    : ${gil}`)
    console.log(`  写入前 sha  : ${sourceSha}`)
    console.log(`  新建        : [${id}] "${structName}"  ${args.archived ? '局内存档结构体' : '基础结构体'}`)
    console.log(`  成员        : ${args.members.map((m) => `${m.name}:${typeNameOfCode(m.typeCode)}`).join('、')}`)
    for (const c of res.changed) console.log(`  · ${c}`)
    console.log(`  回读核对    : 结构体 ✓（${readBack.members.length} 成员）  folder 条目 ✓（folderId=${entry.folderId} typeValue=${entry.typeValue}）`)
    emitBytesOrWrite(outBytes, gil, args)
    return
  }
  if (!args.outputPath && !args.write) {
    printUpdatePlan(args, defs, gil, sourceSha)
    return
  }
  const target = defs.find((d) => d.name === args.name || String(d.id) === args.name)
  if (!target) throw new Error(`[error] structure not found: ${args.name}`)
  const res = updateStruct(payloadOf(sourceBytes), {
    id: target.id,
    addMembers: args.addMembers.map((m) => ({ name: m.name, typeCode: m.typeCode })),
    removeNames: args.removeMembers,
    rename: args.rename ? [args.rename[0], args.rename[1]] : undefined,
    setDefault: splitDefault(args.setDefault)
  })
  const outBytes = rebuildGil(sourceBytes, res.payload)
  // 回读断言：目标结构体的成员数与预期一致（不是「CLI 说成功」）
  const after = readStructDefs(outBytes).find((d) => d.id === target.id)
  // 期望成员名序列：删掉待删的、把重命名的换掉、末尾接上新增的
  const expectNames = target.members
    .map((m) => m.name)
    .filter((n) => !args.removeMembers.includes(n))
    .map((n) => (args.rename && args.rename[0] === n ? args.rename[1] : n))
    .concat(args.addMembers.map((m) => m.name))
  const actualNames = after?.members.map((m) => m.name) ?? []
  if (!after || actualNames.length !== expectNames.length || actualNames.some((n, i) => n !== expectNames[i])) {
    throw new Error(
      `[error] 回读核对失败：更新后 [${target.id}] 成员为 [${actualNames.join('、')}]，期望 [${expectNames.join('、')}]。已放弃写盘。`
    )
  }
  console.log(`结构体更新 → 已写入`)
  console.log(`  目标地图    : ${gil}`)
  console.log(`  写入前 sha  : ${sourceSha}`)
  console.log(`  目标结构体  : [${target.id}] "${target.name}"  ${target.members.length} → ${after.members.length} 成员`)
  for (const c of res.changed) console.log(`  · ${c}`)
  console.log(`  回读核对    : ✓ ${after.members.length} 成员（${after.members.map((m) => `${m.name}:${m.typeCode}`).join('、')}）`)
  emitBytesOrWrite(outBytes, gil, args)
}

/** 取 GIL 载荷（20B 头 + 载荷 + 4B 尾） */
function payloadOf(bytes: Uint8Array): Uint8Array {
  return bytes.slice(20, -4)
}

/** D9：官方限制 + D8 重名 的前置校验（超限在建之前就拒绝，不产出编辑器打不开的中间态） */
function preflightCreate(args: Args, defs: readonly StructDef[]): void {
  const clash = defs.find((d) => d.name === args.name)
  if (clash) {
    throw new Error(
      `[error] 结构体名重复："${args.name}" 已被 [${clash.id}] 使用。` +
        `官方：结构体类型由名字完全确定，不允许同名（不同名的结构体即使内部相同也是不同类型，节点图中不能相连）。`
    )
  }
  const seen = new Set<string>()
  for (const m of args.members) {
    if (seen.has(m.name)) throw new Error(`[error] 成员名重复：${m.name}`)
    seen.add(m.name)
    if ((m.typeCode === 25 || m.typeCode === 26) && m.ref === undefined) {
      throw new Error(
        `[error] 成员 "${m.name}" 是 ${typeNameOfCode(m.typeCode)}，必须用 =<结构体名或id> 指定引用哪个结构体`
      )
    }
    if (args.archived && ARCHIVED_FORBIDDEN.has(m.typeCode)) {
      throw new Error(
        `[error] 局内存档结构体不支持 ${typeNameOfCode(m.typeCode)} 类型（成员 "${m.name}"）。` +
          `官方限制：不支持实体 / 实体列表 / 所有类型的字典 / 结构体。`
      )
    }
  }
}

function printCreatePlan(args: Args, defs: readonly StructDef[], gil: string, sha: string): void {
  const id = nextStructId(defs)
  const kind = args.archived ? '局内存档结构体' : '基础结构体'
  console.log(`create 计划（尚未写盘——本子命令的实现进行中）`)
  console.log(`  目标地图    : ${gil}`)
  console.log(`  当前 sha256 : ${sha}`)
  console.log(`  新建        : [${id}] "${args.name}"  ${kind}`)
  console.log(`  成员        : ${args.members.length} 个`)
  for (const m of args.members) {
    const ref = m.ref ? ` → ${m.ref}` : ''
    const len = m.listLength !== undefined ? ` ×${m.listLength}` : ''
    console.log(`      ${m.name} : ${typeNameOfCode(m.typeCode)}${len}${ref}`)
  }
  console.log(`  整表改写    : 既有 ${defs.length} 条记录 f503 各 +1，新建写 2`)
  console.log(`  物化节点族  : 拼装/拆分/修改 × 四类图 —— 待实现（D5）`)
}

function printUpdatePlan(args: Args, defs: readonly StructDef[], gil: string, sha: string): void {
  const d = defs.find((x) => x.name === args.name || String(x.id) === args.name)
  if (!d) {
    throw new Error(
      `[error] structure not found: ${args.name}；本图有：${defs.map((x) => x.name).join('、') || '（无）'}`
    )
  }
  console.log(`update 计划（尚未写盘——本子命令的实现进行中）`)
  console.log(`  目标地图    : ${gil}`)
  console.log(`  当前 sha256 : ${sha}`)
  console.log(`  目标结构体  : [${d.id}] "${d.name}"（${d.members.length} 成员）`)
  if (args.addMembers.length) console.log(`  新增成员    : ${args.addMembers.map((m) => `${m.name}:${typeNameOfCode(m.typeCode)}`).join('、')}`)
  if (args.removeMembers.length) console.log(`  删除成员    : ${args.removeMembers.join('、')}`)
  if (args.rename) console.log(`  重命名成员  : ${args.rename[0]} → ${args.rename[1]}`)
  console.log(`  ⚠ 成员增减会重写该结构体的全部物化节点族，既有图上的引脚可能失配（D6）`)
}

export { usage as structsUsage, printList as printStructList, emitBytesOrWrite }

/** 统一写出：--output 出候选；--write 备份后原子替换并同步 Temp */
function emitBytesOrWrite(
  outBytes: Uint8Array,
  gil: string,
  args: { outputPath?: string; write: boolean }
): void {
  if (args.outputPath) {
    const out = path.resolve(args.outputPath)
    fs.writeFileSync(out, outBytes)
    console.log(`written=${out}`)
    console.log(`candidateSha256=${sha256Bytes(outBytes)}`)
    return
  }
  if (!args.write) {
    throw new Error('[error] 需要 --output <file> 或 --write')
  }
  const backupDir = path.join(process.cwd(), '.gsts', 'backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = path.join(backupDir, `${path.basename(gil)}.${stamp}`)
  fs.copyFileSync(gil, backup)
  fs.writeFileSync(gil, outBytes)
  syncGilToTemp(path.dirname(gil), path.basename(gil))
  console.log(`backup=${backup}`)
  console.log(`written=${gil}`)
  console.log(`sha256=${sha256Bytes(outBytes)}`)
}

export { buildFile }
