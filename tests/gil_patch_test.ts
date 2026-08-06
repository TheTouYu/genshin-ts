import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { parseWireMessage, wireRecords } from '../src/cli/static_assembly/wire.js'
import {
  attachAux,
  buildAuxRecord,
  createAuxRecord,
  detachAux,
  patchAuxColor,
  patchAuxTransform,
  patchEntityColor,
  patchEntityTransform,
  readAuxTransform
} from '../src/cli/static_assembly/patch.js'
import { exportEntities } from '../src/cli/gil_entities.js'

// 真实编辑器相邻快照（entities 线 v20→v21，2026-08-06/07）：
// v20 = 球体实体 1077936137 颜色 0xFF58D284；v21 = 用户经编辑器上色，
// wire 解码 = 0xFFB75FFC（varint `fc bf dd fd 0f`；注意 0xFFD75FFC 是早期误记），
// 同一保存中编辑器把材质槽 f5 同步规范化为 RGB（0x58D284→0xB75FFC）。
// patch 管线的产出必须与编辑器产物逐字节一致。
const V20 = '/home/h/genshin-ts-evidence/entities/create-entity-v21/raw/before.gil'
const V21 = '/home/h/genshin-ts-evidence/entities/create-entity-v21/raw/after.gil'
const SPHERE = 1077936137
const V21_COLOR = 0xffb75ffc

function root5Record(bytes: Uint8Array, index: number): Uint8Array {
  return wireRecords(parseWireMessage(bytes.slice(20, -4))!, 5, 1)[index]
}

function recordOf(bytes: Uint8Array, id: number): Uint8Array {
  const record = wireRecords(parseWireMessage(bytes.slice(20, -4))!, 5, 1).find((r) => {
    const fields = parseWireMessage(r)
    return fields?.find((f) => f.number === 1 && f.wire === 0)?.value === id
  })
  assert.ok(record, `record ${id} not found`)
  return record
}

// 除目标 root 的目标记录（及其祖先长度前缀）外，其余 root 字节必须原样保留。
// exceptRoot：跨 root 操作（attachAux 同时改 root 5 与 root 27）时跳过另一个 root。
function assertOnlyTargetRecordChanged(
  before: Uint8Array,
  after: Uint8Array,
  root: number,
  id: number,
  exceptRoot?: number
) {
  const beforeTop = parseWireMessage(before.slice(20, -4))!
  const afterTop = parseWireMessage(after.slice(20, -4))!
  const beforeRoot = beforeTop.find((f) => f.number === root && f.wire === 2)!
  const afterRoot = afterTop.find((f) => f.number === root && f.wire === 2)!
  const beforeRecords = parseWireMessage(beforeRoot.value as Uint8Array)!
  const afterRecords = parseWireMessage(afterRoot.value as Uint8Array)!
  assert.equal(beforeRecords.length, afterRecords.length)
  for (let i = 0; i < beforeRecords.length; i++) {
    const record = beforeRecords[i]
    if (record.number !== 1 || record.wire !== 2) continue
    const fields = parseWireMessage(record.value as Uint8Array)!
    if (fields.find((f) => f.number === 1 && f.wire === 0)?.value === id) continue
    assert.equal(
      Buffer.from(record.value as Uint8Array).toString('hex'),
      Buffer.from(afterRecords[i].value as Uint8Array).toString('hex'),
      `root ${root} non-target record ${i} changed`
    )
  }
  // 其他 root 字段（wire bytes）逐字节相同；varint root（39/40/41 等）也应相同
  for (const f of beforeTop) {
    if (f.number === root || f.number === exceptRoot) continue
    const afterField = afterTop.find((x) => x.number === f.number && x.wire === f.wire)
    assert.ok(afterField, `root ${f.number} missing after patch`)
    if (f.wire === 2) {
      assert.equal(
        Buffer.from(f.value as Uint8Array).toString('hex'),
        Buffer.from(afterField.value as Uint8Array).toString('hex'),
        `root ${f.number} changed`
      )
    } else {
      assert.equal(f.value, afterField.value, `root ${f.number} changed`)
    }
  }
}

