import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { applyStaticAssembly } from '../src/cli/gil_static_assemblies.js'
import {
  emitWireMessage,
  nthWireField,
  parseWireMessage,
  wireMessage,
  wireRecordId,
  wireRecords
} from '../src/cli/static_assembly/wire.js'
import { buildFile } from '../src/injector/binary.js'
import {
  buildStaticAssemblyFixture,
  FIXTURE_IDS
} from './fixtures/static-assembly/build_fixture.js'

const source = buildStaticAssemblyFixture()
const directory = mkdtempSync(path.join(tmpdir(), 'gsts-static-assembly-components-'))
const gilPath = path.join(directory, 'fixture.gil')
writeFileSync(gilPath, source)

function createdRecord(bytes: Uint8Array, section: number, id: number): Uint8Array {
  const top = parseWireMessage(bytes.slice(20, -4))
  assert.ok(top)
  const record = wireRecords(top, section, 1).find((value) => wireRecordId(value) === id)
  assert.ok(record)
  return record
}

function componentRecords(record: Uint8Array, fieldNumber: number): Uint8Array[] {
  const fields = parseWireMessage(record)
  assert.ok(fields)
  return fields
    .filter((field) => field.number === fieldNumber && field.wire === 2)
    .map((field) => field.value as Uint8Array)
}

function seedFollowMotionComponent(bytes: Uint8Array): Uint8Array {
  const top = parseWireMessage(bytes.slice(20, -4))!
  for (const [sectionNumber, componentFieldNumber] of [
    [4, 8],
    [8, 7]
  ] as const) {
    const section = wireMessage(nthWireField(top, sectionNumber))
    const expectedOwnerId = sectionNumber === 4 ? FIXTURE_IDS.definition : FIXTURE_IDS.instance
    const record = section.find(
      (field) =>
        field.number === 1 &&
        field.wire === 2 &&
        wireRecordId(field.value as Uint8Array) === expectedOwnerId
    )!
    const recordFields = parseWireMessage(record.value as Uint8Array)!
    recordFields.push({
      number: componentFieldNumber,
      wire: 2,
      value: emitWireMessage([
        { number: 1, wire: 0, value: 9 },
        { number: 2, wire: 0, value: 999 }
      ])
    })
    record.value = emitWireMessage(recordFields)
    nthWireField(top, sectionNumber).value = emitWireMessage(section)
  }
  return buildFile(emitWireMessage(top), { schema: 1, headTag: 2, fileType: 3, tailTag: 4 })
}

function assembly(prefabId: number) {
  return {
    name: `组件回归_${prefabId}`,
    prefabId,
    templatePrefabId: FIXTURE_IDS.definition,
    templateInstanceId: FIXTURE_IDS.instance,
    templateName: '模板',
    position: [0, 0, 0] as const,
    items: [{ resourceId: 10009001, position: [0, 0, 0] as const }],
    definitionAuxiliaryIds: [prefabId + 1],
    instanceAuxiliaryIds: [prefabId + 2]
  }
}

const omitted = applyStaticAssembly({ gilPath, assembly: assembly(300) })
assert.equal(componentRecords(createdRecord(omitted.bytes, 4, 300), 8).length, 0)
assert.equal(componentRecords(createdRecord(omitted.bytes, 8, 300), 7).length, 0)

const configured = applyStaticAssembly({
  gilPath,
  assembly: {
    ...assembly(400),
    components: [{ type: 'followMotion', preset: 'fullFollow' }]
  }
})
const definitionComponents = componentRecords(createdRecord(configured.bytes, 4, 400), 8)
const instanceComponents = componentRecords(createdRecord(configured.bytes, 8, 400), 7)
assert.equal(definitionComponents.length, 1)
assert.equal(instanceComponents.length, 1)
assert.equal(Buffer.from(definitionComponents[0]).equals(Buffer.from(instanceComponents[0])), true)
const expectedFullFollowHex =
  '080910019a0134120b47495f526f6f744e6f64651a0a0d0000803f1d0000803f220028b00930cc083a025a00b21f0ce5ae8ce585a8e8b79fe99a8f'
assert.equal(Buffer.from(definitionComponents[0]).toString('hex'), expectedFullFollowHex)

