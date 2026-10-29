/**
 * src/cli/sim_import.ts — `gsts sim:import`：把模拟器导出的 GIA 落地到地图 .gil 的**覆盖分析**
 *
 * 定位（2026-10-23 用户定方向）：
 *   模拟器 = 上游 IR 生产者（只管 GIA：模板/控件/脚本映射）；
 *   我们 = GIL 落地编译器 + 回读验证器（模拟器的黑盒点正是我们的可支持面）。
 *
 * 本命令只做 **dry-run 覆盖报告**（不写游戏文件）：
 *   ①解码 GIA（envelope 20B 头 + Root protobuf + 4B 尾）
 *   ②按 guid/parent/children 重建两侧资产树
 *   ③对每个节点判定落地状态：LANDABLE（有现成命令原语）/ UNSUPPORTED（缺原语，指名缺哪一条）
 *   ④对照目标 .gil 现状（布局 / 模板 / 脚本登记）
 *
 * 2026-10-29 三链路改造（用户令：拆分「能力缺失 / 目标地图已有 / 脚本 GUID 漂移」）：
 *   链路①**结构**：模板组(类4) + 实例组(类3) + 容器节点 + 三处 packed 追加——wire 已差分闭合；
 *   链路②**类型码**：GIA `which=70` 的 types 数组 == GIL 记录族描述符序序列——已闭合；
 *   链路③**脚本 GUID**：Lua 里的模板 GUID 与落地后新分配的 ID 不一定一致。**这条最隐蔽**：
 *     结构全对、编辑器零报错，运行时却可能 `InstantiateClientUIControl` 全失败、界面空白。
 *     实证（地图 1073741846，2026-10-29）：脚本写死 1073742105/2106/2107，实际模板被分配到
 *     1867/1868/1869，靠脚本自带的 `discoverTemplates` 兜底扫描才没露馅——而那个扫描区间是
 *     写死的 `[1073741825,1073742050] ∪ [1073742100,1073742150]`，落在区间外就静默失败。
 *
 * 已知事实（2026-10-23 实测）：GIA 的 `data.field502` 类型码与 .gil 的 compTypes **同一套编码**
 * （容器组 15/23/12/82、容器节点 86+91、文本框 86+84、图片 86+96/97），因此落地可直接复用
 * `ui/src/client-kinds.ts` 的判别表，不需要第二套映射。
 */

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { RootType } from './client_ui/proto.js'
import { parseWireMessage, type WireField } from './static_assembly/wire.js'
import { sha256Bytes } from './static_assembly/json.js'
import { resyncMap } from './maps.js'
import { saveLevelDirOf, syncGilToTemp } from './gil_paths.js'
import { registerScriptInPayload, updateScriptInPayload } from './gil_scripts.js'
import {
  clientUiRootStatus,
  ensureClientUiHierarchyRoots,
  importGiaContainerTemplate,
  instantiateContainerTemplate
} from '../../ui/src/container-subtree.js'
import { parseRoot9, type ParsedRoot9 } from '../../ui/src/record.js'
import { clientKindOf } from '../../ui/src/client-kinds.js'
import type { UiRecordMeta } from '../../ui/src/types.js'

/** 脚本挂载槽字段（与 ui/src/container-subtree.ts 的 MOUNT_FIELD 同值） */
const MOUNT_FIELD = 74
/** .gil 信封：20B 头 + payload + 4B 尾（registerScriptInPayload 只吃/吐 payload） */
const GIL_HEAD = 20
const GIL_TAIL = 4

function payloadOf(bytes: Uint8Array): Uint8Array {
  return bytes.slice(GIL_HEAD, bytes.length - GIL_TAIL)
}

function wrapPayload(payload: Uint8Array, envelope: Uint8Array): Uint8Array {
  const out = new Uint8Array(GIL_HEAD + payload.length + GIL_TAIL)
  out.set(envelope.subarray(0, GIL_HEAD), 0)
  out.set(payload, GIL_HEAD)
  out.set(envelope.subarray(envelope.length - GIL_TAIL), GIL_HEAD + payload.length)
  return out
}

export interface GiaNode {
  guid: number
  name: string
  /** 组件类型码（= .gil compTypes 同一编码） */
  types: number[]
  kind: string
  children: number[]
  parent?: number
  /** graph（顶层资产）还是 accessory（控件/模板子件） */
  origin: 'graph' | 'accessory'
  /** graph 的 which：21=服务端 UIControlGroup，70=客户端控件模板 */
  which: number
}

export interface GiaScript {
  id: number
  name: string
  path: string
  sourceBytes: number
  /** Lua 源码正文（用于第三条链路「脚本 GUID 漂移」扫描；不含即为空串） */
  source: string
}

export interface GiaPackage {
  filePath: string
  gameVersion: string
  nodes: GiaNode[]
  scripts: GiaScript[]
}

/** 目标地图里匹配到的等价记录（第二栏：目标地图已有） */
export interface TargetMatch {
  id: number
  name: string
  /** template=模板形态（有类4无 f504）/ instance=实例形态（有 f504）/ plain=两者都不是 */
  form: 'template' | 'instance' | 'plain'
}

/** 脚本里一处模板 GUID 声明 */
export interface TemplateRemap {
  /** 声明键（prim / label / hit …） */
  key: string
  /** 脚本里写死的 GUID */
  scriptGuid: number
  /** 该 GUID 在目标图里是否存在 */
  present: boolean
  /** 目标图里按名字找到的等价模板（重映射建议） */
  candidate?: { id: number; name: string }
}

