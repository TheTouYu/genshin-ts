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

/* ────────────────────────────────────────────────────────────────────────────
 * 造物配置读写（2026-10-23 差分闭合：技能条目 / 技能绑定 / CD / 决策图）
 *
 * 槽位（特性槽）：def 记录在 `root4.f6[]`，元件页面实例与场景实体在 `f5[]`；
 * 每个槽是 `{f1=<code>, ...}` 形状：
 *   code 80 → 决策图绑定 `f79{ f1{ f1=1  f2=<决策图ID>  f501=20007 } }`
 *   code 81 → 造物技能管理 `f80{ f1{…技能条目…}… f2{ f1=f32(公共冷却) } }`
 *     · 技能条目：`f1{ f1=1  f2{f1=1 f2=<技能配置ID>}  f3{…CD…}  f12="技能_N" }`
 *     · CD 0 s = `f3` 的四个 f32（f1..f4）整组省略（稀疏编码，0 不落盘）
 *     · 忽略公共冷却 = `f3.f8 = 1`（外层 `f80.f2.f1` 的公共冷却值不变）
 *   code 82 → 自主逻辑参数（本轮仍未闭合，只读不写）
 * 证据：地图 1073741827 快照 v8→v10，见 docs/game-engine-knowledge/gil-static-scene-semantics.md ⑧⑨⑩。
 * ──────────────────────────────────────────────────────────────────────────── */

/** 槽代码：决策图 / 技能管理 / 自主逻辑参数。 */
export const CREATION_SLOT_DECISION = 80
export const CREATION_SLOT_SKILLS = 81
export const CREATION_SLOT_AUTONOMY = 82
/** 决策图槽的类型标记（`f79.f1.f501`）。 */
export const CREATION_DECISION_TYPE_MARK = 20007

export type CreationLayer = 'def' | 'instance' | 'entity'

export type CreationSkillView = {
  index: number
  name: string
  configId?: number
  cd: number[]
  ignorePublicCd: boolean
  raw: number
}

export type CreationConfigView = {
  recordId: number
  layer: CreationLayer
  name: string
  base: number
  decisionGraphId?: number
  decisionTypeMark?: number
  skills: CreationSkillView[]
  publicCooldown?: number
}

export type CreationConfigUpdate =
  | {
      kind: 'add-skill'
      name?: string
      configId?: number
      cdSeconds?: number
      ignorePublicCd?: boolean
    }
  | {
      kind: 'bind-skill'
      index: number
      configId: number
      cdSeconds?: number
      ignorePublicCd?: boolean
    }
  | { kind: 'bind-decision'; graphId: number }

/** 元件页面实例 / 场景实体的基板 resID 放在记录尾字段 8（def 则在字段 2）。 */
function recordTailBase(record: Uint8Array): number | undefined {
  return parse(record)?.find((f) => f.number === 8 && f.wire === 0)?.value as number | undefined
}

/**
 * 技能管理槽的真实嵌套（2026-10-23 实测，读回落差一级就对不上）：
 * `f81 槽 → f80（管理器）→ f1（管理器体）→ { f1 = 技能条目…, f2 = 公共冷却 }`
 */
function skillManagerBody(record: Uint8Array, layer: CreationLayer): WireField[] | undefined {
  const slot = findSlot(record, layer, CREATION_SLOT_SKILLS)
  if (!slot) return undefined
  const payload = slotPayload(slot)
  const manager = payload.find((f) => f.number === 80 && f.wire === 2)
  if (!manager) return undefined
  const body = parse(manager.value as Uint8Array)?.find((f) => f.number === 1 && f.wire === 2)
  if (!body) return undefined
  return parse(body.value as Uint8Array)
}

function slotFieldOf(layer: CreationLayer): number {
  return layer === 'def' ? 6 : 5
}

function fieldsOf(bytes: Uint8Array): WireField[] {
  const fields = parse(bytes)
  if (!fields) throw new Error('[error] malformed creation record')
  return fields
}

/** 取槽条目（`{f1=<code>, …}`）；不存在返回 undefined。 */
function findSlot(record: Uint8Array, layer: CreationLayer, code: number): WireField | undefined {
  const slotField = slotFieldOf(layer)
  return fieldsOf(record).find((f) => {
    if (f.number !== slotField || f.wire !== 2) return false
    const sub = parse(f.value as Uint8Array)
    return sub?.some((x) => x.number === 1 && x.wire === 0 && x.value === code)
  })
}