const basicMotionConfigured = applyStaticAssembly({
  gilPath,
  assembly: {
    ...assembly(425),
    components: [{ type: 'basicMotion', preset: 'default' }]
  }
})
const basicDefinition = componentRecords(createdRecord(basicMotionConfigured.bytes, 4, 425), 8)
const basicInstance = componentRecords(createdRecord(basicMotionConfigured.bytes, 8, 425), 7)
// 2026-08-13 修正：基础运动器真实类型码 4（9B 默认快照），旧 18 为模板自带组件误判
const expectedBasicMotionHex = '080410017203c81f01'
assert.equal(basicDefinition.length, 1)
assert.equal(basicInstance.length, 1)
assert.equal(Buffer.from(basicDefinition[0]).equals(Buffer.from(basicInstance[0])), true)
assert.equal(Buffer.from(basicDefinition[0]).toString('hex'), expectedBasicMotionHex)

// 铭牌（code 27）：默认空配置槽。逐字节对照真实编辑器样本
// nameplate-component exp2（definition f8 / instance f7 双写一致）。
const nameplateConfigured = applyStaticAssembly({
  gilPath,
  assembly: {
    ...assembly(427),
    components: [{ type: 'nameplate', preset: 'default' }]
  }
})
const nameplateDefinition = componentRecords(createdRecord(nameplateConfigured.bytes, 4, 427), 8)
const nameplateInstance = componentRecords(createdRecord(nameplateConfigured.bytes, 8, 427), 7)
const expectedNameplateHex = '081b1001b20200'
assert.equal(nameplateDefinition.length, 1)
assert.equal(nameplateInstance.length, 1)
assert.equal(Buffer.from(nameplateDefinition[0]).equals(Buffer.from(nameplateInstance[0])), true)
assert.equal(Buffer.from(nameplateDefinition[0]).toString('hex'), expectedNameplateHex)

// 铭牌（code 27）带显示内容：逐字节对照 nameplate-component exp4（305B，内容“这是显示内容”）。
const nameplateContentConfigured = applyStaticAssembly({
  gilPath,
  assembly: {
    ...assembly(431),
    components: [{ type: 'nameplate', preset: 'default', content: '这是显示内容' }]
  }
})
const nameplateContentDefinition = componentRecords(
  createdRecord(nameplateContentConfigured.bytes, 4, 431),
  8
)
const nameplateContentInstance = componentRecords(
  createdRecord(nameplateContentConfigured.bytes, 8, 431),
  7
)
const expectedNameplateContentHex =
  '081b1001b202a902aa1fa502a81f01b01f01ba1f0b47495f526f6f744e6f6465c21f00cd1f0000a040' +
  'd21f00dd1f0000a041e51f0000803f8220d901b21f30b01f12ba1f0cad1f0000c842b51f0000f041c21f' +
  '15aa1f12e8bf99e698afe698bee7a4bae58685e5aeb9ca1f00f01f0cba1f16b01ff955c21f0cad1f0000' +
  '0042b51f00000042ca1f00c21f48c21f0ca81fffffffffffffffffff01ca1f0ca81ffffffffffffffff' +
  'fff01d21f0ca81fffffffffffffffffff01e01f01ea1f0cad1f0000c842b51f0000a040f21f00fd1f00' +
  '00803fca1f06a81f01d21f00d21f1bb21f00ba1f0cad1f0000c842b51f0000a040c01f01e51f0000c842' +
  'da1f15aa1f00b21f0cad1f0000c842b51f0000a040c01f02d025019a2000d22510e993ade7898c20e985' +
  '8de7bdae494431e22500e8250d'
assert.equal(nameplateContentDefinition.length, 1)
assert.equal(nameplateContentInstance.length, 1)
assert.equal(
  Buffer.from(nameplateContentDefinition[0]).equals(Buffer.from(nameplateContentInstance[0])),
  true
)
assert.equal(
  Buffer.from(nameplateContentDefinition[0]).toString('hex'),
  expectedNameplateContentHex
)

