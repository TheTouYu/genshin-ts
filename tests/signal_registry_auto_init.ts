import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { registerSignalInGil } from '../src/cli/gil_signal_registrations.js'
import { readRegisteredSignalsFromGil } from '../src/cli/gil_signals.js'
import { buildFile, readUint32BE } from '../src/injector/binary.js'
import { emitWireMessage, parseWireMessage, type WireField } from '../src/cli/static_assembly/wire.js'

// 断言：field 10.5（信号注册表）缺失的全新地图，register 自动初始化空注册表并成功，
// 结果与"手工插入空注册表后再 register"（08-03 /tmp/init-signal-registry.mjs 同构）逐字节一致。
const here = path.dirname(fileURLToPath(import.meta.url))
const donor = new Uint8Array(fs.readFileSync(path.join(here, 'fixtures/signals/cube-turn-donor.gil')))
const targetWithRegistry = new Uint8Array(
  fs.readFileSync(path.join(here, 'fixtures/signals/register-target.gil'))
)

// 构造"全新地图"：删除 field 10.5（注册表）与 field 10.2（信号定义），返回完整 GIL
// （register-target fixture 的 field 10 只有 2 和 5 两类信号子字段）
function stripRegistry(bytes: Uint8Array): Uint8Array {
  const payload = bytes.slice(20, -4)
  const root = parseWireMessage(payload)
  assert.ok(root)
  const topField = root.find((f) => f.number === 10 && f.wire === 2)
  assert.ok(topField)
  const top = parseWireMessage(topField.value as Uint8Array)
  assert.ok(top)
  const without = top.filter((f) => !(f.number === 5 && f.wire === 2) && !(f.number === 2 && f.wire === 2))
  assert.ok(without.length < top.length, 'fixture must contain field 10.5')
  const nextRoot = root.map((f) => (f === topField ? { ...f, value: emitWireMessage(without) } : f))
  const header = {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  }
  return buildFile(new Uint8Array(emitWireMessage(nextRoot)), header)
}

// 手工插入空注册表（init 脚本同构），返回完整 GIL
function initRegistry(bytes: Uint8Array): Uint8Array {
  const payload = bytes.slice(20, -4)
  const root = parseWireMessage(payload)
  assert.ok(root)
  const topField = root.find((f) => f.number === 10 && f.wire === 2)!
  const top = parseWireMessage(topField.value as Uint8Array)!
  const emptyRegistry: WireField = { number: 5, wire: 2, value: new Uint8Array(0) }
  const insertAt = top.findIndex((f) => f.number > 5)
  const nextTop = [...top]
  nextTop.splice(insertAt < 0 ? nextTop.length : insertAt, 0, emptyRegistry)
  const nextRoot = root.map((f) => (f === topField ? { ...f, value: emitWireMessage(nextTop) } : f))
  const header = {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  }
  return buildFile(new Uint8Array(emitWireMessage(nextRoot)), header)
}

const signal = {
  name: 'cube_turn_autoinit',
  params: [
    { name: 'face', type: 'str' as const },
    { name: 'direction', type: 'str' as const }
  ]
}

// 1. 无注册表目标直接 register：不抛"signal registry field 10.5"，成功
const stripped = stripRegistry(targetWithRegistry)
const auto = registerSignalInGil({ bytes: stripped, templateBytes: donor, templateSignalName: 'cube_turn', signal })

// 2. 等价性：手工 init + register 结果与自动初始化逐字节一致
const manual = registerSignalInGil({
  bytes: initRegistry(stripped),
  templateBytes: donor,
  templateSignalName: 'cube_turn',
  signal
})
assert.ok(Buffer.from(auto.bytes).equals(Buffer.from(manual.bytes)), 'auto-init must equal manual init + register')

// 3. 回读：注册表完好，新信号可读且带参数
const output = `/tmp/gsts-signal-auto-init-${process.pid}.gil`
fs.writeFileSync(output, auto.bytes)
try {
  const all = readRegisteredSignalsFromGil(output)
  const registered = all.find((entry) => entry.name === 'cube_turn_autoinit')
  assert.ok(registered, 'auto-initialized signal must be readable')
  assert.deepEqual(
    registered.params.map((param) => ({ name: param.name, type: param.type })),
    [
      { name: 'face', type: 'str' },
      { name: 'direction', type: 'str' }
    ]
  )
  // 原注册表内容不受影响（strip 后仍应只有新注册的信号）
  assert.equal(all.length, 1)
} finally {
  fs.rmSync(output, { force: true })
}

console.log('PASS: signal registry auto-init (register on fresh map, byte-identical to manual init)')
