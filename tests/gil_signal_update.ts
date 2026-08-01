import assert from 'node:assert/strict'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'

import { readRegisteredSignalsFromGil } from '../src/cli/gil_signals.js'
import { updateSignalInGil } from '../src/cli/gil_signal_registrations.js'

const [sourcePath] = process.argv.slice(2)
if (!sourcePath) throw new Error('Usage: tsx tests/gil_signal_update.ts <source.gil>')

const outputPath = `/tmp/gsts-signal-update-${process.pid}.gil`
const result = updateSignalInGil({
  bytes: new Uint8Array(readFileSync(sourcePath)),
  targetSignalName: '信号测试全参数',
  signal: {
    name: '信号测试全参数',
    params: [
      { name: '伤害值', type: 'int' },
      { name: '移动速度', type: 'float' },
      { name: '目标位置', type: 'vec3' },
      { name: '文本', type: 'str' },
      { name: '是否暴击', type: 'bool' },
      { name: '目标GUID', type: 'guid' },
      { name: '目标实体', type: 'entity' },
      { name: '预制体', type: 'prefab_id' },
      { name: '配置ID', type: 'config_id' }
    ]
  }
})
writeFileSync(outputPath, result.bytes)
const entry = readRegisteredSignalsFromGil(outputPath).find(
  (candidate) => candidate.name === '信号测试全参数'
)
unlinkSync(outputPath)

assert.ok(entry)
assert.deepEqual(
  {
    sendId: entry.sendId,
    monitorId: entry.monitorId,
    serverId: entry.serverId,
    params: entry.params.map((param) => `${param.name}:${param.type}`)
  },
  {
    sendId: 1610612753,
    monitorId: 1610612754,
    serverId: 1610612755,
    params: [
      '伤害值:int',
      '移动速度:float',
      '目标位置:vec3',
      '文本:str',
      '是否暴击:bool',
      '目标GUID:guid',
      '目标实体:entity',
      '预制体:prefab_id',
      '配置ID:config_id'
    ]
  }
)

console.log(JSON.stringify({ status: 'PASS', preservedIds: true, parameterCount: entry.params.length }))
