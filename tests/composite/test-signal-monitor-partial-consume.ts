// 红灯回归：onSignal 未消费的信号参数不得触发 schema mismatch
// 背景：2026-08-03 bug 汇报（star-cube-nexus）——服务器图 .onSignal 只读 evt.params.face、
// 不读 evt.params.direction 时（注册表声明 (str, str)），gsts build 报
// "signal schema mismatch: IR=[str], map=[str, str]"。
// 根因：IR 端 monitor_signal 参数输出按"被消费"生成，collectSignalUsages 据此推断 schema，
// 未消费参数从推断结果消失。accessory 产物本身始终使用注册表全量参数，故只需修正校验：
// monitor-only 时按 pinIndex 对齐注册表参数、允许合法子集；send 存在时仍全量比对。
import assert from 'node:assert/strict'

import {
  finalizeSignalEncoding
} from '../../src/compiler/ir_to_gia_transform/build_signal_definition.js'
import {
  createSignalRegistry,
  type RegisteredSignalDefinition
} from '../../src/compiler/signal_registry.js'

const definitionBytes = {
  send: 'IioKEQiRThCgnAEY8asBKIWAgIAGEhEIkU4QoJwBGPGrASiFgICABiIAKAKiBgoQARoCCAEiAEADqgYKEAEaAggCIgBABbIGFgoEZmFjZRABGgIIAyIGCAUYBiAGQAyyBh0KCWRpcmVjdGlvbhABGgQIAxABIgYIBRgGIAZAENIGOAoJ5L+h5Y+35ZCNIiMIBRIZCAUQASIFCAGiBgDKBgsKCWN1YmVfdHVybjABOgIIBCoECAYQAUAr2gY3COkHqgYxCgljdWJlX3R1cm4SEQiRThCgnAEY8asBKIaAgIAGGhEIkU4QopwBGPGrASiHgICABsIMDOWPkemAgeS/oeWPt9gMAeAMCA==',
  monitor:
    'IioKEQiRThCgnAEY8asBKIaAgIAGEhEIkU4QoJwBGPGrASiGgICABiIAKAKqBgoQARoCCAIiAEANugYfCg/kuovku7bmupDlrp7kvZMQARoCCAQiBBgBIAFAD7oGIQoN5LqL5Lu25rqQR1VJRBABGgQIBBABIgYIARgCIAJAELoGJAoS5L+h5Y+35p2l5rqQ5a6e5L2TEAEaBAgEEAIiBBgBIAFAEboGGAoEZmFjZRABGgQIBBADIgYIBRgGIAZAIroGHQoJZGlyZWN0aW9uEAEaBAgEEAQiBggFGAYgBkAj0gY4Cgnkv6Hlj7flkI0iIwgFEhkIBRABIgUIAaIGAMoGCwoJY3ViZV90dXJuMAE6AggEKgQIBhABQCzaBjcI6geyBjEKCWN1YmVfdHVybhIRCJFOEKCcARjxqwEohYCAgAYaEQiRThCinAEY8asBKIeAgIAGwgwM55uR5ZCs5L+h5Y+32AwC4AwI',
  server:
    'IicKEQiRThCinAEY8asBKIeAgIAGEg4IkU4QopwBGPCrASjQDyIAKAKiBgoQARoCCAEiAEATqgYKEAEaAggCIgBAFLIGFgoEZmFjZRABGgIIAyIGCAUYCSAJQCiyBh0KCWRpcmVjdGlvbhABGgQIAxABIgYIBRgJIAlAKdIGGxABGgIIBSIECAIgAyoLCAUQAaIGBAi8mwxALdIGRAoJ5L+h5Y+35ZCNEAEaBAgFEAEiJwgFEhsIBRABIgcIAqoGAhAJygYLCgljdWJlX3R1cm4gCTABOgIIBCoECAYQAUAu2gY3COkHqgYxCgljdWJlX3R1cm4SEQiRThCgnAEY8asBKIaAgIAGGhEIkU4QoJwBGPGrASiFgICABsIMIeWQkeacjeWKoeWZqOiKgueCueWbvuWPkemAgeS/oeWPt9gMAeAMCA=='
}

const signal = {
  name: 'cube_turn',
  params: [
    { name: 'face', type: 'str', sendPinIndex: 12, monitorPinIndex: 34, serverPinIndex: 40 },
    { name: 'direction', type: 'str', sendPinIndex: 16, monitorPinIndex: 35, serverPinIndex: 41 }
  ],
  sendId: 1610612741,
  monitorId: 1610612742,
  serverId: 1610612743,
  encoding: {
    signalVersion: 2,
    sendNameCompositePinIndex: 43,
    monitorNameCompositePinIndex: 44,
    definitionBytes,
    source: { uid: 110170759, mapId: 1073741849, gameVersion: '6.7.0' }
  }
} as unknown as RegisteredSignalDefinition

const registry = createSignalRegistry([signal])

function encodeMonitorOnly(consumed: Array<[number, string]>): void {
  const connIndex = new Map<number, Map<number, { type: string }>>([
    [99, new Map(consumed.map(([pinIndex, type]) => [pinIndex, { type }]))]
  ])
  finalizeSignalEncoding({
    ir: {
      graph: { type: 'server', id: 1073741844 },
      nodes: [{ id: 99, type: 'monitor_signal', args: [{ type: 'str', value: 'cube_turn' }] }]
    } as never,
    rootNodes: [],
    accessoryGraphs: [],
    connIndex,
    signalRegistry: registry
  })
}

// bug 场景：注册表 (str, str)，onSignal 只消费 face（IR 输出引脚 3）→ 必须通过
assert.doesNotThrow(
  () => encodeMonitorOnly([[3, 'str']]),
  'monitor-only 消费部分参数不应触发 schema mismatch'
)

// 全部参数消费 → 仍通过（现有行为）
assert.doesNotThrow(() => encodeMonitorOnly([[3, 'str'], [4, 'str']]))

// 消费不存在的第 3 个参数（pinIndex 5）→ 真实错误，必须报错
assert.throws(
  () => encodeMonitorOnly([[5, 'str']]),
  /signal schema mismatch/,
  '消费超出注册表范围的参数应报错'
)

// 消费 face 但 IR 推断类型为 float ≠ 注册表 str → 真实错误，必须报错
assert.throws(
  () => encodeMonitorOnly([[3, 'float']]),
  /signal schema mismatch/,
  '消费参数类型与注册表不符应报错'
)

// 产物监控 CompositeDef 参数必须仍是注册表全量（(str, str)），不是消费子集
const accessories = finalizeSignalEncoding({
  ir: {
    graph: { type: 'server', id: 1073741844 },
    nodes: [{ id: 99, type: 'monitor_signal', args: [{ type: 'str', value: 'cube_turn' }] }]
  } as never,
  rootNodes: [],
  accessoryGraphs: [],
  connIndex: new Map([[99, new Map([[3, { type: 'str' }]])]]),
  signalRegistry: registry
}).accessories
const monitorUnit = accessories.find(
  (unit: any) => Number(unit.id?.id) === signal.monitorId
)
const monitorDef: any = monitorUnit?.compositeDef?.inner?.def
assert.deepEqual(
  (monitorDef?.outputs ?? []).map((o: { name?: unknown }) => o.name).slice(-2),
  ['face', 'direction'],
  '监听信号 CompositeDef 输出参数应为注册表全量 (face, direction)，而非消费子集'
)