// 铭牌（code 27）显示范围：range=10（38.501[0].505 f32，默认 5）。
// 逐字节对照 2026-08-17 地图 1073741893 编辑器样本（内容“你好，这是测试铭牌”）。
const nameplateRangeConfigured = applyStaticAssembly({
  gilPath,
  assembly: {
    ...assembly(432),
    components: [
      { type: 'nameplate', preset: 'default', content: '你好，这是测试铭牌', range: 10 }
    ]
  }
})
const nameplateRangeDefinition = componentRecords(
  createdRecord(nameplateRangeConfigured.bytes, 4, 432),
  8
)
const nameplateRangeInstance = componentRecords(
  createdRecord(nameplateRangeConfigured.bytes, 8, 432),
  7
)
const expectedNameplateRangeHex =
  '081b1001b202b202aa1fae02a81f01b01f01ba1f0b47495f526f6f744e6f6465c21f00cd1f00002041' +
  'd21f00dd1f0000a041e51f0000803f8220e201b21f39b01f12ba1f0cad1f0000c842b51f0000f041c21f' +
  '1eaa1f1be4bda0e5a5bdefbc8ce8bf99e698afe6b58be8af95e993ade7898cca1f00f01f0cba1f16b01f' +
  'f955c21f0cad1f00000042b51f00000042ca1f00c21f48c21f0ca81fffffffffffffffffff01ca1f0ca8' +
  '1fffffffffffffffffff01d21f0ca81fffffffffffffffffff01e01f01ea1f0cad1f0000c842b51f0000' +
  'a040f21f00fd1f0000803fca1f06a81f01d21f00d21f1bb21f00ba1f0cad1f0000c842b51f0000a040c0' +
  '1f01e51f0000c842da1f15aa1f00b21f0cad1f0000c842b51f0000a040c01f02d025019a2000d22510e9' +
  '93ade7898c20e9858de7bdae494431e22500e8250d'
assert.equal(nameplateRangeDefinition.length, 1)
assert.equal(nameplateRangeInstance.length, 1)
assert.equal(
  Buffer.from(nameplateRangeDefinition[0]).equals(Buffer.from(nameplateRangeInstance[0])),
  true
)
assert.equal(Buffer.from(nameplateRangeDefinition[0]).toString('hex'), expectedNameplateRangeHex)

// 文本气泡（code 28）：默认 97B 槽（含一条 501 配置「文本气泡 配置ID1」）。
// 逐字节对照真实编辑器样本 component-investigation exp7。
const textBubbleConfigured = applyStaticAssembly({
  gilPath,
  assembly: {
    ...assembly(428),
    components: [{ type: 'textBubble', preset: 'default' }]
  }
})
const textBubbleDefinition = componentRecords(createdRecord(textBubbleConfigured.bytes, 4, 428), 8)
const textBubbleInstance = componentRecords(createdRecord(textBubbleConfigured.bytes, 8, 428), 7)
const expectedTextBubbleHex =
  '081c1001ba025aaa1f57a81f01b01f01ba1f0b47495f526f6f744e6f6465c21f00cd1f0000a041' +
  'd21f00d81f01ea1f0fb01f12ba1f00c51f0000803fc82501f81f1eca2516e69687e69cace6b094' +
  'e6b3a120e9858de7bdae494431da2500e8250d'
assert.equal(textBubbleDefinition.length, 1)
assert.equal(textBubbleInstance.length, 1)
assert.equal(Buffer.from(textBubbleDefinition[0]).equals(Buffer.from(textBubbleInstance[0])), true)
assert.equal(Buffer.from(textBubbleDefinition[0]).toString('hex'), expectedTextBubbleHex)

// 光源（code 38）：默认 71B 槽（含一条 501 配置「光源1」+ GI_RootNode）。
// 逐字节对照 2026-08-17 地图 1073741892 两次独立编辑器样本（definition f8 / instance f7 双写一致）。
const lightSourceConfigured = applyStaticAssembly({
  gilPath,
  assembly: {
    ...assembly(429),
    components: [{ type: 'lightSource', preset: 'default' }]
  }
})
const lightSourceDefinition = componentRecords(
  createdRecord(lightSourceConfigured.bytes, 4, 429),
  8
)
const lightSourceInstance = componentRecords(createdRecord(lightSourceConfigured.bytes, 8, 429), 7)
const expectedLightSourceHex =
  '082610018a03400a3e0801aa1f361207e58589e6ba9031221e15000020411a00220028019a031015' +
  '000040401d0000404020ffffffff0f320b47495f526f6f744e6f6465b01f01'
assert.equal(lightSourceDefinition.length, 1)
assert.equal(lightSourceInstance.length, 1)
assert.equal(Buffer.from(lightSourceDefinition[0]).equals(Buffer.from(lightSourceInstance[0])), true)
assert.equal(Buffer.from(lightSourceDefinition[0]).toString('hex'), expectedLightSourceHex)