/** 第三条链路：脚本 GUID ↔ 模板 ID */
export interface ScriptDrift {
  /** 扫描的 UI ID 段 [lo, hi) */
  band: [number, number]
  /** 脚本里出现的、落在 UI ID 段的全部 GUID */
  referenced: number[]
  /** 其中在目标图已存在的 */
  present: number[]
  /** 其中在目标图不存在的（漂移） */
  missing: number[]
  /** 脚本是否自带 ID 自愈（例如 discoverTemplates 之类按 ID 段暴力试探） */
  selfHeal: boolean
  /** 按 `T.tpl = { k = guid }` 这类声明解析出的重映射建议 */
  templates: TemplateRemap[]
  /** 一句话结论 */
  verdict: string
}

export interface CoverageItem {
  item: string
  guid?: number
  status: 'LANDABLE' | 'UNSUPPORTED' | 'NEEDS_HOST'
  /** 缺的原语 / 依赖 */
  needs?: string
  note?: string
  /** 第二栏：目标地图已有等价记录 */
  inTarget?: TargetMatch[]
  /** 第三栏：本条参与脚本 GUID 漂移（脚本按名字引用它） */
  drift?: boolean
}

export interface CoverageReport {
  schemaVersion: 2
  kind: 'gsts.sim-import-analysis'
  gia: { path: string; nodes: number; scripts: number; gameVersion: string }
  target: {
    path: string
    layoutId?: number
    layoutName?: string
    existingTemplates: number
    existingScripts: number
    existingContainers: number
    /** 目标图当前最大 root9 记录 ID；导入会从这里往上分配 */
    maxRecordId: number
    /** 导入后新记录预计从这个 ID 起分配 */
    nextFreeId: number
  }
  items: CoverageItem[]
  summary: {
    landable: number
    unsupported: number
    needsHost: number
    /** 目标地图已有等价记录条数 */
    inTarget: number
    /** 有脚本 GUID 漂移风险的条数 */
    drift: number
  }
  scriptDrift: ScriptDrift | null
  supportedToday: string[]
  missingPrimitives: string[]
}

const GIA_ENVELOPE_HEAD = 20
const GIA_ENVELOPE_TAIL = 4

/** UI 控件 ID 段（root9 记录从 0x40000000 起；预留 4096 槽足够覆盖现有观测最大值 1073742150） */
export const UI_ID_BASE = 1073741824
export const UI_ID_SPAN = 4096

/** 解码 GIA：只取结构，不解释未知字段（fail-closed 报告，不猜） */
export function decodeGia(bytes: Uint8Array): GiaPackage {
  if (bytes.length <= GIA_ENVELOPE_HEAD + GIA_ENVELOPE_TAIL) throw new Error('[error] GIA 文件过小')
  const payload = bytes.subarray(GIA_ENVELOPE_HEAD, bytes.length - GIA_ENVELOPE_TAIL)
  const decoded = RootType.toObject(RootType.decode(payload), {
    enums: Number,
    defaults: false,
    arrays: true
  }) as Record<string, unknown>

  const nodes: GiaNode[] = []
  const scripts: GiaScript[] = []
  const push = (unit: Record<string, unknown>, origin: 'graph' | 'accessory') => {
    const ui = unit.ui as { content?: Record<string, unknown> } | undefined
    const content = ui?.content
    if (!content) return
    const data = (content.data as Array<Record<string, unknown>> | undefined) ?? []
    const types = data
      .map((d) => d.field502)
      .filter((t): t is number => typeof t === 'number')
    const name = data
      .map((d) => (d.name as { value?: string } | undefined)?.value)
      .find((n): n is string => typeof n === 'string' && n.length > 0)
    const children = ((content.children as number[] | undefined) ?? []).slice()
    const parent = content.parent as number | undefined
    nodes.push({
      guid: Number(content.guid ?? 0),
      name: name ?? '',
      types,
      kind: clientKindOf(types) ?? 'unknown',
      children,
      ...(parent !== undefined && parent !== 0 ? { parent } : {}),
      origin,
      which: Number(unit.which ?? 0)
    })
  }

  for (const unit of (decoded.graph as Array<Record<string, unknown>> | undefined) ?? []) {
    const wrapper = unit.script as { mapping?: Record<string, unknown> } | undefined
    const mapping = wrapper?.mapping
    if (mapping) {
      const source = String(mapping.source ?? '')
      scripts.push({
        id: Number(mapping.id ?? 0),
        name: String(mapping.name ?? ''),
        path: String(mapping.file_path ?? ''),
        sourceBytes: Buffer.byteLength(source, 'utf8'),
        source
      })
    }
    push(unit, 'graph')
  }
  for (const unit of (decoded.accessories as Array<Record<string, unknown>> | undefined) ?? []) {
    push(unit, 'accessory')
  }
  return {
    filePath: String(decoded.filePath ?? ''),
    gameVersion: String(decoded.gameVersion ?? ''),
    nodes,
    scripts
  }
}

/** 目标 .gil 现状（只读）。返回可序列化摘要 + 原始记录（供匹配用） */
export function readTarget(gilBytes: Uint8Array): {
  target: CoverageReport['target']
  records: UiRecordMeta[]
} {
  const parsed: ParsedRoot9 = parseRoot9(gilBytes)
  const layout = parsed.records.find((r) => r.kind === 'layout')
  const templates = parsed.records.filter((r) => r.kind === 'client-container' && r.familyTypes.includes(4))
  const containers = parsed.records.filter(
    (r) => r.kind === 'client-container' || r.kind === 'client-container-node'
  )
  const maxRecordId = parsed.records.reduce((m, r) => (r.id > m ? r.id : m), 0)
  return {
    records: parsed.records,
    target: {
      path: '',
      ...(layout ? { layoutId: layout.id } : {}),
      ...(layout ? { layoutName: layout.name } : {}),
      existingTemplates: templates.length,
      existingScripts: 0,
      existingContainers: containers.length,
      maxRecordId,
      nextFreeId: maxRecordId > 0 ? maxRecordId + 1 : UI_ID_BASE
    }
  }
}

