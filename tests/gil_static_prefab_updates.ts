import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { applyStaticPrefabUpdate } from '../src/cli/gil_static_prefab_updates.js'
import { parseWireMessage, wireRecordId, wireRecords } from '../src/cli/static_assembly/wire.js'
import {
  buildStaticAssemblyFixture,
  FIXTURE_IDS
} from './fixtures/static-assembly/build_fixture.js'

const directory = mkdtempSync(path.join(tmpdir(), 'gsts-static-prefab-updates-'))
const gilPath = path.join(directory, 'fixture.gil')
writeFileSync(gilPath, buildStaticAssemblyFixture())

function record(bytes: Uint8Array, section: number, id: number): Uint8Array {
  const top = parseWireMessage(bytes.slice(20, -4))
  assert.ok(top)
  const matches = wireRecords(top, section, 1).filter((value) => wireRecordId(value) === id)
  assert.equal(matches.length, 1)
  return matches[0]
}

function components(owner: Uint8Array, fieldNumber: number, type: number): Uint8Array[] {
  const fields = parseWireMessage(owner)
  assert.ok(fields)
  return fields
    .filter((field) => field.number === fieldNumber && field.wire === 2)
    .map((field) => field.value as Uint8Array)
    .filter((component) =>
      parseWireMessage(component)?.some(
        (field) => field.number === 1 && field.wire === 0 && field.value === type
      )
    )
}

const sourceBytes = buildStaticAssemblyFixture()
const result = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    components: [{ type: 'followMotion', preset: 'fullFollow' }]
  }
})

const definitionComponents = components(record(result.bytes, 4, FIXTURE_IDS.definition), 8, 9)
const instanceComponents = components(record(result.bytes, 8, FIXTURE_IDS.instance), 7, 9)
assert.equal(definitionComponents.length, 1)
assert.equal(instanceComponents.length, 1)
assert.equal(Buffer.from(definitionComponents[0]).equals(Buffer.from(instanceComponents[0])), true)
assert.equal(
  Buffer.from(definitionComponents[0]).toString('hex'),
  '080910019a0134120b47495f526f6f744e6f64651a0a0d0000803f1d0000803f220028b00930cc083a025a00b21f0ce5ae8ce585a8e8b79fe99a8f'
)

writeFileSync(gilPath, sourceBytes)
const basicMotion = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    components: [{ type: 'basicMotion', preset: 'default' }]
  }
})
const basicDefinition = components(record(basicMotion.bytes, 4, FIXTURE_IDS.definition), 8, 4)
const basicInstance = components(record(basicMotion.bytes, 8, FIXTURE_IDS.instance), 7, 4)
assert.equal(basicDefinition.length, 1)
assert.equal(basicInstance.length, 1)
assert.equal(Buffer.from(basicDefinition[0]).equals(Buffer.from(basicInstance[0])), true)
assert.equal(
  // 2026-08-13 修正：基础运动器真实类型码 4（9B 默认快照），旧 18 为模板自带组件误判
  Buffer.from(basicDefinition[0]).toString('hex'),
  '080410017203c81f01'
)

writeFileSync(gilPath, sourceBytes)
const scaleOnly = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    scale: [0.01, 0.01, 0.01]
  }
})
assert.equal(
  Buffer.from(record(scaleOnly.bytes, 4, FIXTURE_IDS.definition)).equals(
    Buffer.from(record(sourceBytes, 4, FIXTURE_IDS.definition))
  ),
  true,
  'scale-only update must not modify the prefab definition'
)
const scaledInstance = parseWireMessage(record(scaleOnly.bytes, 8, FIXTURE_IDS.instance))!
const transformOwner = parseWireMessage(
  scaledInstance.find((field) => field.number === 6 && field.wire === 2)!.value as Uint8Array
)!
const transform = parseWireMessage(
  transformOwner.find((field) => field.number === 11 && field.wire === 2)!.value as Uint8Array
)!
const scale = parseWireMessage(
  transform.find((field) => field.number === 3 && field.wire === 2)!.value as Uint8Array
)!
assert.deepEqual(
  scale.map((field) => Buffer.from(field.value as Uint8Array).readFloatLE()),
  [Math.fround(0.01), Math.fround(0.01), Math.fround(0.01)]
)

