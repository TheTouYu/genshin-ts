import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { runAssetsEntities } from '../src/cli/assets_entities.js'
import {
  applyEntities,
  entityFromDefinition,
  exportEntities,
  readEntityAuxIds
} from '../src/cli/gil_entities.js'
import { emitWireMessage as emit, parseWireMessage, wireMessage } from '../src/cli/static_assembly/wire.js'
import { buildFile } from '../src/injector/binary.js'

// 空地图骨架没有 root 5；实体导出应返回空列表而不是把缺失容器当作损坏。
assert.deepEqual(
  exportEntities(
    buildFile(
      emit([{ number: 2, wire: 2, value: new TextEncoder().encode('空地图') }]),
      { schema: 1, headTag: 2, fileType: 3, tailTag: 4 }
    )
  ),
  []
)

// 真实编辑器样本（add-entity-from-component-1077936182 实验）：
// before.gil 中的元件定义 1077936182（箭头指示牌_1）与 after.gil 中的
// 场景实体 1077936186（从该元件新增）。转换结果应与真实实体逐字节一致。
const DEF_HEX =
  '08b68080820410aee5c409321708015a130a11e7aeade5a4b4e68c87e7a4bae7898c5f31320b080db2010620ffffffff0f3216080eba01110a0f1a0d4d50416374696f6e47726f7570320a08268203050d0000803f320508289203003205086fea05003205083d8a04003205083e9204003a2f08015a2b0a0a0de85275411d6266c6c01205158cc283c21a0f0d0000803f150000803f1d0000803fa81fffffffff0f3a04080262003a0408036a003a060804720208013a0808057a04080110013a0508068201003a4508078a01400d00002041150000803f1d0000fa432801320510c2c7ee0445cdcccc3d4dcdcccc3d55cdcccc3d5dcdcccc3d65cdcccc3d6dcdcccc3d75cdcccc3d7dcdcccc3d3a0a08089201050801a81f013a35080baa01300a2e0a0b47495f526f6f744e6f646512001a00b21f0ce4b8ade5bf83e58e9fe782b9c01f01ca1f08526f6f744e6f64653a08080cb20103a81f013a050810d201003a050811da01003a070813ea010208013a050814f201003a18081682021318ffffffff0f250000c84228ffffff0730ac34426508121001e2015e4a25180120012a0032003d0000803f420052005801ba1f0ce58f97e587bbe789b9e69588d81f0d5228180120012a0032003d0000803f420052005801ba1f0fe8a2abe587bbe58092e789b9e69588d81f0d5a0b47495f526f6f744e6f64654206080110015a004206080310016a00420708131001ea01004207080610018201004207080e1001c201005001'
const ENT_HEX =
  '08ba80808204120608b6808082042a1708015a130a11e7aeade5a4b4e68c87e7a4bae7898c5f312a0b080db2010620ffffffff0f2a16080eba01110a0f1a0d4d50416374696f6e47726f75702a0a08268203050d0000803f2a0508289203002a05086fea05002a05083d8a04002a05083e9204002a050813e201002a050834f20300322f08015a2b0a0a0d7a7434401d8d1260401205158cc283c21a0f0d0000803f150000803f1d0000803fa81fffffffff0f320408026200320408036a003206080472020801320808057a040801100132050806820100324508078a01400d00002041150000803f1d0000fa432801320510c2c7ee0445cdcccc3d4dcdcccc3d55cdcccc3d5dcdcccc3d65cdcccc3d6dcdcccc3d75cdcccc3d7dcdcccc3d320a08089201050801a81f013235080baa01300a2e0a0b47495f526f6f744e6f646512001a00b21f0ce4b8ade5bf83e58e9fe782b9c01f01ca1f08526f6f744e6f64653208080cb20103a81f0132050810d2010032050811da010032070813ea0102080132050814f201003218081682021318ffffffff0f250000c84228ffffff0730ac343a6508121001e2015e4a25180120012a0032003d0000803f420052005801ba1f0ce58f97e587bbe789b9e69588d81f0d5228180120012a0032003d0000803f420052005801ba1f0fe8a2abe587bbe58092e789b9e69588d81f0d5a0b47495f526f6f744e6f64653a06080110015a003a06080310016a003a0708131001ea01003a07080610018201003a07080e1001c2010040aee5c409'

const definition = Buffer.from(DEF_HEX, 'hex')

function replaceVarint(record: Uint8Array, number: number, value: number): Uint8Array {
  const fields = parseWireMessage(record)
  assert.ok(fields)
  const matches = fields.filter((field) => field.number === number && field.wire === 0)
  assert.equal(matches.length, 1)
  matches[0].value = value
  return emit(fields)
}

