import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { applyStaticPrefabCategories } from '../src/cli/gil_static_prefab_categories.js'
import {
  emitWireMessage,
  nthWireField,
  parseWireMessage,
  printableWireText,
  wireMessage
} from '../src/cli/static_assembly/wire.js'
import { buildFile } from '../src/injector/binary.js'
import {
  buildStaticAssemblyFixture,
  FIXTURE_IDS
} from './fixtures/static-assembly/build_fixture.js'

const text = (number: number, value: string) =>
  ({
    number,
    wire: 2,
    value: new TextEncoder().encode(value)
  }) as const
const message = (number: number, fields: Parameters<typeof emitWireMessage>[0]) =>
  ({
    number,
    wire: 2,
    value: emitWireMessage(fields)
  }) as const
const member = (id: number) =>
  message(5, [
    { number: 1, wire: 0, value: 100 },
    { number: 2, wire: 0, value: id }
  ])

function fixture(): Uint8Array {
  const source = buildStaticAssemblyFixture()
  const top = parseWireMessage(source.slice(20, -4))!
  nthWireField(top, 6).value = emitWireMessage([
    message(1, [
      { number: 1, wire: 0, value: 6 },
      message(2, [
        text(1, 'root'),
        { number: 3, wire: 0, value: 1 },
        message(4, [text(1, '学习'), { number: 3, wire: 0, value: 3 }]),
        message(4, [text(1, '魔方'), { number: 3, wire: 0, value: 4 }]),
        message(4, [text(1, '基础元件'), { number: 3, wire: 0, value: 5 }])
      ]),
      message(3, [
        text(1, '未分类页签'),
        { number: 3, wire: 0, value: 2 },
        member(FIXTURE_IDS.definition)
      ])
    ])
  ])
  return buildFile(emitWireMessage(top), { schema: 1, headTag: 2, fileType: 3, tailTag: 4 })
}

function categories(bytes: Uint8Array): Map<string, number[]> {
  const top = parseWireMessage(bytes.slice(20, -4))!
  const registry = wireMessage(nthWireField(top, 6))
  const record = wireMessage(registry[0])
  const root = wireMessage(nthWireField(record, 2))
  return new Map(
    root
      .filter((field) => field.number === 4 && field.wire === 2)
      .map((field) => {
        const category = wireMessage(field)
        const name = printableWireText(nthWireField(category, 1).value as Uint8Array)!
        const ids = category
          .filter((child) => child.number === 5 && child.wire === 2)
          .map((child) => nthWireField(wireMessage(child), 2).value as number)
        return [name, ids]
      })
  )
}

const source = fixture()
const directory = mkdtempSync(path.join(tmpdir(), 'gsts-static-prefab-categories-'))
const gilPath = path.join(directory, 'fixture.gil')
writeFileSync(gilPath, source)
const result = applyStaticPrefabCategories({
  gilPath,
  categories: [
    { name: '学习', prefabIds: [FIXTURE_IDS.definition] },
    { name: '魔方', prefabIds: [] },
    { name: '基础元件', prefabIds: [] }
  ]
})
assert.deepEqual(
  categories(result.bytes),
  new Map([
    ['学习', [FIXTURE_IDS.definition]],
    ['魔方', []],
    ['基础元件', []]
  ])
)
const resultTop = parseWireMessage(result.bytes.slice(20, -4))!
const resultRegistry = wireMessage(nthWireField(resultTop, 6))
const resultRecord = wireMessage(resultRegistry[0])
const resultRoot = wireMessage(nthWireField(resultRecord, 2))
const defaultCategory = resultRecord.find((field) => field.number === 3 && field.wire === 2)!
const defaultFields = wireMessage(defaultCategory)
assert.equal(
  defaultFields.some(
    (field) =>
      field.number === 5 && nthWireField(wireMessage(field), 2).value === FIXTURE_IDS.definition
  ),
  false,
  'assigned prefab must be removed from the default category'
)
assert.equal(
  Buffer.from(
    nthWireField(parseWireMessage(result.bytes.slice(20, -4))!, 4).value as Uint8Array
  ).equals(
    Buffer.from(nthWireField(parseWireMessage(source.slice(20, -4))!, 4).value as Uint8Array)
  ),
  true,
  'category update must not modify prefab definitions'
)
assert.throws(
  () =>
    applyStaticPrefabCategories({
      gilPath,
      categories: [{ name: '不存在', prefabIds: [FIXTURE_IDS.definition] }]
    }),
  /category.*不存在.*not found/i
)
assert.throws(
  () =>
    applyStaticPrefabCategories({
      gilPath,
      categories: [
        { name: '学习', prefabIds: [FIXTURE_IDS.definition] },
        { name: '魔方', prefabIds: [FIXTURE_IDS.definition] }
      ]
    }),
  /prefab.*multiple categories/i
)
const created = applyStaticPrefabCategories({
  gilPath,
  categories: [{ name: '新分类', create: true, prefabIds: [FIXTURE_IDS.definition] }]
})
const createdTop = parseWireMessage(created.bytes.slice(20, -4))!
const createdRegistry = wireMessage(nthWireField(createdTop, 6))
const createdRecord = wireMessage(createdRegistry[0])
const createdRoot = wireMessage(nthWireField(createdRecord, 2))
const newCategory = createdRoot.find((field) => {
  if (field.number !== 4 || field.wire !== 2) return false
  const fields = wireMessage(field)
  return printableWireText(nthWireField(fields, 1).value as Uint8Array) === '新分类'
})!
const newCategoryFields = wireMessage(newCategory)
assert.equal(printableWireText(nthWireField(newCategoryFields, 1).value as Uint8Array), '新分类')
assert.equal(nthWireField(newCategoryFields, 3).value, 6)
assert.equal(nthWireField(newCategoryFields, 5).value !== undefined, true)
assert.throws(
  () =>
    applyStaticPrefabCategories({
      gilPath,
      categories: [{ name: '学习', prefabIds: [999] }]
    }),
  /prefab.*999.*not found/i
)

console.log('static prefab category tests passed')
