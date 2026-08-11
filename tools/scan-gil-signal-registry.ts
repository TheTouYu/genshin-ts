/**
 * 宽容模式读取 GIL 信号注册表：信号名、send/monitor/server 三 identity、参数三套 pinIndex、定义布局。
 *
 * 背景（2026-08-11 eval-split 复盘）：assets:signals inspect/register 走 readRegisteredSignalsFromGil()
 * （src/cli/gil_signals.ts），该函数对任一注册项缺 signal-name pin layout（definition field 106）
 * 即整体抛错——本图 cube2_test_turn 正是这种残缺注册，导致 CLI 全程不可用；复盘会话被迫自写
 * read-regs.ts 四次迭代（模块路径/未导出函数/readVarint 缺失）才拿到注册定义。
 * 本工具 = 该脚本的宽容版 + 定义布局读取（read-name-cpi2 能力）：残缺项单条标记 broken，不中断全表。
 *
 * 用法:
 *   npx tsx tools/scan-gil-signal-registry.ts <map.gil>                       # 全部注册项（含三套 pinIndex）
 *   npx tsx tools/scan-gil-signal-registry.ts <map.gil> --signal cube_turn    # 单信号
 *   npx tsx tools/scan-gil-signal-registry.ts <map.gil> --json                # 结构化输出
 *   npx tsx tools/scan-gil-signal-registry.ts <map.gil> --defs                # 附加三份定义的布局（信号名/执行输出 pinIndex）
 *   npx tsx tools/scan-gil-signal-registry.ts <map.gil> --gate                # 有残缺项退出码 1（探活门禁）
 */
import { readFileSync } from 'node:fs'

import { readGilPayloadFields } from '../src/cli/gil_extract_utils.js'
import { parseWireMessage, printableWireText } from '../src/cli/static_assembly/wire.js'
import { readFieldBytes, readFieldMessages, readFieldVarint, readVarint } from '../src/injector/binary.js'

type ParamInfo = {
  name: string
  typeCode: number
  sendPinIndex: number
  monitorPinIndex: number
  serverPinIndex: number
}
type DefLayout = {
  field: number
  name: string | undefined
  pinIndex: number | undefined
  text: string | undefined
}
type SignalEntry = {
  name: string
  sendId: number
  monitorId: number
  serverId: number
  signalVersion: number
  params: ParamInfo[]
  broken: string[]
  layouts?: { send: DefLayout[]; monitor: DefLayout[]; server: DefLayout[] }
}

function usage(exitCode = 0): never {
  console.log(
    [
      '用法: npx tsx tools/scan-gil-signal-registry.ts <map.gil> [选项]',
      '',
      '选项:',
      '  --signal <名称>   只输出指定信号',
      '  --json            输出 JSON',
      '  --defs            附加三份定义（send/monitor/server）的布局明细',
      '  --gate            存在残缺注册项时退出码 1（探活门禁；缺省发现残缺项也打印警告）',
      '  -h, --help        显示帮助',
      '',
      '宽容语义: 单条注册项缺定义/缺 name CPI/参数不齐 → 该条标记 broken 并继续，不中断全表。',
      '（对照 src/cli/gil_signals.ts readSignalLayouts：任一残缺整体抛错 → assets:signals CLI 不可用）'
    ].join('\n')
  )
  process.exit(exitCode)
}

function parseNodeGraphId(buf: Uint8Array): { type?: number; nodeId?: number } {
  const out: { type?: number; nodeId?: number } = {}
  let offset = 0
  while (offset < buf.length) {
    const key = readVarint(buf, offset)
    if (!key) break
    offset = key.next
    const field = key.value >> 3
    const wire = key.value & 7
    if (wire === 0) {
      const v = readVarint(buf, offset)
      if (!v) break
      offset = v.next
      if (field === 2) out.type = v.value
      if (field === 5) out.nodeId = v.value
      continue
    }
    if (wire === 2) {
      const l = readVarint(buf, offset)
      if (!l) break
      offset = l.next + l.value
      continue
    }
    if (wire === 1) { offset += 8; continue }
    if (wire === 5) { offset += 4; continue }
    break
  }
  return out
}

