import assert from 'node:assert/strict'
import { writeFileSync, readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildFile } from '../src/injector/binary.js'
import { emitWireMessage, parseWireMessage } from '../src/cli/static_assembly/wire.js'
import {
  registerSignalInGil,
  repairSignalInGil
} from '../src/cli/gil_signal_registrations.js'
import { readRegisteredSignalsFromGil } from '../src/cli/gil_signals.js'

const REAL_MAP = process.env.GSTS_SIGNAL_TEST_MAP
const freshBytes = buildFile(
  emitWireMessage([{ number: 10, wire: 2, value: emitWireMessage([]) }]),
  { schema: 1, headTag: 0x0326, fileType: 2, tailTag: 0x0679 }
)

function top10(bytes: Uint8Array): any[] {
  const root = parseWireMessage(bytes.slice(20, -4))!
  const topField = root.find((f) => f.number === 10 && f.wire === 2)!
  return parseWireMessage(topField.value as Uint8Array)!
}
function defOf(top: any[], id: number): Uint8Array | undefined {
  for (const def of top.filter((f) => f.number === 2 && f.wire === 2)) {
    const ws = parseWireMessage(def.value as Uint8Array)!
    const inner = ws.find((x) => x.number === 1 && x.wire === 2)
    if (!inner) continue
    const root = parseWireMessage(inner.value as Uint8Array)!
    const f4 = root.find((x) => x.number === 4 && x.wire === 2)
    if (!f4) continue
    const generic = parseWireMessage(f4.value as Uint8Array)!.find((x) => x.number === 1 && x.wire === 2)
    if (!generic) continue
    if (parseWireMessage(generic.value as Uint8Array)!.find((x) => x.number === 5)?.value === id) {
      return def.value as Uint8Array
    }
  }
  return undefined
}
function pinOf(paramEntry: Uint8Array, field: number): number | undefined {
  return parseWireMessage(paramEntry)!.find((x) => x.number === field && x.wire === 0)?.value as number | undefined
}
function registryOf(top: any[]): any[] {
  return parseWireMessage(top.find((f) => f.number === 5)!.value as Uint8Array)!
}

function containsVarint(data: Uint8Array, expected: number, depth = 0): boolean {
  if (depth > 6) return false
  for (const field of parseWireMessage(data) ?? []) {
    if (field.wire === 0 && field.number === 5 && field.value === expected) return true
    if (field.wire === 2 && containsVarint(field.value as Uint8Array, expected, depth + 1)) return true
  }
  return false
}

// 从注册产物里删掉第四份定义 + 条目 f9 + 第四条 identity（复刻旧 CLI 的失败产物形态）。
function stripClientScriptDefinition(bytes: Uint8Array, clientScriptId: number): Uint8Array {
  const payload = bytes.slice(20, -4)
  const root = parseWireMessage(payload)!
  const topField = root.find((f) => f.number === 10 && f.wire === 2)!
  const top = parseWireMessage(topField.value as Uint8Array)!
  const isClientScriptDef = (field: any): boolean => {
    if (field.number !== 2 || field.wire !== 2) return false
    const ws = parseWireMessage(field.value as Uint8Array)!
    const inner = ws.find((x) => x.number === 1 && x.wire === 2)
    if (!inner) return false
    const root2 = parseWireMessage(inner.value as Uint8Array)!
    const nameField = root2.find((x) => x.number === 200 && x.wire === 2)
    return (
      !!nameField &&
      Buffer.from(nameField.value as Uint8Array).toString('utf8') === '发送客户端脚本信号'
    )
  }
  const nextTop = top
    .filter((field) => !isClientScriptDef(field))
    .map((field) => {
      if (field.number !== 5 || field.wire !== 2) return field
      const entries = parseWireMessage(field.value as Uint8Array)!
      const next = entries.flatMap((entry) => {
        if (entry.number === 2 && entry.wire === 2) {
          const sub = parseWireMessage(entry.value as Uint8Array)!
          const id = sub.find((x) => x.number === 5 && x.wire === 0)?.value
          return id === clientScriptId ? [] : [entry]
        }
        if (entry.number === 3 && entry.wire === 2) {
          const sub = parseWireMessage(entry.value as Uint8Array)!
          if (!sub.some((x) => x.number === 9 && x.wire === 2)) return [entry]
          return [
            { ...entry, value: emitWireMessage(sub.filter((x) => !(x.number === 9 && x.wire === 2))) }
          ]
        }
        return [entry]
      })
      return { ...field, value: emitWireMessage(next) }
    })
  const nextRoot = root.map((field) =>
    field === topField ? { ...field, value: emitWireMessage(nextTop) } : field
  )
  return buildFile(emitWireMessage(nextRoot), {
    schema: 1,
    headTag: 0x0326,
    fileType: 2,
    tailTag: 0x0679
  })
}

