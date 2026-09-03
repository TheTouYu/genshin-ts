/**
 * ui/src/floating-page.ts — 悬浮交互页基础命令引擎（票10）
 *
 * 范围（DESIGN §3.3 L2 悬浮页面 + mappings §4）：
 *   - createFloatingPageCandidate：库容器面「纯添加」= 3 条单条族（实体+固有容器+关闭按钮）。
 *     wire 依据 轮24：旧 gil_ui BUILTIN_FP_* 是「添加+同步」合并形态，不作产出形态；
 *   - addPageContainerCandidate：新增页面容器（顶层容器记录 + 实体 t42 引用追加；轮33）；
 *   - setContainerActiveCandidate：容器初始生效标记（容器名字后 b01f01 增删；轮48/49 双向闭合）；
 *   - addPageVariableCandidate：形式变量 t41 条目追加（f503.f34.f501 重复条目；轮3）。
 *
 * 通用纪律：纯函数 bytes→bytes；未触碰字段 parse/emit 保真透传；donor 缺失 fail-closed 不猜；
 * 物理插入位/索引位默认规则 = 尾部追加（与编辑器逐字节对拍时以 insertAfterId/indexAfterId 显式给锚）。
 * 字节级同步核验：ui/tests/floating-page-assert.ts（轮23→24 / 轮32b→33 / 轮47→48→49 / 轮2→3 重放）。
 */

import { remapUiRecordVarints, setUiControlName } from '../../src/cli/gil_ui.js'
import { emitWireMessage, parseWireMessage } from '../../src/cli/static_assembly/wire.js'
import { floatingPageDonor } from './floating-page-donors.js'
import { collectUsedControlIds } from './create.js'
import {
  extractContainerRefs,
  findComponent,
  LIBRARY_CONTAINER_ID,
  packedVarints,
  parseRoot9,
  recordNameOf
} from './record.js'
import type { ParsedRoot9 } from './record.js'
import {
  appendMemberId,
  clusterEndId,
  containerClusterRootId,
  encodePacked,
  insertIntoIndex,
  insertRecords,
  ownIdOf,
  withSection,
  w0,
  w2
} from './section-ops.js'
import type { WireField } from '../../src/cli/static_assembly/wire.js'

export type PageVariableType = 'int' | 'float' | 'string' | 'dynamic-text'

const PAGE_VARIABLE_TYPE_CODES: Record<PageVariableType, number> = {
  int: 0,
  float: 1,
  string: 2,
  'dynamic-text': 3
}

/** 连续分配 n 个未占用 ID（尾段接续；显式段给重放对拍/用户指定用） */
function allocateConsecutive(parsed: ParsedRoot9, count: number, start?: number): number[] {
  const used = collectUsedControlIds(parsed)
  const from = start ?? (used.size === 0 ? 1073741843 : Math.max(...used) + 1)
  const ids: number[] = []
  for (let i = 0; i < count; i++) {
    const id = from + i
    if (used.has(id)) throw new Error(`[error] ID 段与现存冲突: ${id}（可显式指定起点避让）`)
    ids.push(id)
  }
  return ids
}

// ============ 1. 悬浮页纯添加（轮24：3 条单条族） ============

export interface FloatingPageCreateOptions {
  /** 三条记录 ID（缺省=尾段连续分配） */
  ids?: { entity: number; container: number; closeButton: number }
  /** 实体名（缺省=donor 默认「悬浮交互页」） */
  name?: string
  /** 实体物理锚点覆盖：插到该记录之后（缺省=库容器簇物理末端，轮24 规则） */
  insertAfterId?: number
  /** 容器+关闭按钮物理锚点覆盖（缺省=最后 parentless 容器簇物理末端） */
  containerInsertAfterId?: number
  /** 顶层索引锚点覆盖（缺省=锚容器索引项之后；无锚=索引尾追加） */
  indexAfterId?: number
}

export interface FloatingPageCreateResult {
  bytes: Uint8Array
  entityId: number
  containerId: number
  closeButtonId: number
  /** 库容器 1840 追加后的成员列表 */
  libraryMemberIds: number[]
}