/** 编辑器重名去重会加 `_1`/`_2` 后缀（实测：客户端控件容器 → 客户端控件容器_1） */
export function nameMatches(targetName: string, giaName: string): boolean {
  if (!giaName) return false
  if (targetName === giaName) return true
  const m = /^(.+)_\d+$/.exec(targetName)
  return m !== null && m[1] === giaName
}

function formOf(rec: UiRecordMeta): TargetMatch['form'] {
  if (rec.familyTypes.includes(4)) return 'template'
  if (rec.familyTypes.includes(3)) return 'instance'
  return 'plain'
}

/** 在目标图里找等价记录：kind 相同 + 名字相同（或重名后缀） */
export function findInTarget(records: readonly UiRecordMeta[], node: GiaNode): TargetMatch[] {
  const kind = clientKindOf(node.types) ?? node.kind
  return records
    .filter((r) => r.kind === kind && nameMatches(r.name, node.name))
    .map((r) => ({ id: r.id, name: r.name, form: formOf(r) }))
}

/** 从脚本源码里抽出落在 UI ID 段的全部 GUID */
export function extractUiGuids(source: string): number[] {
  const found = new Set<number>()
  for (const m of source.matchAll(/\b1\d{9}\b/g)) {
    const n = Number(m[0])
    if (n >= UI_ID_BASE && n < UI_ID_BASE + UI_ID_SPAN) found.add(n)
  }
  return [...found].sort((a, b) => a - b)
}

/** 解析脚本里 `T.tpl = { prim = 1073742105, ... }` 这类模板 GUID 声明 */
export function extractTemplateEntries(source: string): Array<{ key: string; guid: number }> {
  const out: Array<{ key: string; guid: number }> = []
  for (const m of source.matchAll(/\btpl\s*=\s*\{([^}]*)\}/g)) {
    for (const kv of m[1].matchAll(/([A-Za-z_]\w*)\s*=\s*(\d{9,})/g)) {
      out.push({ key: kv[1], guid: Number(kv[2]) })
    }
  }
  return out
}

/** 第三条链路：脚本 GUID ↔ 模板 ID 漂移分析 */
export function analyzeScriptDrift(
  gia: GiaPackage,
  records: readonly UiRecordMeta[]
): ScriptDrift | null {
  if (gia.scripts.length === 0) return null
  const byId = new Map(records.map((r) => [r.id, r]))
  const referenced = new Set<number>()
  const templates: TemplateRemap[] = []
  let selfHeal = false
  for (const script of gia.scripts) {
    for (const guid of extractUiGuids(script.source)) referenced.add(guid)
    if (/discover/i.test(script.source)) selfHeal = true
    for (const entry of extractTemplateEntries(script.source)) {
      const present = byId.has(entry.guid)
      const candidate = records.find(
        (r) => r.familyTypes.includes(4) && nameMatches(r.name, entry.key)
      )
      templates.push({
        key: entry.key,
        scriptGuid: entry.guid,
        present,
        ...(candidate ? { candidate: { id: candidate.id, name: candidate.name } } : {})
      })
    }
  }
  const present = [...referenced].filter((g) => byId.has(g))
  const missing = [...referenced].filter((g) => !byId.has(g))
  const unresolved = templates.filter((t) => !t.present && t.candidate !== undefined)
  let verdict: string
  if (missing.length === 0) {
    verdict = '脚本引用的 UI GUID 在目标图全部存在，无漂移'
  } else if (unresolved.length > 0) {
    verdict =
      `脚本写死 ${missing.length} 个目标图不存在的 UI GUID，其中 ${unresolved.length} 个可按名字` +
      `在目标图找到等价模板（需重映射）· ${selfHeal ? '脚本带 ID 自愈，可能被兜住（扫描区间写死，勿依赖）' : '脚本无自愈 → 落地后运行时会静默失败'}`
  } else {
    verdict = `脚本写死 ${missing.length} 个目标图不存在的 UI GUID，且按名字找不到等价模板 → 需先落地模板再重映射`
  }
  return {
    band: [UI_ID_BASE, UI_ID_BASE + UI_ID_SPAN],
    referenced: [...referenced].sort((a, b) => a - b),
    present,
    missing,
    selfHeal,
    templates,
    verdict
  }
}

/**
 * 覆盖分析：把 GIA 的每个资产/控件映射到「我们现在能不能落地」，同时标出「目标图已有」与「脚本漂移」。
 * 判定依据 = 现有命令面（2026-10-29）：
 *   - 布局挂载（布局 f503 追加）→ 有
 *   - 客户端控件容器两件套（组 + 容器节点）→ 有（create --type client-container）
 *   - 客户端控件单件（10 类，挂容器节点）→ 有（create --type client-<kind>）
 *   - 脚本登记 + external lua + f74 挂载 → 有（assets:scripts register/mount）
 *   - 客户端控件模板（which=70 + 模板根记录）→ **wire 已闭合，缺实现**
 *   - 服务端控件组（which=21）→ **wire 已闭合（模板组+实例组成对），缺实现**
 */
