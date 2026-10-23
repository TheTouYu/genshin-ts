/**
 * src/cli/sim_import.ts — `gsts sim:import`：把模拟器导出的 GIA 落地到地图 .gil 的**覆盖分析**（Step 1 骨架）
 *
 * 定位（2026-10-23 用户定方向）：
 *   模拟器 = 上游 IR 生产者（只管 GIA：模板/控件/脚本映射）；
 *   我们 = GIL 落地编译器 + 回读验证器（模拟器的黑盒点正是我们的可支持面）。
 *
 * 本轮只做 **dry-run 覆盖报告**（不写游戏文件）：
 *   ①解码 GIA（envelope 20B 头 + Root protobuf + 4B 尾）
 *   ②按 guid/parent/children 重建两侧资产树
 *   ③对每个节点判定落地状态：LANDABLE（有现成命令原语）/ UNSUPPORTED（缺原语，指名缺哪一条）
 *   ④对照目标 .gil 现状（布局 / 模板 / 脚本登记），输出缺口清单
 *
 * 已知事实（2026-10-23 实测）：GIA 的 `data.field502` 类型码与 .gil 的 compTypes **同一套编码**
 * （容器组 15/23/12/82、容器节点 86+91、文本框 86+84、图片 86+96/97），因此落地可直接复用
 * `ui/src/client-kinds.ts` 的判别表，不需要第二套映射。
 */

import { readFileSync } from 'node:fs'
import { RootType } from './client_ui/proto.js'
import { parseRoot9 } from '../../ui/src/record.js'
import { clientKindOf } from '../../ui/src/client-kinds.js'

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
}

export interface GiaPackage {
  filePath: string
  gameVersion: string
  nodes: GiaNode[]
  scripts: GiaScript[]
}

export interface CoverageItem {
  item: string
  guid?: number
  status: 'LANDABLE' | 'UNSUPPORTED' | 'NEEDS_HOST'
  /** 缺的原语 / 依赖 */
  needs?: string
  note?: string
}

export interface CoverageReport {
  schemaVersion: 1
  kind: 'gsts.sim-import-analysis'
  gia: { path: string; nodes: number; scripts: number; gameVersion: string }
  target: {
    path: string
    layoutId?: number
    layoutName?: string
    existingTemplates: number
    existingScripts: number
    existingContainers: number
  }
  items: CoverageItem[]
  summary: { landable: number; unsupported: number; needsHost: number }
  supportedToday: string[]
  missingPrimitives: string[]
}