export function createFloatingPageCandidate(
  sourceBytes: Uint8Array,
  options: FloatingPageCreateOptions = {}
): FloatingPageCreateResult {
  const parsed = parseRoot9(sourceBytes)
  if (!parsed.recordsById.has(LIBRARY_CONTAINER_ID)) {
    throw new Error(`[error] 控件组库容器 ${LIBRARY_CONTAINER_ID} 不存在（悬浮页放置面缺失）`)
  }
  // placement（DESIGN §1.2）：floating-page 仅 library 面；布局内放置=fail-closed
  const ids =
    options.ids ??
    (() => {
      const run = allocateConsecutive(parsed, 3)
      return { entity: run[0], container: run[1], closeButton: run[2] }
    })()
  const entityDonor = floatingPageDonor('entity')
  const containerDonor = floatingPageDonor('builtin-container')
  const closeDonor = floatingPageDonor('close-button')

  // 交叉重映射：实体 t42 引用容器 donor ID；容器 f503 members 引用关闭按钮 donor ID
  let entityRaw = remapUiRecordVarints(Buffer.from(entityDonor.hex, 'hex'), {
    [entityDonor.selfId]: ids.entity,
    [containerDonor.selfId]: ids.container
  })
  if (options.name !== undefined) entityRaw = setUiControlName(entityRaw, options.name)
  const containerRaw = remapUiRecordVarints(Buffer.from(containerDonor.hex, 'hex'), {
    [containerDonor.selfId]: ids.container,
    [closeDonor.selfId]: ids.closeButton
  })
  const closeRaw = remapUiRecordVarints(Buffer.from(closeDonor.hex, 'hex'), {
    [closeDonor.selfId]: ids.closeButton,
    [closeDonor.parentId!]: ids.container
  })

  let libraryMemberIds: number[] = []
  const bytes = withSection(sourceBytes, (section, parsed) => {
    appendMemberId(section, LIBRARY_CONTAINER_ID, ids.entity)
    // 插入位=归属簇物理末端（轮24 规则）：
    //   实体（库容器子记录）→ 库容器簇末；容器+关闭按钮 → 最后 parentless 容器簇末
    const entityAnchor =
      options.insertAfterId ?? clusterEndId(parsed, LIBRARY_CONTAINER_ID)
    insertRecords(section, [entityRaw], entityAnchor)
    const containerAnchor =
      options.containerInsertAfterId ??
      (() => {
        const anchor = containerClusterRootId(parsed)
        return anchor !== undefined ? clusterEndId(parsed, anchor) : undefined
      })()
    insertRecords(section, [containerRaw, closeRaw], containerAnchor)
    // 固有容器为 parentless 顶层记录 → 入索引，位置=锚容器索引项之后（物理序==索引序）
    const indexAnchor =
      options.indexAfterId ??
      (() => {
        const anchor = containerClusterRootId(parsed)
        return anchor !== undefined && parsed.indexIds.has(anchor) ? anchor : undefined
      })()
    insertIntoIndex(section, ids.container, indexAnchor)
    const library = parsed.recordsById.get(LIBRARY_CONTAINER_ID)
    const beforeMembers = library?.fields.find((f) => f.number === 503 && f.wire === 2)
    libraryMemberIds = [
      ...(beforeMembers ? packedVarints(beforeMembers.value as Uint8Array) : []),
      ids.entity
    ]
  })
  return {
    bytes,
    entityId: ids.entity,
    containerId: ids.container,
    closeButtonId: ids.closeButton,
    libraryMemberIds
  }
}

// ============ 2. 新增页面容器（轮33） ============

export interface PageContainerAddOptions {
  /** 悬浮页实体 ID（实例侧） */
  pageId: number
  /** 新容器 ID（缺省=尾段接续分配） */
  containerId?: number
  /** 初始生效（缺省 true=donor 出生形态；false=克隆后移除标记） */
  active?: boolean
  insertAfterId?: number
  indexAfterId?: number
}