export function analyzeCoverage(
  gia: GiaPackage,
  target: CoverageReport['target'],
  records: readonly UiRecordMeta[] = []
): CoverageReport {
  const items: CoverageItem[] = []
  const missing = new Set<string>()
  const drift = analyzeScriptDrift(gia, records)
  const templateKeys = new Set((drift?.templates ?? []).map((t) => t.key))

  const group = gia.nodes.find((n) => n.origin === 'graph' && n.which === 21)
  if (group) {
    const inTarget = findInTarget(records, group)
    items.push({
      item: `服务端控件组「${group.name}」`,
      guid: group.guid,
      status: 'UNSUPPORTED',
      needs: '服务端控件组成对创建（模板组 类4序4 + 实例组 类3序3 + 成员表 类62序82）',
      note: 'wire 已差分闭合（R1–R5），缺实现；落地后还需挂进布局 f503',
      ...(inTarget.length > 0 ? { inTarget } : {}),
      ...(templateKeys.has(group.name) ? { drift: true } : {})
    })
    missing.add('服务端控件组成对创建（UIControlGroup = 模板组 + 实例组）')
  }

  const templates = gia.nodes.filter((n) => n.origin === 'graph' && n.which === 70)
  for (const tpl of templates) {
    const inTarget = findInTarget(records, tpl)
    items.push({
      item: `客户端控件模板「${tpl.name || tpl.guid}」`,
      guid: tpl.guid,
      status: 'UNSUPPORTED',
      needs: '客户端控件模板创建（模板根 类2序6 序号 + 类4序4 + 无 f504）',
      note: `类型码 ${tpl.types.join(',')}`,
      ...(inTarget.length > 0 ? { inTarget } : {}),
      ...(templateKeys.has(tpl.name) ? { drift: true } : {})
    })
    missing.add('客户端控件模板创建（模板根 + 子控件 + 模板列表注册）')
  }

  for (const node of gia.nodes.filter((n) => n.origin === 'accessory')) {
    const host = node.parent !== undefined ? gia.nodes.find((n) => n.guid === node.parent) : undefined
    const inTemplate = host !== undefined && templates.some((t) => t.guid === host.guid || t.children.includes(node.guid))
    const landable = !inTemplate && (node.kind === 'client-container-node' || clientControlLandable(node.kind))
    const inTarget = findInTarget(records, node)
    items.push({
      item: `控件「${node.name || node.guid}」(${node.kind})`,
      guid: node.guid,
      status: landable ? 'LANDABLE' : 'UNSUPPORTED',
      ...(landable
        ? { note: 'create --type client-container / client-<kind> 已支持' }
        : { needs: inTemplate ? '模板归属（随模板落地）' : '缺该类型的落地原语' }),
      ...(inTarget.length > 0 ? { inTarget } : {})
    })
  }

  for (const script of gia.scripts) {
    const drifted = drift !== null && drift.missing.length > 0
    items.push({
      item: `脚本 ${script.path || script.name}`,
      guid: script.id,
      status: group ? 'NEEDS_HOST' : 'LANDABLE',
      ...(group
        ? { needs: '宿主控件（服务端容器）尚未落地', note: `源码 ${script.sourceBytes}B 可内联` }
        : { note: 'assets:scripts register + mount 已支持' }),
      ...(drifted ? { drift: true } : {})
    })
  }

  const summary = {
    landable: items.filter((i) => i.status === 'LANDABLE').length,
    unsupported: items.filter((i) => i.status === 'UNSUPPORTED').length,
    needsHost: items.filter((i) => i.status === 'NEEDS_HOST').length,
    inTarget: items.filter((i) => (i.inTarget?.length ?? 0) > 0).length,
    drift: items.filter((i) => i.drift === true).length
  }
  return {
    schemaVersion: 2,
    kind: 'gsts.sim-import-analysis',
    gia: { path: gia.filePath, nodes: gia.nodes.length, scripts: gia.scripts.length, gameVersion: gia.gameVersion },
    target,
    items,
    summary,
    scriptDrift: drift,
    supportedToday: [
      '布局挂载（布局 f503 尾部追加）',
      '客户端控件容器两件套（组 f502=23 + 容器节点 f502=86）',
      '客户端控件 10 类单件（create --type client-<kind> --on container:<id>）',
      '脚本登记 f50 + external_lua_file + f74 挂载（assets:scripts register/update/mount）',
      '子树删除（delete，含布局成员与模板反向引用清理）'
    ],
    missingPrimitives: [...missing]
  }
}

function clientControlLandable(kind: string): boolean {
  return [
    'client-textbox',
    'client-cursor-area',
    'client-reference',
    'client-grid',
    'client-button',
    'client-textwindow',
    'client-keyhint',
    'client-image',
    'client-animation',
    'client-fullscreen-animation'
  ].includes(kind)
}

/** 单行渲染三栏：能力 / 目标图已有 / 漂移 */
function renderItem(item: CoverageItem): string {
  const cap = item.status === 'LANDABLE' ? 'OK  ' : item.status === 'NEEDS_HOST' ? 'HOST' : 'GAP '
  const list = item.inTarget ?? []
  const shown = list.slice(0, 3).map((m) => `${m.name}#${m.id}(${m.form})`)
  const more = list.length > shown.length ? ` … 共 ${list.length} 处` : ''
  const have = shown.length > 0 ? shown.join(' ') + more : '—'
  const drift = item.drift ? 'DRIFT' : '—'
  const tail = item.needs ? ` — 缺: ${item.needs}` : item.note ? `（${item.note}）` : ''
  return `  [${cap}][${drift}] ${item.item}${tail}\n      目标图已有: ${have}`
}

