import fs from 'node:fs'
import path from 'node:path'
import { buildFile, readUint32BE } from '../injector/binary.js'
import { emitWireMessage, parseWireMessage, type WireField } from './static_assembly/wire.js'
import { registerElementEntry } from './gil_prefabs.js'

/**
 * 复杂造物（造物元件）创建：**字节透传克隆**路线（记忆河 D131/D153 定案）。
 *
 * 为什么不是「按字段生成」：造物 def 的能力块（f6 的 80/81/82 特化槽、f8 的 42/26 等）
 * 不在 CLI 组件白名单里，任何 parse→decode→re-encode 的组件级往返都会丢槽
 * （票 24 §6「普通丘丘基板有损」= 同族现象）。因此：
 *   - 模板 = 用户在编辑器里建好的一个**干净造物**（def 记录 + 元件页面实例记录，原字节）；
 *   - 创建 = 原字节克隆 + 只改 id/名字/回指三处 + 照抄模板的 root6 注册位形。
 * def 是能力真值源（用户 2026-10-03 口径），实例/实体层只是引用。
 */

/** 造物 ID 段（与客户端图同域，实测起点 1082130433；玩家模板段 1086324737 之前）。 */
export const CREATION_ID_MIN = 1082130433
export const CREATION_ID_MAX = 1086324737
/** 复杂造物基板默认值（打手丘丘人，res 30007001）。 */
export const CREATION_BASE_DEFAULT = 30007001

export type CreationRegistryEntry = {
  groupType: number
  entryType: number
  target: 'def' | 'instance'
}

export type CreationTemplate = {
  schemaVersion: 1
  kind: 'creation-template'
  base: number
  defId: number
  instanceId: number
  def: string
  instance: string
  registry: CreationRegistryEntry[]
}

type Parsed = WireField[] | undefined

function parse(data: Uint8Array): Parsed {
  return parseWireMessage(data)
}

function emit(fields: readonly WireField[]): Uint8Array {
  return emitWireMessage(fields)
}

function topOf(bytes: Uint8Array): WireField[] {
  const top = parse(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  return top
}

function rebuild(bytes: Uint8Array, top: readonly WireField[]): Uint8Array {
  return buildFile(emit(top), {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  })
}

/** root 段里的记录体（每个 f1 wire2 一条）。 */
function recordsOf(top: readonly WireField[], rootNo: number): Uint8Array[] {
  const section = top.find((f) => f.number === rootNo && f.wire === 2)
  if (!section) return []
  const fields = parse(section.value as Uint8Array)
  if (!fields) return []
  return fields.filter((f) => f.number === 1 && f.wire === 2).map((f) => f.value as Uint8Array)
}

function recordId(record: Uint8Array): number {
  const first = parse(record)?.[0]
  return first && first.number === 1 && first.wire === 0 ? (first.value as number) : -1
}

/** def 记录基板 resID（字段 2）。 */
function recordBase(record: Uint8Array): number {
  const f = parse(record)?.find((x) => x.number === 2 && x.wire === 0)
  return f ? (f.value as number) : -1
}

/** 读名字：def 走 f6[1].f11.f1，实例走 f5[1].f11.f1（两者同构，只是槽所在字段号不同）。 */
function nameOf(record: Uint8Array, slotField: number): string {
  const entry = parse(record)?.find((f) => {
    if (f.number !== slotField || f.wire !== 2) return false
    const sub = parse(f.value as Uint8Array)
    return sub?.some((x) => x.number === 1 && x.wire === 0 && x.value === 1)
  })
  if (!entry) return ''
  const inner = parse(entry.value as Uint8Array)?.find((f) => f.number === 11 && f.wire === 2)
  if (!inner) return ''
  const text = parse(inner.value as Uint8Array)?.find((f) => f.number === 1 && f.wire === 2)
  return text ? Buffer.from(text.value as Uint8Array).toString('utf8') : ''
}

function setName(record: Uint8Array, slotField: number, name: string): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] malformed creation record')
  const entry = fields.find((f) => {
    if (f.number !== slotField || f.wire !== 2) return false
    const sub = parse(f.value as Uint8Array)
    return sub?.some((x) => x.number === 1 && x.wire === 0 && x.value === 1)
  })
  if (!entry) throw new Error(`[error] creation name slot (f${slotField}) not found`)
  const entryFields = parse(entry.value as Uint8Array)!
  const inner = entryFields.find((f) => f.number === 11 && f.wire === 2)
  if (!inner) throw new Error(`[error] creation name field (f${slotField}.f11) not found`)
  const innerFields = parse(inner.value as Uint8Array)!
  const text = innerFields.find((f) => f.number === 1 && f.wire === 2)
  if (!text) throw new Error(`[error] creation name text (f${slotField}.f11.f1) not found`)
  text.value = new TextEncoder().encode(name)
  inner.value = emit(innerFields)
  entry.value = emit(entryFields)
  return emit(fields)
}