function slotPayload(slot: WireField): WireField[] {
  const sub = parse(slot.value as Uint8Array)
  if (!sub) throw new Error('[error] malformed creation slot')
  return sub
}

function nested(container: WireField, number: number): WireField | undefined {
  return parse(container.value as Uint8Array)?.find((f) => f.number === number && f.wire === 2)
}

/**
 * 在**同一份 parse 图**里改槽载荷后重发记录。
 * 反例（初版 bug）：`findSlot()` 会重新 parse 出一份独立图，
 * 改那份图上的 `slot.value` 不会影响 `record` 自己的字段树 → 静默零改动。
 */
function updateSlot(
  record: Uint8Array,
  layer: CreationLayer,
  code: number,
  mutate: (payload: WireField[]) => void
): Uint8Array {
  const fields = fieldsOf(record)
  const slotFieldNo = slotFieldOf(layer)
  const slot = fields.find((f) => {
    if (f.number !== slotFieldNo || f.wire !== 2) return false
    return parse(f.value as Uint8Array)?.some((x) => x.number === 1 && x.wire === 0 && x.value === code)
  })
  if (!slot) throw new Error(`[error] 造物记录没有槽 code ${code}`)
  const payload = parse(slot.value as Uint8Array)
  if (!payload) throw new Error(`[error] malformed slot code ${code}`)
  mutate(payload)
  slot.value = emit(payload)
  return emit(fields)
}

/** 在地图里定位造物记录：先 root5 实体，再 root8 页面实例，最后 root4 定义。 */
export function locateCreationRecord(
  bytes: Uint8Array,
  params: { targetId: number; layer?: CreationLayer }
): { layer: CreationLayer; record: Uint8Array } {
  const top = topOf(bytes)
  const layers: CreationLayer[] = params.layer ? [params.layer] : ['entity', 'instance', 'def']
  const rootOf: Record<CreationLayer, number> = { entity: 5, instance: 8, def: 4 }
  for (const layer of layers) {
    const hit = recordsOf(top, rootOf[layer]).find((r) => recordId(r) === params.targetId)
    if (hit) return { layer, record: hit }
  }
  throw new Error(`[error] 没有找到造物记录 ${params.targetId}（root5 实体 / root8 页面实例 / root4 定义）`)
}

export function readCreationConfig(
  bytes: Uint8Array,
  params: { targetId: number; layer?: CreationLayer }
): CreationConfigView {
  const { layer, record } = locateCreationRecord(bytes, params)
  const slotField = slotFieldOf(layer)
  const view: CreationConfigView = {
    recordId: recordId(record),
    layer,
    name: nameOf(record, slotField),
    base: layer === 'def' ? recordBase(record) : (recordTailBase(record) ?? -1),
    skills: []
  }
  const decisionSlot = findSlot(record, layer, CREATION_SLOT_DECISION)
  if (decisionSlot) {
    const holder = slotPayload(decisionSlot).find((f) => f.number === 79 && f.wire === 2)
    const inner = holder ? nested(holder, 1) : undefined
    view.decisionTypeMark = inner ? (parse(inner.value as Uint8Array)?.find((f) => f.number === 501 && f.wire === 0)?.value as number | undefined) : undefined
    view.decisionGraphId = inner ? (parse(inner.value as Uint8Array)?.find((f) => f.number === 2 && f.wire === 0)?.value as number | undefined) : undefined
  }
  const managerFields = skillManagerBody(record, layer)
  if (managerFields) {
    {
      const cooldown = managerFields.find((f) => f.number === 2 && f.wire === 2)
      if (cooldown) {
        const cdFields = parse(cooldown.value as Uint8Array) ?? []
        view.publicCooldown = readF32(cdFields.find((f) => f.number === 1 && f.wire === 5))
      }
      let index = 0
      for (const entry of managerFields) {
        if (entry.number !== 1 || entry.wire !== 2) continue
        const entryFields = parse(entry.value as Uint8Array) ?? []
        index += 1
        const bind = entryFields.find((f) => f.number === 2 && f.wire === 2)
        const bindFields = bind ? parse(bind.value as Uint8Array) ?? [] : []
        const params3 = entryFields.find((f) => f.number === 3 && f.wire === 2)
        const paramFields = params3 ? parse(params3.value as Uint8Array) ?? [] : []
        const cd: number[] = []
        for (const field of [1, 2, 3, 4]) {
          const value = readF32(paramFields.find((x) => x.number === field && x.wire === 5))
          if (value !== undefined) cd.push(value)
        }
        const nameField = entryFields.find((f) => f.number === 12 && f.wire === 2)
        view.skills.push({
          index,
          name: nameField ? Buffer.from(nameField.value as Uint8Array).toString('utf8') : '',
          configId: bindFields.find((f) => f.number === 2 && f.wire === 0)?.value as number | undefined,
          cd,
          ignorePublicCd: paramFields.some((f) => f.number === 8 && f.wire === 0 && f.value === 1),
          raw: (entry.value as Uint8Array).length
        })
      }
    }
  }
  return view
}