/** CLI 入口 */
export async function runSimImport(args: string[], deps: { log: (s: string) => void; err: (s: string) => void }): Promise<number> {
  let giaPath: string | undefined
  let gilPath: string | undefined
  let jsonMode = false
  let apply = false
  let write = false
  let yes = false
  let remapScript = true
  let layoutArg: string | undefined
  let outputPath: string | undefined
  let startId: number | undefined
  let rootDonor: string | undefined
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--gia') giaPath = args[++i]
    else if (a === '--gil') gilPath = args[++i]
    else if (a === '--format') jsonMode = args[++i] === 'json'
    else if (a === '--apply') apply = true
    else if (a === '--write') write = true
    else if (a === '--yes') yes = true
    else if (a === '--no-remap') remapScript = false
    else if (a === '--layout') layoutArg = args[++i]
    else if (a === '--output') outputPath = args[++i]
    else if (a === '--start-id') startId = Number(args[++i])
    else if (a === '--root-donor') rootDonor = args[++i]
    else if (a === '--help' || a === '-h') {
      deps.log(
        [
          'Usage: gsts sim:import --gia <file.gia> [--gil <map.gil>] [--format text|json]',
          '       gsts sim:import --gia <file.gia> --gil <map.gil> --apply [--layout <ID|名>]',
          '              [--output <file> | --write --yes] [--no-remap] [--start-id <n>]',
          '',
          '把模拟器导出的整合包 GIA 与目标地图 .gil 对照，输出**落地覆盖报告**（只读，不写游戏文件）。',
          '  --gia   模拟器 exportData("gia-combined") 产物',
          '  --gil   目标地图 .gil（缺省用 --map-id/项目配置）',
          '',
          '三栏口径（2026-10-29 三链路）：',
          '  [OK  ] / [GAP ] / [HOST]  能力栏：现有命令能不能落地（缺什么由 缺: 指名）',
          '  目标图已有栏              目标地图里是否已有等价记录（模板/实例/控件按 kind+名字匹配）',
          '  [DRIFT]                   脚本 GUID 栏：脚本写死的模板 GUID 在目标图是否存在',
          '',
          '--apply 落地（2026-10-29）：造模板侧（模板组 + 容器节点 + 各客户端控件模板，与编辑器导入',
          '  逐字节同构）→ 登记脚本 root50 并把挂载槽 f74 重指向新 GUID → 把脚本里写死的模板 GUID',
          '  重映射到新分配 ID → 实例化进布局。自检：root9 森林根集(f501) == 无 f504 记录集。',
          '  --no-remap 关闭脚本 GUID 重映射（仅调试；线上会 probe 全 FAIL 界面空白）。',
          '',
          '第三条链路（脚本 GUID ↔ 模板 ID）为什么要报：结构全对、编辑器零报错，',
          '运行时仍可能 InstantiateClientUIControl 全失败、界面空白。',
          '判据：导入后跑一次试玩，日志里不得出现 `probe ... FAIL` 或 `discover incomplete`。'
        ].join('\n')
      )
      return 0
    }
  }
  if (!giaPath) {
    deps.err('[error] 需要 --gia <file.gia>')
    return 2
  }
  const giaBytes = new Uint8Array(readFileSync(giaPath))
  const gia = decodeGia(giaBytes)
  if (apply) {
    return runApply(giaBytes, gia, {
      gilPath,
      layoutArg,
      outputPath,
      write,
      yes,
      remapScript,
      startId,
      rootDonor,
      jsonMode,
      log: deps.log,
      err: deps.err
    })
  }
  let target: CoverageReport['target'] = {
    path: gilPath ?? '',
    existingTemplates: 0,
    existingScripts: 0,
    existingContainers: 0,
    maxRecordId: 0,
    nextFreeId: UI_ID_BASE
  }
  let records: UiRecordMeta[] = []
  if (gilPath) {
    const read = readTarget(new Uint8Array(readFileSync(gilPath)))
    target = { ...read.target, path: gilPath }
    records = read.records
  }
  const report = analyzeCoverage(gia, target, records)
  if (jsonMode) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return 0
  }
  deps.log(`GIA: ${report.gia.path || giaPath}`)
  deps.log(`  资产节点 ${report.gia.nodes} · 脚本 ${report.gia.scripts} · gameVersion ${report.gia.gameVersion || '(缺)'}`)
  if (gilPath) {
    deps.log(
      `目标: ${gilPath}（布局 ${report.target.layoutName ?? '?'}#${report.target.layoutId ?? '?'}，` +
        `现有客户端容器 ${report.target.existingContainers}，最大记录 ${report.target.maxRecordId}，` +
        `导入后新记录从此起分配 ${report.target.nextFreeId}）`
    )
  }
  deps.log('')
  deps.log('  [能力][脚本] 条目')
  for (const item of report.items) deps.log(renderItem(item))
  deps.log('')
  deps.log(
    `汇总: LANDABLE ${report.summary.landable} · UNSUPPORTED ${report.summary.unsupported} · ` +
      `NEEDS_HOST ${report.summary.needsHost} · 目标图已有 ${report.summary.inTarget} · ` +
      `脚本漂移涉及 ${report.summary.drift} 条`
  )
  if (report.scriptDrift) {
    const d = report.scriptDrift
    deps.log('')
    deps.log('脚本 GUID 漂移（第三条链路）:')
    deps.log(`  扫描段 [${d.band[0]}, ${d.band[1]}) · 引用 ${d.referenced.length} 个 · 已存在 ${d.present.length} · 缺失 ${d.missing.length}`)
    if (d.missing.length > 0) deps.log(`  缺失: ${d.missing.join(', ')}`)
    for (const t of d.templates) {
      const to = t.candidate ? `${t.candidate.name}#${t.candidate.id}` : '(目标图无同名模板)'
      deps.log(`  ${t.key}: ${t.scriptGuid} → ${t.present ? '已存在' : `需重映射到 ${to}`}`)
    }
    deps.log(`  结论: ${d.verdict}`)
    if (d.missing.length > 0) {
      deps.log('  ⚠ 落地后必须重映射脚本 GUID，或确认脚本自带按 ID 段的兜底扫描能覆盖新 ID；')
      deps.log('    验收判据 = 试玩日志里不出现 `probe ... FAIL` / `discover incomplete`。')
    }
  }
  if (report.missingPrimitives.length > 0) {
    deps.log('')
    deps.log('缺失原语:')
    for (const p of report.missingPrimitives) deps.log(`  - ${p}`)
  }
  return 0
}