export interface PageContainerAddResult {
  bytes: Uint8Array
  containerId: number
  active: boolean
  /** 实体 t42 引用列表（追加后） */
  pageContainerRefs: number[]
}

export function addPageContainerCandidate(
  sourceBytes: Uint8Array,
  options: PageContainerAddOptions
): PageContainerAddResult {
  const parsed = parseRoot9(sourceBytes)
  const page = parsed.recordsById.get(options.pageId)
  if (!page) throw new Error(`[error] 悬浮页实体不存在: ${options.pageId}`)
  if (page.kind !== 'floating-page') {
    throw new Error(`[error] ${options.pageId} 不是悬浮页实体（kind=${page.kind}）`)
  }
  const containerId = options.containerId ?? allocateConsecutive(parsed, 1)[0]
  const donor = floatingPageDonor('page-container')
  let containerRaw = remapUiRecordVarints(Buffer.from(donor.hex, 'hex'), {
    [donor.selfId]: containerId
  })
  const active = options.active ?? true
  if (!active) {
    const donorRaw = Buffer.from(donor.hex, 'hex')
    const donorFields = parseWireMessage(donorRaw)
    const donorName = recordNameOf(donorFields, donorRaw)
    if (!donorName) throw new Error('[error] page-container donor 无名字（标记定位失败）')
    containerRaw = applyContainerActive(containerRaw, false, donorName)
  }

  let pageContainerRefs: number[] = []
  const bytes = withSection(sourceBytes, (section, parsed) => {
    const pageField = section.find((f) => ownIdOf(f) === options.pageId)
    if (!pageField) throw new Error(`[error] 悬浮页实体字段未找到: ${options.pageId}`)
    pageField.value = appendContainerRef(pageField.value as Uint8Array, containerId)
    pageContainerRefs = extractContainerRefs(
      parseWireMessage(pageField.value as Uint8Array) ?? []
    )
    // 新 parentless 容器插在最后 parentless 容器簇物理末端（轮33 规则；与 create 同一规则）
    const containerAnchor =
      options.insertAfterId ??
      (() => {
        const anchor = containerClusterRootId(parsed)
        return anchor !== undefined ? clusterEndId(parsed, anchor) : undefined
      })()
    insertRecords(section, [containerRaw], containerAnchor)
    const indexAnchor =
      options.indexAfterId ??
      (() => {
        const anchor = containerClusterRootId(parsed)
        return anchor !== undefined && parsed.indexIds.has(anchor) ? anchor : undefined
      })()
    insertIntoIndex(section, containerId, indexAnchor)
  })
  return { bytes, containerId, active, pageContainerRefs }
}

/** 实体记录 t42（f503.f36.f501 packed）容器引用追加 */
function appendContainerRef(recordRaw: Uint8Array, containerId: number): Uint8Array {
  const fields = parseWireMessage(recordRaw)
  if (!fields) throw new Error('[error] 实体记录解析失败')
  const comp42 = findComponent(fields, 42)
  if (!comp42) throw new Error('[error] 悬浮页实体缺 t42 组件（容器引用列表）——fail-closed')
  const f503 = comp42.find((x) => x.number === 503 && x.wire === 2)
  const f503m = f503 ? parseWireMessage(f503.value as Uint8Array) : undefined
  const f36 = f503m?.find((x) => x.number === 36 && x.wire === 2)
  const f36m = f36 ? parseWireMessage(f36.value as Uint8Array) : undefined
  const f501 = f36m?.find((x) => x.number === 501 && x.wire === 2)
  if (!f501) throw new Error('[error] t42.f503.f36.f501 容器引用 packed 缺失——fail-closed')
  const ids = packedVarints(f501.value as Uint8Array)
  if (ids.includes(containerId)) throw new Error(`[error] 实体 t42 已引用容器 ${containerId}`)
  ids.push(containerId)
  f501.value = encodePacked(ids)
  f36!.value = emitWireMessage(f36m!)
  f503!.value = emitWireMessage(f503m!)
  // 回写到记录顶层 t42 组件槽
  for (const f of fields) {
    if (f.number !== 505 || f.wire !== 2) continue
    const comp = parseWireMessage(f.value as Uint8Array)
    if (!comp) continue
    if (comp.find((x) => x.number === 502 && x.wire === 0)?.value !== 42) continue
    comp.forEach((x) => {
      if (x.number === 503) x.value = f503!.value
    })
    f.value = emitWireMessage(comp)
    return emitWireMessage(fields)
  }
  throw new Error('[error] t42 组件槽回写失败（unreachable）')
}

