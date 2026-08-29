/**
 * gsts variables:verify —— 规律表驱动核验（设计文档 C1/C4，只读）。
 *
 * 对任意 .gil/.gia 按 scope 读取变量容器/节点，与规律表
 * （tests/fixtures/variables-wire-rules.json，单一事实源）逐字节比对：
 *  - 结构规则（骨架/形态）：全部按 status=verified 的规则硬断言；
 *  - hex fixture：样本字节级锁定的记录/引脚值，存在同名/同键 fixture 时逐字节比对；
 *  - inferred 段（client dict 值 pin、图变量 dict、server ioc 9..20）：不硬断言，只报 NOTE。
 *
 * 用法：
 *   gsts variables:verify --gil <file> [--scope assets|graph|local-server|local-client|all]
 *                         [--entity <id>] [--graph <id>] [--rules <json>] [--json]
 *
 * 退出码：全 PASS = 0；存在 DIFF = 1。
 * 核验层级说明：本命令只做「照规律表逐字节比对」（L2）；不证明注入正确（L3）或游戏行为（L4）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import protobuf from 'protobufjs'

import { loadGiaProto } from '../injector/proto.js'
import { listGraphs, locateGraphField } from './static_assembly/graph_edit.js'
import { parseWireMessage } from './static_assembly/wire.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_RULES_PATH = path.resolve(
  __dirname,
  '../../tests/fixtures/variables-wire-rules.json'
)

type RulesTable = {
  meta: {
    version: number
    statusLegend: Record<string, string>
    [k: string]: unknown
  }
  samples: Array<{ id: string; file: string | null; sha256: string | null; scope: string; note?: string }>
  rules: {
    assets: { entryForm: Record<string, string>; fixtures: Record<string, { hex: string; samples: string[]; note?: string }> }
    graph: { fixtures: Record<string, Array<{ hex: string; variant: string; samples: string[]; note?: string }>> }
    'local-server': {
      cidTable: { verified: { get: Record<string, number>; set: Record<string, number> }; inferred?: string }
      iocTable: { verified: Record<string, number>; inferred: Record<string, number>; note?: string }
      fixtures: Record<string, { hex: string; samples: string[]; note?: string }>
    }
    'local-client': {
      iocTable: Record<string, number>
      clientVarTypeTable: Record<string, number>
      classTable: Record<string, number | null>
      typeStatus: { verified: string[]; 'cross-checked': string[]; inferred: string[]; note?: string }
      fixtures: Record<string, { irType: string; namePinHex: string; valuePinHex: string; samples: string[]; note?: string }>
    }
  }
}

type CheckStatus = 'PASS' | 'DIFF' | 'NOTE'
type CheckResult = { rule: string; status: CheckStatus; detail: string }

type GraphView = { id: number; name?: string; nodes: unknown[]; graphValues: unknown[] }
type VerifyOptions = {
  gil: string
  scope: string
  entity?: number
  graph?: number
  rulesPath?: string
  json?: boolean
}

const hexOf = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex')

/** 第一个不一致字节偏移（按消息内字节序，从 0 起；-1 = 长度不同）。 */
function firstDiffOffset(actualHex: string, expectedHex: string): number {
  const n = Math.min(actualHex.length, expectedHex.length)
  for (let i = 0; i < n; i += 2) {
    if (actualHex.slice(i, i + 2) !== expectedHex.slice(i, i + 2)) return i / 2
  }
  return actualHex.length === expectedHex.length ? -1 : Math.min(actualHex.length, expectedHex.length) / 2
}

const isOwn = (o: unknown, k: string): boolean =>
  !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k)

const KNOWN_VAR_TYPES = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 17, 20, 21, 22, 23, 24, 27
])

// ---- .gil 图定位（复用静态组装解析；.gia 走 Root decode）----

function loadGilGraphs(bytes: Uint8Array, graphFilter: number | undefined): GraphView[] {
  const { rootMessage } = loadGiaProto()
  const GraphNodeT = rootMessage.root.lookupType('GraphNode')
  const GraphVariableT = rootMessage.root.lookupType('GraphVariable')
  const payload = bytes.slice(20, -4)
  const views: GraphView[] = []
  for (const g of listGraphs(bytes)) {
    if (graphFilter !== undefined && g.id !== graphFilter) continue
    const field = locateGraphField(payload, g.id).field
    const blob = payload.subarray(field.dataStart, field.dataEnd)
    const fields = parseWireMessage(blob) ?? []
    views.push({
      id: g.id,
      name: g.name,
      graphValues: (fields.filter((f) => f.number === 6 && f.wire === 2) ?? []).map((f) =>
        GraphVariableT.decode(f.value as Uint8Array)
      ),
      nodes: (fields.filter((f) => f.number === 3 && f.wire === 2) ?? []).map((f) =>
        GraphNodeT.decode(f.value as Uint8Array)
      )
    })
  }
  return views
}

function loadGiaGraphs(payload: Uint8Array, graphFilter: number | undefined): GraphView[] {
  const { rootMessage } = loadGiaProto()
  const root = rootMessage.decode(payload) as any
  const units = [root.graph, ...(root.accessories ?? [])].filter(Boolean)
  const views: GraphView[] = []
  for (const unit of units) {
    const graph = unit?.graph?.inner?.graph
    if (!graph) continue
    const id = Number(unit?.id?.id ?? graph?.id?.id?.id ?? 0)
    if (graphFilter !== undefined && id !== graphFilter) continue
    views.push({
      id,
      name: unit?.name ?? graph?.name,
      graphValues: graph.graphValues ?? [],
      nodes: graph.nodes ?? []
    })
  }
  return views
}