writeFileSync(gilPath, sourceBytes)
const positionOnly = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    position: [12, 2, 0]
  }
})
assert.equal(
  Buffer.from(record(positionOnly.bytes, 4, FIXTURE_IDS.definition)).equals(
    Buffer.from(record(sourceBytes, 4, FIXTURE_IDS.definition))
  ),
  true,
  'position-only update must not modify the prefab definition'
)
const sourceInstance = parseWireMessage(record(sourceBytes, 8, FIXTURE_IDS.instance))!
const sourceTransformOwner = parseWireMessage(
  sourceInstance.find((field) => field.number === 6 && field.wire === 2)!.value as Uint8Array
)!
const sourceTransform = parseWireMessage(
  sourceTransformOwner.find((field) => field.number === 11 && field.wire === 2)!.value as Uint8Array
)!
const positionedInstance = parseWireMessage(record(positionOnly.bytes, 8, FIXTURE_IDS.instance))!
const positionedTransformOwner = parseWireMessage(
  positionedInstance.find((field) => field.number === 6 && field.wire === 2)!.value as Uint8Array
)!
const positionedTransform = parseWireMessage(
  positionedTransformOwner.find((field) => field.number === 11 && field.wire === 2)!
    .value as Uint8Array
)!
const position = parseWireMessage(
  positionedTransform.find((field) => field.number === 1 && field.wire === 2)!.value as Uint8Array
)!
assert.deepEqual(
  position.map((field) => [field.number, Buffer.from(field.value as Uint8Array).readFloatLE()]),
  [
    [1, 12],
    [2, 2]
  ]
)
for (const fieldNumber of [2, 3]) {
  assert.equal(
    Buffer.from(
      positionedTransform.find((field) => field.number === fieldNumber && field.wire === 2)!
        .value as Uint8Array
    ).equals(
      Buffer.from(
        sourceTransform.find((field) => field.number === fieldNumber && field.wire === 2)!
          .value as Uint8Array
      )
    ),
    true,
    `position-only update must preserve transform field ${fieldNumber} bytes`
  )
}

assert.throws(
  () =>
    applyStaticPrefabUpdate({
      gilPath,
      update: {
        prefabId: FIXTURE_IDS.definition,
        instanceId: FIXTURE_IDS.instance,
        expectedName: '错误名称',
        components: [{ type: 'followMotion', preset: 'fullFollow' }]
      }
    }),
  /expectedName.*does not match/i
)

// --- 2026-08-16: nameplate(27)/textBubble(28) 默认槽（update 路径锁定）---
// 证据：nameplate-component exp2（27，7B 空配置）/ component-investigation exp7（28，97B 默认 501 配置）。
writeFileSync(gilPath, sourceBytes)
const nameplate = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    components: [{ type: 'nameplate', preset: 'default' }]
  }
})
const nameplateDefinition = components(record(nameplate.bytes, 4, FIXTURE_IDS.definition), 8, 27)
const nameplateInstance = components(record(nameplate.bytes, 8, FIXTURE_IDS.instance), 7, 27)
assert.equal(nameplateDefinition.length, 1)
assert.equal(nameplateInstance.length, 1)
assert.equal(Buffer.from(nameplateDefinition[0]).equals(Buffer.from(nameplateInstance[0])), true)
assert.equal(Buffer.from(nameplateDefinition[0]).toString('hex'), '081b1001b20200')

