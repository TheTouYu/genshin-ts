import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { registerSignalInGil } from '../src/cli/gil_signal_registrations.js'
import { readRegisteredSignalsFromGil } from '../src/cli/gil_signals.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const target = new Uint8Array(
  fs.readFileSync(path.join(here, 'fixtures/signals/register-target.gil'))
)
const donor = new Uint8Array(
  fs.readFileSync(path.join(here, 'fixtures/signals/cube-turn-donor.gil'))
)
const result = registerSignalInGil({
  bytes: target,
  templateBytes: donor,
  templateSignalName: 'cube_turn',
  signal: {
    name: 'cube_turn',
    params: [
      { name: 'face', type: 'str' },
      { name: 'direction', type: 'str' }
    ]
  }
})
const output = `/tmp/gsts-signal-repeated-type-${process.pid}.gil`
fs.writeFileSync(output, result.bytes)
try {
  const all = readRegisteredSignalsFromGil(output)
  const signal = all.find((entry) => entry.name === 'cube_turn')
  assert.ok(signal)
  assert.deepEqual(
    signal.params.map((param) => ({
      name: param.name,
      type: param.type,
      pins: [param.sendPinIndex, param.monitorPinIndex, param.serverPinIndex]
    })),
    [
      { name: 'face', type: 'str', pins: [12, 34, 40] },
      { name: 'direction', type: 'str', pins: [16, 35, 41] }
    ]
  )
  assert.equal(new Set(signal.params.map((param) => param.sendPinIndex)).size, 2)
  assert.equal(all.length, 4)
} finally {
  fs.rmSync(output, { force: true })
}

// donor 池跨信号聚合（football-v2 R2.1）：donor 地图全部信号的同型槽都进池
// （cube_turn face[12]/direction[16] + 信号测试全参数.文本[12]/工具_系列 str 槽），
// 3 个 str 参数借前三个槽 [12],[16],[12]——同槽被多参数引用是编辑器共享槽形态
// （工具_系列），引擎不校验 pin 唯一性（2026-09-02 差分，见 gil_signal_registrations.ts）。
const tooMany = registerSignalInGil({
  bytes: target,
  templateBytes: donor,
  templateSignalName: 'cube_turn',
  signal: {
    name: 'too_many_strings',
    params: [
      { name: 'one', type: 'str' },
      { name: 'two', type: 'str' },
      { name: 'three', type: 'str' }
    ]
  }
})
assert.equal(tooMany.templateSignalName, 'cube_turn')
const tooManyOut = `/tmp/gsts-signal-too-many-${process.pid}.gil`
fs.writeFileSync(tooManyOut, tooMany.bytes)
try {
  const sig = readRegisteredSignalsFromGil(tooManyOut).find((s) => s.name === 'too_many_strings')
  assert.ok(sig)
  assert.deepEqual(
    sig.params.map((param) => [param.sendPinIndex, param.monitorPinIndex, param.serverPinIndex]),
    [
      [12, 34, 40],
      [16, 35, 41],
      [12, 34, 40]
    ]
  )
} finally {
  fs.rmSync(tooManyOut, { force: true })
}

// builtin fallback 路径（无 donor，2026-09-02 还债后任意同型重复不再 fail-closed）：
// pin +1k 连续分配（旧 str send +4 系 cube_turn 复制巧合，作废）。重复 float 是
// 能力债核心场景（历史编辑器从未出现、无 donor 也可注册）。target mapPool 已有
// 2 个 float 槽（信号_1.参数_2 / 信号_全部参数测试.参数_2）优先复用，第 3 个
// float 由 builtin 生成（基数 90/109/122 + startK=2 → 92/111/124）；int 复用
// mapPool 第 1 槽。
const builtinRepeat = registerSignalInGil({
  bytes: target,
  signal: {
    name: 'builtin_repeats',
    params: [
      { name: 'a', type: 'float' },
      { name: 'b', type: 'float' },
      { name: 'c', type: 'float' },
      { name: 'd', type: 'int' }
    ]
  }
})
assert.equal(builtinRepeat.templateSignalName, 'builtin-layouts')
const builtinOut = `/tmp/gsts-signal-builtin-repeat-${process.pid}.gil`
fs.writeFileSync(builtinOut, builtinRepeat.bytes)
try {
  const sig = readRegisteredSignalsFromGil(builtinOut).find((s) => s.name === 'builtin_repeats')
  assert.ok(sig)
  assert.deepEqual(
    sig.params.map((param) => [param.sendPinIndex, param.monitorPinIndex, param.serverPinIndex]),
    [
      [38, 53, 66],
      [87, 125, 138],
      [92, 111, 124],
      [37, 52, 65]
    ]
  )
} finally {
  fs.rmSync(builtinOut, { force: true })
}

// 共享槽去重（2026-09-02 还债补丁）：mapPool 聚合的跨信号共享槽（donor fixture 里
// 信号测试全参数/工具_全参数/工具_混合 三个信号的 float 都引用 90/109/122）不能让
// 同一信号的两个参数拿到相同 pin——编辑器无此形态（R1-R4 每参数独立 pin），引擎
// 未验证。去重后第 2 个 float 由 builtin 生成 91/110/123。
const dedupeCheck = registerSignalInGil({
  bytes: donor,
  signal: {
    name: 'dedupe_shared_slots',
    params: [
      { name: 'p', type: 'float' },
      { name: 'q', type: 'float' }
    ]
  }
})
const dedupeOut = `/tmp/gsts-signal-dedupe-${process.pid}.gil`
fs.writeFileSync(dedupeOut, dedupeCheck.bytes)
try {
  const sig = readRegisteredSignalsFromGil(dedupeOut).find((s) => s.name === 'dedupe_shared_slots')
  assert.ok(sig)
  assert.deepEqual(
    sig.params.map((param) => [param.sendPinIndex, param.monitorPinIndex, param.serverPinIndex]),
    [
      [90, 109, 122],
      [91, 110, 123]
    ]
  )
} finally {
  fs.rmSync(dedupeOut, { force: true })
}

console.log('signal repeated-type donor layouts: PASS')
