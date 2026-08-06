import assert from 'node:assert/strict'

import {
  applyEntities,
  entityFromDefinition,
  exportEntities
} from '../src/cli/gil_entities.js'
import { emitWireMessage as emit, parseWireMessage } from '../src/cli/static_assembly/wire.js'
import { buildFile } from '../src/injector/binary.js'

// 真实编辑器样本（add-entity-from-component-1077936182 实验）：
// before.gil 中的元件定义 1077936182（箭头指示牌_1）与 after.gil 中的
// 场景实体 1077936186（从该元件新增）。转换结果应与真实实体逐字节一致。
const DEF_HEX =
  '08b68080820410aee5c409321708015a130a11e7aeade5a4b4e68c87e7a4bae7898c5f31320b080db2010620ffffffff0f3216080eba01110a0f1a0d4d50416374696f6e47726f7570320a08268203050d0000803f320508289203003205086fea05003205083d8a04003205083e9204003a2f08015a2b0a0a0de85275411d6266c6c01205158cc283c21a0f0d0000803f150000803f1d0000803fa81fffffffff0f3a04080262003a0408036a003a060804720208013a0808057a04080110013a0508068201003a4508078a01400d00002041150000803f1d0000fa432801320510c2c7ee0445cdcccc3d4dcdcccc3d55cdcccc3d5dcdcccc3d65cdcccc3d6dcdcccc3d75cdcccc3d7dcdcccc3d3a0a08089201050801a81f013a35080baa01300a2e0a0b47495f526f6f744e6f646512001a00b21f0ce4b8ade5bf83e58e9fe782b9c01f01ca1f08526f6f744e6f64653a08080cb20103a81f013a050810d201003a050811da01003a070813ea010208013a050814f201003a18081682021318ffffffff0f250000c84228ffffff0730ac34426508121001e2015e4a25180120012a0032003d0000803f420052005801ba1f0ce58f97e587bbe789b9e69588d81f0d5228180120012a0032003d0000803f420052005801ba1f0fe8a2abe587bbe58092e789b9e69588d81f0d5a0b47495f526f6f744e6f64654206080110015a004206080310016a00420708131001ea01004207080610018201004207080e1001c201005001'
const ENT_HEX =
  '08ba80808204120608b6808082042a1708015a130a11e7aeade5a4b4e68c87e7a4bae7898c5f312a0b080db2010620ffffffff0f2a16080eba01110a0f1a0d4d50416374696f6e47726f75702a0a08268203050d0000803f2a0508289203002a05086fea05002a05083d8a04002a05083e9204002a050813e201002a050834f20300322f08015a2b0a0a0d7a7434401d8d1260401205158cc283c21a0f0d0000803f150000803f1d0000803fa81fffffffff0f320408026200320408036a003206080472020801320808057a040801100132050806820100324508078a01400d00002041150000803f1d0000fa432801320510c2c7ee0445cdcccc3d4dcdcccc3d55cdcccc3d5dcdcccc3d65cdcccc3d6dcdcccc3d75cdcccc3d7dcdcccc3d320a08089201050801a81f013235080baa01300a2e0a0b47495f526f6f744e6f646512001a00b21f0ce4b8ade5bf83e58e9fe782b9c01f01ca1f08526f6f744e6f64653208080cb20103a81f0132050810d2010032050811da010032070813ea0102080132050814f201003218081682021318ffffffff0f250000c84228ffffff0730ac343a6508121001e2015e4a25180120012a0032003d0000803f420052005801ba1f0ce58f97e587bbe789b9e69588d81f0d5228180120012a0032003d0000803f420052005801ba1f0fe8a2abe587bbe58092e789b9e69588d81f0d5a0b47495f526f6f744e6f64653a06080110015a003a06080310016a003a0708131001ea01003a07080610018201003a07080e1001c2010040aee5c409'

const definition = Buffer.from(DEF_HEX, 'hex')