/** fixed32 在 wire 层是 4 字节 LE 缓冲（不是裸 number）。 */
function f32(value: number): WireField {
  return { number: 0, wire: 5, value: new Uint8Array(new Float32Array([value]).buffer) }
}

function readF32(field: WireField | undefined): number | undefined {
  if (!field) return undefined
  const value = field.value
  if (value instanceof Uint8Array) return Buffer.from(value).readFloatLE(0)
  return typeof value === 'number' ? value : undefined
}

/** 编辑器新建技能条目时的默认 CD 参数（实测 `f1=1 f2=3 f3=1 f4=3 f6=1 f7=1`）。 */
const DEFAULT_SKILL_CD = [1, 3, 1, 3]

function buildSkillParams(opts: { cdSeconds?: number; ignorePublicCd?: boolean }): WireField[] {
  const out: WireField[] = []
  if (opts.cdSeconds === undefined) {
    DEFAULT_SKILL_CD.forEach((v, i) => out.push({ ...f32(v), number: i + 1 }))
  } else if (opts.cdSeconds !== 0) {
    throw new Error(
      '[error] 只支持 --cd 0（省略四个 f32，实测形态）或省略 --cd（沿用编辑器默认 1/3/1/3）；' +
        '其它 CD 值的字段语义未闭合，先做一轮编辑器差分再放开'
    )
  }
  out.push({ number: 6, wire: 0, value: 1 })
  out.push({ number: 7, wire: 0, value: 1 })
  if (opts.ignorePublicCd) out.push({ number: 8, wire: 0, value: 1 })
  return out
}