function loadGraphs(file: string, bytes: Uint8Array, graphFilter: number | undefined): GraphView[] {
  return file.toLowerCase().endsWith('.gia')
    ? loadGiaGraphs(bytes.slice(20, -4), graphFilter)
    : loadGilGraphs(bytes, graphFilter)
}

// ---- 通用 pin 值形态检查 ----

function pinOf(node: unknown, kind: number, index: number): any {
  const pins = (node as { pins?: unknown[] }).pins ?? []
  return pins.find((p) => {
    const pn = p as { i1?: { kind?: number; index?: number } }
    return pn.i1?.kind === kind && pn.i1?.index === index
  })
}

function varBaseHex(value: unknown, VarBaseT: protobuf.Type): string {
  return hexOf(VarBaseT.encode(value as protobuf.Message).finish())
}

/** 标量 VarBase 内层形态检查（server 用 type_server / client 用 type_client，由 isClient 切换）。
 *  requireEmptyPayload=true 时要求默认值形态（空 payload）；false 只查 class/itemType/payload 键（显式值合法）。 */
function checkInnerForm(
  inner: any,
  irType: string,
  isClient: boolean,
  rules: RulesTable,
  requireEmptyPayload = false,
  allowInnerAlreadySetVal = false
): { ok: boolean; detail: string } {
  const problems: string[] = []
  const cls = isClient
    ? ('entity' === irType || irType in rules.rules['local-client'].classTable
        ? rules.rules['local-client'].classTable[irType]
        : irType.endsWith('_list') || irType === 'dict'
          ? rules.rules['local-client'].classTable[irType === 'dict' ? 'dict' : 'list']
          : undefined)
    : SERVER_CLASS_BY_TYPE[irType]
  if (cls === undefined) return { ok: false, detail: `未知类型 ${irType}（不在规律表）` }
  if (cls === null) {
    if (isOwn(inner, 'class')) problems.push('entity 内层不应有 class 字段')
  } else if (inner.class !== cls) {
    problems.push(`class=${inner.class}（期望 ${cls}）`)
  }
  const it = inner?.itemType
  if (!it) {
    problems.push('缺 itemType')
  } else {
    const cb = it.classBase
    if (isClient) {
      const ctype = it.type_client?.type
      const exp = rules.rules['local-client'].clientVarTypeTable[irType]
      if (cb !== 2) problems.push(`itemType.classBase=${cb}（期望 2 client）`)
      if (ctype !== exp) problems.push(`type_client.type=${ctype}（期望 ${exp}）`)
    } else {
      const stype = it.type_server?.type
      const exp = SERVER_VAR_TYPE_BY_NAME[irType]
      if (cb !== 1) problems.push(`itemType.classBase=${cb}（期望 1 server）`)
      if (stype !== exp) problems.push(`type_server.type=${stype}（期望 ${exp}）`)
      if (isOwn(it.type_server, 'kind')) problems.push('type_server.kind 不应显式写 0')
    }
  }
  if (!allowInnerAlreadySetVal && isOwn(inner, 'alreadySetVal')) {
    problems.push('内层不应有 alreadySetVal')
  }
  if (cls === null) {
    const payloadKeys = PAYLOAD_KEYS.filter((k) => isOwn(inner, k))
    if (payloadKeys.length > 0) problems.push(`entity 内层不应有 payload（${payloadKeys.join(',')}）`)
  } else if (cls === 10002) {
    const arr = inner?.bArray
    if (!arr || !Array.isArray(arr.entries)) problems.push('列表内层缺 bArray.entries')
  } else {
    const payloadKeys = PAYLOAD_KEYS.filter((k) => isOwn(inner, k))
    const expectedEmpty = isClient
      ? CLIENT_PAYLOAD_BY_CLASS[cls]
      : SERVER_PAYLOAD_BY_CLASS[cls]
    if (expectedEmpty === undefined) {
      if (payloadKeys.length !== 1) problems.push(`payload 键数=${payloadKeys.length}（期望 1 个）`)
    } else {
      const has = payloadKeys.includes(expectedEmpty)
      if (!has) {
        problems.push(`缺 ${expectedEmpty} payload（实际 ${payloadKeys.join(',') || '无'}）`)
      } else if (requireEmptyPayload && !isPayloadEmpty(inner[expectedEmpty])) {
        problems.push(`${expectedEmpty} payload 非空（默认值形态）`)
      }
    }
  }
  return { ok: problems.length === 0, detail: problems.join('；') || '内层形态一致' }
}

/** payload 内容为空判定：无字段，或只有 val 且 val 为空对象（零 vec3 的 {val:{}} 属空）。 */
function isPayloadEmpty(payload: unknown): boolean {
  const content = JSON.parse(JSON.stringify(payload ?? {}))
  const keys = Object.keys(content)
  if (keys.length === 0) return true
  if (keys.length === 1 && keys[0] === 'val') {
    const v = content.val
    if (v === null || v === undefined) return true
    if (typeof v === 'object') return Object.keys(v).length === 0
  }
  return false
}