const emptyDefinition = replaceVarint(definition, 2, 10005018)

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
                { number: 3, wire: 0, value: 2 },
                // 组条目 (100, definition)：ID 被 definition 登记占用，实体不得复用
                {
                  number: 5,
                  wire: 2,
                  value: emit([
                    { number: 1, wire: 0, value: 100 },
                    { number: 2, wire: 0, value: 1077936182 }
                  ])
                }
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
assert.deepEqual(exported[0].auxIds, [])
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

// sourceDefinitionId 只选择转换模板；definitionId 才写入实体 relation。这样可用独立
// root4 空模型 definition 生成直接资源实体 10005018，而不把 donor definition 加入目标地图。
const directResource = applyEntities({
  bytes: mini,
  definitions: [emptyDefinition],
  entities: [
    {
      name: '足球vNext宿主',
      id: 1077936188,
      definitionId: 10005018,
      sourceDefinitionId: 1077936182,
      scale: [0.1, 0.1, 0.1]
    }
  ]
})
const directEntity = exportEntities(directResource).find((entity) => entity.id === 1077936188)
assert.ok(directEntity)
assert.equal(directEntity.definitionId, 10005018)
assert.equal(directEntity.resourceId, 10005018)
assert.deepEqual(directEntity.scale, [Math.fround(0.1), Math.fround(0.1), Math.fround(0.1)])
// 直接资源实体（目标地图 root 4 无 definitionId 定义）必须写 relation 内建标记
// {1:resId, 2:1}——真实编辑器样本（1077936172/1077936173/1077936175）f2 均带
// {2:1}；缺标记的实体编辑器加载时被忽略（2026-08-07 实测：注入的 1077936176
// 编辑器不可见，用户新建实体直接复用了该 ID，保存后覆盖注入记录）。
const directTop = parseWireMessage(directResource.slice(20, -4))
assert.ok(directTop)
const directEntityBytes = (directTop.find((field) => field.number === 5 && field.wire === 2)!
  .value as Uint8Array)
const directEntityRecord = parseWireMessage(directEntityBytes)!
  .find((field) => field.number === 1 && field.wire === 2)
assert.ok(directEntityRecord, 'direct resource entity record missing')
const directRelation = parseWireMessage(directEntityRecord.value as Uint8Array)!
  .find((field) => field.number === 2 && field.wire === 2)
assert.ok(directRelation, 'direct resource entity relation missing')
assert.equal(
  Buffer.from(directRelation.value as Uint8Array).toString('hex'),
  '089ad4e2041001',
  'builtin resource entity relation must be {1:10005018, 2:1}'
)

// CLI 同一路径必须接受 sourceDefinitionId，并用哈希门拒绝过期源。
const directory = mkdtempSync(path.join(tmpdir(), 'gsts-entity-source-definition-'))
const sourcePath = path.join(directory, 'source.gil')
const donorPath = path.join(directory, 'donor.gil')
const entitiesPath = path.join(directory, 'entities.json')
const candidatePath = path.join(directory, 'candidate.gil')
const donorDefinition = replaceVarint(emptyDefinition, 1, 1077936200)
writeFileSync(sourcePath, mini)
writeFileSync(
  donorPath,
  buildFile(
    emit([{ number: 4, wire: 2, value: emit([{ number: 1, wire: 2, value: donorDefinition }]) }]),
    {
      schema: 1,
      headTag: 2,
      fileType: 3,
      tailTag: 4
    }
  )
)
writeFileSync(
  entitiesPath,
  JSON.stringify({
    schemaVersion: 1,
    entities: [
      {
        name: '足球vNext宿主',
        id: 1077936188,
        definitionId: 10005018,
        sourceDefinitionId: 1077936200,
        scale: [0.1, 0.1, 0.1]
      }
    ]
  })
)
const sourceHash = createHash('sha256').update(readFileSync(sourcePath)).digest('hex')
await runAssetsEntities([
  'import',
  '--gil',
  sourcePath,
  '--entities',
  entitiesPath,
  '--definitions-gil',
  donorPath,
  '--expect-source-hash',
  sourceHash,
  '--output',
  candidatePath
])
const cliEntity = exportEntities(new Uint8Array(readFileSync(candidatePath))).find(
  (entity) => entity.id === 1077936188
)
assert.equal(cliEntity?.definitionId, 10005018)
assert.equal(cliEntity?.resourceId, 10005018)
await assert.rejects(
  runAssetsEntities([
    'import',
    '--gil',
    sourcePath,
    '--entities',
    entitiesPath,
    '--definitions-gil',
    donorPath,
    '--expect-source-hash',
    '0'.repeat(64),
    '--output',
    path.join(directory, 'stale.gil')
  ]),
  /source SHA-256 mismatch/i
)

