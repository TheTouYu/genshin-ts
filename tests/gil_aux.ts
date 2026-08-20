import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { attachAuxiliary } from '../src/cli/gil_aux.js'
import { parseWireMessage as parse } from '../src/cli/static_assembly/wire.js'

// 装饰物挂载测试（2026-08-20 真实样本 after-entity-aux-user.gil：
// 用户给圆柱实体 1077936184 挂装饰物 10009007，root27 inst aux + 实体 f501 引用）。

const SAMPLE_PATH = fileURLToPath(
  new URL('./fixtures/static-assembly/after-entity-aux-user.gil', import.meta.url)
)
const SAMPLE = new Uint8Array(fs.readFileSync(SAMPLE_PATH))

function topOf(bytes: Uint8Array) {
  const top = parse(bytes.slice(20, -4))
  assert.ok(top, 'GIL payload must parse')
  return top
}

function auxInfo(bytes: Uint8Array): Array<{ id: number; side: number; hostRef?: number; f12?: string }> {
  const top = topOf(bytes)
  const root27 = top.find((f) => f.number === 27 && f.wire === 2)
  if (!root27) return []
  const out: Array<{ id: number; side: number; hostRef?: number; f12?: string }> = []
  for (const f of parse(root27.value as Uint8Array) ?? []) {
    if (f.wire !== 2) continue
    const rec = parse(f.value as Uint8Array) ?? []
    const id = rec.find((y) => y.number === 1 && y.wire === 0)?.value
    if (typeof id !== 'number') continue
    const f4slot40 = rec
      .filter((y) => y.number === 4 && y.wire === 2)
      .map((y) => parse(y.value as Uint8Array) ?? [])
      .find((s) => s.find((z) => z.number === 1 && z.wire === 0)?.value === 40)
    const f50 = f4slot40?.find((z) => z.number === 50 && z.wire === 2)
    const hostRef = f50
      ? ((parse(f50.value as Uint8Array) ?? []).find((z) => z.number === 502 && z.wire === 0)?.value as number | undefined)
      : undefined
    const f12 = rec.find((y) => y.number === 12 && y.wire === 2)
    out.push({
      id,
      side: f.number,
      hostRef,
      f12: f12 ? Buffer.from(f12.value as Uint8Array).toString('hex') : undefined
    })
  }
  return out
}

function entityF501(bytes: Uint8Array, entityId: number): number[] {
  const top = topOf(bytes)
  const root5 = top.find((f) => f.number === 5 && f.wire === 2)!
  for (const f of parse(root5.value as Uint8Array) ?? []) {
    if (f.number !== 1 || f.wire !== 2) continue
    const rec = parse(f.value as Uint8Array)!
    if (rec.find((x) => x.number === 1 && x.wire === 0)?.value !== entityId) continue
    const slot40 = rec
      .filter((x) => x.number === 5 && x.wire === 2)
      .map((x) => parse(x.value as Uint8Array)!)
      .find((s) => s.find((y) => y.number === 1 && y.wire === 0)?.value === 40)
    const f50 = slot40?.find((x) => x.number === 50 && x.wire === 2)
    const f501 = f50 ? (parse(f50.value as Uint8Array) ?? []).find((x) => x.number === 501) : undefined
    if (!f501) return []
    const packed = f501.value as Uint8Array
    const ids: number[] = []
    let val = 0
    let shift = 0
    for (const byte of packed) {
      val |= (byte & 0x7f) << shift
      if (!(byte & 0x80)) {
        ids.push(val)
        val = 0
        shift = 0
      } else shift += 7
    }
    return ids
  }
  return []
}

// —— 1. 真实样本自检：用户挂的装饰物 aux hostRef = 宿主实体 ID ——
const sampleAux = auxInfo(SAMPLE)
assert.ok(sampleAux.length >= 1, 'sample must contain at least one aux')
const userAux = sampleAux.find((a) => a.side === 2)!
assert.equal(userAux.hostRef, 1077936184, 'user aux f4 slot40 must reference host entity')
assert.equal(userAux.f12, '', 'entity aux f12 must be empty')
assert.deepEqual(entityF501(SAMPLE, 1077936184), [1073741826], 'user entity f501 must reference its aux')

// —— 2. attachAuxiliary：给球体实体挂装饰物，aux hostRef = 宿主 ——
const beforeAuxCount = auxInfo(SAMPLE).length
const out = attachAuxiliary(SAMPLE, { hostId: 1077936183, resourceId: 10009001, name: '装饰物_2' })
const afterAux = auxInfo(out.bytes)
assert.equal(afterAux.length, beforeAuxCount + 1, 'must add one aux')
const newAux = afterAux.find((a) => a.id === out.auxIds[0])!
assert.equal(newAux.side, 2, 'entity aux goes to f2 (instance-side)')
assert.equal(newAux.hostRef, 1077936183, 'aux f4 slot40 must reference the host entity')
assert.equal(newAux.f12, '', 'entity aux f12 must be empty')
assert.ok(entityF501(out.bytes, 1077936183).includes(out.auxIds[0]), 'entity f501 must reference new aux')

// —— 3. 给元件定义挂装饰物：def-side + inst-side ——
const defOut = attachAuxiliary(SAMPLE, { hostId: 1077936185, resourceId: 10009002, name: '装饰物_3' })
const defAuxes = auxInfo(defOut.bytes).filter((a) => a.id === defOut.auxIds[0] || a.id === defOut.auxIds[1])
assert.equal(defOut.auxIds.length, 2, 'definition host must create def + inst aux')
const defSide = defAuxes.find((a) => a.side === 1)!
assert.equal(defSide.hostRef, 1077936185, 'def aux f4 slot40 f502 must reference definition id')
const instSide = defAuxes.find((a) => a.side === 2)!
assert.ok(instSide.f12 && instSide.f12.length > 0, 'inst aux must keep f12 backlink for definition host')

console.log('gil_aux test passed')