const PAYLOAD_KEYS = [
  'bId',
  'bInt',
  'bFloat',
  'bString',
  'bEnum',
  'bVector',
  'bStruct',
  'bArray',
  'bMap',
  'bMapPair'
]
const CLIENT_PAYLOAD_BY_CLASS: Record<number, string> = {
  2: 'bInt',
  5: 'bString',
  7: 'bVector',
  4: 'bFloat',
  6: 'bEnum',
  1: 'bId',
  10002: 'bArray'
}
const SERVER_PAYLOAD_BY_CLASS: Record<number, string> = CLIENT_PAYLOAD_BY_CLASS
const SERVER_VAR_TYPE_BY_NAME: Record<string, number> = {
  entity: 1,
  guid: 2,
  int: 3,
  bool: 4,
  float: 5,
  str: 6,
  guid_list: 7,
  int_list: 8,
  bool_list: 9,
  float_list: 10,
  str_list: 11,
  vec3: 12,
  entity_list: 13,
  vec3_list: 15,
  faction: 17,
  config_id: 20,
  prefab_id: 21,
  config_id_list: 22,
  prefab_id_list: 23,
  faction_list: 24,
  dict: 27
}
const SERVER_CLASS_BY_TYPE: Record<string, number | null> = {
  int: 2,
  str: 5,
  guid: 1,
  float: 4,
  bool: 6,
  vec3: 7,
  entity: null,
  int_list: 10002,
  str_list: 10002,
  entity_list: 10002,
  guid_list: 10002,
  float_list: 10002,
  vec3_list: 10002,
  bool_list: 10002,
  config_id: 1,
  prefab_id: 1,
  faction: 1,
  config_id_list: 10002,
  prefab_id_list: 10002,
  faction_list: 10002,
  dict: 10003
}

/** ConcreteBase 包裹值检查：{1:10000, 2:1, 110:{ioc?, 2:内层}}。返回 {ok, ioc, inner}。 */
function checkConcreteWrap(
  value: any,
  VarBaseT: protobuf.Type,
  expectIoc: number
): { ok: boolean; detail: string; ioc?: number; inner?: any } {
  const problems: string[] = []
  if (!value || value.class !== 10000) problems.push(`class=${value?.class}（期望 10000 ConcreteBase）`)
  if (value.alreadySetVal !== true) problems.push(`alreadySetVal=${value?.alreadySetVal}（期望 true）`)
  const cv = value?.bConcreteValue
  if (!cv) {
    problems.push('缺 bConcreteValue')
    return { ok: problems.length === 0, detail: problems.join('；') }
  }
  if (expectIoc === 0) {
    if (isOwn(cv, 'indexOfConcrete')) problems.push(`indexOfConcrete=${cv.indexOfConcrete}（0 应省略）`)
  } else if (cv.indexOfConcrete !== expectIoc) {
    problems.push(`indexOfConcrete=${cv.indexOfConcrete}（期望 ${expectIoc}）`)
  }
  return { ok: problems.length === 0, detail: problems.join('；') || 'ConcreteBase 形态一致', ioc: cv.indexOfConcrete, inner: cv.value }
}

// ---- scope: graph ----

function verifyGraphScope(graphs: GraphView[], rules: RulesTable, out: CheckResult[]): void {
  const { rootMessage } = loadGiaProto()
  const GraphVariableT = rootMessage.root.lookupType('GraphVariable')
  const VarBaseT = rootMessage.root.lookupType('VarBase')
  if (graphs.length === 0) {
    out.push({ rule: 'graph.scope', status: 'NOTE', detail: '未找到节点图（--graph 过滤后为空）' })
    return
  }
  for (const g of graphs) {
    const label = `graph ${g.id}${g.name ? `「${g.name}」` : ''}`
    if (g.graphValues.length === 0) {
      out.push({ rule: 'graph.records', status: 'PASS', detail: `${label}：无图变量记录` })
      continue
    }
    for (const gv of g.graphValues) {
      const v = gv as any
      const name = v.name ?? ''
      const problems: string[] = []
      if (typeof name !== 'string' || name.length === 0) problems.push('缺 name(f2)')
      if (!KNOWN_VAR_TYPES.has(v.type)) problems.push(`type(f3)=${v.type} 不在已知 VarType`)
      if (v.keyType !== 6) problems.push(`keyType(f7)=${v.keyType}（期望 6）`)
      if (v.valueType !== 6) problems.push(`valueType(f8)=${v.valueType}（期望 6）`)
      if (isOwn(v, 'exposed')) problems.push('exposed(f5) 默认值不应显式写')
      if (isOwn(v, 'structId')) problems.push('structId(f6) 默认值不应显式写')
      const values = v.values as any
      if (!values) {
        problems.push('缺 values(f4)')
      } else {
        if (values.class === 10002) {
          const entries = values.bArray?.entries
          if (!Array.isArray(entries)) {
            problems.push('ArrayBase 缺 bArray.entries')
          } else {
            if (entries.length === 0 && isOwn(values, 'alreadySetVal')) {
              problems.push('空列表不应有 alreadySetVal（v6 变量_6..10）')
            } else if (entries.length > 0 && values.alreadySetVal !== true) {
              problems.push(`非空列表缺 alreadySetVal（期望 true）`)
            }
            entries.forEach((e: any, i: number) => {
              if (!e || !(e.class >= 1 && e.class <= 7)) {
                problems.push(`元素[${i}] class=${e?.class} 非标量`)
                return
              }
              const it = e?.itemType
              if (!it?.type_server || it.type_server.type === undefined) {
                problems.push(`元素[${i}] 缺 itemType.type_server.type`)
              } else if (isOwn(it.type_server, 'kind')) {
                problems.push(`元素[${i}] type_server.kind 不应显式写 0`)
              }
              const payloadKeys = PAYLOAD_KEYS.filter((k) => isOwn(e, k))
              const hasValue = payloadKeys.some((k) => !isPayloadEmpty(e[k]))
              if (hasValue && e.alreadySetVal !== true) {
                problems.push(`元素[${i}] 非默认值缺 alreadySetVal（编辑器 v4 形态）`)
              } else if (!hasValue && isOwn(e, 'alreadySetVal')) {
                problems.push(`元素[${i}] 默认值不应有 alreadySetVal`)
              }
            })
          }
        } else if ([2, 4, 5, 6, 7].includes(values.class)) {
          const it = values.itemType
          if (!it?.type_server || it.type_server.type === undefined) {
            problems.push('标量缺 itemType.type_server.type')
          } else if (isOwn(it.type_server, 'kind')) {
            problems.push('type_server.kind 不应显式写 0')
          }
          if (values.class === 7 && !values.bVector) problems.push('vec3 缺 bVector')
        } else {
          problems.push(`values.class=${values.class} 不在已知形态`)
        }
      }
      const recHex = hexOf(GraphVariableT.encode(v as protobuf.Message).finish())
      const fixtures = rules.rules.graph.fixtures[name]
      let fixtureResult: CheckResult | undefined
      if (fixtures && fixtures.length > 0) {
        const match = fixtures.find((f) => f.hex === recHex)
        if (match) {
          fixtureResult = {
            rule: 'graph.fixture',
            status: 'PASS',
            detail: `${label}「${name}」hex 与 ${match.samples.join('/')} fixture（${match.variant}）逐字节一致`
          }
        } else {
          const offsets = fixtures.map((f) => `vs ${f.samples.join('/')} @${firstDiffOffset(recHex, f.hex)}`)
          fixtureResult = {
            rule: 'graph.fixture',
            status: 'DIFF',
            detail: `${label}「${name}」hex 与全部 ${fixtures.length} 个 fixture 不一致（${offsets.join('；')}）`
          }
        }
      }
      out.push(
        problems.length === 0
          ? { rule: 'graph.record', status: 'PASS', detail: `${label}「${name}」骨架/形态一致` }
          : { rule: 'graph.record', status: 'DIFF', detail: `${label}「${name}」：${problems.join('；')}` }
      )
      if (fixtureResult) out.push(fixtureResult)
    }
  }
}