// ── 1. fresh map, from-scratch str+str ────────────────────────────────────────
const r1 = registerSignalInGil({
  bytes: freshBytes,
  signal: { name: 'verify_ping', params: [{ name: 'msg', type: 'str' }, { name: 'tag', type: 'str' }] }
})
assert.equal(r1.templateSignalName, 'builtin-layouts')
assert.equal(r1.signal.sendId, 1610612741)
assert.equal(r1.signal.monitorId, 1610612742)
assert.equal(r1.signal.serverId, 1610612743)
const t1 = top10(r1.bytes)
const e1 = registryOf(t1).filter((f) => f.number === 3 && f.wire === 2)
assert.equal(e1.length, 1, 'one registry entry')
const p1 = parseWireMessage(e1[0].value as Uint8Array)!
  .filter((f) => f.number === 4 && f.wire === 2)
  .map((f) => f.value as Uint8Array)
assert.equal(p1.length, 2)
assert.deepEqual([pinOf(p1[0], 4), pinOf(p1[0], 5), pinOf(p1[0], 6)], [12, 34, 40])
// 2026-09-02 差分后步长统一 +1k：第 2 个 str send = 13（旧 16 系 cube_turn 复制
// 巧合的 +4 规律，作废；引擎不校验 pin 具体值，见 gil_signal_registrations.ts 注释）
assert.deepEqual([pinOf(p1[1], 4), pinOf(p1[1], 5), pinOf(p1[1], 6)], [13, 35, 41])
for (const id of [r1.signal.sendId, r1.signal.monitorId, r1.signal.serverId]) {
  assert.ok(defOf(t1, id), 'definition present for ' + id)
}
const dir1 = mkdtempSync(join(tmpdir(), 'gsts-signal-test-'))
const f1 = join(dir1, 'map.gil')
writeFileSync(f1, r1.bytes)
const rb1 = readRegisteredSignalsFromGil(f1).find((entry) => entry.name === 'verify_ping')
assert.ok(rb1, 'read-back entry')
assert.equal(rb1!.params.map((p) => p.name + ':' + p.type).join('|'), 'msg:str|tag:str')

// ── 2. donor path vs builtin path on a real map: both register validly ────────
// 2026-09-02 起 builtin 用 +1k 连续 pin，与 donor 抄来的编辑器槽位值不同属预期
// （引擎不校验 pin 数值），不再要求两条路径逐字节相等；各自成功注册即可。
if (REAL_MAP && existsSync(REAL_MAP)) {
  const real = new Uint8Array(readFileSync(REAL_MAP))
  const donorResult = registerSignalInGil({
    bytes: real,
    templateSignalName: 'verify_ping',
    signal: { name: 'verify_ping2', params: [{ name: 'msg', type: 'str' }, { name: 'tag', type: 'str' }] }
  })
  const builtinResult = registerSignalInGil({
    bytes: real,
    signal: { name: 'verify_ping2', params: [{ name: 'msg', type: 'str' }, { name: 'tag', type: 'str' }] }
  })
  assert.equal(builtinResult.templateSignalName, 'builtin-layouts')
  const parityDir = mkdtempSync(join(tmpdir(), 'gsts-signal-test-'))
  const parityMap = join(parityDir, 'map.gil')
  for (const [label, result] of [
    ['donor', donorResult],
    ['builtin', builtinResult]
  ] as const) {
    writeFileSync(parityMap, result.bytes)
    const readBack = readRegisteredSignalsFromGil(parityMap).find(
      (entry) => entry.name === 'verify_ping2'
    )
    assert.ok(readBack, label + ' path read-back entry')
    assert.equal(
      readBack!.params.map((p) => p.name + ':' + p.type).join('|'),
      'msg:str|tag:str',
      label + ' path params'
    )
  }
  rmSync(parityDir, { recursive: true, force: true })
  console.log('donor/builtin dual-path registration: OK (' + REAL_MAP + ')')
}

// ── 3. fresh map, multi-type (int + entity + str + int_list) ──────────────────
const r3 = registerSignalInGil({
  bytes: freshBytes,
  signal: {
    name: 'multi',
    params: [
      { name: 'a', type: 'int' },
      { name: 'b', type: 'entity' },
      { name: 'c', type: 'str' },
      { name: 'd', type: 'int_list' }
    ]
  }
})
const t3 = top10(r3.bytes)
const e3 = registryOf(t3).filter((f) => f.number === 3 && f.wire === 2)
assert.equal(e3.length, 1)
const p3 = parseWireMessage(e3[0].value as Uint8Array)!
  .filter((f) => f.number === 4 && f.wire === 2)
  .map((f) => f.value as Uint8Array)