// 光源（code 38）参数化：radius/intensity 直接编码 float32。
// 用编辑器 after-round4 的原始内部值（显示 7.86/3.90 对应的滑条存储值）逐字节锁定。
const lightSourceParamsConfigured = applyStaticAssembly({
  gilPath,
  assembly: {
    ...assembly(430),
    components: [
      {
        type: 'lightSource',
        preset: 'default',
        radius: 7.855867385864258,
        intensity: 3.8992347717285156
      }
    ]
  }
})
const lightSourceParamsDefinition = componentRecords(
  createdRecord(lightSourceParamsConfigured.bytes, 4, 430),
  8
)
const lightSourceParamsInstance = componentRecords(
  createdRecord(lightSourceParamsConfigured.bytes, 8, 430),
  7
)
const expectedLightSourceParamsHex =
  '082610018a03400a3e0801aa1f361207e58589e6ba9031221e15000020411a00220028019a031015' +
  '4463fb401d108d794020ffffffff0f320b47495f526f6f744e6f6465b01f01'
assert.equal(lightSourceParamsDefinition.length, 1)
assert.equal(lightSourceParamsInstance.length, 1)
assert.equal(
  Buffer.from(lightSourceParamsDefinition[0]).equals(Buffer.from(lightSourceParamsInstance[0])),
  true
)
assert.equal(
  Buffer.from(lightSourceParamsDefinition[0]).toString('hex'),
  expectedLightSourceParamsHex
)

writeFileSync(gilPath, seedFollowMotionComponent(source))
const replaced = applyStaticAssembly({
  gilPath,
  assembly: {
    ...assembly(450),
    components: [{ type: 'followMotion', preset: 'fullFollow' }]
  }
})
const replacedDefinition = componentRecords(createdRecord(replaced.bytes, 4, 450), 8)
const replacedInstance = componentRecords(createdRecord(replaced.bytes, 8, 450), 7)
assert.equal(replacedDefinition.length, 1)
assert.equal(replacedInstance.length, 1)
assert.equal(Buffer.from(replacedDefinition[0]).toString('hex'), expectedFullFollowHex)
assert.equal(Buffer.from(replacedInstance[0]).toString('hex'), expectedFullFollowHex)

writeFileSync(gilPath, source)
assert.throws(
  () =>
    applyStaticAssembly({
      gilPath,
      assembly: {
        ...assembly(500),
        components: [
          { type: 'followMotion', preset: 'fullFollow' },
          { type: 'followMotion', preset: 'fullFollow' }
        ]
      }
    }),
  /components.*duplicate/i
)

// 选项卡（code 17）：区域 + 选项列表。逐字节对照真实元件样本
// “空模型_选项卡组件”（def 1077936180）的 313-byte 组件槽。
const tabBarConfigured = applyStaticAssembly({
  gilPath,
  assembly: {
    ...assembly(475),
    components: [
      {
        type: 'tabBar',
        regionName: '区域1',
        options: ['U', 'R', 'F', 'D', 'L', 'B', '逆/顺时针切换']
      }
    ]
  }
})
const tabBarDefinition = componentRecords(createdRecord(tabBarConfigured.bytes, 4, 475), 8)
const tabBarInstance = componentRecords(createdRecord(tabBarConfigured.bytes, 8, 475), 7)
const expectedTabBarHex =
  '08111001da01b1020a245a150a00120f0d0000803f150000803f1d0000803f1a00b21f07e58cbae59f9f31' +
  'b81f01121f08011201551801200128013200ba1f0c552020e5ba8fe58fb73a2031c01f0d' +
  '121f08021201521801200128013200ba1f0c522020e5ba8fe58fb73a2032c01f0d' +
  '121f08031201461801200128013200ba1f0c462020e5ba8fe58fb73a2033c01f0d' +
  '121f08041201441801200128013200ba1f0c442020e5ba8fe58fb73a2034c01f0d' +
  '121f080512014c1801200128013200ba1f0c4c2020e5ba8fe58fb73a2035c01f0d' +
  '121f08061201421801200128013200ba1f0c422020e5ba8fe58fb73a2036c01f0d' +
  '124308071213e980862fe9a1bae697b6e99288e58887e68da21801200128013200' +
  'ba1f1ee980862fe9a1bae697b6e99288e58887e68da22020e5ba8fe58fb73a2037c01f0d'
assert.equal(tabBarDefinition.length, 1)
assert.equal(tabBarInstance.length, 1)
assert.equal(Buffer.from(tabBarDefinition[0]).equals(Buffer.from(tabBarInstance[0])), true)
assert.equal(Buffer.from(tabBarDefinition[0]).toString('hex'), expectedTabBarHex)

console.log('static assembly component tests passed')
