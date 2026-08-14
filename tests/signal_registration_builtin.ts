import assert from 'node:assert/strict'
import { writeFileSync, readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildFile } from '../src/injector/binary.js'
import { emitWireMessage, parseWireMessage } from '../src/cli/static_assembly/wire.js'
import { registerSignalInGil } from '../src/cli/gil_signal_registrations.js'
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
assert.deepEqual([pinOf(p1[1], 4), pinOf(p1[1], 5), pinOf(p1[1], 6)], [16, 35, 41])
for (const id of [r1.signal.sendId, r1.signal.monitorId, r1.signal.serverId]) {
  assert.ok(defOf(t1, id), 'definition present for ' + id)
}
const dir1 = mkdtempSync(join(tmpdir(), 'gsts-signal-test-'))
const f1 = join(dir1, 'map.gil')
writeFileSync(f1, r1.bytes)
const rb1 = readRegisteredSignalsFromGil(f1).find((entry) => entry.name === 'verify_ping')
assert.ok(rb1, 'read-back entry')
assert.equal(rb1!.params.map((p) => p.name + ':' + p.type).join('|'), 'msg:str|tag:str')

// ── 2. byte-parity: donor path vs builtin path on a real map with same bases ──
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
  assert.ok(
    Buffer.from(donorResult.bytes).equals(Buffer.from(builtinResult.bytes)),
    'builtin bytes must equal donor-cloned bytes when the map reuses the same bases'
  )
  console.log('byte-parity with donor path: OK (' + REAL_MAP + ')')
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

// ── 4. repeated non-str type fails closed ─────────────────────────────────────
assert.throws(
  () =>
    registerSignalInGil({
      bytes: freshBytes,
      signal: { name: 'bad', params: [{ name: 'x', type: 'int' }, { name: 'y', type: 'int' }] }
    }),
  /needs 2 distinct layouts/
)

rmSync(dir1, { recursive: true, force: true })
rmSync(dir3, { recursive: true, force: true })
console.log('PASS signal_registration_builtin')