// 命中检测（code 12）默认槽（update 路径锁定）：逐字节对照 component-investigation exp6。
writeFileSync(gilPath, sourceBytes)
const hitDetection = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    components: [{ type: 'hitDetection', preset: 'default' }]
  }
})
const hitDetectionDefinition = components(record(hitDetection.bytes, 4, FIXTURE_IDS.definition), 8, 12)
const hitDetectionInstance = components(record(hitDetection.bytes, 8, FIXTURE_IDS.instance), 7, 12)
const hitDetectionSceneEntity = components(record(hitDetection.bytes, 5, FIXTURE_IDS.sceneEntity), 7, 12)
assert.equal(hitDetectionDefinition.length, 1)
assert.equal(hitDetectionInstance.length, 1)
assert.equal(hitDetectionSceneEntity.length, 1)
assert.equal(Buffer.from(hitDetectionDefinition[0]).equals(Buffer.from(hitDetectionInstance[0])), true)
assert.equal(
  Buffer.from(hitDetectionSceneEntity[0]).equals(Buffer.from(hitDetectionInstance[0])),
  true
)
assert.equal(
  Buffer.from(hitDetectionDefinition[0]).toString('hex'),
  '080c1001b2014a0a245a150a00120f0d0000803f150000803f1d0000803f1a00b21f07' +
    'e58cbae59f9f31b81f01100118b510250000803f32003a0040d20f4a02fd0a5d9a99993e' +
    '6a02a914b81f0dd03e01'
)

// 铭牌（code 27）带显示内容（update 路径锁定）：逐字节对照 nameplate-component exp4。
writeFileSync(gilPath, sourceBytes)
const nameplateContent = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    components: [{ type: 'nameplate', preset: 'default', content: '这是显示内容' }]
  }
})
const nameplateContentDefinition = components(
  record(nameplateContent.bytes, 4, FIXTURE_IDS.definition),
  8,
  27
)
const nameplateContentInstance = components(
  record(nameplateContent.bytes, 8, FIXTURE_IDS.instance),
  7,
  27
)
assert.equal(nameplateContentDefinition.length, 1)
assert.equal(nameplateContentInstance.length, 1)
assert.equal(
  Buffer.from(nameplateContentDefinition[0]).equals(Buffer.from(nameplateContentInstance[0])),
  true
)
assert.equal(
  Buffer.from(nameplateContentDefinition[0]).toString('hex'),
  '081b1001b202a902aa1fa502a81f01b01f01ba1f0b47495f526f6f744e6f6465c21f00cd1f0000a040' +
    'd21f00dd1f0000a041e51f0000803f8220d901b21f30b01f12ba1f0cad1f0000c842b51f0000f041c21f' +
    '15aa1f12e8bf99e698afe698bee7a4bae58685e5aeb9ca1f00f01f0cba1f16b01ff955c21f0cad1f0000' +
    '0042b51f00000042ca1f00c21f48c21f0ca81fffffffffffffffffff01ca1f0ca81ffffffffffffffff' +
    'fff01d21f0ca81fffffffffffffffffff01e01f01ea1f0cad1f0000c842b51f0000a040f21f00fd1f00' +
    '00803fca1f06a81f01d21f00d21f1bb21f00ba1f0cad1f0000c842b51f0000a040c01f01e51f0000c842' +
    'da1f15aa1f00b21f0cad1f0000c842b51f0000a040c01f02d025019a2000d22510e993ade7898c20e985' +
    '8de7bdae494431e22500e8250d'
)

