/**
 * src/cli/assets_ui_advanced.ts — assets:ui 高级控件命令面（票10）
 *
 * 承接票10 六个引擎的 CLI 语义路由（DESIGN §3.3-3.5）：
 *   floating-page create/variable · container add/active · tab create/page 系列 ·
 *   state material add/remove · material update · rich-image · queue style/message/props
 * 纪律：本文件只做「解析 + 引擎调用 + 摘要」；写回门（SHA 锁定→--write 须附 --yes→
 * 自动备份→Temp 同步）由 assets_ui.ts 的 writeBack 统一执行（09 R1 模式）。
 * 全部命令默认 dry-run（打印候选摘要）；--output 落盘候选；--write --yes 写回源。
 */

import {
  addPageContainerCandidate,
  addPageVariableCandidate,
  createFloatingPageCandidate,
  setContainerActiveCandidate
} from '../../ui/src/floating-page.js'
import {
  createTabCandidate,
  tabPageAddCandidate,
  tabPageDefaultCandidate,
  tabPageRenameCandidate,
  tabPageServerEventCandidate,
  tabStateBlockCandidate,
  type TabStateOp
} from '../../ui/src/tab.js'
import {
  addStateMaterialMemberCandidate,
  stateMaterialGroupId,
  updateMaterialMemberCandidate
} from '../../ui/src/material-member.js'
import { removeMaterialGroupMember } from '../../ui/src/material-groups.js'
import { setRichImageCandidate } from '../../ui/src/rich-image.js'
import {
  queueMessageAddCandidate,
  queueMessageStyleCandidate,
  queuePropsCandidate,
  queueStyleAddCandidate
} from '../../ui/src/queue.js'
import { parseRoot9 } from '../../ui/src/record.js'
import { collectUsedControlIds, resolveSurfaceTarget } from '../../ui/src/create.js'

export interface AdvancedCommand {
  op: string
  params: Record<string, string | number | boolean | undefined>
  /** 重复参数（container-state 多容器等） */
  multi: Record<string, string[]>
}

const ADVANCED_ROOTS = new Set([
  'floating-page',
  'container',
  'tab',
  'state',
  'material',
  'rich-image',
  'queue'
])

export function isUiAdvancedArgv0(first: string | undefined): boolean {
  return first !== undefined && ADVANCED_ROOTS.has(first)
}

function num(raw: string, option: string): number {
  const v = Number(raw)
  if (!Number.isSafeInteger(v) || v < 0) throw new Error(`[error] ${option} 须为非负整数`)
  return v
}

/** 解析高级命令：前导非 -- 词（≤3 个）= 命令短语（tab page add / queue message style…） */
export function parseUiAdvancedCommand(argv: readonly string[]): AdvancedCommand {
  const phrase: string[] = []
  let i = 0
  while (i < argv.length && phrase.length < 3 && !argv[i].startsWith('--') && argv[i] !== '--') {
    phrase.push(argv[i])
    i++
  }
  const params: Record<string, string | number | boolean | undefined> = {}
  const multi: Record<string, string[]> = {}
  const flags = new Set<string>()
  for (; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--gil' || arg === '--format' || arg === '--output' || arg === '--write' || arg === '--yes') {
      if (arg === '--gil' || arg === '--format' || arg === '--output') i++
      else flags.add(arg)
      continue
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const value = argv[i + 1]
      if (value !== undefined && !value.startsWith('--')) {
        // container/control 在状态命令里可重复（multi）；单值场景（container active）读 params
        if (key === 'container' || key === 'control') (multi[key] ??= []).push(value)
        params[key] = value
        i++
      } else {
        flags.add(key)
      }
      continue
    }
    // 尾位置参数（on/off、head/tail 等）
    if (params.positional === undefined) params.positional = arg
  }
  if (flags.has('yes')) params.yes = true
  const op = phrase.join(' ')
  return { op, params, multi }
}

export interface AdvancedCandidate {
  bytes: Uint8Array
  op: string
  summary: Record<string, unknown>
}

/** 校验数字参数存在 */
function requireNum(params: Record<string, unknown>, key: string): number {
  const raw = params[key]
  if (raw === undefined) throw new Error(`[error] 缺少 --${key}`)
  return num(String(raw), `--${key}`)
}