// ---- scope: local-server ----

function verifyLocalServerScope(graphs: GraphView[], rules: RulesTable, out: CheckResult[]): void {
  const { rootMessage } = loadGiaProto()
  const VarBaseT = rootMessage.root.lookupType('VarBase')
  const cidGet = rules.rules['local-server'].cidTable.verified.get
  const cidSet = rules.rules['local-server'].cidTable.verified.set
  const iocV = rules.rules['local-server'].iocTable.verified
  const fixtures = rules.rules['local-server'].fixtures
  let found = 0
  for (const g of graphs) {
    const label = `graph ${g.id}${g.name ? `「${g.name}」` : ''}`
    for (const node of g.nodes) {
      const n = node as any
      const gid = n.genericId?.nodeId
      if (gid !== 18 && gid !== 19 && gid !== 169 && gid !== 170) continue
      found++
      const cid = n.concreteId?.nodeId
      const nlabel = `${label} node#${n.nodeIndex} gid ${gid}`
      if (gid === 18 || gid === 19) {
        const isGet = gid === 18
        const table = isGet ? cidGet : cidSet
        const typeByCid = Object.entries(table).find(([, c]) => c === cid)?.[0]
        if (typeByCid) {
          out.push({ rule: 'local-server.cid', status: 'PASS', detail: `${nlabel} cid=${cid}（${typeByCid}）` })
        } else {
          out.push({
            rule: 'local-server.cid',
            status: 'NOTE',
            detail: `${nlabel} cid=${cid} 不在已验证 cid 表（inferred 段，待样本）`
          })
          continue
        }
        const irType = typeByCid
        const expectIoc = iocV[irType] ?? 0
        const valuePin = isGet ? pinOf(n, 3, 0) : pinOf(n, 3, 1)
        const checkPin = (pin: any, pinLabel: string) => {
          if (!pin?.value) {
            out.push({ rule: 'local-server.pin', status: 'DIFF', detail: `${nlabel} ${pinLabel} 缺值` })
            return
          }
          const wrap = checkConcreteWrap(pin.value, VarBaseT, expectIoc)
          const inner = wrap.inner
          const innerCheck =
            inner !== undefined
              ? checkInnerForm(inner, irType, false, rules)
              : { ok: false, detail: '缺内层 VarBase' }
          const fixture = fixtures[irType]
          const hex = varBaseHex(pin.value, VarBaseT)
          const isTrueVariant = inner?.bEnum && inner.bEnum.val === 1
          const fx = isTrueVariant ? fixtures['bool:true'] : fixture
          const hexOk = fx ? fx.hex === hex : undefined
          const problems: string[] = []
          if (!wrap.ok) problems.push(wrap.detail)
          if (!innerCheck.ok) problems.push(innerCheck.detail)
          if (hexOk === false) {
            problems.push(`hex 与 ${fx!.samples.join('/')} fixture 不一致 @byte ${firstDiffOffset(hex, fx!.hex)}`)
          }
          const status: CheckStatus = problems.length === 0 ? 'PASS' : 'DIFF'
          const hexDetail = hexOk === true ? ` hex==fixture(${fx!.samples.join('/')})` : ''
          out.push({
            rule: 'local-server.pin',
            status,
            detail: `${nlabel} ${pinLabel}（${irType}）${problems.join('；') || `形态一致${hexDetail}`}`
          })
        }
        checkPin(valuePin, isGet ? 'InParam[0]' : 'InParam[1]')
        if (isGet) {
          const outPin = pinOf(n, 4, 1)
          if (outPin?.value) checkPin(outPin, 'OutParam[1]')
        } else {
          // E<1016> 身份 pin：编辑器孤立 Set 节点整 pin 省略（v12 样本），存在才校验连线
          const idPin = pinOf(n, 3, 0)
          if (!idPin) {
            out.push({
              rule: 'local-server.identity',
              status: 'NOTE',
              detail: `${nlabel} 无 E<1016> 身份 pin（孤立 Set 节点，编辑器省略）`
            })
          } else {
            const conns = idPin.connects ?? []
            const ok = conns.length === 1 && conns[0].connect?.kind === 4 && conns[0].connect?.index === 0
            out.push({
              rule: 'local-server.identity',
              status: ok ? 'PASS' : 'DIFF',
              detail: `${nlabel} E<1016> 身份连线 ${ok ? '← Get OutParam[0]' : `异常（conns=${conns.length}）`}`
            })
          }
        }
      } else {
        // 拼装列表 169/170
        const elementType = cid === 170 ? 'str' : cid === 169 ? 'int' : undefined
        if (elementType === undefined) {
          out.push({ rule: 'local-server.assembly', status: 'NOTE', detail: `${nlabel} cid=${cid} 未闭合（inferred）` })
          continue
        }
        const countPin = pinOf(n, 3, 0)
        if (countPin?.value) {
          const cv = countPin.value as any
          const plain = cv.class !== 10000
          const countOk = plain && cv.class === 2 && cv.alreadySetVal === true && cv.bInt?.val !== undefined
          const countFixture = cv.bInt?.val !== undefined
            ? fixtures[`assembly:count:${elementType}:${cv.bInt.val}`]
            : undefined
          const hex = varBaseHex(countPin.value, VarBaseT)
          const fxOk = countFixture ? countFixture.hex === hex : undefined
          out.push({
            rule: 'local-server.assembly.count',
            status: countOk && fxOk !== false ? 'PASS' : 'DIFF',
            detail: `${nlabel} count pin=${cv.bInt?.val}${fxOk === true ? ` hex==fixture(${countFixture!.samples.join('/')})` : fxOk === false ? ` hex 不一致 @byte ${firstDiffOffset(hex, countFixture!.hex)}` : ''}${countOk ? '' : `（形态异常：${plain ? '' : 'ConcreteBase 包裹？'}class=${cv.class}）`}`
          })
        } else {
          out.push({ rule: 'local-server.assembly.count', status: 'NOTE', detail: `${nlabel} 无 count pin（count=0 编辑器省略，v13 观察，未专项闭合）` })
        }
        const expectElemIoc = elementType === 'str' ? 1 : 0
        const listType = elementType === 'str' ? 'str_list' : 'int_list'
        const pins = (n.pins ?? []) as any[]
        const elemPins = pins.filter((p) => p.i1?.kind === 3 && p.i1?.index >= 1)
        let checked = 0
        for (const ep of elemPins) {
          if (!ep.value) continue
          checked++
          const wrap = checkConcreteWrap(ep.value, VarBaseT, expectElemIoc)
          const innerCheck =
            wrap.inner !== undefined
              ? checkInnerForm(wrap.inner, elementType, false, rules, false, true)
              : { ok: false, detail: '缺内层' }
          const hasValue = (() => {
            const inner = wrap.inner
            if (!inner) return false
            const k = SERVER_PAYLOAD_BY_CLASS[inner.class]
            if (!k) return false
            return !isPayloadEmpty(inner[k])
          })()
          if (hasValue && innerCheck.ok && innerCheck.detail === '内层形态一致') {
            // 非默认元素：已有 alreadySetVal（checkInnerForm 不允许内层已有）→ 需单独断言
            if (!isOwn(wrap.inner, 'alreadySetVal') || wrap.inner.alreadySetVal !== true) {
              innerCheck.ok = false
              innerCheck.detail = '非默认元素缺 alreadySetVal'
            }
          }
          const val = wrap.inner?.bInt?.val ?? wrap.inner?.bString?.val
          const fx = val !== undefined ? fixtures[`assembly:element:${elementType}:${val}`] : undefined
          const hex = varBaseHex(ep.value, VarBaseT)
          const fxOk = fx ? fx.hex === hex : undefined
          if (checked <= 3 || fx) {
            out.push({
              rule: 'local-server.assembly.element',
              status: wrap.ok && innerCheck.ok && fxOk !== false ? 'PASS' : 'DIFF',
              detail: `${nlabel} 元素[${ep.i1.index}]${val !== undefined ? `=${val}` : '(默认)'} ${[wrap.detail, innerCheck.detail].filter((d) => d && d !== '形态一致' && d !== '内层形态一致').join('；') || '形态一致'}${fxOk === true ? ` hex==fixture(${fx!.samples.join('/')})` : fxOk === false ? ` hex 不一致 @byte ${firstDiffOffset(hex, fx!.hex)}` : ''}`
            })
          }
        }
        const outPin = pinOf(n, 4, 0)
        if (outPin?.value) {
          const wrap = checkConcreteWrap(outPin.value, VarBaseT, expectElemIoc)
          const inner = wrap.inner
          const innerOk =
            inner !== undefined && inner.class === 10002
              ? (() => {
                  const it = inner.itemType
                  const t = it?.type_server?.type
                  const exp = SERVER_VAR_TYPE_BY_NAME[listType]
                  const emptyArr = Array.isArray(inner.bArray?.entries) && inner.bArray.entries.length === 0
                  return { ok: t === exp && emptyArr, detail: t === exp ? 'ArrayBase 空字面量锚' : `type_server.type=${t}（期望 ${exp}）` }
                })()
              : { ok: false, detail: 'OutParam 内层非 ArrayBase' }
          const fx = fixtures[`assembly:out:${listType}`]
          const hex = varBaseHex(outPin.value, VarBaseT)
          const fxOk = fx ? fx.hex === hex : undefined
          out.push({
            rule: 'local-server.assembly.out',
            status: wrap.ok && innerOk.ok && fxOk !== false ? 'PASS' : 'DIFF',
            detail: `${nlabel} OutParam ${wrap.detail}；${innerOk.detail}${fxOk === true ? ` hex==fixture(${fx!.samples.join('/')})` : fxOk === false ? ` hex 不一致 @byte ${firstDiffOffset(hex, fx!.hex)}` : ''}`
          })
        }
      }
    }
  }
  if (found === 0) {
    out.push({ rule: 'local-server.scope', status: 'NOTE', detail: '未发现 Get/Set/拼装列表节点' })
  }
}