const expectPins = [
  { type: 'int', pins: [68, 76, 83] },
  { type: 'entity', pins: [69, 77, 84] },
  { type: 'str', pins: [12, 34, 40] },
  { type: 'int_list', pins: [140, 154, 167] }
]
for (let i = 0; i < expectPins.length; i++) {
  assert.deepEqual(
    [pinOf(p3[i], 4), pinOf(p3[i], 5), pinOf(p3[i], 6)],
    expectPins[i].pins,
    expectPins[i].type + ' pins'
  )
}
const dir3 = mkdtempSync(join(tmpdir(), 'gsts-signal-test-'))
const f3 = join(dir3, 'map.gil')
writeFileSync(f3, r3.bytes)
const rb3 = readRegisteredSignalsFromGil(f3).find((entry) => entry.name === 'multi')
assert.ok(rb3)
assert.equal(rb3!.params.map((p) => p.name + ':' + p.type).join('|'), 'a:int|b:entity|c:str|d:int_list')

// ── 4. repeated non-str type registers without a donor ────────────────────────
// 2026-09-02 四轮编辑器差分（模型比对 1849）：同型重复参数不再 fail-closed。
// pin +1k 连续（引擎不校验具体值）；n3 field2 = 全局序号（int 重复 R4 实证：
// send 0(省略)/1、monitor 3/4）。
const r4 = registerSignalInGil({
  bytes: freshBytes,
  signal: { name: 'two_ints', params: [{ name: 'x', type: 'int' }, { name: 'y', type: 'int' }] }
})
const f4dir = mkdtempSync(join(tmpdir(), 'gsts-signal-test-'))
const f4 = join(f4dir, 'map.gil')
writeFileSync(f4, r4.bytes)
const rb4 = readRegisteredSignalsFromGil(f4).find((entry) => entry.name === 'two_ints')
assert.ok(rb4)
assert.equal(rb4!.params.map((p) => p.name + ':' + p.type).join('|'), 'x:int|y:int')
assert.deepEqual(
  rb4!.params.map((p) => [p.sendPinIndex, p.monitorPinIndex, p.serverPinIndex]),
  [
    [68, 76, 83],
    [69, 77, 84]
  ]
)

// ── 5. n3 field2 = 参数全局序号（2026-08-16 灯阵差分实证）──────────────
// vec3+int 双参数：send/server 参数 n3 field2 = 0（省略）/1；monitor = 3/4。
// 修复前 CLI 沿用 builtin 模板常量（vec3=2、int=0）→ 序号错位 → 引擎拒载。
const r5 = registerSignalInGil({
  bytes: freshBytes,
  signal: {
    name: 'lamp_seq',
    params: [
      { name: 'senderPos', type: 'vec3' },
      { name: 'hop', type: 'int' }
    ]
  }
})
const t5 = top10(r5.bytes)
function n3Field2(def: Uint8Array | undefined, paramName: string, kind: number): number | undefined {
  if (!def) return undefined
  const ws = parseWireMessage(def)!
  const inner = ws.find((x) => x.number === 1 && x.wire === 2)
  if (!inner) return undefined
  const root = parseWireMessage(inner.value as Uint8Array)!
  const params = root.filter((x) => x.wire === 2 && x.number === kind)
  for (const p of params) {
    const sub = parseWireMessage(p.value as Uint8Array)!
    const name = sub.find((x) => x.number === 1 && x.wire === 2)
    if (!name || Buffer.from(name.value as Uint8Array).toString('utf8') !== paramName) continue
    const n3 = sub.find((x) => x.number === 3 && x.wire === 2)
    if (!n3) return undefined
    const n3f = parseWireMessage(n3.value as Uint8Array)!
    const f2 = n3f.find((x) => x.number === 2 && x.wire === 0)
    return f2 === undefined ? 0 : (f2.value as number)
  }
  return undefined
}
// send（#102）与 server（#102）：senderPos 序号 0（省略=0）、hop 序号 1
for (const id of [r5.signal.sendId, r5.signal.serverId]) {
  const def = defOf(t5, id)
  assert.equal(n3Field2(def, 'senderPos', 102), 0, `id=${id} senderPos field2=0`)
  assert.equal(n3Field2(def, 'hop', 102), 1, `id=${id} hop field2=1`)
}
// monitor（#103）：senderPos 3+0=3、hop 3+1=4
const monDef = defOf(t5, r5.signal.monitorId)
assert.equal(n3Field2(monDef, 'senderPos', 103), 3, 'monitor senderPos field2=3')
assert.equal(n3Field2(monDef, 'hop', 103), 4, 'monitor hop field2=4')