const GIA_ENVELOPE_HEAD = 20
const GIA_ENVELOPE_TAIL = 4

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
      scripts.push({
        id: Number(mapping.id ?? 0),
        name: String(mapping.name ?? ''),
        path: String(mapping.file_path ?? ''),
        sourceBytes: Buffer.byteLength(String(mapping.source ?? ''), 'utf8')
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

/** 目标 .gil 现状（只读） */
export function readTarget(gilBytes: Uint8Array): CoverageReport['target'] {
  const parsed = parseRoot9(gilBytes)
  const layout = parsed.records.find((r) => r.kind === 'layout')
  const templates = parsed.records.filter((r) => r.kind === 'client-container' && r.familyTypes?.includes(4))
  const containers = parsed.records.filter(
    (r) => r.kind === 'client-container' || r.kind === 'client-container-node'
  )
  // 脚本登记表（f50）在 root9 之外；这里只做计数占位，详情由 assets:scripts list 提供
  return {
    path: '',
    ...(layout ? { layoutId: layout.id } : {}),
    ...(layout ? { layoutName: layout.name } : {}),
    existingTemplates: templates.length,
    existingScripts: 0,
    existingContainers: containers.length
  }
}

/**
 * 覆盖分析：把 GIA 的每个资产/控件映射到"我们现在能不能落地"。
 * 判定依据 = 现有命令面（2026-10-23）：
 *   - 布局挂载（布局 f503 追加）→ 有
 *   - 客户端控件容器两件套（组 + 容器节点）→ 有（create --type client-container）
 *   - 客户端控件单件（10 类，挂容器节点）→ 有（create --type client-<kind>）
 *   - 脚本登记 + external lua + f74 挂载 → 有（assets:scripts register/mount）
 *   - **客户端控件模板（which=70 + 模板根记录）→ 缺**
 *   - **服务端控件组（which=21）→ 缺**（现有 create 只能建布局级/客户端容器，服务端 UIControlGroup 未做）
 */
export function analyzeCoverage(gia: GiaPackage, target: CoverageReport['target']): CoverageReport {
  const items: CoverageItem[] = []
  const missing = new Set<string>()

  const group = gia.nodes.find((n) => n.origin === 'graph' && n.which === 21)
  if (group) {
    items.push({
      item: `服务端控件组「${group.name}」`,
      guid: group.guid,
      status: 'UNSUPPORTED',
      needs: '服务端 UIControlGroup 创建（现有 create 仅覆盖布局级容器与客户端控件）',
      note: '落地后还需挂进布局 f503'
    })
    missing.add('服务端控件组创建（UIControlGroup + 子控件树）')
  }

  const templates = gia.nodes.filter((n) => n.origin === 'graph' && n.which === 70)
  for (const tpl of templates) {
    items.push({
      item: `客户端控件模板「${tpl.name || tpl.guid}」`,
      guid: tpl.guid,
      status: 'UNSUPPORTED',
      needs: '客户端控件模板创建（模板根 + 子控件 + 模板列表注册）',
      note: `类型码 ${tpl.types.join(',')}`
    })
    missing.add('客户端控件模板创建（模板根 + 子控件 + 模板列表注册）')
  }

  for (const node of gia.nodes.filter((n) => n.origin === 'accessory')) {
    const host = node.parent !== undefined ? gia.nodes.find((n) => n.guid === node.parent) : undefined
    const inTemplate = host !== undefined && templates.some((t) => t.guid === host.guid || t.children.includes(node.guid))
    const landable = !inTemplate && (node.kind === 'client-container-node' || clientControlLandable(node.kind))
    items.push({
      item: `控件「${node.name || node.guid}」(${node.kind})`,
      guid: node.guid,
      status: landable ? 'LANDABLE' : inTemplate ? 'UNSUPPORTED' : 'UNSUPPORTED',
      ...(landable
        ? { note: 'create --type client-container / client-<kind> 已支持' }
        : { needs: inTemplate ? '模板归属（随模板落地）' : '缺该类型的落地原语' })
    })
  }

  for (const script of gia.scripts) {
    items.push({
      item: `脚本 ${script.path || script.name}`,
      guid: script.id,
      status: group ? 'NEEDS_HOST' : 'LANDABLE',
      ...(group
        ? { needs: '宿主控件（服务端容器）尚未落地', note: `源码 ${script.sourceBytes}B 可内联` }
        : { note: 'assets:scripts register + mount 已支持' })
    })
  }

  const summary = {
    landable: items.filter((i) => i.status === 'LANDABLE').length,
    unsupported: items.filter((i) => i.status === 'UNSUPPORTED').length,
    needsHost: items.filter((i) => i.status === 'NEEDS_HOST').length
  }
  return {
    schemaVersion: 1,
    kind: 'gsts.sim-import-analysis',
    gia: { path: gia.filePath, nodes: gia.nodes.length, scripts: gia.scripts.length, gameVersion: gia.gameVersion },
    target,
    items,
    summary,
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
          '状态口径：LANDABLE=现有命令能落地；UNSUPPORTED=缺原语（needs 指名）；NEEDS_HOST=依赖宿主控件先落地。'
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
    existingContainers: 0
  }
  if (gilPath) {
    const read = readTarget(new Uint8Array(readFileSync(gilPath)))
    target = { ...read, path: gilPath }
  }
  const report = analyzeCoverage(gia, target)
  if (jsonMode) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return 0
  }
  deps.log(`GIA: ${report.gia.path || giaPath}`)
  deps.log(`  资产节点 ${report.gia.nodes} · 脚本 ${report.gia.scripts} · gameVersion ${report.gia.gameVersion || '(缺)'}`)
  if (gilPath) {
    deps.log(
      `目标: ${gilPath}（布局 ${report.target.layoutName ?? '?'}#${report.target.layoutId ?? '?'}，` +
        `现有客户端容器 ${report.target.existingContainers}）`
    )
  }
  deps.log('')
  for (const item of report.items) {
    const mark = item.status === 'LANDABLE' ? 'OK  ' : item.status === 'NEEDS_HOST' ? 'HOST' : 'GAP '
    deps.log(`  [${mark}] ${item.item}${item.needs ? ' — 缺: ' + item.needs : ''}${item.note ? '（' + item.note + '）' : ''}`)
  }
  deps.log('')
  deps.log(`汇总: LANDABLE ${report.summary.landable} · UNSUPPORTED ${report.summary.unsupported} · NEEDS_HOST ${report.summary.needsHost}`)
  if (report.missingPrimitives.length > 0) {
    deps.log('缺失原语:')
    for (const p of report.missingPrimitives) deps.log(`  - ${p}`)
  }
  return 0
}