// ---- scope: local-client ----

function verifyLocalClientScope(graphs: GraphView[], rules: RulesTable, out: CheckResult[]): void {
  const { rootMessage } = loadGiaProto()
  const VarBaseT = rootMessage.root.lookupType('VarBase')
  const iocTable = rules.rules['local-client'].iocTable
  const ctypeTable = rules.rules['local-client'].clientVarTypeTable
  const irTypeByCtype: Record<number, string> = Object.fromEntries(
    Object.entries(ctypeTable).map(([k, v]) => [v, k])
  )
  const statusByType = rules.rules['local-client'].typeStatus
  const fixtures = rules.rules['local-client'].fixtures
  let found = 0
  for (const g of graphs) {
    const label = `graph ${g.id}${g.name ? `「${g.name}」` : ''}`
    for (const node of g.nodes) {
      const n = node as any
      const gid = n.genericId?.nodeId
      if (gid !== 200081 && gid !== 200082) continue
      found++
      const nlabel = `${label} node#${n.nodeIndex} gid ${gid}`
      const isGet = gid === 200082
      const cid = n.concreteId?.nodeId
      const expectCid = isGet ? 1036 : 2000
      if (cid !== expectCid) {
        out.push({ rule: 'local-client.cid', status: 'DIFF', detail: `${nlabel} cid=${cid}（期望 ${expectCid}）` })
        continue
      }
      out.push({ rule: 'local-client.cid', status: 'PASS', detail: `${nlabel} cid=${cid}` })
      const namePin = pinOf(n, 3, 0)
      const name = namePin?.value?.bString?.val as string | undefined
      if (!namePin || namePin.type !== 9) {
        out.push({ rule: 'local-client.name-pin', status: 'DIFF', detail: `${nlabel} 名字 pin 缺失或 type!=9` })
        continue
      }
      const npv = namePin.value as any
      const nameOk =
        npv.class === 5 &&
        npv.alreadySetVal === true &&
        npv.itemType?.classBase === 2 &&
        npv.itemType?.type_client?.type === 9 &&
        typeof npv.bString?.val === 'string' &&
        npv.bString.val.length > 0
      out.push({
        rule: 'local-client.name-pin',
        status: nameOk ? 'PASS' : 'DIFF',
        detail: `${nlabel}「${name ?? ''}」StringBase 形态${nameOk ? '一致' : '异常'}`
      })
      const valuePin = isGet ? pinOf(n, 4, 0) : pinOf(n, 3, 1)
      if (!valuePin) {
        out.push({ rule: 'local-client.value-pin', status: 'DIFF', detail: `${nlabel} 值 pin 缺失` })
        continue
      }
      const ctype = valuePin.type
      const irType = irTypeByCtype[ctype]
      if (!irType || iocTable[irType] === undefined) {
        out.push({ rule: 'local-client.value-pin', status: 'NOTE', detail: `${nlabel} type=${ctype} 不在规律表（未闭合类型）` })
        continue
      }
      const typeStatus = statusByType.verified.includes(irType)
        ? 'verified'
        : statusByType['cross-checked'].includes(irType)
          ? 'cross-checked'
          : 'inferred'
      const expectIoc = iocTable[irType]
      const wrap = checkConcreteWrap(valuePin.value, VarBaseT, expectIoc)
      const innerCheck =
        wrap.inner !== undefined
          ? checkInnerForm(wrap.inner, irType, true, rules)
          : { ok: false, detail: '缺内层 VarBase' }
      const fixture = fixtures[name ?? '']
      const hex = varBaseHex(valuePin.value, VarBaseT)
      const fxOk = fixture ? fixture.valuePinHex === hex : undefined
      const problems: string[] = []
      if (!wrap.ok) problems.push(wrap.detail)
      if (!innerCheck.ok) problems.push(innerCheck.detail)
      if (fxOk === false) {
        problems.push(`hex 与 ${fixture!.samples.join('/')} fixture 不一致 @byte ${firstDiffOffset(hex, fixture!.valuePinHex)}`)
      }
      const status: CheckStatus =
        typeStatus === 'inferred'
          ? 'NOTE'
          : problems.length === 0
            ? 'PASS'
            : 'DIFF'
      const fxDetail = fxOk === true ? ` hex==fixture(${fixture!.samples.join('/')})` : ''
      const stDetail = typeStatus === 'inferred' ? '（inferred：client dict 无编辑器样本，设计文档要求不硬断言）' : ''
      out.push({
        rule: `local-client.value-pin.${irType}`,
        status,
        detail: `${nlabel}「${name ?? ''}」type=${ctype}(${irType}) ${problems.join('；') || `形态一致${fxDetail}`}${stDetail}`
      })
      if (!isGet) {
        const hasClientExec = (n.pins ?? []).some((p: any) => p.i1?.kind === 5)
        const hasFlow = (n.pins ?? []).some((p: any) => p.i1?.kind === 1 || p.i1?.kind === 2)
        const ok = hasClientExec && !hasFlow
        out.push({
          rule: 'local-client.set-exec',
          status: ok ? 'PASS' : 'DIFF',
          detail: `${nlabel} Set 执行 ${ok ? '走 ClientExec、无流 pin' : `（ClientExec=${hasClientExec} 流pin=${hasFlow}）`}`
        })
      }
    }
  }
  if (found === 0) {
    out.push({ rule: 'local-client.scope', status: 'NOTE', detail: '未发现客户端局部变量节点' })
  }
}