const writeSourcePath = path.join(directory, 'write-source.gil')
writeFileSync(writeSourcePath, mini)
await runAssetsEntities([
  'import',
  '--gil',
  writeSourcePath,
  '--entities',
  entitiesPath,
  '--definitions-gil',
  donorPath,
  '--expect-source-hash',
  sourceHash,
  '--write'
])
assert.ok(readFileSync(writeSourcePath).equals(readFileSync(candidatePath)))
const backups = readdirSync(path.join(directory, '.gsts', 'backups'))
assert.equal(backups.length, 1)
assert.ok(readFileSync(path.join(directory, '.gsts', 'backups', backups[0])).equals(mini))
assert.equal(readdirSync(directory).filter((name) => name.endsWith('.tmp')).length, 0)

// 重复 ID = 更新已有实体（记录替换，不重复登记组条目，实体数不变）
const updated = applyEntities({
  bytes: applied,
  definitions: [definition],
  entities: [{ name: 'x', id: 1077936187, definitionId: 1077936182 }]
})
const updatedExported = exportEntities(updated)
assert.equal(updatedExported.length, 1, 'update must not duplicate entity')
assert.equal(updatedExported[0].name, 'x')
assert.throws(
  () =>
    applyEntities({
      bytes: applied,
      definitions: [definition],
      entities: [{ name: 'x', id: 1077936182, definitionId: 1077936182 }]
    }),
  /entity ID conflict/i
)

// 颜色回读：export 必须能读出实体级自定义颜色（真实 wire：实体材质槽在
// #6{f1=22}.f32，颜色值 f3=0xAARRGGBB varint；2026-08-06 v9 地图 27 块实测，
// readColor 曾读 #5/f5 导致颜色永远不可见）
const colored = applyEntities({
  bytes: applied,
  definitions: [definition],
  entities: [{ name: 'x', id: 1077936187, definitionId: 1077936182, color: 0xffff0000 }]
})
const coloredExported = exportEntities(colored)
assert.equal(coloredExported.length, 1)
assert.equal(coloredExported[0].color?.enabled, true)
assert.equal(coloredExported[0].color?.rgb, 0xffff0000)
assert.equal(coloredExported[0].color?.opacity, 100)

// apply-candidate：hash-gated 候选写回（备份 = 源、目标 = 候选、无残留 tmp）
const applySourcePath = path.join(directory, 'apply-source.gil')
writeFileSync(applySourcePath, mini)
await runAssetsEntities([
  'apply-candidate',
  '--gil',
  applySourcePath,
  '--candidate',
  candidatePath,
  '--expect-source-hash',
  sourceHash
])
assert.ok(readFileSync(applySourcePath).equals(readFileSync(candidatePath)))
const applyBackups = readdirSync(path.join(directory, '.gsts', 'backups'))
assert.equal(applyBackups.length, 2)
assert.ok(
  readFileSync(path.join(directory, '.gsts', 'backups', applyBackups[1])).equals(mini),
  'apply-candidate backup must equal pre-write source'
)
assert.equal(readdirSync(directory).filter((name) => name.endsWith('.tmp')).length, 0)

// apply-candidate 参数与哈希门错误
await assert.rejects(
  runAssetsEntities([
    'apply-candidate',
    '--gil',
    applySourcePath,
    '--candidate',
    candidatePath
  ]),
  /expect-source-hash/i
)
await assert.rejects(
  runAssetsEntities([
    'apply-candidate',
    '--gil',
    applySourcePath,
    '--candidate',
    candidatePath,
    '--expect-source-hash',
    '0'.repeat(64)
  ]),
  /source SHA-256 mismatch/i
)
const applySource2 = path.join(directory, 'apply-source-2.gil')
writeFileSync(applySource2, mini)
await assert.rejects(
  runAssetsEntities([
    'apply-candidate',
    '--gil',
    applySource2,
    '--candidate',
    path.join(directory, 'missing.gil'),
    '--expect-source-hash',
    sourceHash
  ]),
  /ENOENT/i
)