{
  const v20 = new Uint8Array(readFileSync(V20))
  const v21 = new Uint8Array(readFileSync(V21))
  const patched = patchEntityColor(v20, SPHERE, V21_COLOR)
  // 1. 目标记录与编辑器真实产物逐字节一致（f3 颜色 + f5 RGB 同步规范化）
  assert.equal(
    Buffer.from(root5Record(patched, 14)).toString('hex'),
    Buffer.from(root5Record(v21, 14)).toString('hex'),
    'patched sphere record must equal editor-saved v21 record byte-for-byte'
  )
  // 2. 其余 root 5 记录与全部其他 root 字段原样保留
  assertOnlyTargetRecordChanged(v20, patched, 5, SPHERE)
  // 3. 回读断言（既有语义：GstsStaticColor.rgb = 0xAARRGGBB 全值，见 tests/gil_entities.ts）
  const entity = exportEntities(patched).find((e) => e.id === SPHERE)
  assert.equal(entity?.color?.enabled, true)
  assert.equal((entity?.color as { rgb: number }).rgb, V21_COLOR)
  console.log('PASS color patch matches editor v21 byte-for-byte; other roots untouched')
}

{
  const v21 = new Uint8Array(readFileSync(V21))
  const patched = patchEntityTransform(v21, SPHERE, {
    position: [1, 2, 3],
    rotation: [0, 46, 0],
    scale: [1, 1, 1]
  })
  const entity = exportEntities(patched).find((e) => e.id === SPHERE)!
  assert.deepEqual([...entity.position], [1, 2, 3])
  assert.deepEqual([...entity.rotation], [0, 46, 0])
  assert.deepEqual([...entity.scale], [1, 1, 1])
  assert.equal(entity.color?.enabled, true, 'transform patch must keep color')
  assertOnlyTargetRecordChanged(v21, patched, 5, SPHERE)
  console.log('PASS transform patch round-trips; color kept; other roots untouched')
}

{
  const v21 = new Uint8Array(readFileSync(V21))
  assert.throws(() => patchEntityColor(v21, 999999999, 0xffff0000), /not found/)
  console.log('PASS missing record fails loudly')
}

// 幂等性：同一 patch 重复应用不再变化
{
  const v21 = new Uint8Array(readFileSync(V21))
  const once = patchEntityColor(v21, SPHERE, 0xff58d284)
  const twice = patchEntityColor(once, SPHERE, 0xff58d284)
  assert.equal(Buffer.from(twice).toString('hex'), Buffer.from(once).toString('hex'))
  console.log('PASS patch idempotent')
}

// ---- aux（装饰物）patch 管线（2026-08-08，规则见 gil-structure-semantics.md）----

const AUX_LIVE = 1073741826 // v21 魔方块-1-1-1 贴片（资源 10009001，owner 1077936145）
const NO_T40_ENTITY = 1094713345 // v21 无挂接槽实体（新建槽路径）

function auxRecord(bytes: Uint8Array, auxId: number): Uint8Array {
  const record = wireRecords(parseWireMessage(bytes.slice(20, -4))!, 27, 2).find((r) => {
    const fields = parseWireMessage(r)
    return fields?.find((f) => f.number === 1 && f.wire === 0)?.value === auxId
  })
  assert.ok(record, `aux ${auxId} not found`)
  return record
}

/** 独立实现实体 f501 列表读取（不依赖 patch.ts 内部，双向校验） */
function entityAuxIds(bytes: Uint8Array, entityId: number): number[] {
  for (const f of parseWireMessage(recordOf(bytes, entityId))!) {
    if (f.number !== 5 || f.wire !== 2) continue
    const slot = parseWireMessage(f.value as Uint8Array)!
    if (!slot.some((c) => c.number === 1 && c.wire === 0 && c.value === 40)) continue
    const f50 = slot.find((c) => c.number === 50 && c.wire === 2)
    if (!f50) return []
    const list = parseWireMessage(f50.value as Uint8Array)!.find(
      (c) => c.number === 501 && c.wire === 2
    )
    if (!list) return []
    const data = list.value as Uint8Array
    const ids: number[] = []
    let i = 0
    while (i < data.length) {
      let v = 0
      let shift = 0
      while (i < data.length) {
        const b = data[i++]
        v |= (b & 0x7f) << shift
        if (!(b & 0x80)) break
        shift += 7
      }
      ids.push(v >>> 0)
    }
    return ids
  }
  return []
}