// ---- scope: assets ----

function verifyAssetsScope(
  payload: Uint8Array,
  rules: RulesTable,
  opts: VerifyOptions,
  out: CheckResult[]
): void {
  const entryForm = rules.rules.assets.entryForm
  const fixtures = rules.rules.assets.fixtures
  const top = parseWireMessage(payload) ?? []
  const root5 = top.find((f) => f.number === 5 && f.wire === 2)
  if (!root5) {
    out.push({ rule: 'assets.scope', status: 'NOTE', detail: '无 root5 节（.gia 不支持 assets scope）' })
    return
  }
  const section = parseWireMessage(root5.value as Uint8Array) ?? []
  let found = 0
  for (const f of section.filter((x) => x.number === 1 && x.wire === 2)) {
    const rec = parseWireMessage(f.value as Uint8Array) ?? []
    const id = rec.find((x) => x.number === 1 && x.wire === 0)?.value as number | undefined
    if (opts.entity !== undefined && id !== opts.entity) continue
    if (id === undefined) continue
    const nameF = rec.find((x) => x.number === 2 && x.wire === 2)
    const name = nameF ? new TextDecoder('utf-8').decode(nameF.value as Uint8Array) : ''
    for (const f7 of rec.filter((x) => x.number === 7 && x.wire === 2)) {
      const comp = parseWireMessage(f7.value as Uint8Array) ?? []
      for (const f11 of comp.filter((x) => x.number === 11 && x.wire === 2)) {
        const vars = parseWireMessage(f11.value as Uint8Array) ?? []
        for (const v of vars.filter((x) => x.number === 1 && x.wire === 2)) {
          found++
          const entry = parseWireMessage(v.value as Uint8Array) ?? []
          const eNameF = entry.find((x) => x.number === 2 && x.wire === 2)
          const eName = eNameF
            ? new TextDecoder('utf-8', { fatal: true }).decode(eNameF.value as Uint8Array)
            : ''
          const typeCode = entry.find((x) => x.number === 3 && x.wire === 0)?.value as number | undefined
          const f5 = entry.find((x) => x.number === 5 && x.wire === 0)?.value
          const f4 = entry.find((x) => x.number === 4 && x.wire === 2)
          const f4Fields = f4 ? parseWireMessage(f4.value as Uint8Array) ?? [] : []
          const f4Code = f4Fields.find((x) => x.number === 1 && x.wire === 0)?.value
          const f4Env = f4Fields.find((x) => x.number === 2 && x.wire === 2)
          const f4EnvFields = f4Env ? parseWireMessage(f4Env.value as Uint8Array) ?? [] : []
          const f4Val = typeCode !== undefined ? f4Fields.find((x) => x.number === typeCode + 10) : undefined
          const f6 = entry.find((x) => x.number === 6 && x.wire === 2)
          const f6Fields = f6 ? parseWireMessage(f6.value as Uint8Array) ?? [] : []
          const f6Code = f6Fields.find((x) => x.number === 1 && x.wire === 0)?.value
          const f6Env = f6Fields.find((x) => x.number === 2 && x.wire === 2)
          const problems: string[] = []
          if (!eName) problems.push(`缺 name(f2)`)
          if (typeCode === undefined || !KNOWN_VAR_TYPES.has(typeCode)) {
            problems.push(`typeCode(f3)=${typeCode} 不在已知 VarType`)
          }
          if (f5 !== 1) problems.push(`f5=${f5}（期望 1 恒写）`)
          if (!f4 || f4Code !== typeCode) {
            problems.push(`f4 缺失或 f4Code=${f4Code}≠typeCode`)
          } else {
            const envOk =
              f4EnvFields.length === 2 &&
              f4EnvFields[0]?.wire === 0 &&
              f4EnvFields[0]?.value === typeCode &&
              f4EnvFields[1]?.wire === 2 &&
              (f4EnvFields[1].value as Uint8Array).length === 0
            if (!envOk) problems.push(`f4.f2 双层包裹异常（期望 {1:${typeCode}, 2:{}}）`)
            if (!f4Val) problems.push(`缺 f4.f${Number(typeCode) + 10} 默认值字段`)
          }
          const f6Ok =
            f6Fields.length === 2 &&
            f6Code === typeCode &&
            f6Env?.wire === 2 &&
            (f6Env.value as Uint8Array).length === 0
          if (!f6Ok) problems.push(`f6 类型包裹异常（期望单层 {1:${typeCode}, 2:{}}）`)
          const entryHex = hexOf(v.value as Uint8Array)
          const fixture = fixtures[`${id}:${eName}`]
          let fxResult: CheckResult | undefined
          if (fixture) {
            if (fixture.hex === entryHex) {
              fxResult = {
                rule: 'assets.fixture',
                status: 'PASS',
                detail: `entity ${id}「${eName}」hex 与 ${fixture.samples.join('/')} fixture 逐字节一致`
              }
            } else {
              fxResult = {
                rule: 'assets.fixture',
                status: 'DIFF',
                detail: `entity ${id}「${eName}」hex 与 ${fixture.samples.join('/')} fixture 不一致 @byte ${firstDiffOffset(entryHex, fixture.hex)}`
              }
            }
          }
          out.push({
            rule: 'assets.entry',
            status: problems.length === 0 ? 'PASS' : 'DIFF',
            detail: `entity ${id}「${eName}」${problems.join('；') || `骨架一致（${entryForm.f5}）`}`
          })
          if (fxResult) out.push(fxResult)
        }
      }
    }
  }
  if (found === 0) {
    out.push({
      rule: 'assets.scope',
      status: 'NOTE',
      detail: opts.entity !== undefined ? `entity ${opts.entity} 无变量容器/entry` : '未发现任何实体变量 entry'
    })
  }
}

