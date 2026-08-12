/**
 * tabBar 组件区域配置（regionType/regionSize/regionRadius/regionCenter）focused 测试。
 *
 * 真实样本对照（~/genshin-ts-evidence/component-investigation/tabbar-region-exp2/raw/）：
 * - before.gil（exp5：盒体 3×3×3，regionName=魔方操作，options=R/L/U/D/F/B）→ 249B 槽
 * - after.gil（exp6：球体半径 1，同区域/选项）→ 237B 槽
 * 两个样本槽 hex 内联于本文件；本测试编码出的槽与样本逐字节一致（验收 2/3/4）。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { applyStaticAssembly } from '../src/cli/gil_static_assemblies.js'
import {
  parseWireMessage,
  wireRecordId,
  wireRecords
} from '../src/cli/static_assembly/wire.js'
import { exportStaticAssemblies } from '../src/cli/static_assembly/export.js'
import { emitWireMessage as emit, type WireField } from '../src/cli/static_assembly/wire.js'
import { buildFile } from '../src/injector/binary.js'

// 真实样本 exp5（before.gil def 1077936137 field 8）：盒体 3×3×3，249B
const SAMPLE_BOX_3X3X3 = Buffer.from(
  '08111001da01f1010a295a150a00120f0d0000404015000040401d000040401a00b21f0ce9ad94e696b9e6938de4bd9cb81f01' +
    '121f08011201521801200128013200ba1f0c522020e5ba8fe58fb73a2031c01f0d' +
    '121f080212014c1801200128013200ba1f0c4c2020e5ba8fe58fb73a2032c01f0d' +
    '121f08031201551801200128013200ba1f0c552020e5ba8fe58fb73a2033c01f0d' +
    '121f08041201441801200128013200ba1f0c442020e5ba8fe58fb73a2034c01f0d' +
    '121f08051201461801200128013200ba1f0c462020e5ba8fe58fb73a2035c01f0d' +
    '121f08061201421801200128013200ba1f0c422020e5ba8fe58fb73a2036c01f0d',
  'hex'
)

// 真实样本 exp6（after.gil def 1077936137 field 8）：球体半径 1、中心偏移全 0，237B
const SAMPLE_SPHERE_R1 = Buffer.from(
  '08111001da01e5010a1d080162070a00150000803fb21f0ce9ad94e696b9e6938de4bd9cb81f01' +
    '121f08011201521801200128013200ba1f0c522020e5ba8fe58fb73a2031c01f0d' +
    '121f080212014c1801200128013200ba1f0c4c2020e5ba8fe58fb73a2032c01f0d' +
    '121f08031201551801200128013200ba1f0c552020e5ba8fe58fb73a2033c01f0d' +
    '121f08041201441801200128013200ba1f0c442020e5ba8fe58fb73a2034c01f0d' +
    '121f08051201461801200128013200ba1f0c462020e5ba8fe58fb73a2035c01f0d' +
    '121f08061201421801200128013200ba1f0c422020e5ba8fe58fb73a2036c01f0d',
  'hex'
)

// 旧编码器默认输出（无扩展字段，盒体 1×1×1；与 tests/gil_static_assembly_components.ts 同源）
const EXPECTED_LEGACY_HEX =
  '08111001da01b1020a245a150a00120f0d0000803f150000803f1d0000803f1a00b21f07e58cbae59f9f31' +
  'b81f01121f08011201551801200128013200ba1f0c552020e5ba8fe58fb73a2031c01f0d' +
  '121f08021201521801200128013200ba1f0c522020e5ba8fe58fb73a2032c01f0d' +
  '121f08031201461801200128013200ba1f0c462020e5ba8fe58fb73a2033c01f0d' +
  '121f08041201441801200128013200ba1f0c442020e5ba8fe58fb73a2034c01f0d' +
  '121f080512014c1801200128013200ba1f0c4c2020e5ba8fe58fb73a2035c01f0d' +
  '121f08061201421801200128013200ba1f0c422020e5ba8fe58fb73a2036c01f0d' +
  '124308071213e980862fe9a1bae697b6e99288e58887e68da21801200128013200' +
  'ba1f1ee980862fe9a1bae697b6e99288e58887e68da22020e5ba8fe58fb73a2037c01f0d'

const OPTIONS = ['R', 'L', 'U', 'D', 'F', 'B']
const REGION_NAME = '魔方操作'

// 微型地图（同 tests/static_assembly_export.ts 形状）：def 名称 f6.f11.f1、资源 f2、
// 装饰物 packed f501、辅助记录 root 27（recordType 1/2）。模板 5000 无组件槽。
const TEXT = new TextEncoder()

function msg(number: number, fields: readonly WireField[]): WireField {
  return { number, wire: 2, value: emit(fields) }
}

function text(number: number, value: string): WireField {
  return { number, wire: 2, value: TEXT.encode(value) }
}

function vector(number: number, values: readonly number[]): WireField {
  const bytes = Buffer.alloc(values.length * 4)
  values.forEach((value, index) => bytes.writeFloatLE(value, index * 4))
  return { number, wire: 2, value: bytes }
}

function packed(ids: readonly number[]): Uint8Array {
  const parts: number[] = []
  for (const id of ids) {
    let value = id
    while (value >= 0x80) {
      parts.push((value & 0x7f) | 0x80)
      value >>>= 7
    }
    parts.push(value)
  }
  return Uint8Array.from(parts)
}

function defRecord(id: number, name: string, slots: readonly Uint8Array[]): Uint8Array {
  return emit([
    { number: 1, wire: 0, value: id },
    { number: 2, wire: 0, value: 10009001 },
    msg(6, [msg(11, [text(1, name)])]),
    ...slots.map((value) => ({ number: 8, wire: 2, value }) as WireField),
    { number: 501, wire: 2, value: packed([id + 1000]) }
  ])
}

function instRecord(id: number, name: string, defId: number, slots: readonly Uint8Array[]): Uint8Array {
  return emit([
    { number: 1, wire: 0, value: id },
    msg(2, [{ number: 1, wire: 0, value: defId }]),
    msg(5, [msg(11, [text(1, name)])]),
    msg(6, [
      { number: 1, wire: 0, value: 1 },
      msg(11, [vector(1, [0, 0, 0]), vector(2, [0, 0, 0]), vector(3, [1, 1, 1])])
    ]),
    ...slots.map((value) => ({ number: 7, wire: 2, value }) as WireField),
    { number: 501, wire: 2, value: packed([id + 1001]) }
  ])
}

function auxiliaryRecord(id: number, ownerId: number): Uint8Array {
  return emit([
    { number: 1, wire: 0, value: id },
    { number: 2, wire: 0, value: 10009001 },
    msg(4, [msg(11, [text(1, '装饰物_1')])]),
    msg(5, [
      { number: 1, wire: 0, value: 1 },
      msg(11, [vector(1, [1, 2, 3]), vector(2, [0, 0, 0]), vector(3, [1, 1, 1])])
    ]),
    msg(12, [{ number: 1, wire: 0, value: ownerId }])
  ])
}

function buildMiniMap(): Uint8Array {
  const definition = defRecord(5000, '模板A', [])
  const instance = instRecord(5000, '模板A', 5000, [])
  const definitionAuxiliary = auxiliaryRecord(6000, 5000)
  const instanceAuxiliary = auxiliaryRecord(6001, 5000)
  const top = emit([
    msg(4, [{ number: 1, wire: 2, value: definition }]),
    msg(6, [
      msg(1, [msg(3, [msg(5, [{ number: 1, wire: 0, value: 1 }, { number: 2, wire: 0, value: 5000 }])])])
    ]),
    msg(8, [{ number: 1, wire: 2, value: instance }]),
    msg(27, [
      { number: 1, wire: 2, value: definitionAuxiliary },
      { number: 2, wire: 2, value: instanceAuxiliary }
    ])
  ])
  return buildFile(top, { schema: 1, headTag: 2, fileType: 3, tailTag: 4 })
}

const directory = mkdtempSync(path.join(tmpdir(), 'gsts-tabbar-region-config-'))
const gilPath = path.join(directory, 'fixture.gil')
writeFileSync(gilPath, buildMiniMap())

function base(prefabId: number) {
  return {
    name: `区域配置_${prefabId}`,
    prefabId,
    templatePrefabId: 5000,
    templateInstanceId: 5000,
    templateName: '模板A',
    position: [0, 0, 0] as const,
    items: [{ resourceId: 10009001, position: [0, 0, 0] as const }],
    definitionAuxiliaryIds: [prefabId + 1000],
    instanceAuxiliaryIds: [prefabId + 2000]
  }
}

function encode(prefabId: number, components: unknown[]) {
  const result = applyStaticAssembly({
    gilPath,
    assembly: { ...base(prefabId), components: components as never }
  })
  writeFileSync(gilPath, result.bytes)
  return result
}

function componentSlot(assembly: { bytes: Uint8Array }, id: number, fieldNumber: number): Uint8Array {
  const top = parseWireMessage(assembly.bytes.slice(20, -4))
  assert.ok(top)
  const record = wireRecords(top, 4, 1).find((value) => wireRecordId(value) === id)
  assert.ok(record)
  const fields = parseWireMessage(record)
  assert.ok(fields)
  const slot = fields.find((field) => field.number === fieldNumber && field.wire === 2)
  assert.ok(slot)
  return slot.value as Uint8Array
}

// ---- 验收 2：无扩展字段 → 与旧 tabBarComponent 输出逐字节一致 ----
const legacy = encode(300, [
  { type: 'tabBar', regionName: '区域1', options: ['U', 'R', 'F', 'D', 'L', 'B', '逆/顺时针切换'] }
])
const legacySlot = componentSlot(legacy, 300, 8)
assert.equal(Buffer.from(legacySlot).toString('hex'), EXPECTED_LEGACY_HEX)
assert.equal(legacySlot.length, 313)

// ---- 验收 3：box regionSize=[3,3,3] → f11 {f1 空, f2={3.0,3.0,3.0}, f3 空}，与 exp5 样本逐字节一致 ----
const box3 = encode(310, [
  {
    type: 'tabBar',
    regionName: REGION_NAME,
    regionType: 'box',
    regionSize: [3, 3, 3],
    options: OPTIONS
  }
])
const box3Slot = componentSlot(box3, 310, 8)
assert.equal(Buffer.from(box3Slot).equals(SAMPLE_BOX_3X3X3), true, 'box 3x3x3 must match exp5 sample')
// 结构断言：f27.f1.f11.f2 = 三个 float32 3.0
{
  const f27 = parseWireMessage(box3Slot)?.find((f) => f.number === 27 && f.wire === 2)
  const config = parseWireMessage(f27!.value as Uint8Array)!
  const region = config.find((f) => f.number === 1 && f.wire === 2)!
  const regionFields = parseWireMessage(region.value as Uint8Array)!
  const f11 = regionFields.find((f) => f.number === 11 && f.wire === 2)!
  const f11Fields = parseWireMessage(f11.value as Uint8Array)!
  const f1 = f11Fields.find((f) => f.number === 1 && f.wire === 2)!
  assert.equal((f1.value as Uint8Array).length, 0) // f11.f1 空 = 无中心偏移
  const size = f11Fields.find((f) => f.number === 2 && f.wire === 2)!
  const floats = parseWireMessage(size.value as Uint8Array)!
    .filter((f) => f.wire === 5)
    .map((f) => Buffer.from(f.value as Uint8Array).readFloatLE(0))
  assert.deepEqual(floats, [3, 3, 3])
  const f3 = f11Fields.find((f) => f.number === 3 && f.wire === 2)!
  assert.equal((f3.value as Uint8Array).length, 0)
}

// ---- 验收 4a：sphere radius=1、center 全 0 → f12.f1 空块，与 exp6 样本逐字节一致 ----
const sphere1 = encode(320, [
  {
    type: 'tabBar',
    regionName: REGION_NAME,
    regionType: 'sphere',
    regionRadius: 1,
    regionCenter: [0, 0, 0],
    options: OPTIONS
  }
])
const sphere1Slot = componentSlot(sphere1, 320, 8)
assert.equal(Buffer.from(sphere1Slot).equals(SAMPLE_SPHERE_R1), true, 'sphere r1 must match exp6 sample')
{
  const f27 = parseWireMessage(sphere1Slot)?.find((f) => f.number === 27 && f.wire === 2)
  const config = parseWireMessage(f27!.value as Uint8Array)!
  const region = config.find((f) => f.number === 1 && f.wire === 2)!
  const regionFields = parseWireMessage(region.value as Uint8Array)!
  const marker = regionFields.find((f) => f.number === 1 && f.wire === 0)
  assert.equal(marker?.value, 1)
  const f12 = regionFields.find((f) => f.number === 12 && f.wire === 2)!
  const f12Fields = parseWireMessage(f12.value as Uint8Array)!
  const center = f12Fields.find((f) => f.number === 1 && f.wire === 2)!
  assert.equal((center.value as Uint8Array).length, 0) // 全 0 偏移 = 空块，与 exp6 样本一致
}

// ---- 验收 4b：sphere radius=3、center=[0.1,0,0] → f1=1 + f12 {f1={0.1,0,0}, f2=3.0}（2026-08-12 游戏验证通过）----
const sphere3 = encode(330, [
  {
    type: 'tabBar',
    regionName: REGION_NAME,
    regionType: 'sphere',
    regionRadius: 3,
    regionCenter: [0.1, 0, 0],
    options: OPTIONS
  }
])
const sphere3Slot = componentSlot(sphere3, 330, 8)
assert.equal(sphere3Slot.length, 252)
{
  const f27 = parseWireMessage(sphere3Slot)?.find((f) => f.number === 27 && f.wire === 2)
  const config = parseWireMessage(f27!.value as Uint8Array)!
  const region = config.find((f) => f.number === 1 && f.wire === 2)!
  const regionFields = parseWireMessage(region.value as Uint8Array)!
  const marker = regionFields.find((f) => f.number === 1 && f.wire === 0)
  assert.equal(marker?.value, 1)
  const f12 = regionFields.find((f) => f.number === 12 && f.wire === 2)!
  const f12Fields = parseWireMessage(f12.value as Uint8Array)!
  // f12.f1 = 中心偏移子块 {f1=X, f2=Y, f3=Z} float32（2026-08-12 游戏验证通过）
  const center = f12Fields.find((f) => f.number === 1 && f.wire === 2)!
  const centerFloats = parseWireMessage(center.value as Uint8Array)!
    .filter((f) => f.wire === 5)
    .map((f) => Buffer.from(f.value as Uint8Array).readFloatLE(0))
  // float32 量化：0.1 → 0.10000000149011612
  assert.ok(centerFloats.every((value, axis) => Math.abs(value - [0.1, 0, 0][axis]) < 1e-6))
  // f12.f2 = 半径 float32 3.0
  const radius = f12Fields.find((f) => f.number === 2 && f.wire === 5)!
  assert.equal(Buffer.from(radius.value as Uint8Array).readFloatLE(0), 3)
  // f502 区域名 / f503 = 1
  const f502 = regionFields.find((f) => f.number === 502 && f.wire === 2)
  assert.ok(f502)
  const f503 = regionFields.find((f) => f.number === 503 && f.wire === 0)
  assert.equal(f503?.value, 1)
}

// ---- 验收 1：非法组合 fail closed ----
function expectReject(prefabId: number, components: unknown[], pattern: RegExp) {
  assert.throws(
    () => encode(prefabId, components),
    pattern,
    `expected rejection matching ${pattern}`
  )
}
expectReject(340, [{ type: 'tabBar', regionName: 'r', regionType: 'box', regionRadius: 2, options: ['A'] }], /regionRadius.*box/)
expectReject(341, [{ type: 'tabBar', regionName: 'r', regionType: 'sphere', regionSize: [1, 1, 1], options: ['A'] }], /regionSize.*sphere/)
expectReject(342, [{ type: 'tabBar', regionName: 'r', regionType: 'box', regionCenter: [0.1, 0, 0], options: ['A'] }], /box region center/)
expectReject(343, [{ type: 'tabBar', regionName: 'r', regionType: 'pyramid', options: ['A'] }], /regionType/)
expectReject(344, [{ type: 'tabBar', regionName: 'r', regionType: 'sphere', regionRadius: 0, options: ['A'] }], /regionRadius/)
expectReject(345, [{ type: 'tabBar', regionName: 'r', regionType: 'box', regionSize: [0, 1, 1], options: ['A'] }], /regionSize/)

// ---- 回读（export）确认：区域几何可逆解码 ----
{
  const exported = exportStaticAssemblies(sphere3.bytes)
  const assembly = exported.find((item) => item.prefabId === 330)
  assert.ok(assembly)
  assert.deepEqual(assembly.components, [
    {
      type: 'tabBar',
      regionName: REGION_NAME,
      regionType: 'sphere',
      regionRadius: 3,
      regionCenter: [0.1, 0, 0],
      options: OPTIONS
    }
  ])
}
{
  const exported = exportStaticAssemblies(box3.bytes)
  const assembly = exported.find((item) => item.prefabId === 310)
  assert.ok(assembly)
  assert.deepEqual(assembly.components, [
    {
      type: 'tabBar',
      regionName: REGION_NAME,
      regionType: 'box',
      regionSize: [3, 3, 3],
      options: OPTIONS
    }
  ])
}
{
  // 默认盒体（无扩展字段）回读保持旧形状：不输出 region 字段
  const exported = exportStaticAssemblies(legacy.bytes)
  const assembly = exported.find((item) => item.prefabId === 300)
  assert.ok(assembly)
  assert.deepEqual(assembly.components, [
    { type: 'tabBar', regionName: '区域1', options: ['U', 'R', 'F', 'D', 'L', 'B', '逆/顺时针切换'] }
  ])
}

console.log('tabBar region config tests passed')