// ---- import 自动挂接 definition 的 instance-side aux（2026-08-10 修复）----
// 真实样本（1073741862 足球）：实体与 definition 各有 132 条 instance-side
// aux（root27.f2），除 f1/f502/f12 外逐字节一致；import 生成的实体必须复制
// 一套挂接，否则场景实体只剩主体无装饰物（production-workflow §7 已知 Bug）。
const auxDefId = 1077936200
const auxEntityId = 1077936201
const donorAuxId = 1073741825 // 0x40000001 起独立 ID 空间
const auxDefinition = replaceVarint(definition, 1, auxDefId)
const donorAux = emit([
  { number: 1, wire: 0, value: donorAuxId },
  { number: 2, wire: 0, value: 10009001 },
  {
    number: 4,
    wire: 2,
    value: emit([
      { number: 1, wire: 0, value: 1 },
      { number: 11, wire: 2, value: emit([text(1, '贴片')]) }
    ])
  },
  {
    number: 4,
    wire: 2,
    value: emit([
      { number: 1, wire: 0, value: 40 },
      { number: 50, wire: 2, value: emit([{ number: 502, wire: 0, value: auxDefId }]) }
    ])
  },
  {
    number: 5,
    wire: 2,
    value: emit([
      { number: 1, wire: 0, value: 1 },
      { number: 11, wire: 2, value: new Uint8Array(0) }
    ])
  },
  { number: 12, wire: 2, value: emit([{ number: 1, wire: 0, value: auxDefId }]) }
])
const miniWithAux = buildFile(
  emit([
    { number: 4, wire: 2, value: emit([{ number: 1, wire: 2, value: auxDefinition }]) },
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
              value: emit([text(1, '未分类页签'), { number: 3, wire: 0, value: 2 }])
            }
          ])
        }
      ])
    },
    { number: 27, wire: 2, value: emit([{ number: 2, wire: 2, value: donorAux }]) }
  ]),
  { schema: 1, headTag: 2, fileType: 3, tailTag: 4 }
)
const auxApplied = applyEntities({
  bytes: miniWithAux,
  definitions: [auxDefinition],
  entities: [{ name: '贴片实体', id: auxEntityId, definitionId: auxDefId }]
})
const auxTop = parseWireMessage(auxApplied.slice(20, -4))
assert.ok(auxTop)
const auxCreated = wireMessage(
  auxTop.find((field) => field.number === 5 && field.wire === 2)!
).find((field) => field.number === 1 && field.wire === 2)!
// 实体侧挂接：f5{t=40}.f50.f501 = [新 aux ID]（donor max=1073741825 → +1）
assert.deepEqual(readEntityAuxIds(auxCreated.value as Uint8Array), [1073741826])
// root27.f2：donor 原样保留 + 一条 clone
const auxRecords = wireMessage(
  auxTop.find((field) => field.number === 27 && field.wire === 2)!
)
  .filter((field) => field.number === 2 && field.wire === 2)
  .map((field) => field.value as Uint8Array)
assert.equal(auxRecords.length, 2)
assert.equal(Buffer.from(auxRecords[0]).toString('hex'), Buffer.from(donorAux).toString('hex'))
const cloneFields = parseWireMessage(auxRecords[1])
assert.ok(cloneFields)
assert.equal(cloneFields.find((field) => field.number === 1 && field.wire === 0)?.value, 1073741826)
// clone 侧挂接：f4{t=40}.f50.f502 = 实体、f12{f1} = 实体（双向引用）
const cloneSlot = parseWireMessage(
  cloneFields.find(
    (field) =>
      field.number === 4 &&
      field.wire === 2 &&
      parseWireMessage(field.value as Uint8Array)?.some(
        (child) => child.number === 1 && child.wire === 0 && child.value === 40
      )
  )!.value as Uint8Array
)!
assert.equal(cloneSlot.find((field) => field.number === 1)?.value, 40)
const cloneF50 = parseWireMessage(cloneSlot.find((field) => field.number === 50)!.value as Uint8Array)!
assert.equal(cloneF50.find((field) => field.number === 502)?.value, auxEntityId)
const cloneF12 = parseWireMessage(
  cloneFields.find((field) => field.number === 12 && field.wire === 2)!.value as Uint8Array
)!
assert.equal(cloneF12.find((field) => field.number === 1)?.value, auxEntityId)
// 更新幂等：同一实体再次 import，挂接保留、不新增 aux 记录
const auxReApplied = applyEntities({
  bytes: auxApplied,
  definitions: [auxDefinition],
  entities: [{ name: '贴片实体', id: auxEntityId, definitionId: auxDefId }]
})
const auxReTop = parseWireMessage(auxReApplied.slice(20, -4))
assert.ok(auxReTop)
const auxReCreated = wireMessage(
  auxReTop.find((field) => field.number === 5 && field.wire === 2)!
).find((field) => field.number === 1 && field.wire === 2)!
assert.deepEqual(readEntityAuxIds(auxReCreated.value as Uint8Array), [1073741826])
assert.equal(
  wireMessage(auxReTop.find((field) => field.number === 27 && field.wire === 2)!).filter(
    (field) => field.number === 2 && field.wire === 2
  ).length,
  2
)

console.log('gil entities tests passed')