// ---- 主入口 ----

function parseArgs(argv: string[]): VerifyOptions {
  const opts: VerifyOptions = { gil: '', scope: 'all' }
  const take = (name: string): string | undefined => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  opts.gil = take('--gil') ?? ''
  opts.scope = take('--scope') ?? 'all'
  const entity = take('--entity')
  if (entity !== undefined) opts.entity = Number(entity)
  const graph = take('--graph')
  if (graph !== undefined) opts.graph = Number(graph)
  opts.rulesPath = take('--rules')
  opts.json = argv.includes('--json')
  return opts
}

const VALID_SCOPES = ['assets', 'graph', 'local-server', 'local-client', 'all']

export async function runVariablesVerify(argv: string[]): Promise<void> {
  const opts = parseArgs(argv)
  if (!opts.gil || !fs.existsSync(opts.gil)) {
    throw new Error(
      '[error] variables:verify 需要 --gil <file>（.gil/.gia 只读核验）\n' +
        '  可选：--scope assets|graph|local-server|local-client|all（默认 all）\n' +
        '        --entity <id> 只核验指定实体；--graph <id> 只核验指定图；--json 输出 JSON'
    )
  }
  if (!VALID_SCOPES.includes(opts.scope)) {
    throw new Error(`[error] 未知 scope：${opts.scope}（可选 ${VALID_SCOPES.join('|')}）`)
  }
  const rulesPath = opts.rulesPath ?? DEFAULT_RULES_PATH
  const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8')) as RulesTable
  const bytes = new Uint8Array(fs.readFileSync(opts.gil))
  const payload = bytes.slice(20, -4)

  const scopes = opts.scope === 'all' ? ['assets', 'graph', 'local-server', 'local-client'] : [opts.scope]
  const reports: Array<{ scope: string; checks: CheckResult[] }> = []
  for (const scope of scopes) {
    const checks: CheckResult[] = []
    if (scope === 'graph') {
      const graphs = loadGraphs(opts.gil, bytes, opts.graph)
      verifyGraphScope(graphs, rules, checks)
    } else if (scope === 'local-server') {
      const graphs = loadGraphs(opts.gil, bytes, opts.graph)
      verifyLocalServerScope(graphs, rules, checks)
    } else if (scope === 'local-client') {
      const graphs = loadGraphs(opts.gil, bytes, opts.graph)
      verifyLocalClientScope(graphs, rules, checks)
    } else {
      verifyAssetsScope(payload, rules, opts, checks)
    }
    reports.push({ scope, checks })
  }

  const allChecks = reports.flatMap((r) => r.checks)
  const pass = allChecks.filter((c) => c.status === 'PASS').length
  const diff = allChecks.filter((c) => c.status === 'DIFF').length
  const note = allChecks.filter((c) => c.status === 'NOTE').length

  if (opts.json) {
    const samples = rules.samples
    console.log(
      JSON.stringify(
        {
          file: opts.gil,
          rules: path.relative(process.cwd(), rulesPath),
          rulesVersion: rules.meta.version,
          samples: samples.length,
          scopes: reports.map((r) => ({
            scope: r.scope,
            checks: r.checks,
            summary: summarize(r.checks)
          })),
          summary: { pass, diff, note, verdict: diff === 0 ? 'PASS' : 'DIFF' }
        },
        null,
        2
      )
    )
  } else {
    console.log(`== variables:verify ==`)
    console.log(`file: ${opts.gil} (${bytes.length} B)`)
    console.log(`rules: ${path.relative(process.cwd(), rulesPath)} v${rules.meta.version}（${rules.samples.length} 样本）`)
    for (const r of reports) {
      console.log(`\n== scope ${r.scope} ==`)
      for (const c of r.checks) {
        console.log(`  ${c.status.padEnd(4)} ${c.rule}  ${c.detail}`)
      }
      const s = summarize(r.checks)
      console.log(`  -- ${r.scope}: ${s.pass} PASS / ${s.diff} DIFF / ${s.note} NOTE`)
    }
    console.log(`\n== 汇总: ${pass} PASS / ${diff} DIFF / ${note} NOTE ==`)
    if (diff === 0) {
      console.log('核验结论: ALL PASS —— 与规律表逐字节比对一致（L2 核验；注入正确性 L3 / 游戏行为 L4 不属本命令）')
    } else {
      console.log('核验结论: DIFF 存在 —— 见上方差异条目（字节偏移为消息内偏移）')
    }
  }
  process.exitCode = diff > 0 ? 1 : 0
}

function summarize(checks: CheckResult[]): { pass: number; diff: number; note: number } {
  return {
    pass: checks.filter((c) => c.status === 'PASS').length,
    diff: checks.filter((c) => c.status === 'DIFF').length,
    note: checks.filter((c) => c.status === 'NOTE').length
  }
}