/** 克隆 def 记录：改 id + 名字（其余字节原样透传）。 */
function cloneDef(record: Uint8Array, id: number, name?: string): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] malformed creation def record')
  const idField = fields.find((f) => f.number === 1 && f.wire === 0)
  if (!idField) throw new Error('[error] creation def record has no id field')
  idField.value = id
  let out = emit(fields)
  if (name) out = setName(out, 6, name)
  return out
}

/** 克隆实例记录：改 id + 回指 def id + 名字。 */
function cloneInstance(record: Uint8Array, id: number, defId: number, name?: string): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] malformed creation instance record')
  const idField = fields.find((f) => f.number === 1 && f.wire === 0)
  if (!idField) throw new Error('[error] creation instance record has no id field')
  idField.value = id
  const ref = fields.find((f) => f.number === 2 && f.wire === 2)
  if (!ref) throw new Error('[error] creation instance record has no definition reference')
  const refFields = parse(ref.value as Uint8Array)
  if (!refFields) throw new Error('[error] malformed creation instance reference')
  const refId = refFields.find((f) => f.number === 1 && f.wire === 0)
  if (!refId) throw new Error('[error] creation instance reference has no id')
  refId.value = defId
  ref.value = emit(refFields)
  let out = emit(fields)
  if (name) out = setName(out, 5, name)
  return out
}

/** 从地图里取出模板：造物 def + 元件页面实例 + 它们在 root6 的注册位形。 */
export function readCreationTemplate(
  bytes: Uint8Array,
  params: { defId?: number; base?: number }
): CreationTemplate {
  const top = topOf(bytes)
  const defs = recordsOf(top, 4)
  const instances = recordsOf(top, 8)
  const def =
    params.defId !== undefined
      ? defs.find((r) => recordId(r) === params.defId)
      : defs.find((r) => recordBase(r) === (params.base ?? CREATION_BASE_DEFAULT) && recordId(r) >= CREATION_ID_MIN)
  if (!def) {
    throw new Error(
      `[error] 没有找到造物 def（--def <id> 或 --base <resID>；当前 root4 造物候选=${defs
        .filter((r) => recordId(r) >= CREATION_ID_MIN)
        .map((r) => recordId(r))
        .join(',') || '无'}）`
    )
  }
  const defId = recordId(def)
  const instance = instances.find((r) => {
    const ref = parse(r)?.find((f) => f.number === 2 && f.wire === 2)
    if (!ref) return false
    return parse(ref.value as Uint8Array)?.some((f) => f.number === 1 && f.wire === 0 && f.value === defId)
  })
  if (!instance) throw new Error(`[error] 没有找到 def ${defId} 的元件页面实例（root8 回指记录）`)
  const instanceId = recordId(instance)
  const registry: CreationRegistryEntry[] = []
  const section = top.find((f) => f.number === 6 && f.wire === 2)
  for (const recordField of parse(section?.value as Uint8Array) ?? []) {
    if (recordField.number !== 1 || recordField.wire !== 2) continue
    const recordFields = parse(recordField.value as Uint8Array)
    if (!recordFields) continue
    const groupType = recordFields.find((f) => f.number === 1 && f.wire === 0)?.value as number | undefined
    const group = recordFields.find((f) => f.number === 3 && f.wire === 2)
    if (groupType === undefined || !group) continue
    for (const entry of parse(group.value as Uint8Array) ?? []) {
      if (entry.number !== 5 || entry.wire !== 2) continue
      const entryFields = parse(entry.value as Uint8Array)
      if (!entryFields) continue
      const entryType = entryFields.find((f) => f.number === 1 && f.wire === 0)?.value as number | undefined
      const targetId = entryFields.find((f) => f.number === 2 && f.wire === 0)?.value as number | undefined
      if (entryType === undefined || targetId === undefined) continue
      if (targetId === defId) registry.push({ groupType, entryType, target: 'def' })
      else if (targetId === instanceId) registry.push({ groupType, entryType, target: 'instance' })
    }
  }
  return {
    schemaVersion: 1,
    kind: 'creation-template',
    base: recordBase(def),
    defId,
    instanceId,
    def: Buffer.from(def).toString('base64'),
    instance: Buffer.from(instance).toString('base64'),
    registry
  }
}

