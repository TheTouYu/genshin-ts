// Lua 脚本资产 wire 层：槽 .gil 顶层 f50 脚本登记表（2026-10-14 真机定谳，D260）。
//
// wire 结构（编辑器两次导入实证）：
//   顶层 f50 (wire2) → 单层 f50 包装 → 容器 { f1: 条目(可重复), f2: 1 }
//   条目 = { f1: guid(varint), f2: name(string), f3: file_path(string), f5: source(string) }
//   file_path 自带 default_import_file/ 前缀；外部文件提取到
//   <槽目录>/external_lua_file/<file_path>（UTF-8 BOM + source）。
// 编辑器重复导入去重铁律：guid+1、name 加数字尾（main→main2）、path 加 _1 后缀。
//
// 编辑策略：整树 parse → 原地替换顶层 f50（其余顶层字段字节透传，不重排）→
// 容器内既有条目按原始 WireField 原样回放（未知字段保留），仅追加新条目。
import { emitWireMessage, parseWireMessage, type WireField } from './static_assembly/wire.js'

export const SCRIPT_REGISTRY_FIELD = 50
export const FIRST_SCRIPT_GUID = 1073741825
export const SCRIPT_PATH_PREFIX = 'default_import_file/'

export type ScriptRegistryEntry = {
  guid: number
  name: string
  filePath: string
  source: string | null
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

// 归一化 lua 路径：反斜杠→正斜杠、去 ./、去重复 default_import_file/ 前缀
export function normalizeScriptPath(raw: string): string {
  let p = raw.replace(/\\/g, '/').replace(/^\.\//, '')
  while (p.startsWith(SCRIPT_PATH_PREFIX)) p = p.slice(SCRIPT_PATH_PREFIX.length)
  if (!p || p === '/') throw new Error('[error] script path is empty')
  if (p.includes('..')) throw new Error(`[error] script path must not contain ..: ${raw}`)
  return SCRIPT_PATH_PREFIX + p
}

// 顶层 f50 → 容器 WireField 列表；无登记表返回 null。
// 真实编辑器形态（2026-10-16 三轮差分定谳，D268）：顶层 f50 内容直接就是容器
// {f1 wrapper × N, f2:1}；wrapper（f1 LEN）内容才是条目 {f1:guid,f2:name,f3:path,f5:source}。
// 旧 CLI 曾写三层（f50 → wrap → f50 → container），保留回退兼容。
function registryContainerFields(payload: Uint8Array): WireField[] | null {
  const top = parseWireMessage(payload)
  if (!top) throw new Error('[error] malformed GIL payload')
  const registry = top.find((f) => f.number === SCRIPT_REGISTRY_FIELD && f.wire === 2)
  if (!registry) return null
  const direct = parseWireMessage(registry.value as Uint8Array)
  if (!direct) throw new Error('[error] malformed script registry container (f50)')
  if (direct.some((f) => f.number === 1 && f.wire === 2)) return direct
  const inner = direct.find((f) => f.number === SCRIPT_REGISTRY_FIELD && f.wire === 2)
  if (!inner) throw new Error('[error] script registry wrapper has no inner f50')
  const container = parseWireMessage(inner.value as Uint8Array)
  if (!container) throw new Error('[error] malformed script registry container')
  return container
}

function entryOfFields(fields: WireField[]): ScriptRegistryEntry | null {
  const guidField = fields.find((f) => f.number === 1 && f.wire === 0)
  const nameField = fields.find((f) => f.number === 2 && f.wire === 2)
  const pathField = fields.find((f) => f.number === 3 && f.wire === 2)
  if (!guidField || !nameField || !pathField) return null
  const sourceField = fields.find((f) => f.number === 5 && f.wire === 2)
  return {
    guid: Number(guidField.value),
    name: decodeUtf8(nameField.value as Uint8Array),
    filePath: decodeUtf8(pathField.value as Uint8Array),
    source: sourceField ? decodeUtf8(sourceField.value as Uint8Array) : null
  }
}

export function parseScriptRegistry(payload: Uint8Array): ScriptRegistryEntry[] {
  const container = registryContainerFields(payload)
  if (!container) return []
  const entries: ScriptRegistryEntry[] = []
  for (const field of container) {
    if (field.number !== 1 || field.wire !== 2) continue
    const inner = parseWireMessage(field.value as Uint8Array)
    if (!inner) continue
    const entry = entryOfFields(inner)
    if (entry) entries.push(entry)
  }
  return entries
}

export type RegisterScriptOptions = {
  name: string
  /** lua 路径，可带可不带 default_import_file/ 前缀（自动归一化补齐） */
  filePath: string
  source: string
  /** 显式 guid（缺省 = 既有最大 guid + 1，下限 FIRST_SCRIPT_GUID） */
  guid?: number
}

export type RegisterScriptResult = {
  payload: Uint8Array
  entry: ScriptRegistryEntry
  /** 编辑器同款去重后缀是否被应用（name/path 改名时非空说明撞了既有条目） */
  dedupApplied: boolean
}

function dedupeName(base: string, taken: Set<string>): { name: string; changed: boolean } {
  if (!taken.has(base)) return { name: base, changed: false }
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}${i}`
    if (!taken.has(candidate)) return { name: candidate, changed: true }
  }
  throw new Error(`[error] cannot dedupe script name: ${base}`)
}

function dedupePath(base: string, taken: Set<string>): { filePath: string; changed: boolean } {
  if (!taken.has(base)) return { filePath: base, changed: false }
  const slash = base.lastIndexOf('/')
  const dir = slash >= 0 ? base.slice(0, slash + 1) : ''
  const file = slash >= 0 ? base.slice(slash + 1) : base
  const dot = file.lastIndexOf('.')
  const stem = dot > 0 ? file.slice(0, dot) : file
  const ext = dot > 0 ? file.slice(dot) : ''
  for (let i = 1; i < 1000; i++) {
    const candidate = `${dir}${stem}_${i}${ext}`
    if (!taken.has(candidate)) return { filePath: candidate, changed: true }
  }
  throw new Error(`[error] cannot dedupe script path: ${base}`)
}

// 在 payload 顶层 f50 追加一条脚本登记；无 f50 时在顶层末尾新建。
// 既有条目（含未知字段）按原始 WireField 回放，仅追加新条目；顶层其余字段原样保留。
export function registerScriptInPayload(
  payload: Uint8Array,
  options: RegisterScriptOptions
): RegisterScriptResult {
  const top = parseWireMessage(payload)
  if (!top) throw new Error('[error] malformed GIL payload')

  const existing = parseScriptRegistry(payload)
  const takenNames = new Set(existing.map((e) => e.name))
  const takenPaths = new Set(existing.map((e) => e.filePath))
  const takenGuids = new Set(existing.map((e) => e.guid))

  const nameResult = dedupeName(options.name, takenNames)
  const pathResult = dedupePath(normalizeScriptPath(options.filePath), takenPaths)
  const guid =
    options.guid ??
    Math.max(FIRST_SCRIPT_GUID, ...existing.map((e) => e.guid + 1), FIRST_SCRIPT_GUID)
  if (takenGuids.has(guid)) {
    throw new Error(`[error] script guid already registered: ${guid}`)
  }
  const entry: ScriptRegistryEntry = {
    guid,
    name: nameResult.name,
    filePath: pathResult.filePath,
    source: options.source
  }
  const entryFields: WireField[] = [
    { number: 1, wire: 0, value: entry.guid },
    { number: 2, wire: 2, value: encodeUtf8(entry.name) },
    { number: 3, wire: 2, value: encodeUtf8(entry.filePath) },
    { number: 5, wire: 2, value: encodeUtf8(options.source) }
  ]

  const registryIndex = top.findIndex(
    (f) => f.number === SCRIPT_REGISTRY_FIELD && f.wire === 2
  )
  let newTop: WireField[]
  const entryField: WireField = { number: 1, wire: 2, value: emitWireMessage(entryFields) }
  if (registryIndex >= 0) {
    // 容器既有字段原样回放，新条目插到最后一个 f1 之后（编辑器形态：f1* 在前，f2 尾随）
    const container = registryContainerFields(payload)!
    let lastEntryIndex = -1
    for (let i = container.length - 1; i >= 0; i--) {
      if (container[i].number === 1 && container[i].wire === 2) {
        lastEntryIndex = i
        break
      }
    }
    const newContainer = [...container]
    newContainer.splice(lastEntryIndex + 1, 0, entryField)
    const wrapped: WireField = {
      number: SCRIPT_REGISTRY_FIELD,
      wire: 2,
      value: emitWireMessage(newContainer)
    }
    newTop = [...top]
    newTop[registryIndex] = wrapped
  } else {
    const wrapped: WireField = {
      number: SCRIPT_REGISTRY_FIELD,
      wire: 2,
      value: emitWireMessage([entryField, { number: 2, wire: 0, value: 1 }])
    }
    newTop = [...top, wrapped]
  }

  return {
    payload: emitWireMessage(newTop),
    entry,
    dedupApplied: nameResult.changed || pathResult.changed
  }
}

export type UpdateScriptOptions = {
  /** 按名字定位（与 guid 二选一） */
  name?: string
  /** 按 guid 定位（与 name 二选一） */
  guid?: number
  source: string
}

export type UpdateScriptResult = {
  payload: Uint8Array
  entry: ScriptRegistryEntry
}

// 更新已登记脚本的源码：f1 wrapper 内 f5 → 新 source，其余字段（含未知字段）
// 原始字节回放；容器内该条目原位替换。定位不唯一（撞名且未给 guid）时报错。
export function updateScriptInPayload(
  payload: Uint8Array,
  options: UpdateScriptOptions
): UpdateScriptResult {
  if (options.guid === undefined && !options.name) {
    throw new Error('[error] update requires --name or --guid to locate the script')
  }
  const top = parseWireMessage(payload)
  if (!top) throw new Error('[error] malformed GIL payload')
  const container = registryContainerFields(payload)
  if (!container) throw new Error('[error] no script registry (f50) in this map')

  let hitIndex = -1
  let hits = 0
  for (let i = 0; i < container.length; i++) {
    const field = container[i]
    if (field.number !== 1 || field.wire !== 2) continue
    const body = parseWireMessage(field.value as Uint8Array)
    if (!body) continue
    const candidate = entryOfFields(body)
    if (!candidate) continue
    const matched =
      options.guid !== undefined ? candidate.guid === options.guid : candidate.name === options.name
    if (matched) {
      hits++
      if (hitIndex < 0) hitIndex = i
    }
  }
  if (hitIndex < 0) {
    throw new Error(`[error] script not found: ${options.guid ?? options.name}`)
  }
  if (hits > 1 && options.guid === undefined) {
    throw new Error(`[error] ambiguous script name "${options.name}" (${hits} hits); use --guid`)
  }

  const origBody = parseWireMessage(container[hitIndex].value as Uint8Array)!
  const newBody: WireField[] = []
  let replaced = false
  for (const field of origBody) {
    if (field.number === 5 && field.wire === 2) {
      newBody.push({ number: 5, wire: 2, value: encodeUtf8(options.source) })
      replaced = true
    } else {
      newBody.push(field)
    }
  }
  if (!replaced) {
    newBody.push({ number: 5, wire: 2, value: encodeUtf8(options.source) })
  }

  const newContainer = [...container]
  newContainer[hitIndex] = { number: 1, wire: 2, value: emitWireMessage(newBody) }
  const registryIndex = top.findIndex(
    (f) => f.number === SCRIPT_REGISTRY_FIELD && f.wire === 2
  )
  const newTop = [...top]
  newTop[registryIndex] = {
    number: SCRIPT_REGISTRY_FIELD,
    wire: 2,
    value: emitWireMessage(newContainer)
  }

  const entry = entryOfFields(newBody)
  if (!entry) throw new Error('[error] internal: rebuilt entry failed to parse')
  return { payload: emitWireMessage(newTop), entry }
}

// ── 脚本挂载（2026-10-16 真机定谳，D268）────────────────────────────────────
// 挂载条目 = 11B 模式：f502{f1{f1:<script guid varint>}}。
// 挂载列表 = host 节点 record（f9.f502）内 data 组件链中的 f74 LEN 字段：
//   空槽 = f74 空载荷（3B 字段）；有条目 = f74 载荷为若干 11B 条目串接。
//   真图同字段还存在 `a81f01`（f501 varint=1）前缀形态：前缀字段原样保留，条目追加在其后。
// host 身份 = record 的直接字段 f501 varint（节点 guid）；name 取组件链内 f12 wrapper
// {f501: string}（best-effort，两个 f12 形态不混用）。
export const MOUNT_LIST_FIELD = 74
const MOUNT_ENTRY_FIELD = 502
const MAX_MOUNT_DEPTH = 10

export type ScriptMount = {
  hostGuid: number
  hostName: string | null
  scriptGuid: number
}

type MountListRef = {
  /** 从 record 字段列表出发的索引链：[i0, i1, …]，最后一级字段即 f74 */
  path: number[]
  field: WireField
}

type MountHost = {
  recIndex: number
  hostGuid: number
  hostName: string | null
  ref: MountListRef | null
  scriptGuids: number[]
}

function entryLeafGuid(field: WireField): number | null {
  if (field.number !== MOUNT_ENTRY_FIELD || field.wire !== 2) return null
  const inner = parseWireMessage(field.value as Uint8Array)
  if (!inner || inner.length !== 1) return null
  const wrapper = inner[0]
  if (wrapper.number !== 1 || wrapper.wire !== 2) return null
  const guidFields = parseWireMessage(wrapper.value as Uint8Array)
  if (!guidFields || guidFields.length !== 1) return null
  const leaf = guidFields[0]
  if (leaf.number !== 1 || leaf.wire !== 0) return null
  return Number(leaf.value)
}

// f74 载荷是否形态合法：空槽（空载荷）或挂载条目 + 允许的标量前缀字段。
function isMountListValue(value: Uint8Array): boolean {
  const fields = parseWireMessage(value)
  if (!fields) return false
  return fields.every((f) => f.wire === 0 || entryLeafGuid(f) !== null)
}

function findMountListRef(
  fields: WireField[],
  path: number[],
  depth: number
): MountListRef | null {
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    if (field.wire !== 2) continue
    const value = field.value as Uint8Array
    if (field.number === MOUNT_LIST_FIELD && isMountListValue(value)) {
      return { path: [...path, i], field }
    }
    if (depth >= MAX_MOUNT_DEPTH) continue
    const inner = parseWireMessage(value)
    if (!inner) continue
    const found = findMountListRef(inner, [...path, i], depth + 1)
    if (found) return found
  }
  return null
}

function hostNameOf(fields: WireField[], depth: number): string | null {
  if (depth > MAX_MOUNT_DEPTH) return null
  for (const field of fields) {
    if (field.wire !== 2) continue
    const value = field.value as Uint8Array
    if (field.number === 12) {
      const inner = parseWireMessage(value)
      if (inner && inner.length === 1 && inner[0].number === 501 && inner[0].wire === 2) {
        return decodeUtf8(inner[0].value as Uint8Array)
      }
    }
    const nested = parseWireMessage(value)
    if (!nested) continue
    const found = hostNameOf(nested, depth + 1)
    if (found) return found
  }
  return null
}

// 枚举 f9 树里所有 host record 与其挂载列表；非节点 record（无 f501 guid）跳过。
function mountHosts(payload: Uint8Array): { hosts: MountHost[]; f9Index: number; f9Fields: WireField[] } {
  const top = parseWireMessage(payload)
  if (!top) throw new Error('[error] malformed GIL payload')
  const f9Index = top.findIndex((f) => f.number === 9 && f.wire === 2)
  if (f9Index < 0) throw new Error('[error] no UI control tree (root 9) in this map')
  const f9Fields = parseWireMessage(top[f9Index].value as Uint8Array)
  if (!f9Fields) throw new Error('[error] malformed UI control tree (root 9)')
  const hosts: MountHost[] = []
  f9Fields.forEach((rec, recIndex) => {
    if (rec.number !== 502 || rec.wire !== 2) return
    const recFields = parseWireMessage(rec.value as Uint8Array)
    if (!recFields) return
    const guidField = recFields.find((f) => f.number === 501 && f.wire === 0)
    if (!guidField) return
    const ref = findMountListRef(recFields, [], 0)
    const scriptGuids: number[] = []
    if (ref) {
      const listFields = parseWireMessage(ref.field.value as Uint8Array) ?? []
      for (const field of listFields) {
        const guid = entryLeafGuid(field)
        if (guid !== null) scriptGuids.push(guid)
      }
    }
    hosts.push({
      recIndex,
      hostGuid: Number(guidField.value),
      hostName: hostNameOf(recFields, 0),
      ref,
      scriptGuids
    })
  })
  return { hosts, f9Index, f9Fields }
}

export function parseScriptMounts(payload: Uint8Array): ScriptMount[] {
  const { hosts } = mountHosts(payload)
  const mounts: ScriptMount[] = []
  for (const host of hosts) {
    for (const scriptGuid of host.scriptGuids) {
      mounts.push({ hostGuid: host.hostGuid, hostName: host.hostName, scriptGuid })
    }
  }
  return mounts
}

function replaceInPath(fields: WireField[], path: number[], replacement: WireField): WireField[] {
  const [head, ...rest] = path
  if (head === undefined) throw new Error('[error] internal: empty mount path')
  const next = [...fields]
  if (rest.length === 0) {
    next[head] = replacement
    return next
  }
  const child = next[head]
  const childFields = parseWireMessage(child.value as Uint8Array)
  if (!childFields) throw new Error('[error] internal: mount path broken')
  next[head] = { number: child.number, wire: 2, value: emitWireMessage(replaceInPath(childFields, rest, replacement)) }
  return next
}

function mountEntryField(scriptGuid: number): WireField {
  return {
    number: MOUNT_ENTRY_FIELD,
    wire: 2,
    value: emitWireMessage([
      { number: 1, wire: 2, value: emitWireMessage([{ number: 1, wire: 0, value: scriptGuid }]) }
    ])
  }
}

// 把脚本挂到一个 host 节点上（host 必须已有挂载槽 f74；无槽由编辑器侧最小差分补齐）。
export function mountScriptInPayload(
  payload: Uint8Array,
  options: { hostGuid: number; scriptGuid: number }
): { payload: Uint8Array; mount: ScriptMount } {
  const registry = parseScriptRegistry(payload)
  if (!registry.some((e) => e.guid === options.scriptGuid)) {
    throw new Error(
      `[error] script guid ${options.scriptGuid} is not registered (f50); register it first` +
        ` (known: ${registry.map((e) => e.guid).join(',') || 'none'})`
    )
  }
  const { hosts, f9Index, f9Fields } = mountHosts(payload)
  const host = hosts.find((h) => h.hostGuid === options.hostGuid)
  if (!host) {
    throw new Error(
      `[error] host control not found: ${options.hostGuid}` +
        ` (known hosts: ${hosts.map((h) => h.hostGuid).join(',')})`
    )
  }
  if (!host.ref) {
    throw new Error(
      `[error] host ${options.hostGuid} has no mount slot (f74);` +
        ' open it in the editor and mount/unmount once to materialize the slot, then retry'
    )
  }
  if (host.scriptGuids.includes(options.scriptGuid)) {
    throw new Error(`[error] script ${options.scriptGuid} is already mounted on host ${options.hostGuid}`)
  }
  const oldList = host.ref.field.value as Uint8Array
  const newList = emitWireMessage([
    ...(parseWireMessage(oldList) ?? []),
    mountEntryField(options.scriptGuid)
  ])
  const recFields = parseWireMessage(f9Fields[host.recIndex].value as Uint8Array)!
  const newRecFields = replaceInPath(recFields, host.ref.path, {
    number: MOUNT_LIST_FIELD,
    wire: 2,
    value: newList
  })
  const newRecord: WireField = { number: MOUNT_ENTRY_FIELD, wire: 2, value: emitWireMessage(newRecFields) }
  const newF9 = [...f9Fields]
  newF9[host.recIndex] = newRecord
  const top = parseWireMessage(payload)!
  const newTop = [...top]
  newTop[f9Index] = { number: 9, wire: 2, value: emitWireMessage(newF9) }
  return {
    payload: emitWireMessage(newTop),
    mount: { hostGuid: host.hostGuid, hostName: host.hostName, scriptGuid: options.scriptGuid }
  }
}

// 从 host 上解挂一个脚本：删除匹配 guid 的 11B 条目，标量前缀与其余条目原样保留。
export function unmountScriptInPayload(
  payload: Uint8Array,
  options: { hostGuid: number; scriptGuid: number }
): { payload: Uint8Array; hostGuid: number } {
  const { hosts, f9Index, f9Fields } = mountHosts(payload)
  const host = hosts.find((h) => h.hostGuid === options.hostGuid)
  if (!host) throw new Error(`[error] host control not found: ${options.hostGuid}`)
  if (!host.ref || !host.scriptGuids.includes(options.scriptGuid)) {
    throw new Error(`[error] script ${options.scriptGuid} is not mounted on host ${options.hostGuid}`)
  }
  const oldList = parseWireMessage(host.ref.field.value as Uint8Array) ?? []
  const newList = emitWireMessage(
    oldList.filter((field) => entryLeafGuid(field) !== options.scriptGuid)
  )
  const recFields = parseWireMessage(f9Fields[host.recIndex].value as Uint8Array)!
  const newRecFields = replaceInPath(recFields, host.ref.path, {
    number: MOUNT_LIST_FIELD,
    wire: 2,
    value: newList
  })
  const newF9 = [...f9Fields]
  newF9[host.recIndex] = { number: MOUNT_ENTRY_FIELD, wire: 2, value: emitWireMessage(newRecFields) }
  const newTop = [...parseWireMessage(payload)!]
  newTop[f9Index] = { number: 9, wire: 2, value: emitWireMessage(newF9) }
  return { payload: emitWireMessage(newTop), hostGuid: host.hostGuid }
}