function defLayouts(blob: Uint8Array): DefLayout[] {
  // 定义记录 blob：每个 wire=2 子消息（参数/输出/信号名）内 field 8 = pinIndex，field 1 = 名称文本
  const out: DefLayout[] = []
  const m = parseWireMessage(blob) ?? []
  for (const f of m) {
    if (f.wire !== 2) continue
    const sub = parseWireMessage(f.value as Uint8Array) ?? []
    const nameF = sub.find((x) => x.number === 1 && x.wire === 2)
    const name = nameF ? printableWireText(nameF.value as Uint8Array) : undefined
    const piF = sub.find((x) => x.number === 8)
    const pi = piF?.value as number | undefined
    out.push({ field: f.number, name, pinIndex: pi, text: printableWireText(f.value as Uint8Array) })
  }
  return out
}

function main(): void {
  const args = process.argv.slice(2)
  if (args.includes('-h') || args.includes('--help')) usage(0)
  const gil = args[0]
  if (!gil || gil.startsWith('--')) usage(1)
  const wantSignal = args.includes('--signal') ? args[args.indexOf('--signal') + 1] : undefined
  const asJson = args.includes('--json')
  const withDefs = args.includes('--defs')
  const gate = args.includes('--gate')

  const { payload, fields } = readGilPayloadFields(gil)
  const top = parseWireMessage(payload) ?? []
  const containerField = top.find((f) => f.number === 10 && f.wire === 2)
  const container = containerField ? (parseWireMessage(containerField.value as Uint8Array) ?? []) : []

  // 定义记录表：nodeId -> blob
  const definitions = new Map<number, Uint8Array>()
  for (const wrapper of container.filter((f) => f.number === 2 && f.wire === 2)) {
    const inner = readFieldBytes(wrapper.value as Uint8Array, 1)
    const idBytes = inner ? readFieldBytes(inner, 4) : undefined
    const id = idBytes
      ? (parseNodeGraphId(readFieldBytes(idBytes, 1) ?? idBytes).nodeId ??
        parseNodeGraphId(readFieldBytes(idBytes, 2) ?? idBytes).nodeId)
      : undefined
    if (id !== undefined && inner) definitions.set(id, inner)
  }

  const indexField = container.find((f) => f.number === 5 && f.wire === 2)
  const index = indexField ? (parseWireMessage(indexField.value as Uint8Array) ?? []) : []
  const entries: SignalEntry[] = []

  for (const field of index.filter((e) => e.number === 3 && e.wire === 2)) {
    const entry = parseWireMessage(field.value as Uint8Array) ?? []
    const nameF = entry.find((e) => e.number === 3 && e.wire === 2)
    const name = nameF ? printableWireText(nameF.value as Uint8Array) : undefined
    if (!name) continue
    const broken: string[] = []
    const send = readFieldBytes(field.value as Uint8Array, 1)
    const monitor = readFieldBytes(field.value as Uint8Array, 2)
    const server = readFieldBytes(field.value as Uint8Array, 7)
    const sendId = send ? parseNodeGraphId(send).nodeId : undefined
    const monitorId = monitor ? parseNodeGraphId(monitor).nodeId : undefined
    const serverId = server ? parseNodeGraphId(server).nodeId : undefined
    const sendDef = sendId !== undefined ? definitions.get(sendId) : undefined
    const monitorDef = monitorId !== undefined ? definitions.get(monitorId) : undefined
    const serverDef = serverId !== undefined ? definitions.get(serverId) : undefined
    if (!sendDef || !monitorDef || !serverDef) broken.push('definition missing')

    const serverParams = serverDef ? readFieldMessages(serverDef, 102) : []
    const params: ParamInfo[] = []
    let paramBroken = false
    entry
      .filter((item) => item.number === 4 && item.wire === 2)
      .forEach((item, i) => {
        const p = parseWireMessage(item.value as Uint8Array) ?? []
        const pnameF = p.find((e) => e.number === 1 && e.wire === 2)
        const pname = pnameF ? printableWireText(pnameF.value as Uint8Array) : undefined
        const typeCode = p.find((e) => e.number === 2)?.value as number | undefined
        const sendPin = p.find((e) => e.number === 4)?.value as number | undefined
        const monPin = p.find((e) => e.number === 5)?.value as number | undefined
        const srvPin = p.find((e) => e.number === 6)?.value as number | undefined
        if (
          !pname || typeCode === undefined || sendPin === undefined ||
          monPin === undefined || srvPin === undefined
        ) {
          paramBroken = true
          return
        }
        void i
        void serverParams
        params.push({ name: pname, typeCode, sendPinIndex: sendPin, monitorPinIndex: monPin, serverPinIndex: srvPin })
      })
    if (paramBroken) broken.push('incomplete param layout')
    const signalVersion = entry.find((e) => e.number === 6)?.value as number | undefined
    if (signalVersion === undefined) broken.push('missing signalVersion')

    // name CPI（field 106）：与 readSignalLayouts 相同语义（containsText 递归查找），但残缺只标记本条
    const containsText = (buf: Uint8Array, expected: string, depth = 0): boolean => {
      // 与 gil_signals.ts containsText 同语义：递归遍历全部 wire=2 子字段找文本
      if (depth > 8) return false
      for (const f of parseWireMessage(buf) ?? []) {
        if (f.wire !== 2) continue
        const value = f.value as Uint8Array
        const text = printableWireText(value)
        if (text === expected || (text === undefined && containsText(value, expected, depth + 1))) return true
      }
      return false
    }
    const nameCpi = (def: Uint8Array | undefined, sigName: string): number | undefined => {
      if (!def) return undefined
      for (const encoded of readFieldMessages(def, 106)) {
        if (!containsText(encoded, sigName)) continue
        const pi = readFieldVarint(encoded, 8)
        if (pi !== undefined) return pi
      }
      return undefined
    }
    if (sendDef && nameCpi(sendDef, name) === undefined) broken.push('send def missing name CPI (field 106)')
    if (monitorDef && nameCpi(monitorDef, name) === undefined) broken.push('monitor def missing name CPI (field 106)')

    const entryOut: SignalEntry = {
      name,
      sendId: sendId ?? -1,
      monitorId: monitorId ?? -1,
      serverId: serverId ?? -1,
      signalVersion: signalVersion ?? -1,
      params,
      broken
    }
    if (withDefs) {
      entryOut.layouts = {
        send: sendDef ? defLayouts(sendDef) : [],
        monitor: monitorDef ? defLayouts(monitorDef) : [],
        server: serverDef ? defLayouts(serverDef) : []
      }
    }
    entries.push(entryOut)
  }

  const wanted = wantSignal ? entries.filter((e) => e.name === wantSignal) : entries
  const brokenCount = entries.filter((e) => e.broken.length > 0).length

  if (asJson) {
    console.log(JSON.stringify({ gilPath: gil, entries: wanted, brokenEntries: brokenCount }, null, 2))
  } else {
    for (const e of wanted) {
      const flag = e.broken.length > 0 ? `  ⚠ BROKEN: ${e.broken.join('; ')}` : ''
      console.log(`${e.name}  send=${e.sendId} monitor=${e.monitorId} server=${e.serverId} v${e.signalVersion}${flag}`)
      for (const p of e.params) {
        console.log(`    param ${p.name} type=${p.typeCode} pin(send/monitor/server)=${p.sendPinIndex}/${p.monitorPinIndex}/${p.serverPinIndex}`)
      }
      if (e.layouts) {
        for (const kind of ['send', 'monitor', 'server'] as const) {
          for (const d of e.layouts[kind]) {
            const label = d.name ? `name=${d.name}` : d.text ? `text=${d.text}` : 'msg'
            console.log(`    def[${kind}] field=${d.field} ${label} pinIndex=${d.pinIndex ?? '?'}`)
          }
        }
      }
    }
    if (brokenCount > 0) {
      console.log(`\n⚠ ${brokenCount} 个残缺注册项（全表仍输出；assets:signals CLI 会因此整体不可用）`)
    }
  }

  // gate 模式：残缺即失败（配合"注册前先探活"流程）
  if (gate && brokenCount > 0) process.exit(1)
}

main()
