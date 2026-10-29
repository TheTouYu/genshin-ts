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

import { readFileSync } from 'node:fs'
import { RootType } from './client_ui/proto.js'
import { parseRoot9, type ParsedRoot9 } from '../../ui/src/record.js'
import { clientKindOf } from '../../ui/src/client-kinds.js'
import type { UiRecordMeta } from '../../ui/src/types.js'

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
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--gia') giaPath = args[++i]
    else if (a === '--gil') gilPath = args[++i]
    else if (a === '--format') jsonMode = args[++i] === 'json'
    else if (a === '--help' || a === '-h') {
      deps.log(
        [
          'Usage: gsts sim:import --gia <file.gia> [--gil <map.gil>] [--format text|json]',
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
  const gia = decodeGia(new Uint8Array(readFileSync(giaPath)))
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