function requireStr(params: Record<string, unknown>, key: string): string {
  const raw = params[key]
  if (raw === undefined || String(raw) === '') throw new Error(`[error] 缺少 --${key}`)
  return String(raw)
}

/** 生成高级命令候选（纯函数：bytes→bytes 引擎调用序列） */
export function buildUiAdvancedCandidate(
  sourceBytes: Uint8Array,
  command: AdvancedCommand
): AdvancedCandidate {
  const { op, params, multi } = command
  const parsed = parseRoot9(sourceBytes)
  const positional = params.positional !== undefined ? String(params.positional) : undefined

  if (op === 'floating-page create') {
    const result = createFloatingPageCandidate(sourceBytes, {
      ...(params.name !== undefined ? { name: String(params.name) } : {}),
      ...(params.id !== undefined ? { ids: idTriple(parsed, String(params.id)) } : {})
    })
    return {
      bytes: result.bytes,
      op,
      summary: {
        kind: 'ui-floating-page-create',
        entityId: result.entityId,
        containerId: result.containerId,
        closeButtonId: result.closeButtonId,
        note: '纯添加 3 条单条族（轮24 形态）；富版组合走 container/tab/variable 命令'
      }
    }
  }
  if (op === 'floating-page variable add') {
    const typeMap: Record<string, 'int' | 'float' | 'string' | 'dynamic-text'> = {
      int: 'int',
      float: 'float',
      str: 'string',
      text: 'dynamic-text'
    }
    const rawType = requireStr(params, 'type')
    const type = typeMap[rawType]
    if (!type) throw new Error('[error] --type 须为 int|float|str|text')
    const result = addPageVariableCandidate(sourceBytes, {
      pageId: requireNum(params, 'page'),
      name: requireStr(params, 'name'),
      type
    })
    return { bytes: result.bytes, op, summary: { kind: 'ui-page-variable-add', ...result.variable } }
  }
  if (op === 'container add') {
    const result = addPageContainerCandidate(sourceBytes, {
      pageId: requireNum(params, 'page'),
      ...(params.id !== undefined ? { containerId: num(String(params.id), '--id') } : {}),
      ...(params.active !== undefined
        ? { active: String(params.active) !== 'off' }
        : {})
    })
    return {
      bytes: result.bytes,
      op,
      summary: {
        kind: 'ui-container-add',
        containerId: result.containerId,
        active: result.active,
        pageContainerRefs: result.pageContainerRefs
      }
    }
  }
  if (op === 'container active') {
    if (positional !== 'on' && positional !== 'off') {
      throw new Error('[error] 用法：container active --container <ID> on|off')
    }
    const result = setContainerActiveCandidate(sourceBytes, {
      containerId: requireNum(params, 'container'),
      active: positional === 'on'
    })
    return { bytes: result.bytes, op, summary: { kind: 'ui-container-active', ...result } }
  }
  if (op === 'tab create') {
    const surfaceRaw = requireStr(params, 'on')
    const surface = resolveSurfaceTarget(parsed, surfaceRaw)
    if (surface.kind !== 'container') {
      throw new Error('[error] tab 仅可放置于悬浮页容器（--on container:<ID> 或 悬浮页:<页>:<容器>）')
    }
    const result = createTabCandidate(sourceBytes, {
      containerId: surface.containerId,
      ...(params.name !== undefined ? { name: String(params.name) } : {}),
      ...(params.id !== undefined ? { id: num(String(params.id), '--id') } : {})
    })
    return { bytes: result.bytes, op, summary: { kind: 'ui-tab-create', tabId: result.tabId, pageCount: result.pageCount } }
  }
  if (op === 'tab page add') {
    const tabId = requireNum(params, 'tab')
    const added = tabPageAddCandidate(sourceBytes, { tabId })
    let bytes = added.bytes
    if (params.name !== undefined || params.text !== undefined) {
      bytes = tabPageRenameCandidate(bytes, {
        tabId,
        page: added.page,
        ...(params.name !== undefined ? { name: String(params.name) } : {}),
        ...(params.text !== undefined ? { text: String(params.text) } : {})
      })
    }
    return {
      bytes,
      op,
      summary: { kind: 'ui-tab-page-add', page: added.page, name: params.name ?? added.name }
    }
  }
  if (op === 'tab page rename') {
    const bytes = tabPageRenameCandidate(sourceBytes, {
      tabId: requireNum(params, 'tab'),
      page: requireNum(params, 'page'),
      ...(params.name !== undefined ? { name: String(params.name) } : {}),
      ...(params.text !== undefined ? { text: String(params.text) } : {})
    })
    return { bytes, op, summary: { kind: 'ui-tab-page-rename', page: params.page } }
  }
  if (op === 'tab page default') {
    const bytes = tabPageDefaultCandidate(sourceBytes, {
      tabId: requireNum(params, 'tab'),
      page: requireNum(params, 'page')
    })
    return { bytes, op, summary: { kind: 'ui-tab-page-default', page: params.page } }
  }
  if (op === 'tab page server-event') {
    if (positional !== 'on' && positional !== 'off') {
      throw new Error('[error] 用法：tab page server-event --tab <ID> --page <n> on|off')
    }
    const bytes = tabPageServerEventCandidate(sourceBytes, {
      tabId: requireNum(params, 'tab'),
      page: requireNum(params, 'page'),
      on: positional === 'on'
    })
    return { bytes, op, summary: { kind: 'ui-tab-page-server-event', page: params.page, on: positional === 'on' } }
  }
  if (op === 'tab page container-state' || op === 'tab page control-state') {
    const block = op.endsWith('container-state') ? 'container' : 'control'
    const listKey = block === 'container' ? 'container' : 'control'
    const tabId = requireNum(params, 'tab')
    const page = requireNum(params, 'page')
    let bytes = sourceBytes
    const ops: TabStateOp[] = []
    for (const spec of multi[listKey] ?? []) {
      const m = /^(.+):(show|hide)$/.exec(spec)
      if (!m) throw new Error(`[error] --${listKey} 格式须为 <ID>:show|hide（得 ${spec}）`)
      ops.push({ kind: 'upsert', targetId: num(m[1], `--${listKey}`), hidden: m[2] === 'hide' })
    }
    if (params.remove !== undefined) {
      ops.push({ kind: 'remove', targetId: num(String(params.remove), '--remove') })
    }
    if (params.enable !== undefined) ops.push({ kind: 'enable' })
    if (params.disable !== undefined) ops.push({ kind: 'disable' })
    if (ops.length === 0) throw new Error('[error] 至少一个操作（--container/--control/--remove/--enable/--disable）')
    for (const stateOp of ops) {
      bytes = tabStateBlockCandidate(bytes, { tabId, page, block, op: stateOp })
    }
    return { bytes, op, summary: { kind: `ui-tab-${block}-state`, page, ops: ops.length } }
  }
  if (op === 'state material add') {
    const stateRaw = requireStr(params, 'state')
    if (stateRaw !== 'normal' && stateRaw !== 'hover' && stateRaw !== 'press') {
      throw new Error('[error] --state 须为 normal|hover|press')
    }
    const memberRaw = requireStr(params, 'member')
    if (memberRaw !== 'text' && memberRaw !== 'image') {
      throw new Error('[error] --member 须为 text|image')
    }
    const targetId = requireNum(params, 'target')
    const result = addStateMaterialMemberCandidate(sourceBytes, {
      targetId,
      state: stateRaw,
      member: memberRaw,
      ...(params.text !== undefined ? { text: String(params.text) } : {}),
      ...(params.color !== undefined ? { color: String(params.color) } : {}),
      ...(params.id !== undefined
        ? { ids: { member: num(String(params.id), '--id') } }
        : {})
    })
    return {
      bytes: result.bytes,
      op,
      summary: {
        kind: 'ui-state-material-add',
        groupId: result.groupId,
        memberId: result.memberId,
        createdGroup: result.createdGroup
      }
    }
  }
  if (op === 'state material remove') {
    const result = removeMaterialGroupMember(sourceBytes, {
      groupId: requireNum(params, 'target'),
      memberId: requireNum(params, 'member')
    })
    return {
      bytes: result.bytes,
      op,
      summary: { kind: 'ui-state-material-remove', groupMemberIds: result.groupMemberIds }
    }
  }
  if (op === 'material update') {
    const result = updateMaterialMemberCandidate(sourceBytes, {
      memberId: requireNum(params, 'target'),
      ...(params.text !== undefined ? { text: String(params.text) } : {}),
      ...(params.color !== undefined ? { color: String(params.color) } : {})
    })
    return { bytes: result.bytes, op, summary: { kind: 'ui-material-update', memberId: result.memberId } }
  }
  if (op === 'rich-image set') {
    const result = setRichImageCandidate(sourceBytes, {
      targetId: requireNum(params, 'target'),
      ...(params.resource !== undefined ? { resourceId: num(String(params.resource), '--resource') } : {}),
      ...(params.text !== undefined ? { text: String(params.text) } : {})
    })
    return { bytes: result.bytes, op, summary: { kind: 'ui-rich-image', action: result.action } }
  }
  if (op === 'queue style add') {
    const memberRaw = requireStr(params, 'material')
    if (memberRaw !== 'text' && memberRaw !== 'image') {
      throw new Error('[error] --material 须为 text|image')
    }
    const result = queueStyleAddCandidate(sourceBytes, {
      targetId: requireNum(params, 'target'),
      material: memberRaw,
      ...(params.text !== undefined ? { text: String(params.text) } : {}),
      ...(params.color !== undefined ? { color: String(params.color) } : {}),
      ...(params['font-size'] !== undefined
        ? { fontSize: num(String(params['font-size']), '--font-size') }
        : {})
    })
    return {
      bytes: result.bytes,
      op,
      summary: {
        kind: 'ui-queue-style-add',
        styleIndex: result.styleIndex,
        styleName: result.styleName,
        groupId: result.groupId,
        memberId: result.memberId
      }
    }
  }
  if (op === 'queue message add') {
    const result = queueMessageAddCandidate(sourceBytes, {
      targetId: requireNum(params, 'target'),
      ...(params.name !== undefined ? { name: String(params.name) } : {})
    })
    return { bytes: result.bytes, op, summary: { kind: 'ui-queue-message-add', ...result } }
  }
  if (op === 'queue message style') {
    const bytes = queueMessageStyleCandidate(sourceBytes, {
      targetId: requireNum(params, 'target'),
      message: requireNum(params, 'message'),
      style: requireNum(params, 'style')
    })
    return { bytes, op, summary: { kind: 'ui-queue-message-style', message: params.message, style: params.style } }
  }
  if (op === 'queue timed-show') {
    if (positional !== 'on' && positional !== 'off') {
      throw new Error('[error] 用法：queue timed-show --target <队列ID> on|off [--seconds F]')
    }
    const bytes = queuePropsCandidate(sourceBytes, {
      targetId: requireNum(params, 'target'),
      timedShow: positional === 'on',
      ...(params.seconds !== undefined
        ? { timedSeconds: Number(String(params.seconds)) }
        : {})
    })
    return { bytes, op, summary: { kind: 'ui-queue-timed-show', on: positional === 'on' } }
  }
  if (op === 'queue insert') {
    if (positional !== 'head' && positional !== 'tail') {
      throw new Error('[error] 用法：queue insert --target <队列ID> head|tail')
    }
    const bytes = queuePropsCandidate(sourceBytes, {
      targetId: requireNum(params, 'target'),
      insertHead: positional === 'head'
    })
    return { bytes, op, summary: { kind: 'ui-queue-insert', position: positional } }
  }
  throw new Error(`[error] 未知高级命令: ${op}（见 usage：gsts assets:ui --help）`)
}

/** 显式三元组 ID（--id 给实体，容器/关闭按钮顺延；三元组须全部空闲） */
function idTriple(
  parsed: ReturnType<typeof parseRoot9>,
  rawId: string | number
): { entity: number; container: number; closeButton: number } {
  const entity = num(String(rawId), '--id')
  const triple = { entity, container: entity + 1, closeButton: entity + 2 }
  const used = collectUsedControlIds(parsed)
  for (const [key, id] of Object.entries(triple)) {
    if (used.has(id)) throw new Error(`[error] --id 三元组 ${key}=${id} 已被占用，请避让`)
  }
  return triple
}