// ── 6. 第四份内置定义「发送客户端脚本信号」（2026-10-25 hl 差分实证）─────────
// 编辑器给每个信号写四份定义：向服务器节点图发送信号 / 监听信号 / 发送信号 /
// 发送客户端脚本信号（节点 id 走 0x60000001 段）。前三份的 n107 映射以 n4 引用第四份；
// 只写三份 = 悬空引用 → 试玩校验报「信号有问题」。0 参数信号也必须带它（旧实现 0 参数
// 走 builtin 会直接抛错，因此这条同时覆盖「无 donor 注册 0 参数信号」）。
const CLIENT_SCRIPT_NAME = '发送客户端脚本信号'
const r6 = registerSignalInGil({ bytes: freshBytes, signal: { name: 'settle', params: [] } })
assert.equal(r6.signal.clientScriptId, 1610612737, 'client-script id from 0x60000001')
const t6 = top10(r6.bytes)
const defIds6 = t6
  .filter((f) => f.number === 2 && f.wire === 2)
  .map((f) => {
    const inner = parseWireMessage(f.value as Uint8Array)!.find((x) => x.number === 1 && x.wire === 2)!
    const root = parseWireMessage(inner.value as Uint8Array)!
    const idMsg = root.find((x) => x.number === 4 && x.wire === 2)!
    const generic = parseWireMessage(idMsg.value as Uint8Array)!.find((x) => x.number === 1 && x.wire === 2)!
    return parseWireMessage(generic.value as Uint8Array)!.find((x) => x.number === 5)!.value as number
  })
assert.deepEqual(
  defIds6.sort((a, b) => a - b),
  [1610612737, 1610612741, 1610612742, 1610612743],
  'four builtin definitions (client-script first id)'
)
const clientScriptDef6 = defOf(t6, 1610612737)
assert.ok(clientScriptDef6, 'client-script definition present')
const clientScriptRoot6 = parseWireMessage(
  parseWireMessage(clientScriptDef6!)!.find((x) => x.number === 1 && x.wire === 2)!.value as Uint8Array
)!
assert.equal(
  Buffer.from(clientScriptRoot6.find((x) => x.number === 200)!.value as Uint8Array).toString('utf8'),
  CLIENT_SCRIPT_NAME,
  'client-script display name'
)
// 注册表条目 f9 = 第四份定义的 identity；identity 列表里也有它（编辑器形态：4 条）
const entry6 = parseWireMessage(
  registryOf(t6).find((f) => f.number === 3 && f.wire === 2)!.value as Uint8Array
)!
const f9 = entry6.find((x) => x.number === 9 && x.wire === 2)
assert.ok(f9, 'registry entry carries f9')
assert.equal(parseWireMessage(f9!.value as Uint8Array)!.find((x) => x.number === 5)!.value, 1610612737)
assert.equal(
  registryOf(t6).filter((f) => f.number === 2 && f.wire === 2).length,
  4,
  'four registry identities'
)
// 前三份定义的 n107 映射必须引用第四份（曾经缺的正是这个引用目标）
for (const id of [r6.signal.sendId, r6.signal.monitorId, r6.signal.serverId]) {
  const def = parseWireMessage(defOf(t6, id)!)!
  const inner = parseWireMessage(def.find((x) => x.number === 1 && x.wire === 2)!.value as Uint8Array)!
  const mapping = inner.find((x) => x.number === 107 && x.wire === 2)!
  assert.ok(
    containsVarint(mapping.value as Uint8Array, 1610612737),
    'n107 references the client-script definition for ' + id
  )
}
const dir6 = mkdtempSync(join(tmpdir(), 'gsts-signal-test-'))
const f6 = join(dir6, 'map.gil')
writeFileSync(f6, r6.bytes)
const rb6 = readRegisteredSignalsFromGil(f6).find((entry) => entry.name === 'settle')
assert.equal(rb6!.clientScriptId, 1610612737, 'read-back exposes clientScriptId')

// ── 7. repair 补齐缺失的第四份定义（旧 CLI 产物 → 编辑器形态）────────────────
// legacy = 从 r6 里删掉第四份定义 + 条目 f9 + 第四条 identity（复刻 2026-10-25 hl 的
// 失败产物形态）。repair 用完整产物当模板，产物应逐字节回到完整产物。
const legacy = stripClientScriptDefinition(r6.bytes, 1610612737)
const repaired = repairSignalInGil({
  bytes: legacy,
  targetSignalName: 'settle',
  templateBytes: r6.bytes,
  templateSignalName: 'settle'
})
assert.equal(repaired.status, 'repaired')
assert.equal(repaired.signal.clientScriptId, 1610612737)
assert.ok(
  Buffer.compare(Buffer.from(repaired.bytes), Buffer.from(r6.bytes)) === 0,
  'repair restores the exact editor shape (byte-equal)'
)

rmSync(dir1, { recursive: true, force: true })
rmSync(dir3, { recursive: true, force: true })
rmSync(dir6, { recursive: true, force: true })
console.log('PASS signal_registration_builtin')