// ============ 3. 容器初始生效标记（轮48/49 双向） ============

export interface ContainerActiveOptions {
  containerId: number
  active: boolean
}

export interface ContainerActiveResult {
  bytes: Uint8Array
  containerId: number
  active: boolean
}

/**
 * 容器初始生效 = 容器名字（UTF-8）后紧跟的 f502 varint=1（b0 1f 01）增删（轮48/49）。
 * 名字不在 comp15 路径（轮48 观察），标记位置以「与名字同层的下一个字段」定位——
 * 定位失败一律 fail-closed（不猜层级）。
 */
export function setContainerActiveCandidate(
  sourceBytes: Uint8Array,
  options: ContainerActiveOptions
): ContainerActiveResult {
  const parsed = parseRoot9(sourceBytes)
  const container = parsed.recordsById.get(options.containerId)
  if (!container) throw new Error(`[error] 容器记录不存在: ${options.containerId}`)
  if (container.kind !== 'container' && container.kind !== 'asset-group') {
    throw new Error(`[error] ${options.containerId} 不是容器记录（kind=${container.kind}）`)
  }
  if (!container.name) throw new Error(`[error] 容器 ${options.containerId} 无名字（标记定位依赖名字）`)
  const bytes = withSection(sourceBytes, (section) => {
    const field = section.find((f) => ownIdOf(f) === options.containerId)
    if (!field) throw new Error(`[error] 容器字段未找到: ${options.containerId}`)
    field.value = applyContainerActive(field.value as Uint8Array, options.active, container.name)
  })
  return { bytes, containerId: options.containerId, active: options.active }
}

/** 名字同层下一字段 = 标记；active=on 增 / off 删；已处于目标态则原样返回 */
function applyContainerActive(
  recordRaw: Uint8Array,
  active: boolean,
  name: string
): Uint8Array {
  const fields = parseWireMessage(recordRaw)
  if (!fields) throw new Error('[error] 容器记录解析失败')
  const patched = toggleMarkAfterName(fields, active, name)
  if (patched) return emitWireMessage(patched)
  throw new Error(
    `[error] 容器初始生效标记定位失败（名字「${name}」后未找到 b01f01 结构）——fail-closed`
  )
}

/** 递归查找名字 UTF-8 字段并在其后增删 {f502=1}；返回改后的字段列表（未命中=null） */
function toggleMarkAfterName(
  fields: WireField[],
  active: boolean,
  name: string
): WireField[] | null {
  const nameBytes = Buffer.from(name, 'utf8')
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]
    if (
      f.wire === 2 &&
      f.value instanceof Uint8Array &&
      Buffer.from(f.value).equals(nameBytes)
    ) {
      const next = fields[i + 1]
      const isMark =
        next !== undefined && next.number === 502 && next.wire === 0 && next.value === 1
      if (active) {
        if (isMark) return fields
        fields.splice(i + 1, 0, w0(502, 1))
        return fields
      }
      if (isMark) {
        fields.splice(i + 1, 1)
        return fields
      }
      return fields
    }
    if (f.wire === 2 && f.value instanceof Uint8Array) {
      const inner = parseWireMessage(f.value)
      if (inner) {
        const patched = toggleMarkAfterName(inner, active, name)
        if (patched) {
          f.value = emitWireMessage(patched)
          return fields
        }
      }
    }
  }
  return null
}

// ============ 4. 形式变量追加（轮3；t41.f503.f34.f501 条目） ============

export interface PageVariableAddOptions {
  pageId: number
  name: string
  type: PageVariableType
}