// 铭牌（code 27）显示范围 range=10（update 路径锁定）：逐字节对照 2026-08-17 地图 1073741893 编辑器样本。
writeFileSync(gilPath, sourceBytes)
const nameplateRange = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    components: [
      { type: 'nameplate', preset: 'default', content: '你好，这是测试铭牌', range: 10 }
    ]
  }
})
const nameplateRangeDefinition = components(
  record(nameplateRange.bytes, 4, FIXTURE_IDS.definition),
  8,
  27
)
const nameplateRangeInstance = components(
  record(nameplateRange.bytes, 8, FIXTURE_IDS.instance),
  7,
  27
)
assert.equal(nameplateRangeDefinition.length, 1)
assert.equal(nameplateRangeInstance.length, 1)
assert.equal(
  Buffer.from(nameplateRangeDefinition[0]).equals(Buffer.from(nameplateRangeInstance[0])),
  true
)
assert.equal(
  Buffer.from(nameplateRangeDefinition[0]).toString('hex'),
  '081b1001b202b202aa1fae02a81f01b01f01ba1f0b47495f526f6f744e6f6465c21f00cd1f00002041' +
    'd21f00dd1f0000a041e51f0000803f8220e201b21f39b01f12ba1f0cad1f0000c842b51f0000f041c21f' +
    '1eaa1f1be4bda0e5a5bdefbc8ce8bf99e698afe6b58be8af95e993ade7898cca1f00f01f0cba1f16b01f' +
    'f955c21f0cad1f00000042b51f00000042ca1f00c21f48c21f0ca81fffffffffffffffffff01ca1f0ca8' +
    '1fffffffffffffffffff01d21f0ca81fffffffffffffffffff01e01f01ea1f0cad1f0000c842b51f0000' +
    'a040f21f00fd1f0000803fca1f06a81f01d21f00d21f1bb21f00ba1f0cad1f0000c842b51f0000a040c0' +
    '1f01e51f0000c842da1f15aa1f00b21f0cad1f0000c842b51f0000a040c01f02d025019a2000d22510e9' +
    '93ade7898c20e9858de7bdae494431e22500e8250d'
)

writeFileSync(gilPath, sourceBytes)
const textBubble = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    components: [{ type: 'textBubble', preset: 'default' }]
  }
})
const bubbleDefinition = components(record(textBubble.bytes, 4, FIXTURE_IDS.definition), 8, 28)
const bubbleInstance = components(record(textBubble.bytes, 8, FIXTURE_IDS.instance), 7, 28)
assert.equal(bubbleDefinition.length, 1)
assert.equal(bubbleInstance.length, 1)
assert.equal(Buffer.from(bubbleDefinition[0]).equals(Buffer.from(bubbleInstance[0])), true)
assert.equal(
  Buffer.from(bubbleDefinition[0]).toString('hex'),
  '081c1001ba025aaa1f57a81f01b01f01ba1f0b47495f526f6f744e6f6465c21f00cd1f0000a041' +
    'd21f00d81f01ea1f0fb01f12ba1f00c51f0000803fc82501f81f1eca2516e69687e69cace6b094' +
    'e6b3a120e9858de7bdae494431da2500e8250d'
)

// --- 2026-08-17: lightSource(38) 默认槽（update 路径锁定）---
// 证据：地图 1073741892 两次独立编辑器样本，definition f8 / instance f7 双写一致 71B。
writeFileSync(gilPath, sourceBytes)
const lightSource = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    components: [{ type: 'lightSource', preset: 'default' }]
  }
})
const lightDefinition = components(record(lightSource.bytes, 4, FIXTURE_IDS.definition), 8, 38)
const lightInstance = components(record(lightSource.bytes, 8, FIXTURE_IDS.instance), 7, 38)
assert.equal(lightDefinition.length, 1)
assert.equal(lightInstance.length, 1)
assert.equal(Buffer.from(lightDefinition[0]).equals(Buffer.from(lightInstance[0])), true)
assert.equal(
  Buffer.from(lightDefinition[0]).toString('hex'),
  '082610018a03400a3e0801aa1f361207e58589e6ba9031221e15000020411a00220028019a031015' +
    '000040401d0000404020ffffffff0f320b47495f526f6f744e6f6465b01f01'
)