/** 造物配置更新（技能条目增/绑、决策图绑定），返回新文件字节。 */
export function updateCreationConfig(
  bytes: Uint8Array,
  params: { targetId: number; layer?: CreationLayer; update: CreationConfigUpdate }
): { bytes: Uint8Array; layer: CreationLayer; recordId: number; detail: string } {
  const top = topOf(bytes)
  const { layer, record } = locateCreationRecord(bytes, params)
  const rootOf: Record<CreationLayer, number> = { entity: 5, instance: 8, def: 4 }
  const rootNo = rootOf[layer]
  const section = top.find((f) => f.number === rootNo && f.wire === 2)
  if (!section) throw new Error(`[error] root ${rootNo} section not found`)
  const sectionFields = parse(section.value as Uint8Array)
  if (!sectionFields) throw new Error(`[error] malformed root ${rootNo} section`)
  const recordIndex = sectionFields.findIndex(
    (f) => f.number === 1 && f.wire === 2 && recordId(f.value as Uint8Array) === params.targetId
  )
  if (recordIndex < 0) throw new Error(`[error] 造物记录 ${params.targetId} 不在 root${rootNo} 段内`)

  const update = params.update
  let newRecord: Uint8Array
  let detail = ''

  if (update.kind === 'bind-decision') {
    newRecord = updateSlot(record, layer, CREATION_SLOT_DECISION, (payload) => {
      const holder = payload.find((f) => f.number === 79 && f.wire === 2)
      if (!holder) throw new Error('[error] 决策图槽缺少 f79 容器')
      // 必须改「holder 自己那份 parse 图」，改完再逐层回填（只回填 holder.value 会丢改动）
      const holderFields = parse(holder.value as Uint8Array)
      if (!holderFields) throw new Error('[error] malformed f79 container')
      const inner = holderFields.find((f) => f.number === 1 && f.wire === 2)
      if (!inner) throw new Error('[error] 决策图槽缺少 f79.f1 容器')
      const innerFields = parse(inner.value as Uint8Array)
      if (!innerFields) throw new Error('[error] malformed decision slot')
      const mark = innerFields.find((f) => f.number === 501 && f.wire === 0)
      if (!mark || mark.value !== CREATION_DECISION_TYPE_MARK) {
        throw new Error(
          `[error] 决策图槽的类型标记不是 ${CREATION_DECISION_TYPE_MARK}（实得 ${String(mark?.value)}），fail closed`
        )
      }
      const graphField = innerFields.find((f) => f.number === 2 && f.wire === 0)
      if (graphField) graphField.value = update.graphId
      else innerFields.splice(1, 0, { number: 2, wire: 0, value: update.graphId })
      inner.value = emit(innerFields)
      holder.value = emit(holderFields)
    })
    detail = `decision graph ${update.graphId}`
  } else {
    const mutateSkills = (payload: WireField[]): void => {
    const manager = payload.find((f) => f.number === 80 && f.wire === 2)
    if (!manager) throw new Error('[error] 技能管理槽缺少 f80 管理器容器')
    const managerContainer = parse(manager.value as Uint8Array)
    if (!managerContainer) throw new Error('[error] malformed skill manager container')
    const bodyField = managerContainer.find((f) => f.number === 1 && f.wire === 2)
    if (!bodyField) throw new Error('[error] 技能管理器缺少 f1 管理器体（fail closed）')
    const managerFields = parse(bodyField.value as Uint8Array)
    if (!managerFields) throw new Error('[error] malformed skill manager body')
    const indices = managerFields.map((f, i) => ({ f, i })).filter((x) => x.f.number === 1 && x.f.wire === 2)
    if (update.kind === 'add-skill') {
      const name = update.name ?? `技能_${indices.length + 1}`
      const entryFields: WireField[] = []
      if (update.configId !== undefined) {
        entryFields.push({ number: 2, wire: 2, value: emit([{ number: 1, wire: 0, value: 1 }, { number: 2, wire: 0, value: update.configId }]) })
      } else {
        entryFields.push({ number: 2, wire: 2, value: emit([{ number: 1, wire: 0, value: 1 }]) })
      }
      entryFields.push({
        number: 3,
        wire: 2,
        value: emit(buildSkillParams({ cdSeconds: update.cdSeconds, ignorePublicCd: update.ignorePublicCd }))
      })
      entryFields.push({ number: 12, wire: 2, value: new TextEncoder().encode(name) })
      entryFields.unshift({ number: 1, wire: 0, value: 1 })
      const insertAt = indices.length ? indices[indices.length - 1].i + 1 : 0
      managerFields.splice(insertAt, 0, { number: 1, wire: 2, value: emit(entryFields) })
      detail = `skill#${indices.length + 1} name=${name}` + (update.configId !== undefined ? ` config=${update.configId}` : ' (unbound)')
    } else {
      const target = indices[update.index - 1]
      if (!target) throw new Error(`[error] 技能序号 ${update.index} 不存在（当前 ${indices.length} 条）`)
      const entryFields = parse(target.f.value as Uint8Array)
      if (!entryFields) throw new Error('[error] malformed skill entry')
      const bind = entryFields.find((f) => f.number === 2 && f.wire === 2)
      const bindValue = emit([{ number: 1, wire: 0, value: 1 }, { number: 2, wire: 0, value: update.configId }])
      if (bind) bind.value = bindValue
      else entryFields.unshift({ number: 2, wire: 2, value: bindValue })
      const params3 = entryFields.find((f) => f.number === 3 && f.wire === 2)
      const newParams = emit(buildSkillParams({ cdSeconds: update.cdSeconds, ignorePublicCd: update.ignorePublicCd }))
      if (params3) params3.value = newParams
      else entryFields.push({ number: 3, wire: 2, value: newParams })
      target.f.value = emit(entryFields)
      detail = `skill#${update.index} config=${update.configId}`
    }
    bodyField.value = emit(managerFields)
    manager.value = emit(managerContainer)
    }
    newRecord = updateSlot(record, layer, CREATION_SLOT_SKILLS, mutateSkills)
  }

  sectionFields[recordIndex] = { number: 1, wire: 2, value: newRecord }
  section.value = emit(sectionFields)
  return { bytes: rebuild(bytes, top), layer, recordId: params.targetId, detail }
}