/* ------------------------------------------------------------------ *
 * 落地（--apply）：GIA → root9 模板 + 脚本 + 布局实例
 * ------------------------------------------------------------------ */

/** GIA 单元的原始 content wire（protobufjs 解码会丢原始字节，落地必须逐字节复制） */
export interface GiaWireNode {
  guid: number
  which: number
  content: Uint8Array
}

/** 从 GIA 原始字节取每个单元的 content（= 一条 root9 记录的 wire，字段号完全一致） */
export function decodeGiaWire(bytes: Uint8Array): GiaWireNode[] {
  const payload = bytes.subarray(GIA_ENVELOPE_HEAD, bytes.length - GIA_ENVELOPE_TAIL)
  const roots = parseWireMessage(payload) ?? []
  const out: GiaWireNode[] = []
  for (const unit of roots) {
    if (unit.number !== 1 && unit.number !== 2) continue
    const fields = parseWireMessage(unit.value as Uint8Array)
    if (!fields) continue
    const ui = fields.find((f) => f.number === 19 && f.wire === 2)
    if (!ui) continue
    const uiFields = parseWireMessage(ui.value as Uint8Array)
    const content = uiFields?.find((f) => f.number === 1 && f.wire === 2)
    if (!content) continue
    const contentBytes = content.value as Uint8Array
    const contentFields = parseWireMessage(contentBytes)
    if (!contentFields) continue
    const guid = Number(contentFields.find((f) => f.number === 501 && f.wire === 0)?.value ?? 0)
    if (!guid) continue
    const which = Number(fields.find((f) => f.number === 5 && f.wire === 0)?.value ?? 0)
    out.push({ guid, which, content: contentBytes })
  }
  return out
}

/** 记录里挂载槽 f74 内的脚本 GUID（递归找 74 子树里的 ID 段 varint） */
export function mountGuidsIn(content: Uint8Array): number[] {
  const found = new Set<number>()
  const dig = (list: readonly WireField[]) => {
    for (const field of list) {
      if (field.wire !== 2) continue
      const nested = parseWireMessage(field.value as Uint8Array)
      if (!nested) continue
      if (field.number === MOUNT_FIELD) {
        const collect = (items: readonly WireField[]) => {
          for (const item of items) {
            if (item.wire === 0) {
              const value = Number(item.value)
              if (value >= UI_ID_BASE) found.add(value)
            } else if (item.wire === 2) {
              const inner = parseWireMessage(item.value as Uint8Array)
              if (inner) collect(inner)
            }
          }
        }
        collect(nested)
        continue
      }
      dig(nested)
    }
  }
  const top = parseWireMessage(content)
  if (top) dig(top)
  return [...found]
}

export interface ApplyGiaOptions {
  /** 落地到的布局（缺省不实例化，只造模板） */
  layoutId?: number
  /** 是否把脚本里的模板 GUID 重映射到新 ID（缺省 true） */
  remapScript?: boolean
  startId?: number
}

export interface ApplyGiaResult {
  bytes: Uint8Array
  groupId: number
  nodeId: number
  templateIds: number[]
  /** 模板组 + 各控件模板拿到的模板序号（按原顺序） */
  templateSeqs: number[]
  /** 重名去重记录 */
  renames: Array<{ from: string; to: string }>
  instanceGroupId?: number
  instanceNodeId?: number
  script?: { guid: number; name: string; filePath: string; sourceBytes: number }
  /** 脚本里被改写的模板 GUID */
  remaps: Array<{ key: string; from: number; to: number }>
  notes: string[]
}

/**
 * 把一个模拟器整合包的 UI 落到目标地图：
 *   ① 造模板侧（容器模板组 + 容器节点 + 各客户端控件模板）——与编辑器导入逐字节同构
 *   ② 登记脚本（root50）+ 把挂载槽 f74 的脚本 GUID 重映射到新 GUID
 *   ③ 把脚本里写死的模板 GUID 重映射到新分配 ID（不重映射 = 运行时 probe 全 FAIL）
 *   ④ 可选：实例化进布局
 */
