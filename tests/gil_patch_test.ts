import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { parseWireMessage, wireRecords } from '../src/cli/static_assembly/wire.js'
import { patchEntityColor, patchEntityTransform } from '../src/cli/static_assembly/patch.js'
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

// 除 root5 目标记录（及其祖先长度前缀）外，其余 root 字节必须原样保留
function assertOnlyTargetRecordChanged(before: Uint8Array, after: Uint8Array, root: number, id: number) {
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
    if (f.number === root) continue
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