/** 独立实现 aux f502 owner 读取 */
function auxOwner(bytes: Uint8Array, auxId: number): number | undefined {
  for (const f of parseWireMessage(auxRecord(bytes, auxId))!) {
    if (f.number !== 4 || f.wire !== 2) continue
    const slot = parseWireMessage(f.value as Uint8Array)!
    if (!slot.some((c) => c.number === 1 && c.wire === 0 && c.value === 40)) continue
    const f50 = slot.find((c) => c.number === 50 && c.wire === 2)
    const inner = f50 ? parseWireMessage(f50.value as Uint8Array)! : []
    return inner.find((c) => c.number === 502 && c.wire === 0)?.value as number | undefined
  }
  return undefined
}

// attachAux：双向引用（实体 f501 ⇔ aux f502）+ 幂等 + 其他记录不动
{
  const v21 = new Uint8Array(readFileSync(V21))
  const patched = attachAux(v21, SPHERE, AUX_LIVE)
  assert.deepEqual(entityAuxIds(patched, SPHERE), [AUX_LIVE])
  assert.equal(auxOwner(patched, AUX_LIVE), SPHERE)
  assertOnlyTargetRecordChanged(v21, patched, 5, SPHERE, 27)
  assertOnlyTargetRecordChanged(v21, patched, 27, AUX_LIVE, 5)
  const twice = attachAux(patched, SPHERE, AUX_LIVE)
  assert.equal(Buffer.from(twice).toString('hex'), Buffer.from(patched).toString('hex'))
  console.log('PASS attach-aux bidirectional refs; idempotent; other records untouched')
}

// attachAux：实体无挂接槽时新建 f5{t=40} 槽
{
  const v21 = new Uint8Array(readFileSync(V21))
  const patched = attachAux(v21, NO_T40_ENTITY, AUX_LIVE)
  assert.deepEqual(entityAuxIds(patched, NO_T40_ENTITY), [AUX_LIVE])
  assert.equal(auxOwner(patched, AUX_LIVE), NO_T40_ENTITY)
  assertOnlyTargetRecordChanged(v21, patched, 5, NO_T40_ENTITY, 27)
  console.log('PASS attach-aux creates f5{t=40} slot when missing')
}

// detachAux：解除双向引用；空列表回落到编辑器形态（f50=空 message，槽保留）
{
  const v21 = new Uint8Array(readFileSync(V21))
  const attached = attachAux(v21, SPHERE, AUX_LIVE)
  const detached = detachAux(attached, SPHERE, AUX_LIVE)
  assert.deepEqual(entityAuxIds(detached, SPHERE), [])
  assert.equal(auxOwner(detached, AUX_LIVE), undefined)
  const f50 = parseWireMessage(
    parseWireMessage(recordOf(detached, SPHERE))!.find(
      (f) =>
        f.number === 5 &&
        parseWireMessage(f.value as Uint8Array)?.some((c) => c.number === 1 && c.wire === 0 && c.value === 40)
    )!.value as Uint8Array
  )!.find((c) => c.number === 50)!
  assert.equal((f50.value as Uint8Array).length, 0, 'empty attach list = empty message')
  const again = detachAux(detached, SPHERE, AUX_LIVE)
  assert.equal(Buffer.from(again).toString('hex'), Buffer.from(detached).toString('hex'))
  console.log('PASS detach-aux removes both refs; empty list collapses to empty f50')
}