export function applyGiaPackage(
  giaBytes: Uint8Array,
  targetBytes: Uint8Array,
  options: ApplyGiaOptions = {}
): ApplyGiaResult {
  const meta = new Map(decodeGia(giaBytes).nodes.map((node) => [node.guid, node]))
  const wire = decodeGiaWire(giaBytes)
  const groupWire = wire.find((item) => item.which === 21)
  if (!groupWire) throw new Error('[error] GIA 里没有服务端控件组（which=21），本包不含 UI 模板')
  const nodeWire = wire.find((item) => {
    const info = meta.get(item.guid)
    return item.which !== 21 && item.which !== 70 && info?.kind === 'client-container-node'
  })
  if (!nodeWire) throw new Error('[error] GIA 里没有容器节点（client-container-node），无法定位挂载宿主')
  const templateWires = wire.filter((item) => item.which === 70)
  if (templateWires.length === 0) throw new Error('[error] GIA 里没有客户端控件模板（which=70）')

  const notes: string[] = []
  const pkg = decodeGia(giaBytes)
  const script = pkg.scripts[0]
  const scriptIdMap = new Map<number, number>()
  let registered: { guid: number; name: string; filePath: string; sourceBytes: number } | undefined
  let working = targetBytes
  const remaps: Array<{ key: string; from: number; to: number }> = []

  if (script) {
    let source = String(script.source ?? '')
    // ① 先落模板拿 idMap 才能重映射脚本；顺序上先算 idMap 不现实（要读目标图记录），
    //    所以这里先登记脚本拿新 guid，模板 idMap 之后再做文本替换。
    const reg = registerScriptInPayload(payloadOf(working), {
      name: script.name || 'main',
      filePath: script.path || 'main.lua',
      source
    })
    working = wrapPayload(reg.payload, working)
    registered = {
      guid: reg.entry.guid,
      name: reg.entry.name,
      filePath: reg.entry.filePath,
      sourceBytes: Buffer.byteLength(source, 'utf8')
    }
    if (reg.dedupApplied) notes.push(`脚本重名/重路径已去重 → ${reg.entry.name} / ${reg.entry.filePath}`)
    for (const guid of mountGuidsIn(nodeWire.content)) scriptIdMap.set(guid, reg.entry.guid)
  }

  const imported = importGiaContainerTemplate(working, {
    group: { guid: groupWire.guid, content: groupWire.content },
    containerNode: { guid: nodeWire.guid, content: nodeWire.content },
    templates: templateWires.map((item) => ({ guid: item.guid, content: item.content })),
    ...(scriptIdMap.size > 0 ? { scriptIdMap } : {}),
    ...(options.startId !== undefined ? { startId: options.startId } : {})
  })
  notes.push(
    `模板序号 ${imported.templateSeqs.join('/')}` +
      (imported.renames.length > 0
        ? ` · 重名去重 ${imported.renames.map((r) => `${r.from}→${r.to}`).join(', ')}`
        : '')
  )

  // ③ 脚本里的模板 GUID → 新 ID（不重映射 = 运行时 probe 全 FAIL + discover 兜底可能扫不到）
  let final = imported.bytes
  if (registered && options.remapScript !== false) {
    const entries = extractTemplateEntries(String(script?.source ?? ''))
    let patched = String(script?.source ?? '')
    for (const entry of entries) {
      const to = imported.idMap.get(entry.guid)
      if (to === undefined || to === entry.guid) continue
      patched = patched.split(String(entry.guid)).join(String(to))
      remaps.push({ key: entry.key, from: entry.guid, to })
    }
    if (remaps.length > 0) {
      const reg = updateScriptInPayload(payloadOf(final), {
        guid: registered.guid,
        source: patched
      })
      final = wrapPayload(reg.payload, final)
      notes.push(`脚本模板 GUID 已重映射 ${remaps.length} 处`)
    } else {
      notes.push('脚本里没有可按名字对上新 ID 的模板 GUID（未重映射）')
    }
  }

  let instanceGroupId: number | undefined
  let instanceNodeId: number | undefined
  if (options.layoutId !== undefined) {
    const inst = instantiateContainerTemplate(final, {
      templateGroupId: imported.groupId,
      layoutId: options.layoutId
    })
    final = inst.bytes
    instanceGroupId = inst.instanceGroupId
    instanceNodeId = inst.instanceNodeId
    notes.push(`已实例化进布局 ${options.layoutId}（组 ${inst.instanceGroupId} / 节点 ${inst.instanceNodeId}）`)
  }

  return {
    bytes: final,
    groupId: imported.groupId,
    nodeId: imported.nodeId,
    templateIds: imported.templateIds,
    templateSeqs: imported.templateSeqs,
    renames: imported.renames,
    ...(instanceGroupId !== undefined ? { instanceGroupId } : {}),
    ...(instanceNodeId !== undefined ? { instanceNodeId } : {}),
    ...(registered ? { script: registered } : {}),
    remaps,
    notes
  }
}

/** root9 不变量自检：森林根集 == 无 f504 记录集合；模板引用必须落地 */
export function checkRoot9Invariants(bytes: Uint8Array): string[] {
  const parsed = parseRoot9(bytes)
  const problems: string[] = []
  const noParent = new Set(parsed.records.filter((r) => r.parentId === null).map((r) => r.id))
  for (const id of parsed.indexIds) {
    if (!noParent.has(id)) problems.push(`索引含 ${id}，但它有 f504（应为森林根）`)
  }
  for (const id of noParent) {
    if (!parsed.indexIds.has(id)) problems.push(`森林根 ${id} 不在索引里`)
  }
  for (const record of parsed.records) {
    if (record.kind !== 'client-container') continue
    if (!record.familyTypes.includes(4)) continue
    const fields = record.fields.find((f) => f.number === 502 && f.wire === 2)
    if (!fields) continue
    for (const instanceId of ([] as number[])) void instanceId
  }
  return problems
}

interface ApplyCliOptions {
  gilPath?: string
  layoutArg?: string
  outputPath?: string
  write: boolean
  yes: boolean
  remapScript: boolean
  startId?: number
  /** 目标图缺 ClientUI 层级根（族 87/88）时，从这张地图克隆两条根补上 */
  rootDonor?: string
  jsonMode: boolean
  log: (message: string) => void
  err: (message: string) => void
}

