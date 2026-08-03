import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { applyStaticAssembly } from '../src/cli/gil_static_assemblies.js'
import { exportStaticAssemblies } from '../src/cli/static_assembly/export.js'
import { emitWireMessage as emit, type WireField } from '../src/cli/static_assembly/wire.js'
import { buildFile } from '../src/injector/binary.js'

// 真实 GIL 结构的微型地图：def 名称在 f6[0].f11.f1、模板资源 ID 在 f2、
// 装饰物引用为 packed field 501，辅助记录在 root 27（recordType 1/2）。
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
    msg(5, [
      { number: 1, wire: 0, value: 22 },
      msg(32, [
        { number: 1, wire: 0, value: 1 },
        { number: 3, wire: 0, value: 0xffff00ff },
        { number: 4, wire: 5, value: Buffer.from([0x00, 0x00, 0xc8, 0x42]) },
        { number: 5, wire: 0, value: 0xffff00 },
        { number: 6, wire: 0, value: 6700 }
      ])
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

const directory = mkdtempSync(path.join(tmpdir(), 'gsts-static-assembly-export-'))
const gilPath = path.join(directory, 'fixture.gil')
writeFileSync(gilPath, buildMiniMap())

// 带选项卡 + 跟随运动器 + 颜色装饰物的拼装，编码后反向导出应还原同一配置。
const applied = applyStaticAssembly({
  gilPath,
  assembly: {
    name: '导出回归_选项卡',
    prefabId: 700,
    templatePrefabId: 5000,
    templateInstanceId: 5000,
    templateName: '模板A',
    position: [3, 0, 0] as const,
    items: [
      {
        resourceId: 10009001,
        position: [-1, 0, 0] as const,
        color: { enabled: true, rgb: 0xff00ff, opacity: 100, overlay: 'overwrite' }
      },
      {
        resourceId: 10009002,
        position: [1, 0, 0] as const,
        scale: [2, 1, 1] as const,
        color: { enabled: false }
      }
    ],
    definitionAuxiliaryIds: [701, 702],
    instanceAuxiliaryIds: [703, 704],
    components: [
      { type: 'followMotion', preset: 'fullFollow' },
      { type: 'tabBar', regionName: '区域1', options: ['U', 'R', 'F'] }
    ]
  }
})
writeFileSync(gilPath, applied.bytes)

const exported = exportStaticAssemblies(applied.bytes)
const assembly = exported.find((item) => item.prefabId === 700)
assert.ok(assembly, 'exported assembly 700 not found')
assert.equal(assembly.name, '导出回归_选项卡')
assert.equal(assembly.prefabId, 700)
assert.equal(assembly.templateResourceId, 10009001)
assert.deepEqual(assembly.position, [3, 0, 0])
assert.equal(assembly.items.length, 2)
assert.equal(assembly.items[0].resourceId, 10009001)
assert.deepEqual(assembly.items[0].color, {
  enabled: true,
  rgb: 0xff00ff,
  opacity: 100,
  overlay: 'overwrite'
})
assert.equal(assembly.items[1].resourceId, 10009002)
assert.deepEqual(assembly.items[1].color, { enabled: false })
assert.deepEqual(assembly.items[1].scale, [2, 1, 1])
assert.deepEqual(assembly.components, [
  { type: 'followMotion', preset: 'fullFollow' },
  { type: 'tabBar', regionName: '区域1', options: ['U', 'R', 'F'] }
])

console.log('static assembly export tests passed')