export interface PageVariableAddResult {
  bytes: Uint8Array
  pageId: number
  variable: { name: string; type: PageVariableType; seq: number }
}

export function addPageVariableCandidate(
  sourceBytes: Uint8Array,
  options: PageVariableAddOptions
): PageVariableAddResult {
  const parsed = parseRoot9(sourceBytes)
  const page = parsed.recordsById.get(options.pageId)
  if (!page) throw new Error(`[error] 悬浮页实体不存在: ${options.pageId}`)
  if (page.kind !== 'floating-page') {
    throw new Error(`[error] ${options.pageId} 不是悬浮页实体（kind=${page.kind}）`)
  }
  let resultSeq = 0
  const bytes = withSection(sourceBytes, (section) => {
    const pageField = section.find((f) => ownIdOf(f) === options.pageId)
    if (!pageField) throw new Error(`[error] 悬浮页实体字段未找到: ${options.pageId}`)
    const patched = appendFormVariable(pageField.value as Uint8Array, options)
    pageField.value = patched.raw
    resultSeq = patched.seq
  })
  return {
    bytes,
    pageId: options.pageId,
    variable: { name: options.name, type: options.type, seq: resultSeq }
  }
}

/** t41 形式变量条目追加（f503.f34 内重复 f501 条目 = {f501:类型, f502:名字, f503:序号}）；
 * 返回改后记录字节与新条目序号（既有条目数 + 1；轮3 样本首条序号 1）。t41 组件缺失时按
 * 通用组件骨架新建 {f502:41, f503:{f34:[entry]}}（重放对拍核验；对拍失败即修正，不静默）。 */
function appendFormVariable(
  recordRaw: Uint8Array,
  options: PageVariableAddOptions
): { raw: Uint8Array; seq: number } {
  const fields = parseWireMessage(recordRaw)
  if (!fields) throw new Error('[error] 实体记录解析失败')
  const typeCode = PAGE_VARIABLE_TYPE_CODES[options.type]
  const nameBytes = Buffer.from(options.name, 'utf8')
  // 轮3 铁证：类型 0（int）省略 f501（proto3 默认值省略）；条目字段升序 {f501?, f502, f503}
  const buildEntry = (seq: number): WireField =>
    w2(
      501,
      emitWireMessage([
        ...(typeCode !== 0 ? [w0(501, typeCode)] : []),
        w2(502, new Uint8Array(nameBytes)),
        w0(503, seq)
      ])
    )
  for (const f of fields) {
    if (f.number !== 505 || f.wire !== 2) continue
    const comp = parseWireMessage(f.value as Uint8Array)
    if (!comp) continue
    if (comp.find((x) => x.number === 502 && x.wire === 0)?.value !== 41) continue
    const f503 = comp.find((x) => x.number === 503 && x.wire === 2)
    if (!f503) throw new Error('[error] t41 组件缺 f503 配置——fail-closed')
    const f503m = parseWireMessage(f503.value as Uint8Array)!
    const f34 = f503m.find((x) => x.number === 34 && x.wire === 2)
    let seq: number
    if (f34) {
      const f34m = parseWireMessage(f34.value as Uint8Array)!
      const entries = f34m.filter((x) => x.number === 501 && x.wire === 2)
      seq = entries.length + 1
      f34m.push(buildEntry(seq))
      f34.value = emitWireMessage(f34m)
    } else {
      seq = 1
      f503m.push(w2(34, emitWireMessage([buildEntry(seq)])))
    }
    f503.value = emitWireMessage(f503m)
    f.value = emitWireMessage(comp)
    return { raw: emitWireMessage(fields), seq }
  }
  // t41 组件缺失：新建组件槽（f502=41 + f503.f34 条目）
  fields.push(
    w2(
      505,
      emitWireMessage([
        w0(502, 41),
        w2(503, emitWireMessage([w2(34, emitWireMessage([buildEntry(1)]))]))
      ])
    )
  )
  return { raw: emitWireMessage(fields), seq: 1 }
}