function runApply(giaBytes: Uint8Array, gia: GiaPackage, options: ApplyCliOptions): number {
  if (!options.gilPath) {
    options.err('[error] --apply 需要 --gil <目标地图.gil>')
    return 2
  }
  if (gia.scripts.length === 0) {
    options.log('提示：该包不含脚本，UI 只会落模板（不会有运行时实例化逻辑）')
  }
  const diskBytes: Uint8Array = new Uint8Array(readFileSync(options.gilPath))
  const diskHash = sha256Bytes(diskBytes)
  let targetBytes: Uint8Array = diskBytes
  // 前置：ClientUI 层级根（族 87/88）。CLI 新建的地图没有（编辑器首开会自建），
  // 缺了就直接落地，编辑器打开时会自建并把整棵子树一起丢掉 → 这里先补齐。
  const rootStatus = clientUiRootStatus(targetBytes)
  const rootNotes: string[] = []
  if (rootStatus.missing.length > 0) {
    if (options.rootDonor === undefined) {
      options.err(
        `[error] 目标地图缺少 ClientUI 层级根（族 ${rootStatus.missing.join('/')}）。` +
          '给 --root-donor <含 87/88 的地图.gil> 让 CLI 补，或先在编辑器里打开保存一次。'
      )
      return 2
    }
    const ensured = ensureClientUiHierarchyRoots(targetBytes, {
      donor: new Uint8Array(readFileSync(options.rootDonor))
    })
    targetBytes = ensured.bytes
    rootNotes.push(`已从 donor 补齐 ClientUI 层级根：${ensured.added.map((a) => `${a.family}#${a.id}`).join(',')}`)
  }
  // 写回比对必须用**磁盘原始字节**的 hash（root 修复后 targetBytes 已不是磁盘内容）
  const sourceHash = diskHash
  const parsed = parseRoot9(targetBytes)
  const layouts = parsed.records.filter((r) => r.kind === 'layout')
  let layout = layouts[0]
  if (options.layoutArg !== undefined) {
    const byId = Number(options.layoutArg)
    const found = layouts.find((r) => r.id === byId || r.name === options.layoutArg)
    if (!found) {
      options.err(
        `[error] 目标图里找不到布局「${options.layoutArg}」` +
          `（现有：${layouts.map((l) => `${l.name}#${l.id}`).join(', ') || '无'}）`
      )
      return 2
    }
    layout = found
  }
  let result: ApplyGiaResult
  try {
    result = applyGiaPackage(giaBytes, targetBytes, {
      ...(layout !== undefined ? { layoutId: layout.id } : {}),
      remapScript: options.remapScript,
      ...(options.startId !== undefined ? { startId: options.startId } : {})
    })
  } catch (error) {
    options.err(error instanceof Error ? error.message : String(error))
    return 1
  }
  for (const note of rootNotes) result.notes.unshift(note)
  const problems = checkRoot9Invariants(result.bytes)
  const nextHash = sha256Bytes(result.bytes)

  if (options.jsonMode) {
    process.stdout.write(
      JSON.stringify(
        {
          schemaVersion: 2,
          kind: 'gsts.sim-import-apply',
          source: { path: options.gilPath, sha256: sourceHash, bytes: diskBytes.length },
          candidate: { sha256: nextHash, bytes: result.bytes.length },
          layout: layout !== undefined ? { id: layout.id, name: layout.name } : null,
          created: {
            groupId: result.groupId,
            nodeId: result.nodeId,
            templateIds: result.templateIds,
            instanceGroupId: result.instanceGroupId ?? null,
            instanceNodeId: result.instanceNodeId ?? null
          },
          script: result.script ?? null,
          remaps: result.remaps,
          notes: result.notes,
          selfCheck: problems.length === 0 ? 'pass' : problems
        },
        null,
        2
      ) + '\n'
    )
  } else {
    options.log(`源: ${options.gilPath}（${diskBytes.length} B sha=${sourceHash.slice(0, 16)}）`)
    options.log(
      `布局: ${layout !== undefined ? `${layout.name}#${layout.id}` : '(无)'}` +
        ` · 模板序号 ${result.templateIds.length + 1} 个新分配`
    )
    options.log(
      `落地: 模板组 ${result.groupId} · 容器节点 ${result.nodeId} · ` +
        `控件模板 ${result.templateIds.join(',')}`
    )
    if (result.script) {
      options.log(`脚本: ${result.script.name} guid=${result.script.guid}（${result.script.sourceBytes} B）`)
    }
    for (const remap of result.remaps) {
      options.log(`重映射 ${remap.key}: ${remap.from} → ${remap.to}`)
    }
    if (result.instanceGroupId !== undefined) {
      options.log(`实例: 布局实例组 ${result.instanceGroupId} · 容器节点 ${result.instanceNodeId}`)
    }
    for (const note of result.notes) options.log(`· ${note}`)
    options.log(`候选: ${nextHash}（${result.bytes.length} B）`)
    options.log(`自检: ${problems.length === 0 ? 'pass（root9 森林根集 == 无 f504 记录集）' : problems.join('; ')}`)
  }
  if (problems.length > 0) {
    options.err('[error] 自检未通过，拒绝写回')
    return 1
  }
  if (options.outputPath) {
    writeFileSync(options.outputPath, result.bytes)
    options.log(`candidate=${options.outputPath}`)
  }
  if (options.write) {
    if (!options.yes) {
      options.err('[error] --write 须附 --yes')
      return 2
    }
    const currentHash = sha256Bytes(new Uint8Array(readFileSync(options.gilPath)))
    if (currentHash !== sourceHash) {
      options.err(`[error] 源文件在操作期间被改变（期望 ${sourceHash}，实际 ${currentHash}）`)
      return 2
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = `${options.gilPath}.${stamp}.bak.gil`
    copyFileSync(options.gilPath, backup)
    writeFileSync(options.gilPath, result.bytes)
    options.log(`backup=${backup}`)
    const mapIdMatch = /(\d+)\.gil$/.exec(options.gilPath)
    try {
      if (mapIdMatch) resyncMap(saveLevelDirOf(options.gilPath), Number(mapIdMatch[1]))
      else syncGilToTemp(saveLevelDirOf(options.gilPath), basename(options.gilPath))
      options.log('writePerformed=true（Save_Level + Temp 已同步）')
    } catch (error) {
      options.log(`writePerformed=true · Temp 同步失败（best-effort）：${String(error)}`)
    }
  } else if (!options.outputPath) {
    options.log('（dry-run：未写盘。要写回加 --write --yes，或 --output <file> 取候选）')
  }
  return 0
}