// 光源（code 38）参数化：radius/intensity 直接编码 float32（update 路径锁定）。
// 用编辑器 after-round4 原始内部值（显示 7.86/3.90 对应的滑条存储值）逐字节锁定。
writeFileSync(gilPath, sourceBytes)
const lightSourceParams = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
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
const lightParamsDefinition = components(
  record(lightSourceParams.bytes, 4, FIXTURE_IDS.definition),
  8,
  38
)
const lightParamsInstance = components(
  record(lightSourceParams.bytes, 8, FIXTURE_IDS.instance),
  7,
  38
)
assert.equal(lightParamsDefinition.length, 1)
assert.equal(lightParamsInstance.length, 1)
assert.equal(Buffer.from(lightParamsDefinition[0]).equals(Buffer.from(lightParamsInstance[0])), true)
assert.equal(
  Buffer.from(lightParamsDefinition[0]).toString('hex'),
  '082610018a03400a3e0801aa1f361207e58589e6ba9031221e15000020411a00220028019a031015' +
    '4463fb401d108d794020ffffffff0f320b47495f526f6f744e6f6465b01f01'
)

// --- P4-3: removeComponents（组件移除能力）---
writeFileSync(gilPath, sourceBytes)
const addForRemoval = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    components: [{ type: 'basicMotion', preset: 'default' }]
  }
})
assert.equal(components(record(addForRemoval.bytes, 4, FIXTURE_IDS.definition), 8, 4).length, 1)
assert.equal(components(record(addForRemoval.bytes, 8, FIXTURE_IDS.instance), 7, 4).length, 1)

writeFileSync(gilPath, addForRemoval.bytes)
const removeResult = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    removeComponents: [4]
  }
})
assert.deepEqual(removeResult.removedComponents, [4])
assert.equal(components(record(removeResult.bytes, 4, FIXTURE_IDS.definition), 8, 4).length, 0)
assert.equal(components(record(removeResult.bytes, 8, FIXTURE_IDS.instance), 7, 4).length, 0)
assert.equal(
  Buffer.from(record(removeResult.bytes, 4, FIXTURE_IDS.definition)).equals(
    Buffer.from(record(sourceBytes, 4, FIXTURE_IDS.definition))
  ),
  true,
  'removing the only added component must restore the original definition'
)
assert.equal(
  Buffer.from(record(removeResult.bytes, 8, FIXTURE_IDS.instance)).equals(
    Buffer.from(record(sourceBytes, 8, FIXTURE_IDS.instance))
  ),
  true,
  'removing the only added component must restore the original instance'
)

writeFileSync(gilPath, sourceBytes)
const absentRemoval = applyStaticPrefabUpdate({
  gilPath,
  update: {
    prefabId: FIXTURE_IDS.definition,
    instanceId: FIXTURE_IDS.instance,
    expectedName: '模板',
    removeComponents: [12, 13]
  }
})
assert.deepEqual(absentRemoval.removedComponents, [])
assert.equal(
  Buffer.from(absentRemoval.bytes).equals(Buffer.from(sourceBytes)),
  true,
  'removing absent component codes must be a byte-identical no-op'
)

assert.throws(
  () =>
    applyStaticPrefabUpdate({
      gilPath,
      update: {
        prefabId: FIXTURE_IDS.definition,
        instanceId: FIXTURE_IDS.instance,
        expectedName: '模板',
        removeComponents: [4, 4]
      }
    }),
  /duplicate type codes/i
)

assert.throws(
  () =>
    applyStaticPrefabUpdate({
      gilPath,
      update: {
        prefabId: FIXTURE_IDS.definition,
        instanceId: FIXTURE_IDS.instance,
        expectedName: '模板',
        components: [{ type: 'basicMotion', preset: 'default' }],
        removeComponents: [4]
      }
    }),
  /must not add and remove the same component type 4/i
)

assert.throws(
  () =>
    applyStaticPrefabUpdate({
      gilPath,
      update: {
        prefabId: FIXTURE_IDS.definition,
        instanceId: FIXTURE_IDS.instance,
        expectedName: '模板',
        removeComponents: [-1]
      }
    }),
  /non-negative safe integer/i
)

console.log('static prefab update component test passed')