// patchAuxColor：f3 颜色 + f5 RGB 同步（编辑器规范化规则）
{
  const v21 = new Uint8Array(readFileSync(V21))
  const patched = patchAuxColor(v21, AUX_LIVE, 0xff58d284)
  const slot = parseWireMessage(auxRecord(patched, AUX_LIVE))!.find(
    (f) =>
      f.number === 5 &&
      f.wire === 2 &&
      parseWireMessage(f.value as Uint8Array)?.some((c) => c.number === 1 && c.wire === 0 && c.value === 22)
  )!
  const mat = parseWireMessage(
    parseWireMessage(slot.value as Uint8Array)!.find((c) => c.number === 32 && c.wire === 2)!
      .value as Uint8Array
  )!
  assert.equal((mat.find((f) => f.number === 3)!.value as number) >>> 0, 0xff58d284)
  assert.equal(mat.find((f) => f.number === 5)!.value, 0x58d284)
  assert.equal(auxOwner(patched, AUX_LIVE), 1077936145, 'owner kept')
  assertOnlyTargetRecordChanged(v21, patched, 27, AUX_LIVE, 5)
  const twice = patchAuxColor(patched, AUX_LIVE, 0xff58d284)
  assert.equal(Buffer.from(twice).toString('hex'), Buffer.from(patched).toString('hex'))
  console.log('PASS aux color patch writes f3+f5; idempotent; owner kept')
}

// patchAuxTransform：position 稀疏 / rotation 度数 / scale 全量，回读一致
{
  const v21 = new Uint8Array(readFileSync(V21))
  const patched = patchAuxTransform(v21, AUX_LIVE, {
    position: [0.5, -0.25, 1],
    rotation: [0, 45, 0],
    scale: [0.5, 0.5, 0.5]
  })
  const t = readAuxTransform(patched, AUX_LIVE)
  assert.deepEqual([...t.position], [0.5, -0.25, 1])
  assert.deepEqual([...t.rotation], [0, 45, 0])
  assert.deepEqual([...t.scale], [0.5, 0.5, 0.5])
  assert.equal(auxOwner(patched, AUX_LIVE), 1077936145, 'owner kept')
  assertOnlyTargetRecordChanged(v21, patched, 27, AUX_LIVE, 5)
  console.log('PASS aux transform patch round-trips (sparse pos/rot, dense scale)')
}

// createAuxRecord + attachAux：新 aux 与编辑器 v21 产物字段树同构 + 双向一致
{
  const v21 = new Uint8Array(readFileSync(V21))
  const newId = 1073741880 // v21 55 条 aux（1073741825…1879）之后的下一个 ID
  const rec = buildAuxRecord({
    id: newId,
    ownerId: SPHERE,
    name: '足球贴片1',
    color: 0xff000000,
    position: [1, 0, 0],
    rotation: [0, 90, 0],
    scale: [0.42, 0.02, 0.42]
  })
  // 字段树同构（number:wire 结构，不含值）：新记录 vs 编辑器 v21 live aux
  const shape = (r: Uint8Array, depth = 0): string =>
    JSON.stringify(
      (parseWireMessage(r) ?? []).map((f) =>
        f.wire === 2 && depth < 2
          ? `${f.number}:${shape(f.value as Uint8Array, depth + 1)}`
          : `${f.number}:${f.wire}`
      )
    )
  assert.equal(shape(rec), shape(auxRecord(v21, AUX_LIVE)), 'field tree must match editor v21 aux')
  const patched = attachAux(createAuxRecord(v21, rec), SPHERE, newId)
  assert.deepEqual(entityAuxIds(patched, SPHERE), [newId])
  assert.equal(auxOwner(patched, newId), SPHERE)
  // 实体侧 f50 与编辑器星球样本同构：{f501: [auxID varints]}
  const f50 = parseWireMessage(
    parseWireMessage(recordOf(patched, SPHERE))!
      .find(
        (f) =>
          f.number === 5 &&
          parseWireMessage(f.value as Uint8Array)?.some((c) => c.number === 1 && c.wire === 0 && c.value === 40)
      )!
      .value as Uint8Array
  )!.find((c) => c.number === 50 && c.wire === 2)!.value as Uint8Array
  assert.ok(
    parseWireMessage(f50)?.some(
      (c) => c.number === 501 && c.wire === 2 && (c.value as Uint8Array).length === 5
    ),
    'f50 = {f501: auxID varint} nested message'
  )
  console.log('PASS create-aux record isomorphic to editor v21; bidirectional refs correct')
}