/** 模板写盘（供下轮复用；默认放仓库 resources/creations/）。 */
export function writeCreationTemplate(filePath: string, template: CreationTemplate): string {
  const abs = path.resolve(filePath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, `${JSON.stringify(template, null, 2)}\n`)
  return abs
}

export function loadCreationTemplate(filePath: string): CreationTemplate {
  const abs = path.resolve(filePath)
  const parsed = JSON.parse(fs.readFileSync(abs, 'utf8')) as CreationTemplate
  if (parsed.kind !== 'creation-template') throw new Error(`[error] 不是造物模板文件: ${abs}`)
  return parsed
}

/** 造物段下一个空闲 ID 对（def / 实例各一）。 */
export function nextCreationIds(bytes: Uint8Array): { defId: number; instanceId: number } {
  const top = topOf(bytes)
  const used = new Set<number>()
  for (const rootNo of [4, 8, 5]) {
    for (const rec of recordsOf(top, rootNo)) {
      const id = recordId(rec)
      if (id >= CREATION_ID_MIN && id < CREATION_ID_MAX) used.add(id)
    }
  }
  let candidate = CREATION_ID_MIN
  const take = (): number => {
    while (used.has(candidate)) candidate += 1
    const out = candidate
    used.add(out)
    candidate += 1
    return out
  }
  return { defId: take(), instanceId: take() }
}

export type CreateCreationParams = {
  template: CreationTemplate
  defId: number
  instanceId: number
  name?: string
}

/** 创建造物：克隆 def + 实例进目标图，并按模板写 root6 注册。 */
export function createCreation(
  bytes: Uint8Array,
  params: CreateCreationParams
): { bytes: Uint8Array; defId: number; instanceId: number; name: string; base: number } {
  const top = topOf(bytes)
  const templateDef = new Uint8Array(Buffer.from(params.template.def, 'base64'))
  const templateInstance = new Uint8Array(Buffer.from(params.template.instance, 'base64'))
  const name = params.name ?? nameOf(templateDef, 6)
  if (params.defId === params.template.defId || params.instanceId === params.template.instanceId) {
    // 模板来自别的地图时 id 可复用；同图内则必须另分配
    const sameMap = recordsOf(top, 4).some((r) => recordId(r) === params.template.defId)
    if (sameMap) {
      throw new Error(
        `[error] 模板 def id ${params.template.defId} 已存在于目标图；请用 --id/--instance-id 另分配造物段 ID`
      )
    }
  }
  const existing = new Set<number>()
  for (const rootNo of [4, 8, 5]) for (const rec of recordsOf(top, rootNo)) existing.add(recordId(rec))
  for (const id of [params.defId, params.instanceId]) {
    if (existing.has(id)) throw new Error(`[error] id already exists in target map: ${id}`)
  }

  const newDef = cloneDef(templateDef, params.defId, params.name)
  const newInstance = cloneInstance(templateInstance, params.instanceId, params.defId, params.name)

  const ensureSection = (rootNo: number): WireField[] => {
    let section = top.find((f) => f.number === rootNo && f.wire === 2)
    if (!section) {
      section = { number: rootNo, wire: 2, value: emit([]) }
      top.push(section)
    }
    const fields = parse(section.value as Uint8Array)
    if (!fields) throw new Error(`[error] invalid root ${rootNo} section`)
    return fields
  }

  const root4 = ensureSection(4)
  root4.push({ number: 1, wire: 2, value: newDef })
  top.find((f) => f.number === 4 && f.wire === 2)!.value = emit(root4)

  const root8 = ensureSection(8)
  root8.push({ number: 1, wire: 2, value: newInstance })
  top.find((f) => f.number === 8 && f.wire === 2)!.value = emit(root8)

  const registry = params.template.registry.length
    ? params.template.registry
    : [
        { groupType: 3, entryType: 400, target: 'instance' as const },
        { groupType: 3, entryType: 2700, target: 'def' as const },
        { groupType: 18, entryType: 2700, target: 'def' as const }
      ]
  for (const entry of registry) {
    registerElementEntry(top, {
      groupType: entry.groupType,
      entryType: entry.entryType,
      id: entry.target === 'def' ? params.defId : params.instanceId
    })
  }

  return {
    bytes: rebuild(bytes, top),
    defId: params.defId,
    instanceId: params.instanceId,
    name,
    base: params.template.base
  }
}