// 同构重放：真实 transform（来自实体 1077936186 的 f6[0]），
// 转换结果必须与真实实体记录逐字节一致。
const replay = entityFromDefinition(definition, {
  id: 1077936186,
  name: '箭头指示牌_1',
  definitionId: 1077936182,
  transform: {
    position: [2.8196091651916504, 0, 3.5011322498321533] as const,
    rotation: [0, -65.87997436523438, 0] as const,
    scale: [1, 1, 1] as const
  }
})
assert.equal(Buffer.from(replay).toString('hex'), ENT_HEX)

// applyEntities：微型地图（root 4 定义 + root 5 空 + root 6 未分类页签组），
// 创建实体后回读应含新记录与 registry 登记。
function text(number: number, value: string) {
  return { number, wire: 2, value: new TextEncoder().encode(value) }
}
const mini = buildFile(
  emit([
    { number: 4, wire: 2, value: emit([{ number: 1, wire: 2, value: definition }]) },
    { number: 5, wire: 2, value: emit([]) },
    {
      number: 6,
      wire: 2,
      value: emit([
        {
          number: 1,
          wire: 2,
          value: emit([
            { number: 1, wire: 0, value: 3 },
            { number: 2, wire: 2, value: new Uint8Array(8) },
            {
              number: 3,
              wire: 2,
              value: emit([
                text(1, '未分类页签'),
                { number: 3, wire: 0, value: 2 }
              ])
            }
          ])
        }
      ])
    }
  ]),
  { schema: 1, headTag: 2, fileType: 3, tailTag: 4 }
)
const applied = applyEntities({
  bytes: mini,
  definitions: [definition],
  entities: [
    { name: '箭头指示牌_2', id: 1077936187, definitionId: 1077936182, position: [10, 0, 0] }
  ]
})
const top = parseWireMessage(applied.slice(20, -4))
assert.ok(top)
const entityRecords = (top.find((field) => field.number === 5 && field.wire === 2)!
  .value as Uint8Array)
const entityFields = parseWireMessage(entityRecords)
assert.ok(entityFields)
const created = entityFields.find((field) => field.number === 1 && field.wire === 2)
assert.ok(created, 'entity record not created')
const createdBytes = created.value as Uint8Array
assert.ok(createdBytes.length > 500, `unexpected entity size ${createdBytes.length}`)
const exported = exportEntities(applied)
assert.equal(exported.length, 1)
assert.equal(exported[0].id, 1077936187)
assert.equal(exported[0].name, '箭头指示牌_2')
assert.equal(exported[0].definitionId, 1077936182)
assert.equal(exported[0].resourceId, 20001454)
assert.deepEqual(exported[0].position, [10, 0, 0])
assert.equal(exported[0].components.length, 1)
assert.equal(exported[0].components[0].type, 'basicMotion')
// registry 登记：root 6 的 f1=3 组应含 {f1=200, f2=1077936187}
const registry = (top.find((field) => field.number === 6 && field.wire === 2)!
  .value as Uint8Array)
assert.ok(
  Buffer.from(registry).includes(Buffer.from([0x08, 0xc8, 0x01, 0x10, 0xbb, 0x80, 0x80, 0x82, 0x04])),
  'entity registry entry missing'
)
// 头部长度字段必须重建：编辑器按头部长度解析 payload，源头部原样复制会在
// payload 变大后导致“存档损坏”（2026-08-06 实测根因）
const dataView = new DataView(applied.buffer, applied.byteOffset, applied.byteLength)
assert.equal(
  dataView.getUint32(16, false),
  applied.length - 24,
  'header payload length must match actual payload'
)
assert.equal(dataView.getUint32(0, false), applied.length - 4, 'header size field must match file size')
// 重复 ID 拒绝
assert.throws(
  () =>
    applyEntities({
      bytes: applied,
      definitions: [definition],
      entities: [{ name: 'x', id: 1077936187, definitionId: 1077936182 }]
    }),
  /entity ID conflict/i
)

console.log('gil entities tests passed')
